# data/puzzle.bin（古い版のキャッシュ用）と data/puzzle2.bin を作る。
# puzzle2.bin: 1 問 1 バイト、下 5 ビット = m、次の 2 ビット = 段（0〜2）、一番上の 1 ビット = 今日向き
#   今日向き = 基本の記号で解ける かつ m < 基本の最短 かつ 段 ≤ 1 かつ m ≤ 3（今日の 1 問の候補。src/daily.js）
# puzzle.bin: 1 問 1 バイト。下 5 ビット = 最小記号数 m（全記号）、上 3 ビット = 難しさ 1〜5。
# 添え字は min.bin と同じ（s×100 + t−1）。入力: results/min.bin（なければ ../data/min.bin、それも無ければ ../data/puzzle.bin の m）、results/mid/min_mid.bin、results/basic/min_basic.bin
# 難しさ: 段 = 0（＋−×÷と括弧だけで最小に届く）/ 1（^ √ ! 単独− 小数点まで）/ 2（N 重階乗・部分階乗が要る）
#   Lv1 段0・m≤2 / Lv2 段0・m≥3 か 段1・m≤2 / Lv3 段1・m=3,4 か 段2・m≤2 / Lv4 段2・m=3 / Lv5 それ以外（m≥5 はすべて）
import os, sys
from collections import Counter
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
p = os.path.join(root, 'results/min.bin')
q = os.path.join(root, '../data/min.bin'); old = os.path.join(root, '../data/puzzle.bin')
if os.path.exists(p): a = open(p, 'rb').read()
elif os.path.exists(q): a = open(q, 'rb').read()
else: a = bytes(x & 31 for x in open(old, 'rb').read())  # min.bin が無いときは、今の puzzle.bin の下 5 ビット（m）を使う
mid = open(os.path.join(root, 'results/mid/min_mid.bin'), 'rb').read()
bas = open(os.path.join(root, 'results/basic/min_basic.bin'), 'rb').read()
out = bytearray(10**6); out2 = bytearray(10**6); cnt = Counter(); today = 0
for i in range(10**6):
    m = a[i]; assert 1 <= m <= 31, (i, m)
    tier = 0 if bas[i] == m else (1 if mid[i] == m else 2)
    if m >= 5: lv = 5
    elif tier == 0: lv = 1 if m <= 2 else 2
    elif tier == 1: lv = 2 if m <= 2 else 3
    else: lv = 3 if m <= 2 else (4 if m == 3 else 5)
    out[i] = m | (lv << 5); cnt[lv] += 1
    td = bas[i] != 255 and m < bas[i] and tier <= 1 and m <= 3
    out2[i] = m | (tier << 5) | (128 if td else 0); today += td
open(os.path.join(root, '../data/puzzle.bin'), 'wb').write(out)
open(os.path.join(root, '../data/puzzle2.bin'), 'wb').write(out2)
print('今日向き', today)
print({k: cnt[k] for k in sorted(cnt)})
