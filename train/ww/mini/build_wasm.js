// 把 kern.wat（兩個 SIMD 小函式：矩陣×向量、加權和）組譯成 wasm，印出 base64，貼到 ai/ww/mini.js 的 WASM_B64
// 需要 npm install wabt；node train/ww/mini/build_wasm.js
// matvec(W,x,y,R,C)：y[r]=Σ W[r,j]·x[j]；wsum(V,a,y,T,C)：y[j]=Σ a[t]·V[t,j]。位址都是位元組，C 必須是 16 的倍數。
const fs=require('fs'),path=require('path');
require('wabt')().then(w=>{const src=fs.readFileSync(path.join(__dirname,'kern.wat'),'utf8');
  const bin=Buffer.from(w.parseWat('kern.wat',src,{simd:true}).toBinary({}).buffer);console.log(bin.length,'bytes');console.log(bin.toString('base64'));});
