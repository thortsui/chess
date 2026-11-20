// 狼人殺 AI 發言：評估（資料本身或某個模型的輸出）
// node train/ww/eval_talk.js <保留對局.jsonl> [模型輸出.jsonl] [訓練句子 sents.txt]
//   沒給模型輸出（或寫 -）：評估保留對局裡原本的回答（out 欄位：老師資料，或 0.8B 模型第一次生成的回答）；
//   有給：每行 {i,text}，i 是保留對局的第幾行（train/ww/gen_student.py 或 train/ww/mini/gen.js 的輸出）。只評估有輸出的那幾筆。
//   有給 sents.txt（train/ww/mini/prep.js 的輸出）：多算「和訓練集重複率」。
// 指標：格式正確率、檢查通過率（wwTalkCheck＋抄別人，和遊戲裡一樣）、說錯話率（自曝、報錯查驗、冒充；他本來就只知道自己的資訊，這是把自己的秘密說溜或亂報，不是知道別人的秘密）、投票和發言一致率、狼人自曝率、簡體字率、
//       口頭禪殘留率（會被 wwTalkTic 截斷的比例）、抄別人、狼人悍跳比例、神職首日跳身份比例、和訓練集重複率
const fs=require('fs'),path=require('path');
const E=require(path.join(__dirname,'../../tools/ww_engine.js'));
const rows=fs.readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean).map(JSON.parse);
const stu=process.argv[3]&&process.argv[3]!=='-'?fs.readFileSync(process.argv[3],'utf8').split('\n').filter(Boolean).map(JSON.parse):null;
const sents=process.argv[4]?new Set(fs.readFileSync(process.argv[4],'utf8').split('\n')):null;
const LIM=+(process.env.WW_N||0);
const LEAK=new Set(['狼人自曝','狼人洩漏','狼人說隊友是狼','狼人查殺隊友','好人說隊友','好人說自己是狼','預言家報假查殺','預言家報假金水','非預言家報查驗','好人假冒身份','沒分配悍跳卻悍跳']);
const GOD=['seer','witch','hunter','guard','idiot','knight','gravekeeper','crow','bear'];
const RN={seer:'預言家',witch:'女巫',hunter:'獵人',guard:'守衛',idiot:'白痴',knight:'騎士',gravekeeper:'守墓人',crow:'烏鴉',bear:'熊'};
const C={n:0,fmt:0,pass:0,leak:0,why:{},vote:0,voteN:0,wolf:0,wolfExpose:0,jumpN:0,jumpDid:0,wolfSeer:0,god1:0,god1Claim:0,seer1:0,seer1Claim:0,len:0,tic:0,simp:0,copy:0,sN:0,sDup:0,abst:0,ms:0,msN:0,slow:0};
const strip=s=>s.replace(/[\s，。！？、；：,.!?;:…～~「」（）()]/g,'');
const uniq=new Set();
let list=stu?stu.map(s=>({r:rows[s.i],text:s.text,ms:s.ms})):rows.map(r=>({r,text:r.out}));if(LIM)list=list.slice(0,LIM);
for(const {r,text,ms} of list){if(!r||!r.st)continue;C.n++;if(ms!=null){C.ms+=ms;C.msN++;if(ms>4000)C.slow++;}
  // 重建檢查用的狀態；別人說過的話從提示的紀錄裡抓回來（檢查「抄別人」用）
  const st={...r.st,cfg:{n:r.st.n},msgs:[]};st.ai=st.roles.map(()=>true);
  for(const l of String(r.prompt).split('\n')){const m=/^(\d+)號：(.*)$/.exec(l);if(m&&+m[1]-1!==r.seat)st.msgs.push({seat:+m[1]-1,to:'all',day:st.day,txt:m[2]});}
  // 口頭禪殘留：原始輸出裡有沒有會被截斷的句子
  const raw=String(text||'').replace(/<\|im_end\|>[\s\S]*$/,'').replace(/\n\s*投[:：][^\n]*\s*$/,'').trim();
  if(raw&&strip(E.wwTalkTic(raw)).length<strip(raw).length-1)C.tic++;
  const p=E.wwTalkParse(text);if(p)C.fmt++;else{C.why['格式錯誤']=(C.why['格式錯誤']||0)+1;continue;}
  C.len+=p.speech.length;uniq.add(p.speech);if(p.vote<0)C.abst++;
  let err=E.wwTalkCheck(st,r.seat,{...p,lines:p.lines.slice()});
  if(!err&&E.wwTalkCopy(st,r.seat,p.speech)){err='抄別人';C.copy++;}
  if(!err)C.pass++;else{C.why[err]=(C.why[err]||0)+1;if(LEAK.has(err))C.leak++;if(err==='簡體字')C.simp++;}
  // 投票一致：發言明說投誰或說誰是狼時，投票要是那個人
  const sd=E.wwTalkStated(p.speech),cl=E.wwTalkClaims(p.speech),want=sd.length?sd:cl.wolf;
  if(r.phase==='speak'&&want.length){C.voteN++;if(want.includes(p.vote))C.vote++;}
  const wolf=['wolf','wolfKing','whiteWolf','hiddenWolf'].includes(r.role);
  const claimSeer=/我(?:才|真的|就|其實|確實|本來就|當然|也)?是(?:真的?|一隻|個)?預言家/.test(p.speech);
  if(wolf){C.wolf++;if(['狼人自曝','狼人洩漏','狼人說隊友是狼','狼人查殺隊友'].includes(err))C.wolfExpose++;
    if(claimSeer)C.wolfSeer++;
    if(r.st.strat&&r.st.strat[r.seat]==='jump'&&r.day===1&&r.phase==='speak'){C.jumpN++;if(claimSeer)C.jumpDid++;}}
  if(GOD.includes(r.role)&&r.day===1&&r.phase==='speak'){const own=new RegExp('我(?:才|真的|就|其實|確實|本來就|當然|也)?是(?:真的?|一隻|個)?'+RN[r.role]).test(p.speech);
    if(r.role==='seer'){C.seer1++;if(own)C.seer1Claim++;}else{C.god1++;if(own)C.god1Claim++;}}
  if(sents)for(const s of p.lines.join('\n').split(/(?<=[。！？\n])/)){const t=strip(s);if(t.length>=8){C.sN++;if(sents.has(t))C.sDup++;}}}
const pc=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';
console.log(`樣本 ${C.n}，平均發言 ${(C.len/Math.max(1,C.fmt)).toFixed(0)} 字，不重複的發言 ${pc(uniq.size,C.fmt)}，投棄票 ${pc(C.abst,C.fmt)}`);
console.log(`格式正確率 ${pc(C.fmt,C.n)}；檢查通過率 ${pc(C.pass,C.n)}；說錯話率 ${pc(C.leak,C.n)}；簡體字率 ${pc(C.simp,C.n)}；口頭禪殘留率 ${pc(C.tic,C.n)}；抄別人 ${pc(C.copy,C.n)}`);
console.log(`投票和發言一致率 ${pc(C.vote,C.voteN)}（${C.voteN} 筆有明說投誰／誰是狼）`);
console.log(`狼人自曝率 ${pc(C.wolfExpose,C.wolf)}（狼人 ${C.wolf} 筆）；狼人自稱預言家 ${pc(C.wolfSeer,C.wolf)}；被分配悍跳的狼第1天真的悍跳 ${pc(C.jumpDid,C.jumpN)}（${C.jumpN} 筆）`);
console.log(`神職（預言家以外）第1天跳身份 ${pc(C.god1Claim,C.god1)}；預言家第1天跳身份 ${pc(C.seer1Claim,C.seer1)}（${C.seer1} 筆）`);
if(sents)console.log(`和訓練集重複率 ${pc(C.sDup,C.sN)}（${C.sN} 個 8 字以上的句子裡，一字不差出現在訓練集的比例）`);
if(C.msN)console.log(`平均每段 ${(C.ms/C.msN).toFixed(0)} ms，超過 4 秒 ${pc(C.slow,C.msN)}`);
console.log('不通過原因',JSON.stringify(C.why));
