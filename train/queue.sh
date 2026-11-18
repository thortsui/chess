#!/bin/bash
# 依序產生多種棋的資料：bash train/queue.sh "dk 18 40 60 250" "gm 18 150 60 250" ...
cd "$(dirname "$0")/.."
for job in "$@"; do bash train/run_gen.sh $job; done
