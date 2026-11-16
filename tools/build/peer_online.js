/* ---------- online (PeerJS · 房主當伺服器) ---------- */
const enc=b=>b.flat().map(p=>p?(p.s==='r'?p.t:p.t.toLowerCase()):'.').join('');
function dec(s){const b=[];for(let r=0;r<10;r++){b.push([]);for(let c=0;c<9;c++){const ch=s[r*9+c];
  b[r].push(ch==='.'?null:{t:ch.toUpperCase(),s:ch===ch.toUpperCase()?'r':'b'});}}return b;}
function snapshot(){if(variant==='dk')return dkSnapshot();if(variant==='ch')return chSnapshot();if(variant==='gm')return gmSnapshot();if(variant==='go')return goSnapshot();return{v:'xq',seq,b:enc(board),t:turn,l:last?[...last.from,...last.to]:null,
  o:over?[over.winner,over.mate?1:0]:null,g:guestPeer,h:hist.length};}
const PREFIX='thortsui-xiangqi-';
let peer=null,conn=null;
function send(c,topic,data){try{if(c&&c.open)c.send({topic,data});}catch(e){}}
const ROOM={emit:(t,d)=>{send(conn,t,d);return Promise.resolve();},leave:()=>Promise.resolve()};
function broadcast(){if(role==='host')send(conn,'st',snapshot());}
const isOpp=()=>true;

function onState(m){
  if(role!=='guest')return;
  const d=m.data;
  if(d&&d.v==='dk'){dkOnState(d);return;}
  if(d&&d.v==='ch'){chOnState(d);return;}
  if(d&&d.v==='gm'){gmOnState(d);return;}
  if(d&&d.v==='go'){goOnState(d);return;}
  variant='xq';
  if(!d||typeof d.b!=='string'||d.b.length!==90||!/^[RNBAKCPrnbakcp.]+$/.test(d.b)||!Number.isInteger(d.seq))return;
  if(mode==='online'&&d.seq<seq)return;
  const moved=mode==='online'&&d.seq>seq&&(d.h|0)>guestHist;
  seq=d.seq;board=dec(d.b);turn=d.t==='b'?'b':'r';
  const l=Array.isArray(d.l)&&d.l.length===4&&d.l.every(n=>Number.isInteger(n))?d.l:null;
  last=l?{from:[l[0],l[1]],to:[l[2],l[3]]}:null;
  over=Array.isArray(d.o)?{winner:d.o[0]==='b'?'b':'r',mate:!!d.o[1]}:null;
  if((d.h|0)<guestHist||(d.h|0)===0)hideBanner();
  if(moved){undoAsk=false;myUndoReq=false;}
  guestHist=d.h|0;pendingMove=false;clearTimeout(pendTimer);hostOnline=true;
  if(sel&&!(board[sel[0]][sel[1]]&&board[sel[0]][sel[1]].s===mySide)){sel=null;targets=[];}
  else if(sel)targets=legal(board,sel[0],sel[1]);
  if(mode!=='online'){busy=false;enterGame('online');}
  render();if(moved)announce();
}
function onHi(){if(role==='host')broadcast();}
function onMv(m){
  if(variant==='dk'){if(role==='host'&&(!guestPeer||m.peer===guestPeer))dkOnMv(m.data||{});return;}
  if(variant==='ch'){if(role==='host'&&(!guestPeer||m.peer===guestPeer))chOnMv(m.data||{});return;}
  if(variant==='gm'){if(role==='host'&&(!guestPeer||m.peer===guestPeer))gmOnMv(m.data||{});return;}
  if(variant==='go'){if(role==='host'&&(!guestPeer||m.peer===guestPeer))goOnMv(m.data||{});return;}
  if(role!=='host'||over||turn!=='b')return;
  const d=m.data||{},{fr,fc,tr,tc}=d;
  if(![fr,fc,tr,tc].every(Number.isInteger)||!inB(fr,fc)||!inB(tr,tc)){broadcast();return;}
  const p=board[fr][fc];
  if(!p||p.s!=='b'||d.seq!==seq||!legalNP(fr,fc).some(([r,c])=>r===tr&&c===tc)){broadcast();return;}
  applyMove(fr,fc,tr,tc);
}
function onUr(){undoAsk=true;render();}
function onUa(m){
  if(!myUndoReq)return;
  myUndoReq=false;const ok=!!(m.data&&m.data.ok);
  if(ok&&role==='host')doUndo();
  setNote(ok?'對方同意悔棋':'對方拒絕悔棋');
}
function onFull(){if(role==='guest')failRoom('這個房間已經有兩位玩家了');}
const HANDLERS={st:onState,hi:onHi,mv:onMv,ur:onUr,ua:onUa,full:onFull,sl:onSlap,tf:onTflip};
function wire(c){
  c.on('data',d=>{if(c!==conn||!d||typeof d!=='object')return;const h=HANDLERS[d.topic];if(h)h({peer:c.peer,data:d.data});});
  c.on('close',()=>{if(c!==conn)return;if(role==='host')guestOnline=false;else hostOnline=false;pendingMove=false;render();});
  c.on('error',()=>{});
}
function hostAccept(c){
  if(conn&&conn.open&&conn.peer!==c.peer){
    c.on('open',()=>{send(c,'full',{});setTimeout(()=>{try{c.close()}catch(e){}},800);});return;}
  if(conn&&conn!==c){try{conn.close()}catch(e){}}
  conn=c;guestPeer=c.peer;wire(c);
  c.on('open',()=>{if(c!==conn)return;guestOnline=true;broadcast();render();});
}
function openPeer(id){
  return new Promise(res=>{
    let p,done=false;const fin=v=>{if(done)return;done=true;clearTimeout(t);res(v);};
    try{p=id?new Peer(id):new Peer();}catch(e){res({ok:false,err:'lib'});return;}
    const t=setTimeout(()=>{try{p.destroy()}catch(e){}fin({ok:false,err:'timeout'});},12000);
    p.on('open',()=>fin({ok:true,peer:p}));
    p.on('error',e=>{if(done)return;try{p.destroy()}catch(x){}fin({ok:false,err:e&&e.type});});
  });
}
function resetOnline(r,c){
  role=r;code=c;mySide=r==='host'?'r':'b';room=ROOM;
  hostPeer=null;guestPeer=null;myPeer=null;guestOnline=false;hostOnline=r==='host';seq=0;guestHist=0;
  pendingMove=false;undoAsk=false;myUndoReq=false;note='';
}
function leaveRoom(){
  clearInterval(rebroadcast);clearTimeout(pendTimer);
  try{conn&&conn.close()}catch(e){}try{peer&&peer.destroy()}catch(e){}
  conn=null;peer=null;room=null;role=null;
}
function failRoom(msg){leaveRoom();busy=false;showMenu(msg,true);}

async function createRoom(){
  busy=true;setOnlineButtons();menuMsg('建立房間中…');
  for(let i=0;i<5;i++){
    const c=String(Math.floor(Math.random()*10000)).padStart(4,'0');
    const r=await openPeer(PREFIX+c);
    if(r.ok){
      peer=r.peer;resetOnline('host',c);
      peer.on('connection',hostAccept);
      peer.on('disconnected',()=>{try{if(peer&&!peer.destroyed)peer.reconnect()}catch(e){}});
      peer.on('error',()=>{});
      if(variant==='dk'){mySide='A';dkFirst='A';}if(variant==='ch')mySide='w';if(variant==='gm'||variant==='go')mySide='b';init();busy=false;enterGame('online');
      rebroadcast=setInterval(()=>{if(guestOnline)broadcast();},4000);
      return;
    }
    if(r.err!=='unavailable-id'){busy=false;setOnlineButtons();menuMsg('連不上配對伺服器，請檢查網路後再試',true);return;}
  }
  busy=false;setOnlineButtons();menuMsg('房號剛好都被占用，請再試一次',true);
}
async function joinRoom(c){
  if(!/^\d{4}$/.test(c)){menuMsg('請輸入 4 位數字房號',true);return;}
  busy=true;setOnlineButtons();menuMsg(`尋找房間 ${c}…`);
  const r=await openPeer(null);
  if(!r.ok){busy=false;setOnlineButtons();menuMsg('連不上配對伺服器，請檢查網路後再試',true);return;}
  peer=r.peer;resetOnline('guest',c);hostPeer=PREFIX+c;
  const me=peer;
  peer.on('error',e=>{if(peer!==me)return;
    if(e&&e.type==='peer-unavailable'&&mode!=='online')failRoom(`找不到房號 ${c} 的房間`);});
  peer.on('disconnected',()=>{try{if(peer===me&&!me.destroyed)me.reconnect()}catch(e){}});
  const cn=peer.connect(hostPeer,{reliable:true});conn=cn;wire(cn);
  cn.on('open',()=>{if(conn!==cn)return;hostOnline=true;menuMsg('已找到房間，連線中…');send(cn,'hi',{});});
  for(let i=0;i<8&&mode!=='online'&&peer===me;i++){await sleep(1500);if(cn.open&&mode!=='online')send(cn,'hi',{});}
  if(mode!=='online'&&peer===me)failRoom('房主沒有回應，請確認房號');
}


