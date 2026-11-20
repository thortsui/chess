const fs=require('fs');const f='index.html';let s=fs.readFileSync(f,'utf8');
const rep=(x,y)=>{const n=s.split(x).length-1;if(n!==1)throw new Error(n+' 次：'+x.slice(0,60));s=s.replace(x,()=>y);};
rep("function wwTalkPrompt(st,seat){\r\n  const v=wwView(st,seat,0)","// 舊順序（0.22～0.26 的格式，身份在最前面）：訓練資料就是這個格式，wwTalkReorder 把它轉成新順序\r\nfunction wwTalkPromptV1(st,seat,noTrim){\r\n  const v=wwView(st,seat,0)");
rep("  while(body.length>900&&log.length>4){log.shift();body=log.join('\n');}\r\n  L.push(body);","  while(!noTrim&&body.length>900&&log.length>4){log.shift();body=log.join('\n');}\r\n  L.push(body);");
rep("// 口頭禪：小模型很愛說","// ===== 提示的順序（0.27.0 起）：公開的在前、私人的在後 =====\r\n"+
"// 狼人殺N人：設定 / 規則：一行 / 存活： / 紀錄： / 公開紀錄（每個人看到的都一樣）/ 我是N號，身份… / 狼隊友・我的查驗・解藥 / 風格 / 私下的紀錄（狼隊頻道、查驗、女巫用藥、守護…）/ 現在：…\r\n"+
"// 同一時間每位電腦的提示，前面（到公開紀錄為止）一字不差，模型可以重用那一段的計算（ai/ww/mini.js 的前綴快取），每次只重算後面屬於他自己的部分。\r\n"+
"// 快取只在「token 一模一樣」時才重用，重用的結果和整段重算完全相同，所以不會把別人的私人資訊帶進來。\r\n"+
"const WW_RULE1={wolf:'狼人夜裡殺人',wolfKing:'狼王出局可開槍',whiteWolf:'白狼王可自爆帶人',hiddenWolf:'隱狼驗是好人',seer:'預言家驗好壞',witch:'女巫一救一毒',hunter:'獵人出局可開槍',guard:'守衛每晚守一人',idiot:'白痴被投免死',knight:'騎士可決鬥',gravekeeper:'守墓人知出局者好壞',crow:'烏鴉詛咒加一票',bear:'熊旁有狼會咆哮'};\r\n"+
"function wwRuleLine(cfgLine){const ks=[];for(const m of String(cfgLine).matchAll(/([^：、×（]+)×\d+/g)){const k=Object.keys(WW_RULE1).find(x=>WW_ROLES[x].n===m[1]);if(k)ks.push(WW_RULE1[k]);}\r\n"+
"  return'規則：'+ks.join('，')+'；狼全出局好人勝，'+(/屠城/.test(cfgLine)?'好人全滅狼勝':'神或民全滅狼勝');}\r\n"+
"const WW_PRIV=/^(?:（狼隊）|查驗：|守墓人：|你|今晚你|時間到，今晚你)/;   // 紀錄裡只有自己看得到的那幾種\r\n"+
"function wwTalkReorder(p){const ls=String(p).replace(/\r/g,'').split('\n'),k=ls.indexOf('紀錄：');if(k<1||ls.some(l=>l.startsWith('規則：')))return String(p);\r\n"+
"  const head=ls.slice(1,k),pub=[],prv=[];ls.slice(k+1,-1).forEach(l=>{if(l)(WW_PRIV.test(l)?prv:pub).push(l);});\r\n"+
"  while(pub.join('\n').length>900&&pub.length>4)pub.shift();   // 公開紀錄太長從最舊的丟（只看公開的長度，大家丟的一樣）\r\n"+
"  return[ls[0],wwRuleLine(ls[0]),head.find(l=>l.startsWith('存活：'))||'存活：','紀錄：',...pub,...head.filter(l=>!l.startsWith('存活：')),...prv.slice(-8),ls[ls.length-1]].join('\n');}\r\n"+
"function wwTalkPrompt(st,seat){return wwTalkReorder(wwTalkPromptV1(st,seat,true));}\r\n"+
"// 口頭禪：小模型很愛說");
rep("^狼隊友：|^開始發言","^狼隊友：|^你的狼隊友：|^開始發言");
fs.writeFileSync(f,s);console.log('ok');
