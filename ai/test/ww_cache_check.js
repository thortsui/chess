// 前綴快取的檢查：node ai/test/ww_cache_check.js [局數=4]
// 跑全電腦對局，把每位電腦發言時的提示依序丟給「有快取」的模型，同時用「每次整段重算」的模型算一次，
// 兩邊用同一組亂數：產生的文字必須一模一樣（快取不會改變結果＝不會把上一個人的私人資訊帶進來），並統計快取省下多少 token。
const fs=require('fs'),path=require('path');
const E=require('../../tools/ww_engine.js'),M=require('../../ai/ww/mini.js');
const dir=path.join(__dirname,'../ww/tiny'),meta=JSON.parse(fs.readFileSync(path.join(dir,'model.json'),'utf8')),bin=fs.readFileSync(path.join(dir,'model.bin'));
const mk=()=>new M.Net(meta,bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength),{});
const A=mk(),B=mk(),N=+(process.argv[2]||4);
const rng=seed=>{let x=seed>>>0||1;return()=>{x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;return x/4294967296;};};
let n=0,bad=0,hit=0,tot=0,ta=0,tb=0,seed=1;
E.wwSetTalk(async(prompt,st,seat,k,opt)=>{seed++;
  let t=process.hrtime.bigint();const a=A.generate(prompt,{...opt,rng:rng(seed)});ta+=Number(process.hrtime.bigint()-t)/1e6;
  t=process.hrtime.bigint();const b=B.generate(prompt,{...opt,rng:rng(seed),noCache:true});tb+=Number(process.hrtime.bigint()-t)/1e6;
  n++;hit+=a.hit;tot+=a.pn;if(a.text!==b.text){bad++;if(bad<3)console.log('不一樣：',JSON.stringify(a.text),JSON.stringify(b.text));}
  return a.text;});
(async()=>{for(let g=0;g<N;g++){const c=6+g%7,st=E.wwNew(E.wwCfgFor(c),Array(c).fill(true),0);let t=0,k=0;
    while(!st.over&&k++<30000){t+=300;E.wwTick(st,t);if(st.talk&&st.talk.res===undefined&&st.talk.p)await st.talk.p;}}
  console.log(`${n} 次生成：快取和整段重算結果不同 ${bad} 次；提示 token 有 ${(100*hit/tot).toFixed(0)}% 沿用快取；平均 ${(ta/n).toFixed(0)} ms（有快取）vs ${(tb/n).toFixed(0)} ms（整段重算）`);
  console.log(bad?'失敗':'全部通過');process.exit(bad?1:0);})();
