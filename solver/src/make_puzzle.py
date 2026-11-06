# data/puzzle.bin を作る: 1 問 1 バイト。下 5 ビット = 最小記号数 m（全記号）、上 3 ビット = 難しさ 1〜5。
# 添え字は min.bin と同じ（s×100 + t−1）。入力: results/min.bin（なければ ../data/min.bin）、results/mid/min_mid.bin、results/basic/min_basic.bin
# 難しさ: 段 = 0（＋−×÷と括弧だけで最小に届く）/ 1（^ √ ! 単独− 小数点まで）/ 2（N 重階乗・部分階乗が要る）
#   Lv1 段0・m≤2 / Lv2 段0・m≥3 か 段1・m≤2 / Lv3 段1・m=3,4 か 段2・m≤2 / Lv4 段2・m=3 / Lv5 それ以外（m≥5 はすべて）
import os, sys
from collections import Counter
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
p = os.path.join(root, 'results/min.bin')
a = open(p if os.path.exists(p) else os.path.join(root, '../data/min.bin'), 'rb').read()
mid = open(os.path.join(root, 'results/mid/min_mid.bin'), 'rb').read()
bas = open(os.path.join(root, 'results/basic/min_basic.bin'), 'rb').read()
out = bytearray(10**6); cnt = Counter()
for i in range(10**6):
    m = a[i]; assert 1 <= m <= 31, (i, m)
    tier = 0 if bas[i] == m else (1 if mid[i] == m else 2)
    if m >= 5: lv = 5
    elif tier == 0: lv = 1 if m <= 2 else 2
    elif tier == 1: lv = 2 if m <= 2 else 3
    else: lv = 3 if m <= 2 else (4 if m == 3 else 5)
    out[i] = m | (lv << 5); cnt[lv] += 1
open(os.path.join(root, '../data/puzzle.bin'), 'wb').write(out)
print({k: cnt[k] for k in sorted(cnt)})
