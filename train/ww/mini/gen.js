// 狼人殺迷你發言模型：用 JS 推論（ai/ww/mini.js，和遊戲裡同一份）替保留集寫發言，給 eval_talk.js 評估
// node train/ww/mini/gen.js <模型資料夾> <heldout.jsonl> <輸出.jsonl> [最多幾筆=1500] [溫度=0.8] [top-p=0.9] [重複懲罰=1.08]
// 輸出每行 {i,text,ms}，i 是 heldout.jsonl 的第幾行。亂數種子固定，同一個模型每次結果一樣。
const fs=require('fs'),path=require('path');
const M=require(path.join(__dirname,'../../../ai/ww/mini.js'));
const [dir,src,dst,N='1500',temp='0.8',topp='0.9',rep='1.08']=process.argv.slice(2);
const meta=JSON.parse(fs.readFileSync(path.join(dir,'model.json'),'utf8'));const bin=fs.readFileSync(path.join(dir,'model.bin'));
const net=new M.Net(meta,bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength),{noWasm:!!process.env.WW_NOWASM});
const rows=fs.readFileSync(src,'utf8').split('\n').filter(Boolean).slice(0,+N).map(JSON.parse);
let seed=20261119;const rng=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const out=[];let ms=0,mx=0;const t0=Date.now();
rows.forEach((r,i)=>{const t=process.hrtime.bigint();const g=net.generate(r.prompt,{temp:+temp,topp:+topp,rep:+rep,rng});const d=Number(process.hrtime.bigint()-t)/1e6;ms+=d;if(d>mx)mx=d;
  out.push(JSON.stringify({i,text:g.text,ms:Math.round(d),n:g.n,pn:g.pn}));});
fs.writeFileSync(dst,out.join('\n')+'\n');
console.log(`${rows.length} 筆，${net.simd?'WASM SIMD':'純 JS'}，平均每段 ${(ms/rows.length).toFixed(0)} ms，最慢 ${mx.toFixed(0)} ms`);
