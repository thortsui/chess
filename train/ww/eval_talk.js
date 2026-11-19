// 狼人殺 AI 發言：評估（老師資料或學生模型的輸出）
// node train/ww/eval_talk.js <保留對局.jsonl> [學生輸出.jsonl]
//   沒給學生輸出：評估老師資料本身（out 欄位）；有給：每行 {i,text}，i 是保留對局的第幾行
// 指標：格式正確率、檢查通過率、資訊洩漏率、投票和發言一致率、狼人自曝率、狼人悍跳比例、神職首日跳身份比例
const fs=require('fs'),path=require('path');
const E=require(path.join(__dirname,'../../tools/ww_engine.js'));
const rows=fs.readFileSync(process.argv[2],'utf8').split('\n').filter(Boolean).map(JSON.parse);
const stu=process.argv[3]?fs.readFileSync(process.argv[3],'utf8').split('\n').filter(Boolean).map(JSON.parse):null;
const LEAK=new Set(['狼人自曝','狼人洩漏','狼人說隊友是狼','狼人查殺隊友','好人說隊友','好人說自己是狼','預言家報假查殺','預言家報假金水','非預言家報查驗','好人假冒身份','沒分配悍跳卻悍跳']);
const GOD=['seer','witch','hunter','guard','idiot','knight','gravekeeper','crow','bear'];
const RN={seer:'預言家',witch:'女巫',hunter:'獵人',guard:'守衛',idiot:'白痴',knight:'騎士',gravekeeper:'守墓人',crow:'烏鴉',bear:'熊'};
const C={n:0,fmt:0,pass:0,leak:0,why:{},vote:0,voteN:0,wolf:0,wolfExpose:0,jumpN:0,jumpDid:0,wolfSeer:0,god1:0,god1Claim:0,seer1:0,seer1Claim:0,len:0};
const ex={};
const list=stu?stu.map(s=>({r:rows[s.i],text:s.text})):rows.map(r=>({r,text:r.out}));
for(const {r,text} of list){if(!r||!r.st)continue;C.n++;
  // 重建檢查用的狀態
  const st={...r.st,cfg:{n:r.st.n},msgs:[]};st.ai=st.roles.map(()=>true);
  const p=E.wwTalkParse(text);if(p)C.fmt++;else{C.why['格式錯誤']=(C.why['格式錯誤']||0)+1;continue;}
  C.len+=p.speech.length;
  const err=E.wwTalkCheck(st,r.seat,{...p,lines:p.lines.slice()});
  if(!err)C.pass++;else{C.why[err]=(C.why[err]||0)+1;if(LEAK.has(err))C.leak++;}
  // 投票一致：發言明說投誰或說誰是狼時，投票要是那個人
  const sd=E.wwTalkStated(p.speech),cl=E.wwTalkClaims(p.speech),want=sd.length?sd:cl.wolf;
  if(r.phase==='speak'&&want.length){C.voteN++;if(want.includes(p.vote))C.vote++;}
  const wolf=['wolf','wolfKing','whiteWolf','hiddenWolf'].includes(r.role);
  const claimSeer=/我(?:才|真的|就|其實|確實|本來就|當然|也)?是(?:真的?|一隻|個)?預言家/.test(p.speech);
  if(wolf){C.wolf++;if(['狼人自曝','狼人洩漏','狼人說隊友是狼','狼人查殺隊友'].includes(err))C.wolfExpose++;
    if(claimSeer)C.wolfSeer++;
    if(r.st.strat&&r.st.strat[r.seat]==='jump'&&r.day===1&&r.phase==='speak'){C.jumpN++;if(claimSeer)C.jumpDid++;}
    if(claimSeer&&!ex.jump)ex.jump=p.speech;}
  if(GOD.includes(r.role)&&r.day===1&&r.phase==='speak'){const own=new RegExp('我(?:才|真的|就|其實|確實|本來就|當然|也)?是(?:真的?|一隻|個)?'+RN[r.role]).test(p.speech);
    if(r.role==='seer'){C.seer1++;if(own)C.seer1Claim++;}else{C.god1++;if(own)C.god1Claim++;}}}
const pc=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';
console.log(`樣本 ${C.n}，平均發言 ${(C.len/Math.max(1,C.fmt)).toFixed(0)} 字`);
console.log(`格式正確率 ${pc(C.fmt,C.n)}；檢查通過率 ${pc(C.pass,C.n)}；資訊洩漏率 ${pc(C.leak,C.n)}`);
console.log(`投票和發言一致率 ${pc(C.vote,C.voteN)}（${C.voteN} 筆有明說投誰／誰是狼）`);
console.log(`狼人自曝率 ${pc(C.wolfExpose,C.wolf)}（狼人 ${C.wolf} 筆）；狼人自稱預言家 ${pc(C.wolfSeer,C.wolf)}；被分配悍跳的狼第1天真的悍跳 ${pc(C.jumpDid,C.jumpN)}`);
console.log(`神職（預言家以外）第1天跳身份 ${pc(C.god1Claim,C.god1)}；預言家第1天跳身份 ${pc(C.seer1Claim,C.seer1)}`);
console.log('不通過原因',JSON.stringify(C.why));
if(ex.jump)console.log('悍跳範例：',ex.jump);
