#!/bin/bash
# 筆電上平行產生老師資料：bash train/run_gen_local.sh <game> <行程數> <每個行程局數>
cd "$(dirname "$0")/.."
G=$1; P=${2:-6}; N=${3:-30}
mkdir -p data/$G; TAG=$(date +%m%d%H%M%S)
for i in $(seq 1 $P); do node train/gen.js $G $N $RANDOM$i data/$G/L${TAG}_$i.bin 60 250 >> data/$G/gen.log 2>&1 & done
wait; echo "[$G] 完成 $(date)" >> data/$G/gen.log
