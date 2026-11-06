#!/bin/bash
# 計算ノードでビルド → 2027 の既知の値で確認 → 全 1 万組を 64 並列で解く → parts.tgz にまとめる。
# 投げ方（ホームから）: sbatch -p DEF -n 64 -t 1:30:00 fourdigits/job_all.sh
# 止まったら同じコマンドで投げ直せば、済んだ組を飛ばして続きから回る（W=64 は変えない）。
#SBATCH -J fourdig
#SBATCH -N 1
#SBATCH -D /home/s2610039/fourdigits
#SBATCH -o logs/%x-%j.out
#SBATCH -e logs/%x-%j.out
cd /home/s2610039/fourdigits || exit 1
echo "$(date) start host=$(hostname)"
g++ -O2 -std=c++17 -o minsym minsym.cpp || exit 1
./minsym one 2027 > check_2027.tsv 2>/dev/null || exit 1
dist=$(awk -F'\t' '{c[$3]++} END{printf "%d %d %d %d", c[1],c[2],c[3],c[4]}' check_2027.tsv)
echo "2027 の分布 (1 2 3 4 個): $dist"
[ "$dist" = "1 24 59 16" ] || { echo "precheck NG"; exit 1; }
W=64; mkdir -p parts
for w in $(seq 0 $((W-1))); do ./minsym run $W $w parts/part_$w.tsv 2>>parts/err_$w.txt & done
wait
n=$(cat parts/part_*.tsv | grep -c '^#done'); echo "$(date) done $n / 10000"
tar czf parts.tgz parts && echo packed
