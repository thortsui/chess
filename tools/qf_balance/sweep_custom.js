// node sweep.js <開始索引> <結束索引> <每組局數> <深度>
const fs=require('fs');let SRC=fs.readFileSync(__dirname+'/../qf_engine.js','utf8').replace('var qfEngine','globalThis.qfEngine');
const SRC_NODBL=SRC.replace('const start=side>0?r===8:r===1;','const start=false;');
const L={R:1,N:2,B:3,A:4,K:5,C:6,P:7,T:8,H:9,F:10,D:11,Y:12,I:13};
const F='thfdydfht'+'iiiiiiiii'+'.........'.repeat(3);
function combos(){const out=[];
  for(const first of['r','b'])for(const back of['相','傌'])for(const r8 of['空','2俥','2俥2傌','2炮'])for(const can of[2,4])for(const sol of['河邊5','原位5','河邊3']){
    out.push({first,back,r8,can,sol,dbl:true});}
  // 再加 4 組：法軍士兵不能走兩步
  for(const first of['r','b'])for(const back of['相','傌'])out.push({first,back,r8:'2俥',can:4,sol:'河邊5',dbl:false});
  return out;}
function board(c){const rows=Array.from({length:5},()=>'.........'.split(''));
  // rows[0]=第5列 ... rows[4]=第9列
  const sc=c.sol==='河邊3'?[2,4,6]:[0,2,4,6,8],sr=c.sol==='原位5'?1:0;sc.forEach(x=>rows[sr][x]='P');
  (c.can===4?[1,2,6,7]:[1,7]).forEach(x=>rows[2][x]='C');
  const r8={空:{},'2俥':{0:'R',8:'R'},'2俥2傌':{0:'R',1:'N',7:'N',8:'R'},'2炮':{0:'C',8:'C'}}[c.r8];for(const k in r8)rows[3][k]=r8[k];
  rows[4]=(c.back==='相'?'RNBAKABNR':'RNNAKANNR').split('');
  return F+rows.map(r=>r.join('')).join('');}
const [a,b,N,D]=process.argv.slice(2).map(Number);const all=combos();if(process.env.START){all.length=0;all.push({first:process.env.FIRST||'r',back:'自訂',r8:'-',can:0,sol:'-',dbl:true,start:process.env.START});}
for(let i=a;i<Math.min(b,all.length);i++){const c=all[i],start=c.start||board(c);if(start.length!==90)throw 'len';
  eval((c.dbl?SRC:SRC_NODBL));const E=globalThis.qfEngine;const res={r:0,b:0,d:0};let plies=0;
  for(let g=0;g<N;g++){let bd=start.split(''),s=c.first,k=0;
    for(;k<400;k++){let r;
      if(k<4){const B=E._B();for(let j=0;j<90;j++){const ch=bd[j];B[j]=ch==='.'?0:(ch===ch.toUpperCase()?L[ch]:-L[ch.toUpperCase()]);}
        const me=s==='r'?1:-1,ms=E.gen(me,false).filter(m=>{const f=(m/90)|0,t=m%90,p=B[f],q=B[t];B[t]=p;B[f]=0;const bad=E.gen(-me,true).some(x=>{const v=B[x%90];return v===me*5||v===me*12;});B[f]=p;B[t]=q;return!bad;});
        if(!ms.length){r=null;}else{const m=ms[Math.floor(Math.random()*ms.length)];r={f:(m/90)|0,t:m%90};}}
      else r=E.think({b:bd.join(''),s,time:60000,depth:D});
      if(!r){res[s==='r'?'b':'r']++;break;}
      const p=bd[r.f];bd[r.t]=(p==='i'&&r.t>=81)?'d':(p==='I'&&r.t<9)?'D':p;bd[r.f]='.';s=s==='r'?'b':'r';}
    if(k>=400)res.d++;plies+=k;}
  console.log(JSON.stringify({i,...c,...res,score:(res.r+res.d/2)/N,plies:Math.round(plies/N)}));}
