#!/usr/bin/env bash
# 狼人殺迷你發言模型：自我對弈循環（只用筆電 CPU、低優先權，不用 DGX、不用顯示卡）
# bash train/ww/mini/selfplay_loop.sh <工作資料夾，例如 D:/ww-mini/sp> [每輪局數=1600] [同時幾個=4]
# 每一輪：
#   1. 用目前最好的模型跑 G 局全電腦對局（P 個程序同時跑），每段發言打分數（selfplay.js play）
#   2. 只留比同身份平均好的發言（selfplay.js pick）
#   3. 混一部分原本的訓練資料（避免忘掉原本會的），prep.js 整理
#   4. 從目前最好的模型接著微調 0.6 輪（CPU fp32）
#   5. 轉檔，A/B 對打 400 組（同一批局面各打兩次＝800 局，新模型分別當好人、當狼），對上目前最好的那版
#   6. 新模型那邊勝率 > 52.5% 才算變強（第 0 版＝0.27.5 的模型），成為下一輪的起點；不然這輪作廢，下一輪換一批對局再試
# 只跑幾輪：WW_ROUNDS=1。原始資料抽樣可以先自己放 <工作資料夾>/orig.jsonl（有就不會重抽）。
# 要停：touch <工作資料夾>/STOP（做完目前這一步就停）。紀錄在 <工作資料夾>/loop.log。不會動到遊戲用的 ai/ww/tiny。
set -u
W=${1:?工作資料夾}; G=${2:-1600}; P=${3:-4}
# 記憶體：微調每批最多幾個 token（CPU fp32，3000 約佔 1.7 GB；16000 會到 3.5 GB 以上，筆電記憶體會不夠），可用環境變數 WW_TOKB 改
export WW_TOKB=${WW_TOKB:-3000}
REPO=$(cd "$(dirname "$0")/../../.." && pwd); cd "$REPO"
VOCAB=D:/ww-mini/vm.json; DATA=D:/ww-mini/data
LOG=$W/loop.log; mkdir -p "$W"
log(){ echo "[$(date '+%m-%d %H:%M')] $*" | tee -a "$LOG"; }
# 自己降成低優先權，之後開的 node／python 都會繼承，不跟前景的程式搶 CPU
powershell -NoProfile -Command "(Get-Process -Id $(cat /proc/$$/winpid)).PriorityClass='BelowNormal'" 2>/dev/null
export PYTHONUTF8=1
[ -d "$W/t0" ] || { cp -r ai/ww/tiny "$W/t0"; mkdir -p "$W/r0"; cp D:/ww-mini/rm2/ckpt.pt "$W/r0/ckpt.pt"; }
# 原本的訓練資料抽樣（固定一份）：0.8B 資料 10%、老師資料 30%，只要通過檢查的
[ -f "$W/orig.jsonl" ] || node -e "
const fs=require('fs');const out=[];const pick=(f,p)=>{for(const l of fs.readFileSync(f,'utf8').split('\n')){if(!l||Math.random()>=p)continue;const d=JSON.parse(l);if(!d.err)out.push(l);}};
pick('$DATA/a.jsonl',.1);pick('$DATA/b.jsonl',.1);pick('$DATA/teacher.jsonl',.3);fs.writeFileSync('$W/orig.jsonl',out.join('\n')+'\n');console.log('原始資料抽樣',out.length);" | tee -a "$LOG"
[ -f "$W/best" ] || echo 0 > "$W/best"
# 中斷後重跑會從沒做完的那一輪、沒做完的那一步接著做（每輪做完會寫 done<K>）
K=$(ls "$W"/done[0-9]* 2>/dev/null | wc -l)
while [ ! -f "$W/STOP" ]; do
  K=$((K+1)); B=$(cat "$W/best"); log "第 $K 輪開始，起點是第 $B 版"
  if [ ! -f "$W/pick$K.jsonl" ]; then
    rm -f "$W"/play$K-*.jsonl
    for i in $(seq 1 $P); do node train/ww/mini/selfplay.js play "$W/t$B" "$W/play$K-$i.jsonl" $((G/P)) $((K*100+i)) > "$W/play$K-$i.log" 2>&1 & done; wait
    [ -f "$W/STOP" ] && break
    node train/ww/mini/selfplay.js pick "$W"/play$K-*.jsonl "$W/pick$K.jsonl" | tee -a "$LOG"; fi
  if [ ! -f "$W/p$K/train.u16" ]; then
    WW_AUG=1 node --max-old-space-size=6000 train/ww/mini/prep.js "$W/p$K" "$VOCAB" "$W/orig.jsonl" "$W/pick$K.jsonl" > "$W/p$K.log" 2>&1; tail -1 "$W/p$K.log" | tee -a "$LOG"; fi
  [ -f "$W/STOP" ] && break
  if [ ! -f "$W/r$K/ckpt.pt" ]; then
    WW_DEV=cpu WW_THREADS=8 WW_INIT="$W/r$B/ckpt.pt" python train/ww/mini/train.py "$W/p$K" "$W/r$K" 320 8 0.6 128 3e-4 > "$W/r$K.log" 2>&1; grep -E "保留集|完成" "$W/r$K.log" | tee -a "$LOG"; fi
  [ -f "$W/r$K/ckpt.pt" ] || { log "微調沒有完成，停止"; break; }
  [ -f "$W/t$K/model.bin" ] || python train/ww/mini/export.py "$W/r$K" "$VOCAB" "$W/t$K" "$W/p$K" > "$W/t$K.log" 2>&1 || { log "轉檔失敗，停止"; break; }
  [ -f "$W/STOP" ] && break
  # A/B：4 個程序各 100 組（每組同一局面打兩次）
  for i in 1 2 3 4; do node train/ww/mini/selfplay.js ab "$W/t$K" "$W/t$B" 100 $((K*1000+i)) > "$W/ab$K-$i.log" 2>&1 & done; wait
  RES=$(node -e "
let n=0,g=0,w=0;for(let i=1;i<=4;i++){const l=require('fs').readFileSync('$W/ab$K-'+i+'.log','utf8').trim().split('\n').pop();try{const r=JSON.parse(l);n+=r.n;g+=r.goodNew;w+=r.wolfNew;}catch(e){}}
const s=(g+w)/(2*n);console.log((s>0.525?'OK ':'NO ')+'新模型那邊勝率 '+(100*s).toFixed(1)+'%（當好人時好人勝 '+(100*g/n).toFixed(1)+'%、當狼時狼勝 '+(100*w/n).toFixed(1)+'%，'+n+' 組，對上第 $B 版）');")
  log "第 $K 版 $RES"
  case "$RES" in OK*) echo $K > "$W/best"; log "第 $K 版變強，下一輪從它開始";; *) log "第 $K 版沒有明顯變強，作廢";; esac
  touch "$W/done$K"; rm -f "$W"/p$K/train.u16 "$W"/p$K/train.idx   # 省空間（約數百 MB），要重訓再跑 prep
  [ -n "${WW_ROUNDS:-}" ] && [ "$K" -ge "$WW_ROUNDS" ] && { log "做完 $WW_ROUNDS 輪（WW_ROUNDS），停止"; break; }
done
log "停止（看到 STOP）"
