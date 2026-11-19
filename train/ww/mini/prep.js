// 狼人殺迷你發言模型：整理訓練資料（篩選、去口頭禪、句型降採樣、切保留集、斷詞成 token 檔）
// node --max-old-space-size=12000 train/ww/mini/prep.js <輸出資料夾> <vocab.json> <資料.jsonl> ... [T:<老師資料.jsonl> ...]
//   沒加 T: 的是 gen_bulk.js 用 0.8B 模型生成的資料；T: 開頭的是老師（27B）寫的資料，放兩份（加權）。
// 做的事：
//   1. 只留通過檢查的（err 為 null）；用現在的規則重新解析一次，訓練目標寫成遊戲裡實際會出現的樣子（口頭禪截斷之後的句子＋「投:N」）。
//      口頭禪截斷後剩不到 10 個字的整筆丟掉。
//   2. 一模一樣的（提示＋回答）只留一筆；同一段發言全文最多留 30 筆。
//   3. 高頻句型降採樣：去掉標點後的 8 字片語，出現在超過 WW_HOT（預設 2.5%）樣本裡的，把含有它的樣本隨機丟到剩 2.5% 左右（報查驗的句子不降）。
//   3b. 座位輪轉擴增：每筆再多做 WW_AUG（預設 1）份「所有號碼一起輪轉」的版本（見 rotate）。
//   4. 依對局切保留集（0.8B 資料 2%、老師資料 5%），保留集留下「第一次生成」的全部回答（含不合格的），評估時和迷你模型並列比較。
//   5. 斷詞（ai/ww/mini.js 的 Tok）：<bos> 提示（最多 BUDGET 個 token，太長丟最舊的紀錄） <sep> 回答 <eos>，寫成 uint16。
const fs=require('fs'),path=require('path'),readline=require('readline'),crypto=require('crypto');
const E=require(path.join(__dirname,'../../../tools/ww_engine.js'));
const M=require(path.join(__dirname,'../../../ai/ww/mini.js'));
const [OUT,VOCAB,...SRC]=process.argv.slice(2);
const CTX=512,MAXOUT=96,BUDGET=CTX-2-MAXOUT,HOT=+(process.env.WW_HOT||0.025),CAP=30,AUG=+(process.env.WW_AUG||1);
const tok=new M.Tok(JSON.parse(fs.readFileSync(VOCAB,'utf8')));
const h100=s=>parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(-7),16)%100;
const rnd=s=>parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(-7),16)/0x10000000;   // 固定的亂數（同一筆每次結果一樣）
const strip=s=>s.replace(/[\s，。！？、；：,.!?;:…～~「」（）()]/g,'');
const stat={aug:0,augSkip:0,augBad:0,read:0,bad:0,tic:0,ticDrop:0,dup:0,cap:0,hot:0,long:0,train:0,held:0,heldT:0};
const rows=[],held=[],heldT=[],seen=new Set(),spCount=new Map();
function canon(d){const st={...d.st,cfg:{n:d.st.n},msgs:[]};const p=E.wwTalkParse(d.out);if(!p)return null;
  const q={...p,lines:p.lines.slice()};if(E.wwTalkCheck(st,d.seat,q))return null;
  const raw=d.out.replace(/\n\s*投[:：][^\n]*$/,'');const cut=strip(p.speech).length<strip(raw).length-1;
  return{out:p.lines.join('\n')+'\n投:'+(q.vote>=0?q.vote+1:'棄'),speech:p.speech,cut};}
// ---- 座位輪轉（資料擴增）：所有號碼一起加 k、繞一圈。發言順序和熊的左右都是環狀的，所以輪轉後的局面完全等價，
//      只是每個人的號碼不同——讓小模型學到「號碼要看提示」而不是背常見的號碼。轉完再用 wwTalkCheck 驗一次，不通過就不用。
const NUMS=/(\d+)((?:\s*[、,，和跟與及或]\s*\d+)*\s*號)/g;
const SAFE=/第\s*\d+\s*[天夜晚輪局次個]|\d+\s*[票人個狼神民瓶張次句分秒輪%％刀槍天夜晚]|[×xX]\s*\d+/g;
// 自由文字（發言）：「N號」「1、2號」照轉；還有別的數字（不確定是不是號碼）就回傳 null，這筆不做擴增
function rotText(s,f){if(/\d/.test(s.replace(NUMS,'').replace(SAFE,'')))return null;return s.replace(NUMS,m=>m.replace(/\d+/g,x=>f(+x)));}
const rotList=(s,f)=>s.split('、').map(x=>/^\d+$/.test(x)?f(+x):x).sort((a,b)=>(typeof a==='number'?a:99)-(typeof b==='number'?b:99)).join('、');
function rotate(d,k){const n=d.st.n,f=x=>x>=1&&x<=n?((x-1+k)%n)+1:x,g=i=>(i+k)%n;
  const ls=d.prompt.split('\n'),out=[];let inLog=false;
  for(let i=0;i<ls.length;i++){let l=ls[i],m;
    if(i===0||i===ls.length-1){out.push(l);continue;}
    if(l==='紀錄：'){inLog=true;out.push(l);continue;}
    if(!inLog){
      if((m=/^存活：(.*)$/.exec(l)))l='存活：'+rotList(m[1],f);
      else if((m=/^狼隊友：(\d.*)$/.exec(l)))l='狼隊友：'+m[1].split('、').map(x=>x.replace(/^\d+/,y=>f(+y))).sort((a,b)=>parseInt(a)-parseInt(b)).join('、');
      else l=l.replace(/(\d+)號/g,(z,x)=>f(+x)+'號');
      out.push(l);continue;}
    if((m=/^((?:（狼隊）)?)(\d+)號：(.*)$/.exec(l))){const t=rotText(m[3],f);if(t==null)return null;out.push(m[1]+f(+m[2])+'號：'+t);continue;}
    if(l.startsWith('投票結果：'))l=l.replace(/（([^（）]*)）/g,(z,x)=>'（'+rotList(x,f)+'）').replace(/棄票：([\d、]+)/,(z,x)=>'棄票：'+rotList(x,f));
    out.push(l.replace(/(\d+)號/g,(z,x)=>f(+x)+'號'));}
  const j=d.out.lastIndexOf('\n');if(j<0)return null;const sp=rotText(d.out.slice(0,j),f);if(sp==null)return null;
  const vote=d.out.slice(j).replace(/\d+/,x=>f(+x));
  const arr=a=>{const b=a.slice();a.forEach((v,i)=>{b[g(i)]=v;});return b;},obj=o=>{const b={};for(const key in (o||{}))b[g(+key)]=o[key];return b;};
  return{...d,prompt:out.join('\n'),out:sp+vote,seat:g(d.seat),st:{...d.st,roles:arr(d.st.roles),alive:arr(d.st.alive),seerRes:obj(d.st.seerRes),strat:obj(d.st.strat)}};}
async function load(file,teacher){const rl=readline.createInterface({input:fs.createReadStream(file,'utf8'),crlfDelay:Infinity});
  for await(const l of rl){if(!l)continue;let d;try{d=JSON.parse(l);}catch(e){continue;}if(!d.st)continue;stat.read++;
    const h=h100(d.gid),isHeld=h<(teacher?5:2);
    if(isHeld){if(teacher){if(!d.err)heldT.push(d);}else if(d.try===1)held.push(d);continue;}
    if(d.err){stat.bad++;continue;}
    const c=canon(d);if(!c){stat.bad++;continue;}
    if(c.cut){stat.tic++;if(strip(c.speech).length<10){stat.ticDrop++;continue;}}
    const key=d.prompt+'\u0001'+c.out;if(seen.has(key)){stat.dup++;continue;}seen.add(key);
    const k=(spCount.get(c.speech)||0)+1;   // 註：輪轉後的版本號碼不同，另外算spCount.set(c.speech,k);if(k>CAP){stat.cap++;continue;}
    rows.push({prompt:d.prompt,out:c.out,sp:strip(c.speech),w:teacher?2:1});
    for(let a=0;a<AUG;a++){const k=1+Math.floor(rnd(key+a)*(d.st.n-1)),d2=rotate({...d,out:c.out},k);if(!d2){stat.augSkip++;continue;}
      const c2=canon(d2);if(!c2||c2.cut){stat.augBad++;continue;}stat.aug++;
      rows.push({prompt:d2.prompt,out:c2.out,sp:strip(c2.speech),w:1});}}}
(async()=>{
  for(const s of SRC){const t=s.startsWith('T:');await load(t?s.slice(2):s,t);console.log('讀完',s,'目前',rows.length);}
  seen.clear();spCount.clear();
  // 高頻句型：先用一部分樣本找出常見的 8 字片語
  const samp=rows.filter((r,i)=>i%Math.max(1,Math.floor(rows.length/60000))===0),df=new Map();
  for(const r of samp){const g=new Set();for(let i=0;i+8<=r.sp.length;i++)g.add(r.sp.substr(i,8));for(const x of g)df.set(x,(df.get(x)||0)+1);}
  const hot=new Map();for(const [g,c] of df)if(c/samp.length>HOT&&!/預言家|查殺|金水|查驗/.test(g))hot.set(g,c/samp.length);   // 報查驗的句子是必要的內容，不降
  const top=[...hot].sort((a,b)=>b[1]-a[1]);console.log('高頻 8 字片語（出現在 >'+(HOT*100)+'% 的樣本）',hot.size,'個；最高的：',top.slice(0,12).map(x=>x[0]+' '+(x[1]*100).toFixed(1)+'%').join('、'));
  const keep=[];
  for(const r of rows){let mx=0;if(hot.size)for(let i=0;i+8<=r.sp.length;i++){const f=hot.get(r.sp.substr(i,8));if(f>mx)mx=f;}
    if(mx>0&&rnd(r.prompt+r.out)>HOT/mx){stat.hot++;continue;}keep.push(r);}
  // 斷詞
  const enc=(prompt,out)=>{const a=tok.encode(out);if(a.length>MAXOUT)return null;return[M.BOS,...tok.prompt(prompt,BUDGET),M.SEP,...a,M.EOS];};
  const write=(name,list)=>{let n=0;for(const x of list)n+=x.length;const u=new Uint16Array(n),ix=new Uint32Array(list.length+1);let o=0;
    list.forEach((x,i)=>{ix[i]=o;u.set(x,o);o+=x.length;});ix[list.length]=o;
    fs.writeFileSync(path.join(OUT,name+'.u16'),Buffer.from(u.buffer));fs.writeFileSync(path.join(OUT,name+'.idx'),Buffer.from(ix.buffer));return n;};
  fs.mkdirSync(OUT,{recursive:true});
  const tr=[],sents=new Set();let unk=0,ntok=0,pl=0,ol=0;
  for(const r of keep){const x=enc(r.prompt,r.out);if(!x){stat.long++;continue;}for(let k=0;k<r.w;k++)tr.push(x);
    for(const t of x){ntok++;if(t===M.UNK)unk++;}pl+=x.indexOf(M.SEP);ol+=x.length-x.indexOf(M.SEP)-2;
    for(const s of r.out.replace(/\n投[:：].*$/,'').split(/(?<=[。！？\n])/)){const t=strip(s);if(t.length>=8)sents.add(t);}}
  stat.train=tr.length;write('train',tr);
  // 保留集：合格的也寫成 token 檔（算 loss 用）；全部寫成 jsonl（生成評估用）
  const hx=[];for(const d of held){if(d.err)continue;const c=canon(d);if(!c)continue;const x=enc(d.prompt,c.out);if(x)hx.push(x);}
  write('held',hx);stat.held=held.length;stat.heldT=heldT.length;
  fs.writeFileSync(path.join(OUT,'heldout.jsonl'),held.map(d=>JSON.stringify(d)).join('\n')+'\n');
  fs.writeFileSync(path.join(OUT,'heldout_teacher.jsonl'),heldT.map(d=>JSON.stringify(d)).join('\n')+'\n');
  fs.writeFileSync(path.join(OUT,'sents.txt'),[...sents].join('\n'));
  fs.writeFileSync(path.join(OUT,'meta.json'),JSON.stringify({V:tok.t.length,ctx:CTX,maxout:MAXOUT,budget:BUDGET,stat}));
  console.log(JSON.stringify(stat));
  console.log(`訓練 ${tr.length} 筆（不含加權重複 ${keep.length-stat.long}），平均提示 ${(pl/(keep.length-stat.long)).toFixed(0)} token、回答 ${(ol/(keep.length-stat.long)).toFixed(0)} token，<unk> 佔 ${(100*unk/ntok).toFixed(3)}%，訓練句子 ${sents.size} 種`);
})();
