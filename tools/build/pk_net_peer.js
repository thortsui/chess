/* ---------- pk-net:peer ---------- */
// 撲克牌連線（GitHub／App 版：PeerJS）。房主的 Peer ID 是固定前綴＋房號，最多接受 3 位加入者
const PK_PREFIX='thortsui-xiangqi-pk-';
function pkOpenPeer(id){return new Promise(res=>{let p,done=false;const fin=v=>{if(done)return;done=true;clearTimeout(t);res(v);};
  try{p=id?new Peer(id):new Peer();}catch(e){res(null);return;}
  const t=setTimeout(()=>{try{p.destroy()}catch(e){}fin(null);},12000);
  p.on('open',()=>fin(p));p.on('error',()=>{if(done)return;try{p.destroy()}catch(x){}fin(null);});});}
const pkNet={
  async host(){
    for(let i=0;i<4;i++){const code=String(Math.floor(Math.random()*10000)).padStart(4,'0');const peer=await pkOpenPeer(PK_PREFIX+code);if(!peer)continue;
      const conns={};let msgFn=()=>{},leaveFn=()=>{};
      peer.on('connection',c=>{
        if(Object.keys(conns).length>=3&&!conns[c.peer]){c.on('open',()=>{try{c.send({m:{k:'full',why:'房間已經滿 4 人'}});}catch(e){}setTimeout(()=>{try{c.close()}catch(e){}},600);});return;}
        conns[c.peer]=c;c.on('data',d=>{if(d&&typeof d==='object')msgFn(c.peer,d.m);});
        c.on('close',()=>{if(conns[c.peer]===c){delete conns[c.peer];leaveFn(c.peer);}});c.on('error',()=>{});});
      return{code,sendTo(to,m){const c=conns[to];try{if(c&&c.open)c.send({m});}catch(e){}},sendHost(){},onMsg(fn){msgFn=fn;},onLeave(fn){leaveFn=fn;},
        close(){Object.values(conns).forEach(c=>{try{c.close()}catch(e){}});try{peer.destroy()}catch(e){}}};}
    return null;},
  async join(code){
    const peer=await pkOpenPeer(null);if(!peer)return null;
    const c=peer.connect(PK_PREFIX+code,{reliable:true});
    const ok=await new Promise(res=>{const t=setTimeout(()=>res(false),8000);c.on('open',()=>{clearTimeout(t);res(true);});c.on('error',()=>{clearTimeout(t);res(false);});peer.on('error',()=>{clearTimeout(t);res(false);});});
    if(!ok){try{peer.destroy()}catch(e){}return null;}
    let msgFn=()=>{},leaveFn=()=>{};c.on('data',d=>{if(d&&typeof d==='object')msgFn('host',d.m);});c.on('close',()=>leaveFn('host'));
    return{code,sendTo(){},sendHost(m){try{if(c.open)c.send({m});}catch(e){}},onMsg(fn){msgFn=fn;},onLeave(fn){leaveFn=fn;},close(){try{c.close()}catch(e){}try{peer.destroy()}catch(e){}}};}
};
/* ---------- pk-net:end ---------- */
