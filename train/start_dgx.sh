#!/bin/bash
# DGX：暖身蒸餾（老師資料）→ 自我對弈訓練（不會停，要停就 docker stop chess-selfplay）
#   bash train/start_dgx.sh            # 全部重跑
#   SKIP_DISTILL=1 bash train/start_dgx.sh   # 已經有 runs/ckpt.pt，直接接著自我對弈
cd "$(dirname "$0")/.."
IMG=nvcr.io/nvidia/pytorch:26.01-py3
RUN="docker run --rm --gpus all --ipc=host -e CONC_MULT=${CONC_MULT:-2} --user $(id -u):$(id -g) -e HOME=/tmp -v $PWD:/w -v $HOME/tools/node-v22.21.0-linux-arm64:/opt/node -e NODE=/opt/node/bin/node -w /w"
mkdir -p runs/inbox runs/distill
if [ -z "$SKIP_DISTILL" ]; then
  $RUN --name chess-distill $IMG python -u train/train.py --data data --out runs/distill --steps ${DISTILL_STEPS:-20000} > runs/distill.log 2>&1
  cp runs/distill/ckpt.pt runs/ckpt.pt
fi
# 1 個訓練主控＋N 個只下棋的主控（各自服務一部分 Node 行程，CPU 與 GPU 並行用滿）
$RUN -d --name chess-selfplay $IMG python -u train/selfplay.py --mode train --procs 0 --out runs --ckpt runs/ckpt.pt
for i in $(seq 1 ${EXTRA:-7}); do
  $RUN -d --name chess-sp$i $IMG python -u train/selfplay.py --mode worker --procs ${PROCS:-8} --remote /w/runs --out runs_w$i --sync-every 120
done
echo "自我對弈已開始：docker logs -f chess-selfplay（停止：docker stop $(docker ps -q --filter name=chess-)）"
