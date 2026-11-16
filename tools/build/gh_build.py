# Build the standalone GitHub Pages version from /home/claude/xiangqi.html (swaps claude room -> PeerJS)
s=open('/home/claude/xiangqi.html').read()
lines=s.split('\n')
a=next(i for i,l in enumerate(lines) if l.startswith('/* ---------- online ----------'))
b=next(i for i,l in enumerate(lines) if l.startswith('/* ---------- input ----------'))
online=open('/tmp/claude-0/-home-claude/863541ea-5b4b-5738-8d8c-237c848f2ff9/scratchpad/peer_online.js').read()
lines[a:b]=online.split('\n')
s='\n'.join(lines)
i0=s.index("(async()=>{\n  try{R=window.claude");i1=s.index("function start(saved)")
s=s[:i0]+"""R=typeof Peer!=='undefined';
setOnlineButtons();
menuMsg(R?'':'連線元件載入失敗，請檢查網路；仍可玩單機或 AI 對戰',!R);

"""+s[i1:]
s=s.replace("window.claude?.hot?.snapshot?.(()=>mode==='local'&&variant==='xq'?{mode,board,turn,hist,last,over}:{});\nwindow.claude?.hot?.ready?window.claude.hot.ready(start):start(window.claude?.hot?.data??{});","start({});")
a=s.index('/* ---------- pk-net:room ---------- */');b=s.index('/* ---------- pk-net:end ---------- */',a)+len('/* ---------- pk-net:end ---------- */')
s=s[:a]+open('/tmp/claude-0/-home-claude/863541ea-5b4b-5738-8d8c-237c848f2ff9/scratchpad/pk_net_peer.js').read().strip()+s[b:]
assert 'window.claude' not in s
t=s.index('<style>')
head='''<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#d9dde0">
<title>對坐象棋</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
FONTLINK
<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>
'''
fl=next(l for l in open('/home/claude/xiangqi.html').read().split('\n') if l.startswith('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'))
head=head.replace('FONTLINK',fl)
s=head+s[t:]
s=s.replace("html,body{height:100%}","html,body{height:100%;margin:0}\n*{box-sizing:border-box}\nbody{font-size:14px;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n[hidden]{display:none!important}",1)
s=s.replace("</style>\n","</style>\n</head>\n<body>\n",1)
s=s.rstrip()+"\n</body>\n</html>\n"
import re,base64,os
os.makedirs('/home/claude/gh/models',exist_ok=True)
for m in re.finditer(r'<script type="text/plain" id="glb-([a-z-]+)">([^<]*)</script>\n',s):
    open('/home/claude/gh/models/'+m.group(1)+'.glb','wb').write(base64.b64decode(m.group(2)))
s=re.sub(r'<script type="text/plain" id="glb-([a-z-]+)">([^<]*)</script>\n','',s)
open('/home/claude/gh/index.html','w').write(s)
print('built')
