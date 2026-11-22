// 狼人殺 AI 發言整合測試：用遊戲裡同一份 JS 推論（ai/ww/mini.js）和同一個模型（ai/ww/tiny/）跑全電腦對局，
// 統計「畫面上實際出現的發言」：有多少輪到電腦發言／遺言的回合真的講了話、有多少退回「過。」，以及每段要幾毫秒。
// node tools/wwtalk_test.js [局數=50] [模型資料夾=ai/ww/tiny]      （環境變數 WW_NOWASM=1：強制用純 JS，不用 WebAssembly）
// 流程和遊戲一樣：模型寫 → wwTalkParse（含口頭禪截斷）→ wwTalkCheck、wwTalkCopy → 不合格重寫一次 → 再不行說「過。」
const fs=require('fs'),path=require('path');
const E=require('./ww_engine.js'),M=require('../ai/ww/mini.js');
const N=+(process.argv[2]||50),dir=process.argv[3]||path.join(__dirname,'../ai/ww/tiny');
const meta=JSON.parse(fs.readFileSync(path.join(dir,'model.json'),'utf8'));const bin=fs.readFileSync(path.join(dir,'model.bin'));
const tL=process.hrtime.bigint();const net=new M.Net(meta,bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength),{noWasm:!!process.env.WW_NOWASM});const loadMs=Number(process.hrtime.bigint()-tL)/1e6;
let rss=0;const mem=()=>{const r=process.memoryUsage().rss;if(r>rss)rss=r;};
const S={turns:0,try1:0,try2:0,ok1:0,ok2:0,why:{},ms:0,mx:0,gen:0,lines:0,pass:0,bad:0,stated:0,follow:0,samples:[]};
let cur=null;
E.wwSetTalk(async(prompt,st,seat,n,opt)=>{
  const t0=process.hrtime.bigint();const r=net.generate(prompt,opt);if(opt&&opt.minLp!=null&&r.lp<opt.minLp)r.text='';   // 和遊戲的 worker 一樣擋胡言亂語
  const ms=Number(process.hrtime.bigint()-t0)/1e6;S.ms+=ms;S.gen++;if(ms>S.mx)S.mx=ms;
  if(n===1){S.turns++;S.try1++;}else S.try2++;mem();
  const p=E.wwTalkParse(r.text);const q=p&&{...p,lines:p.lines.slice()};const err=(q&&E.wwTalkCover(st,seat,q))||E.wwTalkCheck(st,seat,q)||(q&&E.wwTalkCopy(st,seat,q.speech))||null;
  if(err)S.why[err]=(S.why[err]||0)+1;else{if(n===1)S.ok1++;else S.ok2++;if(S.samples.length<12&&Math.random()<.02)S.samples.push(`${seat+1}號（${E.WW_ROLES[st.roles[seat]].n}，第${st.day}天${st.phase==='last'?'遺言':''}）：${p.speech}`);}
  return r.text;});
(async()=>{const t0=Date.now();
  for(let g=0;g<N;g++){const n=6+Math.floor(Math.random()*7);let cfg=E.wwCfgFor(n);
    if(g%3===1){const r={...cfg.roles};for(const k of ['wolfKing','hiddenWolf','guard','idiot','knight','gravekeeper','crow','bear'])if(Math.random()<.25){if(k==='wolfKing'||k==='hiddenWolf'){if(r.wolf>1){r.wolf--;r[k]=1;}}else r[k]=1;}
      const c2=E.wwCfgFix({n,roles:r,win:['num','side','all'][g%3],speak:60});if(E.wwVil(c2)>=1&&!E.wwCfgErr(c2))cfg=c2;}
    const st=E.wwNew(cfg,Array(cfg.n).fill(true),0);let t=0,steps=0;const votes=[];
    while(!st.over&&steps<30000){t+=300;steps++;const ph=st.phase;
      // 投票階段：記下每個人實際投的票，和他發言時說要投的對象比
      if(ph==='vote')for(const s in st.votes){const it=st.intent&&st.intent[s];if(it&&it.day===st.day&&!votes.includes(st.day+':'+s)){votes.push(st.day+':'+s);
          if(st.alive[it.t]&&it.t!==+s){S.stated++;if(st.votes[s]===it.t)S.follow++;}}}
      E.wwTick(st,t);if(st.talk&&st.talk.res===undefined&&st.talk.p)await st.talk.p;}
    if(!st.over){S.bad++;console.log('對局沒有結束',JSON.stringify(cfg));}
    // 畫面上的發言：每一則都要通過簡體字、號碼範圍等基本檢查
    for(const m of st.msgs){if(m.seat<0||m.to!=='all')continue;if(m.txt==='過。'){S.pass++;continue;}S.lines++;
      if(/[A-Za-z<>{}\[\]\\]/.test(m.txt)||m.txt.length>120){S.bad++;console.log('不該出現的發言：',m.txt);}}}
  const pc=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';
  console.log(`${N} 局，${net.simd?'WASM SIMD':'純 JS'}，共 ${((Date.now()-t0)/1000).toFixed(0)} 秒`);
  console.log(`輪到電腦發言／遺言 ${S.turns} 次：第一次就合格 ${pc(S.ok1,S.turns)}，重寫後合格 ${pc(S.ok2,S.turns)}，改用規則發言 ${pc(S.turns-S.ok1-S.ok2,S.turns)}`);
  console.log(`畫面上實際出現：發言 ${S.lines} 則、「過。」 ${S.pass} 則；有講話的回合 ${pc(S.ok1+S.ok2,S.turns)}`);
  console.log(`單次生成的檢查通過率 ${pc(S.ok1+S.ok2,S.gen)}（${S.gen} 次生成）；不通過原因 ${JSON.stringify(S.why)}`);
  console.log(`發言時明說要投誰 → 投票時照著投：${S.follow}／${S.stated}`);
  console.log(`載入模型 ${loadMs.toFixed(0)} ms；每次生成平均 ${(S.ms/S.gen).toFixed(0)} ms，最慢 ${S.mx.toFixed(0)} ms；模型本身佔 ${(net.bytes/1048576).toFixed(0)} MB，整個 Node 程序記憶體峰值 ${(rss/1048576).toFixed(0)} MB`);
  console.log('隨機幾段：');S.samples.forEach(s=>console.log('  '+s));
  const passRate=(S.turns-S.ok1-S.ok2)/Math.max(1,S.turns),fail=S.bad>0||passRate>0.25||S.follow!==S.stated;   // 模型沒講成（改用規則發言 wwSay）超過 25% 就算不能用（0.28.0 起好人要「有根據」，約 15% 會退回規則發言）
  console.log(fail?'失敗':'全部通過');process.exit(fail?1:0);})();
