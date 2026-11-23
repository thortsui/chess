// 狼人殺迷你發言模型：自我對弈（讓模型「越玩越好」，只用筆電，不用 DGX）
// 想法：用現在的模型跑很多局全電腦對局，替每一段發言打分數（那局有沒有贏＋當天投票結果對他那邊好不好），
//       只留「比同身份平均好」的發言，和一部分原本的訓練資料混在一起，從現在的模型接著微調；再用 A/B 對打確認真的變強才換上。
//
// node train/ww/mini/selfplay.js play <模型資料夾> <輸出.jsonl> <局數> [種子]   跑對局、記下每段發言和分數
// node train/ww/mini/selfplay.js pick <輸出.jsonl>... <挑出來的.jsonl>           只留分數比同身份平均高的（格式和 gen_bulk.js 一樣，prep.js 可以直接吃）
// node train/ww/mini/selfplay.js ab <新模型資料夾> <舊模型資料夾> <局數> [種子]  A/B：好人用新、狼用舊 vs 好人用舊、狼用新，比勝率
//
// 打分（每段發言）：
//   整局結果：他那邊贏 +1、輸 -1（權重 WW_WWIN，預設 0.5）
//   當天結果（白天發言才有）：當天投出去的人是對方陣營 +1、是自己陣營 -1、是他自己再 -1、沒人出局 0（權重 1-WW_WWIN）
// 每段發言只看得到自己的資訊（遊戲裡同一套 wwTalkPrompt），打分只在對局結束後用，不會進到提示裡。
const fs=require('fs'),path=require('path');
const R=path.join(__dirname,'../../../');
const E=require(R+'tools/ww_engine.js'),M=require(R+'ai/ww/mini.js');
const WOLF=new Set(['wolf','wolfKing','whiteWolf','hiddenWolf']);
const WWIN=+(process.env.WW_WWIN||0.5);
const PICKLP=+(process.env.WW_PICKLP||-2.2);   // pick 時只留平均 log 機率 ≥ 這個值的發言（越接近 0 越通順、越像正常的話）
function load(dir){const meta=JSON.parse(fs.readFileSync(path.join(dir,'model.json'),'utf8'));const bin=fs.readFileSync(path.join(dir,'model.bin'));
  return new M.Net(meta,bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength),{});}
// 簡單的可重現亂數（換局面設定用；模型取樣用自己的亂數）
function rng(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function randCfg(r,g){const n=6+Math.floor(r()*7);let cfg=E.wwCfgFor(n);
  if(g%3===1){const ro={...cfg.roles};for(const k of ['wolfKing','hiddenWolf','guard','idiot','knight','gravekeeper','crow','bear'])if(r()<.25){if(k==='wolfKing'||k==='hiddenWolf'){if(ro.wolf>1){ro.wolf--;ro[k]=1;}}else ro[k]=1;}
    const c2=E.wwCfgFix({n,roles:ro,win:['num','side','all'][g%3],speak:60});if(E.wwVil(c2)>=1&&!E.wwCfgErr(c2))cfg=c2;}
  return cfg;}
// 跑一局；pickNet(st,seat) 決定這個座位用哪個模型；onTalk 每次生成後呼叫
async function game(cfg,pickNet,onTalk){
  const st=E.wwNew(cfg,Array(cfg.n).fill(true),0);
  E.wwSetTalk(async(prompt,st2,seat,n,opt)=>{const net=pickNet(st2,seat);const r=net.generate(prompt,opt);if(opt&&opt.minLp!=null&&r.lp<opt.minLp)r.text='';   // 和遊戲一樣擋胡言亂語
    onTalk&&onTalk(st2,seat,n,r.text,r.lp);return r.text;});
  let t=0,k=0;while(!st.over&&k<30000){t+=300;k++;E.wwTick(st,t);if(st.talk&&st.talk.res===undefined&&st.talk.p)await st.talk.p;}
  return st;}
// 從公開訊息找每天投出去的人
function outs(st){const o={};for(const m of st.msgs){if(m.seat>=0||m.to!=='all')continue;const a=/(\d+)\s*號 被投票出局/.exec(m.txt);if(a)o[m.day]=+a[1]-1;}return o;}
function winner(st){const m=st.msgs.slice().reverse().find(x=>x.seat<0&&/^遊戲結束/.test(x.txt));return m?(/好人陣營獲勝/.test(m.txt)?'good':'wolf'):null;}

const [cmd,...A]=process.argv.slice(2);
(async()=>{
if(cmd==='play'){const [dir,OUT,G,SEED]=A;const net=load(dir),r=rng(+(SEED||Date.now()%1e9)),out=fs.createWriteStream(OUT,{flags:'a'});
  const t0=Date.now();let nrow=0;
  for(let g=0;g<+G;g++){if(fs.existsSync(OUT+'.stop'))break;const cfg=randCfg(r,g),rows=[];const gid=(SEED||0)+'-'+g+'-'+Date.now();
    const st=await game(cfg,()=>net,(st2,seat,n,txt,lp)=>{
      // 和遊戲一樣的檢查；通過的才會真的被說出來，也才拿來學
      const p=E.wwTalkParse(txt);const q=p&&{...p,lines:p.lines.slice()};
      const err=(q&&E.wwTalkCover(st2,seat,{...q,lines:q.lines.slice()}))||E.wwTalkCheck(st2,seat,q)||(q&&E.wwTalkCopy(st2,seat,q.speech))||null;
      if(err)return;
      rows.push({prompt:E.wwTalkPromptV1(st2,seat,true),out:txt,err:null,role:st2.roles[seat],phase:st2.phase,day:st2.day,n:st2.n,try:n,gid,seat,lp,
        st:{roles:st2.roles.slice(),alive:st2.alive.slice(),seerRes:{...st2.seerRes},strat:st2.strat,phase:st2.phase,day:st2.day,n:st2.n}});});
    const w=winner(st);if(!w)continue;const o=outs(st);
    for(const x of rows){const mine=WOLF.has(x.role)?'wolf':'good';let loc=0;
      if(x.phase==='speak'&&o[x.day]!=null){const v=o[x.day],vs=WOLF.has(st.roles[v])?'wolf':'good';loc=vs===mine?-1:1;if(v===x.seat)loc-=1;}
      x.win=w===mine?1:-1;x.score=WWIN*x.win+(1-WWIN)*loc;out.write(JSON.stringify(x)+'\n');nrow++;}
    if((g+1)%10===0)console.log(`${g+1} 局，${nrow} 段，${((Date.now()-t0)/1000/(g+1)).toFixed(1)} 秒/局`);}
  out.end(()=>console.log('完成',nrow,'段'));}
else if(cmd==='pick'){const OUT=A.pop();const rows=[];for(const f of A)for(const l of fs.readFileSync(f,'utf8').split('\n'))if(l)rows.push(JSON.parse(l));
  // 同身份、同階段（發言／遺言）比平均；只留高於平均的
  const key=x=>x.role+'|'+x.phase,sum={},cnt={};for(const x of rows){sum[key(x)]=(sum[key(x)]||0)+x.score;cnt[key(x)]=(cnt[key(x)]||0)+1;}
  const keep=rows.filter(x=>x.score>sum[key(x)]/cnt[key(x)]+1e-9&&(x.lp==null||x.lp>=PICKLP));
  fs.writeFileSync(OUT,keep.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const by={};for(const x of keep)by[x.role]=(by[x.role]||0)+1;
  console.log(`共 ${rows.length} 段，留下 ${keep.length} 段（${(100*keep.length/rows.length).toFixed(0)}%）`,JSON.stringify(by));}
else if(cmd==='ab'){const [nd,od,G,SEED]=A;const NEW=load(nd),OLD=load(od),r=rng(+(SEED||12345));
  // 同一批局面各跑兩次：好人新／狼舊、好人舊／狼新。新模型那邊的勝率高於 50% 就是變強
  const isW=(st,s)=>WOLF.has(st.roles[s]);let gNew=0,wNew=0,n=0;const t0=Date.now();
  for(let g=0;g<+G;g++){const cfg=randCfg(r,g);
    const a=await game(cfg,(st,s)=>isW(st,s)?OLD:NEW);const b=await game(cfg,(st,s)=>isW(st,s)?NEW:OLD);
    const wa=winner(a),wb=winner(b);if(!wa||!wb)continue;n++;if(wa==='good')gNew++;if(wb==='wolf')wNew++;
    if((g+1)%10===0)console.log(`${g+1} 局：好人用新模型時好人勝 ${(100*gNew/n).toFixed(1)}%；狼用新模型時狼勝 ${(100*wNew/n).toFixed(1)}%（${((Date.now()-t0)/1000/(g+1)).toFixed(0)} 秒/局）`);}
  console.log(JSON.stringify({n,goodNew:gNew,wolfNew:wNew}));}
else console.log('用法見檔案開頭');
})();
