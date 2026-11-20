// 狼人殺 AI 發言：迷你語言模型（從頭訓練的小型 Transformer）的 JS 推論。不依賴任何函式庫、不用 WebGPU。
// 同一個檔案三種用法：
//   1. Web Worker：new Worker('ai/ww/mini.js')
//        {cmd:'load',meta,buf[,noWasm]} → {type:'ready',ms,simd} 或 {type:'error',msg}   （meta＝model.json 的內容，buf＝model.bin 的 ArrayBuffer）
//        {cmd:'gen',id,prompt}          → {type:'gen',id,text,ms,n,pn}                    （prompt＝wwTalkPrompt 的輸出）
//   2. Node：const M=require('./ai/ww/mini.js')；new M.Net(meta,buf).generate(prompt)
//   3. 訓練工具（train/ww/mini/*.js）共用這裡的斷詞（Tok），所以 Python 那邊不用另外寫一份。
// 模型：<bos> 提示 <sep> 發言＋「投:N」 <eos>。權重在檔案裡是 int8（每列一個縮放值），載入時還原成 Float32。
// 運算：有 WebAssembly SIMD 就用兩個小 SIMD 函式（train/ww/mini/kern.wat，快約 10 倍），沒有就用純 JS。每個 token 都有 KV 快取。
(function(root){'use strict';
const PAD=0,BOS=1,SEP=2,EOS=3,UNK=4,NSPEC=5;
// ---------- 斷詞：從左到右每次取詞表裡最長的片語；不在詞表的字是 <unk> ----------
class Tok{
  constructor(tokens){this.t=tokens;this.m=new Map();this.max=1;
    for(let i=NSPEC;i<tokens.length;i++){this.m.set(tokens[i],i);if(tokens[i].length>this.max)this.max=tokens[i].length;}
    // 帶號碼的 token：「投:N」（投票）和「N號…」開頭的，生成時用來擋掉不合法的號碼（見 ban）
    this.votes=[];this.seats=[];tokens.forEach((t,i)=>{let m;if((m=/^投:(\d+)$/.exec(t)))this.votes.push([i,+m[1]]);else if((m=/^(\d+)號/.exec(t)))this.seats.push([i,+m[1]]);});}
  // 這個提示下不能出現的 token：投給不在場的人或自己（「投:N」）、超出人數的號碼（「N號」）。規則引擎本來就會擋，這裡直接不讓模型選，少重寫幾次
  ban(p){const s=String(p),n=+(/^狼人殺(\d+)人/.exec(s)||[])[1]||12,me=+(/\n我是(\d+)號/.exec(s)||[])[1]||0,al=/\n存活：([\d、]+)/.exec(s);
    const ok=new Set(al?al[1].split('、').map(Number):[]);const out=[];
    if(al)for(const [i,k] of this.votes)if(k===me||!ok.has(k))out.push(i);
    for(const [i,k] of this.seats)if(k<1||k>n)out.push(i);return out;}
  encode(s){const out=[],n=s.length;let i=0;
    while(i<n){let L=Math.min(this.max,n-i),id;for(;L>0;L--){id=this.m.get(s.substr(i,L));if(id!==undefined)break;}
      if(L===0){out.push(UNK);i++;}else{out.push(id);i+=L;}}
    return out;}
  decode(ids){let s='';for(const i of ids)if(i>=NSPEC)s+=this.t[i];return s;}
  // 提示太長時從最舊的紀錄開始丟（開頭的身份資訊與最後一行「現在：…」一定留著）
  prompt(p,budget){const ls=String(p).replace(/\r/g,'').split('\n');const k=ls.indexOf('紀錄：');
    if(k<0||ls.length<k+2){const a=this.encode(ls.join('\n'));return a.length>budget?a.slice(a.length-budget):a;}
    // 新順序（0.27.0 起）：公開的（設定、規則、公開紀錄、存活）在前，「我是N號，身份…」以後是自己的。太長時從最舊的公開紀錄開始丟，自己的部分一定留著
    const j=ls.findIndex((l,i)=>i>k&&/^(?:我是\d+號，身份|存活：)/.test(l));   // 「存活：」在公開紀錄之後、自己的部分之前，不會被丟
    if(j>k){let me='',can='',ex='';for(const l of ls){let m;if((m=/^我是(\d+)號/.exec(l)))me=m[1];else if((m=/^存活：(.*)$/.exec(l)))can=m[1];else if(/^(我的查驗|狼隊友)：/.test(l))ex+='，'+l;}
      can=can.split('、').filter(x=>x!==me).join('、');
      const head=this.encode(ls.slice(0,k+1).join('\n')+'\n'),tail=this.encode(ls.slice(j).join('\n')+(me?'\n我'+me+'號'+ex+'，可投：'+can:''));
      const log=ls.slice(k+1,j).map(l=>this.encode(l+'\n'));let tot=head.length+tail.length;for(const l of log)tot+=l.length;
      // 一次丟到下一個「【第N夜／天】」為止（開頭不常變，前綴快取才用得上）
      const day=a=>this.decode(a).startsWith('【第');
      while(tot>budget&&log.length){tot-=log.shift().length;while(log.length&&!day(log[0]))tot-=log.shift().length;}
      let out=head;for(const l of log)out=out.concat(l);out=out.concat(tail);
      return out.length>budget?out.slice(out.length-budget):out;}
    // 最後再提醒一次「我是幾號、可以投誰」：小模型記不住離得很遠的開頭，放在回答前面，號碼就不容易講錯
    //（預言家的查驗、狼隊友也一起重複，少報錯查驗、少把隊友說成狼）
    let me='',can='',ex='';for(const l of ls.slice(0,k)){let m;if((m=/^我是(\d+)號/.exec(l)))me=m[1];else if((m=/^存活：(.*)$/.exec(l)))can=m[1].split('、').filter(x=>x!==me).join('、');
      else if(/^(我的查驗|狼隊友)：/.test(l))ex+='，'+l;}
    const head=this.encode(ls.slice(0,k+1).join('\n')+'\n'),tail=this.encode(ls[ls.length-1]+(me?'\n我'+me+'號'+ex+'，可投：'+can:''));
    const log=ls.slice(k+1,-1).map(l=>this.encode(l+'\n'));let tot=head.length+tail.length;for(const l of log)tot+=l.length;
    while(tot>budget&&log.length)tot-=log.shift().length;
    let out=head;for(const l of log)out=out.concat(l);out=out.concat(tail);
    return out.length>budget?out.slice(out.length-budget):out;}
}
// ---------- 運算核心 ----------
const WASM_B64='AGFzbQEAAAABCQFgBX9/f39/AAMDAgAABQMBAAEHFwMDbWVtAgAGbWF0dmVjAAAEd3N1bQABCtUDAusBAgR/BHsgBEECdCEHAkADQCAFIANPDQFDAAAAAP0TIQkgCSEKIAkhCyAJIQxBACEGA0AgASAGaiEIIAkgAP0ABAAgCP0ABAD95gH95AEhCSAKIAD9AAQQIAj9AAQQ/eYB/eQBIQogCyAA/QAEICAI/QAEIP3mAf3kASELIAwgAP0ABDAgCP0ABDD95gH95AEhDCAAQcAAaiEAIAZBwABqIQYgBiAHSQ0ACyAJIAr95AEgCyAM/eQB/eQBIQkgAiAJ/R8AIAn9HwGSIAn9HwIgCf0fA5KSOAIAIAJBBGohAiAFQQFqIQUMAAsLC+UBAgR/AXsgBEECdCEHQQAhBgNAIAIgBmpDAAAAAP0T/QsEACAGQRBqIQYgBiAHSQ0ACwJAA0AgBSADTw0BIAEqAgD9EyEJQQAhBgNAIAIgBmohCCAIIAj9AAQAIAkgAP0ABAD95gH95AH9CwQAIAggCP0ABBAgCSAA/QAEEP3mAf3kAf0LBBAgCCAI/QAEICAJIAD9AAQg/eYB/eQB/QsEICAIIAj9AAQwIAkgAP0ABDD95gH95AH9CwQwIABBwABqIQAgBkHAAGohBiAGIAdJDQALIAFBBGohASAFQQFqIQUMAAsLCw==';
function b64(s){if(typeof atob==='function'){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}return new Uint8Array(Buffer.from(s,'base64'));}
function wasmKernel(){try{if(typeof WebAssembly!=='object')return null;const bin=b64(WASM_B64);if(!WebAssembly.validate(bin))return null;
    return new WebAssembly.Instance(new WebAssembly.Module(bin)).exports;}catch(e){return null;}}
// 純 JS 版（位址是 Float32 的索引）
function mvJS(F,W,x,y,R,C){for(let r=0;r<R;r++){const o=W+r*C;let a=0,b=0,c=0,d=0;
    for(let j=0;j<C;j+=4){a+=F[o+j]*F[x+j];b+=F[o+j+1]*F[x+j+1];c+=F[o+j+2]*F[x+j+2];d+=F[o+j+3]*F[x+j+3];}F[y+r]=a+b+c+d;}}
function wsJS(F,V,a,y,T,C){for(let j=0;j<C;j++)F[y+j]=0;for(let t=0;t<T;t++){const s=F[a+t],o=V+t*C;for(let j=0;j<C;j++)F[y+j]+=s*F[o+j];}}
// ---------- 模型 ----------
class Net{
  // meta：model.json；buf：model.bin（ArrayBuffer）；opt.noWasm＝強制用純 JS
  constructor(meta,buf,opt){opt=opt||{};const c=meta.cfg;this.cfg=c;this.tok=new Tok(meta.tokens);
    const d=c.d,L=c.L,V=c.V,ctx=c.ctx,nh=c.nh,hd=d/nh;this.hd=hd;
    // 記憶體配置（單位：float）
    let n=16;const A=k=>{const o=n;n+=(k+15)&~15;return o;};const off={};
    for(const t of meta.tensors)off[t.n]=A(t.r*t.c);
    this.KC=A(L*nh*ctx*hd);this.VC=A(L*nh*ctx*hd);
    this.X=A(d);this.H=A(d);this.QKV=A(3*d);this.ATT=A(ctx);this.O=A(d);this.U=A(4*d);this.T1=A(d);this.LOG=A(V);
    const k=opt.noWasm?null:wasmKernel();this.simd=!!k;
    if(k){const need=Math.ceil(n*4/65536)+1;k.mem.grow(need-1);this.F=new Float32Array(k.mem.buffer);
      this.mv=(W,x,y,R,C)=>k.matvec(W<<2,x<<2,y<<2,R,C);this.ws=(Vv,a,y,T,C)=>k.wsum(Vv<<2,a<<2,y<<2,T,C);}
    else{const F=this.F=new Float32Array(n);this.mv=(W,x,y,R,C)=>mvJS(F,W,x,y,R,C);this.ws=(Vv,a,y,T,C)=>wsJS(F,Vv,a,y,T,C);}
    // 還原權重：檔案前段是 float32（量化張量的每列縮放值、沒量化的張量本體），後段是 int8
    const F=this.F;let nf=0;for(const t of meta.tensors)nf+=t.q?t.r:t.r*t.c;
    const fs=new Float32Array(buf,0,nf),q8=new Int8Array(buf,nf*4);let fo=0,qo=0;
    for(const t of meta.tensors){const o=off[t.n];
      if(t.q){for(let r=0;r<t.r;r++){const s=fs[fo+r],b=o+r*t.c,qb=qo+r*t.c;for(let j=0;j<t.c;j++)F[b+j]=q8[qb+j]*s;}fo+=t.r;qo+=t.r*t.c;}
      else{F.set(fs.subarray(fo,fo+t.r*t.c),o);fo+=t.r*t.c;}}
    this.E=off.emb;this.P=off.pos;this.GF=off.nf;this.lay=[];
    for(let l=0;l<L;l++)this.lay.push({g1:off['b'+l+'.n1'],qkv:off['b'+l+'.qkv'],proj:off['b'+l+'.proj'],g2:off['b'+l+'.n2'],fc1:off['b'+l+'.fc1'],fc2:off['b'+l+'.fc2']});
    this.pos=0;this.bytes=n*4;}
  norm(x,y,g,d){const F=this.F;let s=0;for(let i=0;i<d;i++)s+=F[x+i]*F[x+i];const r=1/Math.sqrt(s/d+1e-6);for(let i=0;i<d;i++)F[y+i]=F[x+i]*r*F[g+i];}
  reset(){this.pos=0;this.seq=null;}
  // 吃一個 token（位置 this.pos），want＝要不要算下一個 token 的 logits（回傳 Float32Array 的 view）
  step(tok,want){const F=this.F,c=this.cfg,d=c.d,nh=c.nh,hd=this.hd,ctx=c.ctx,pos=this.pos,X=this.X,H=this.H,Q=this.QKV,ATT=this.ATT,O=this.O,U=this.U,T1=this.T1;
    if(pos>=ctx)throw new Error('超過長度上限');
    const e=this.E+tok*d,p=this.P+pos*d;for(let i=0;i<d;i++)F[X+i]=F[e+i]+F[p+i];
    const sc=1/Math.sqrt(hd),T=pos+1;
    for(let l=0;l<c.L;l++){const w=this.lay[l];
      this.norm(X,H,w.g1,d);this.mv(w.qkv,H,Q,3*d,d);
      for(let h=0;h<nh;h++){const kb=this.KC+(l*nh+h)*ctx*hd,vb=this.VC+(l*nh+h)*ctx*hd;
        F.copyWithin(kb+pos*hd,Q+d+h*hd,Q+d+h*hd+hd);F.copyWithin(vb+pos*hd,Q+2*d+h*hd,Q+2*d+h*hd+hd);
        this.mv(kb,Q+h*hd,ATT,T,hd);
        let mx=-1e30;for(let t=0;t<T;t++){const v=F[ATT+t]*sc;F[ATT+t]=v;if(v>mx)mx=v;}
        let sum=0;for(let t=0;t<T;t++){const v=Math.exp(F[ATT+t]-mx);F[ATT+t]=v;sum+=v;}
        const inv=1/sum;for(let t=0;t<T;t++)F[ATT+t]*=inv;
        this.ws(vb,ATT,O+h*hd,T,hd);}
      this.mv(w.proj,O,T1,d,d);for(let i=0;i<d;i++)F[X+i]+=F[T1+i];
      this.norm(X,H,w.g2,d);this.mv(w.fc1,H,U,4*d,d);
      for(let i=0,n4=4*d;i<n4;i++){const v=F[U+i];F[U+i]=v<=-3?0:v>=3?v:v*(v+3)/6;}   // Hardswish
      this.mv(w.fc2,U,T1,d,4*d);for(let i=0;i<d;i++)F[X+i]+=F[T1+i];}
    this.pos++;
    if(!want)return null;
    this.norm(X,H,this.GF,d);this.mv(this.E,H,this.LOG,c.V,d);return F.subarray(this.LOG,this.LOG+c.V);}
  // 一串 token 從頭算，回傳最後一個位置的 logits（測試用）
  logits(ids){this.reset();let r=null;for(let i=0;i<ids.length;i++)r=this.step(ids[i],i===ids.length-1);return r;}
  // 取樣：溫度、top-p、重複懲罰（只看這次已經生成的 token）
  sample(lg,seen,o){const V=lg.length,temp=o.temp,rep=o.rep;
    for(const t of new Set(seen)){lg[t]=lg[t]>0?lg[t]/rep:lg[t]*rep;}
    lg[PAD]=lg[BOS]=lg[SEP]=lg[UNK]=-1e30;if(o.ban)for(const t of o.ban)lg[t]=-1e30;
    let mx=-1e30;for(let i=0;i<V;i++)if(lg[i]>mx)mx=lg[i];
    const cand=[];let sum=0;for(let i=0;i<V;i++){const p=Math.exp((lg[i]-mx)/temp);if(p>1e-6){cand.push([p,i]);sum+=p;}}
    cand.sort((a,b)=>b[0]-a[0]);
    let cut=o.topp*sum,acc=0,k=0;for(;k<cand.length;k++){acc+=cand[k][0];if(acc>=cut){k++;break;}}
    let r=(o.rng?o.rng():Math.random())*acc;for(let i=0;i<k;i++){r-=cand[i][0];if(r<=0)return cand[i][1];}
    return cand[0][1];}
  // 提示 → 發言文字。opt：max（最多幾個 token，預設 96）、temp 0.8、topp 0.9、rep 1.08、rng、free（true＝不擋不合法的號碼，評估用）
  // 前綴快取（0.27.0 起）：記住上一次算過的 token 序列（this.seq）。這次的提示開頭和它一模一樣的那幾個 token，KV 快取直接沿用，從第一個不一樣的位置開始重算。
  // 每個位置的 KV 只由「它和它前面的 token」決定，所以只要 token 完全相同，沿用和重算的結果一模一樣——不會把上一個人的私人資訊帶進來（那一段一定不一樣，會重算）。
  // opt.noCache：整段重算（測試用）
  generate(prompt,opt){const o=Object.assign({max:96,temp:0.8,topp:0.9,rep:1.08},opt||{});const c=this.cfg;
    const ids=[BOS,...this.tok.prompt(prompt,c.ctx-2-o.max),SEP];if(!o.ban&&!o.free)o.ban=this.tok.ban(prompt);
    const S=o.noCache?[]:(this.seq||[]),m=Math.min(S.length,ids.length-1);let k=0;while(k<m&&S[k]===ids[k])k++;
    this.pos=k;let lg=null;for(let i=k;i<ids.length;i++)lg=this.step(ids[i],i===ids.length-1);
    const seq=ids.slice(),out=[];
    for(let i=0;i<o.max;i++){const t=this.sample(lg,out,o);if(t===EOS)break;out.push(t);if(this.pos>=c.ctx)break;lg=this.step(t,true);seq.push(t);}
    this.seq=seq;
    return{text:this.tok.decode(out),n:out.length,pn:ids.length,hit:k};}
}
const API={Tok,Net,PAD,BOS,SEP,EOS,UNK,NSPEC};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.WWMini=API;
// ---------- Web Worker ----------
if(typeof WorkerGlobalScope!=='undefined'&&typeof self!=='undefined'&&self instanceof WorkerGlobalScope){let net=null;
  self.onmessage=ev=>{const m=ev.data||{};
    if(m.cmd==='load'){try{const t0=performance.now();net=new Net(m.meta,m.buf,{noWasm:!!m.noWasm});
        net.generate('狼人殺6人\n紀錄：\n現在：第1天，輪到我發言。',{max:4});   // 暖機
        postMessage({type:'ready',ms:performance.now()-t0,simd:net.simd,mb:net.bytes/1048576});}
      catch(e){net=null;postMessage({type:'error',msg:String(e&&e.message||e)});}return;}
    if(m.cmd==='gen'){const t0=performance.now();
      try{if(!net)throw new Error('模型還沒載入');const r=net.generate(m.prompt,m.opt);postMessage({type:'gen',id:m.id,text:r.text,n:r.n,pn:r.pn,ms:performance.now()-t0});}
      catch(e){postMessage({type:'gen',id:m.id,text:null,err:String(e&&e.message||e),ms:performance.now()-t0});}}};}
})(typeof self!=='undefined'?self:this);
