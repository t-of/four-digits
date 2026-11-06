#!/bin/sh
# 全 1 万組を W 並列で解く。途中で止まっても、もう一度流せば済んだ組を飛ばして続きから回る。
# 進捗: results/parts/progress.txt（済んだ組の数）。終わったら merge.py が min.bin と examples.tsv.gz を作る。
cd "$(dirname "$0")/.." || exit 1
W=${W:-8}
mkdir -p results/parts
clang++ -O2 -std=c++17 -o src/minsym src/minsym.cpp || exit 1
w=0
while [ $w -lt $W ]; do
  ./src/minsym run $W $w results/parts/part_$w.tsv 2>>results/parts/err_$w.txt &
  w=$((w+1))
done
( while sleep 30; do n=$(cat results/parts/part_*.tsv | grep -c '^#done'); echo "$(date '+%F %T') $n / 10000" > results/parts/progress.txt; [ "$n" -ge 10000 ] && break; done ) &
wait
echo "$(date '+%F %T') 10000 / 10000 終わり" > results/parts/progress.txt
python3 src/merge.py > results/parts/merge.log 2>&1
