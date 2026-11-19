// 確認 ai/ww/mini.js（狼人殺迷你發言模型的 JS 推論）和 PyTorch 算出一樣的值，並量速度與記憶體
// node ai/test/ww_mini_check.js [模型資料夾=ai/ww/tiny]
// model.json 裡的 test 是匯出時用 PyTorch（量化後的權重）算的：一串 token → 最後一個位置的 logits。
// 這裡用 WASM SIMD 與純 JS 兩種核心各算一次，都要和 PyTorch 一致（最大誤差 < 2e-3、最可能的前 8 個 token 順序一樣）。
const fs=require('fs'),path=require('path');
const M=require('../ww/mini.js');
const dir=process.argv[2]||path.join(__dirname,'../ww/tiny');
const meta=JSON.parse(fs.readFileSync(path.join(dir,'model.json'),'utf8'));
const bin=fs.readFileSync(path.join(dir,'model.bin'));const buf=bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength);
const c=meta.cfg;let ok=true;
console.log(`模型：${c.L} 層、寬 ${c.d}、詞表 ${c.V}、長度上限 ${c.ctx}；model.bin ${(bin.length/1048576).toFixed(2)} MB`);
const PROMPT='狼人殺9人：狼人×3、預言家×1、女巫×1、獵人×1、平民×3（屠邊）\n我是5號，身份：預言家（好人陣營）\n我的查驗：2號狼人\n風格：冷靜分析，中；策略：跳身份報查驗\n存活：1、2、3、4、5、6、7、8\n紀錄：\n【第1夜】\n查驗：2號是狼人\n【第1天】昨晚9號死亡\n（9號遺言）\n9號：我是平民，沒什麼資訊，大家加油。\n1號：昨晚死的是9號，他遺言說自己是平民，我先相信。目前沒什麼資訊，想聽聽後面的人怎麼說。\n2號：我覺得1號講得太空了，像在划水。我是好人，今天先看發言。\n3號：2號踩1號踩得有點急，我比較想聽預言家出來報查驗。\n4號：過。\n現在：第1天，輪到我發言。';
for(const noWasm of [false,true]){
  const net=new M.Net(meta,buf,{noWasm});const name=net.simd?'WASM SIMD':'純 JS';
  if(!noWasm&&!net.simd)console.log('（這個環境沒有 WASM SIMD，兩次都是純 JS）');
  const T=meta.test,lg=net.logits(T.ids);
  let md=0;T.head.forEach((v,i)=>{md=Math.max(md,Math.abs(lg[i]-v));});T.top.forEach((t,i)=>{md=Math.max(md,Math.abs(lg[t]-T.topv[i]));});
  const order=Array.from(lg.keys()).sort((a,b)=>lg[b]-lg[a]).slice(0,8),same=order.every((t,i)=>t===T.top[i]||Math.abs(lg[t]-T.topv[i])<2e-3);
  const good=md<2e-3&&same;ok=ok&&good;
  console.log(`${name}：和 PyTorch 最大誤差 ${md.toExponential(2)}，前 8 名${same?'一樣':'不一樣'} ${good?'✓ 一致':'✗ 不一致'}`);
  // 速度：固定亂數種子生成幾段
  let seed=12345;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const n=noWasm?2:8;let ms=0,tk=0,pn=0,txt='';
  for(let i=0;i<n;i++){const t0=process.hrtime.bigint();const r=net.generate(PROMPT,{rng});ms+=Number(process.hrtime.bigint()-t0)/1e6;tk+=r.n;pn=r.pn;txt=r.text;}
  console.log(`  每段 ${(ms/n).toFixed(0)} ms（提示 ${pn} token＋平均生成 ${(tk/n).toFixed(0)} token，${((pn*n+tk)/ms*1000).toFixed(0)} token/秒）；模型佔記憶體 ${(net.bytes/1048576).toFixed(0)} MB`);
  if(!noWasm)console.log('  範例：'+txt.replace(/\n/g,' ／ '));}
process.exit(ok?0:1);
