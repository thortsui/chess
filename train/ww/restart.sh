#!/bin/bash
# 重新開始產生資料：bash restart.sh <輸出檔> <局數> <同時幾局>
cd ~/projects/ww-talk
for p in $(pgrep -f "^/home/ethan/tools/node/bin/node train/ww/gen_talk.js"); do kill $p; done
sleep 1
nohup ~/tools/node/bin/node train/ww/gen_talk.js "$1" "$2" "$3" > "${1%.jsonl}.log" 2>&1 &
echo started
