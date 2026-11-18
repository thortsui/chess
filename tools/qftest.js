// 清法戰爭 AI 自我對局：node tools/qftest.js
const E=require('./qf_engine.js');const res={r:0,b:0,d:0};
for(let g=0;g<6;g++){let b=('thfdydfht'+'iiiiiiiii'+'.........'+'.........'+'.........'+'P.P.P.P.P'+'.........'+'RC.....CR'+'R.......R'+'RNBAKABNR').split('');let s='r',k=0;
  for(;k<160;k++){let r;if(k<2){const B=E._B();const L={R:1,N:2,B:3,A:4,K:5,C:6,P:7,T:8,H:9,F:10,D:11,Y:12,I:13};for(let i=0;i<90;i++){const ch=b[i];B[i]=ch==='.'?0:(ch===ch.toUpperCase()?L[ch]:-L[ch.toUpperCase()]);}
      const ms=E.gen(s==='r'?1:-1,false);const m=ms[Math.floor(Math.random()*ms.length)];r={f:(m/90)|0,t:m%90};}else r=E.think({b:b.join(''),s,time:80});
    if(!r){res[s==='r'?'b':'r']++;break;}const p=b[r.f];b[r.t]=(p==='i'&&r.t>=81)?'d':(p==='I'&&r.t<9)?'D':p;b[r.f]='.';s=s==='r'?'b':'r';}
  if(k>=160)res.d++;}
console.log('清軍勝 / 法軍勝 / 和',JSON.stringify(res));
