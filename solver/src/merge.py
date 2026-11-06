#!/usr/bin/env python3
"""results/parts/part_*.tsv をまとめて results/min.bin と results/examples.tsv.gz を作る。
'#done s' で終わった組だけ使う。全 1 万組がそろっていなければ足りない数を出して止まる。"""
import glob, gzip, os, sys
here = os.path.dirname(os.path.abspath(__file__))
res = os.path.join(here, "..", "results")
ops = os.environ.get("OPSET", "")
if ops and ops != "all":
    res = os.path.join(res, ops)
    sfx = "_" + ops
else:
    sfx = ""
rows = {}
over = []
for fn in sorted(glob.glob(os.path.join(res, "parts", "part_*.tsv"))):
    buf = []
    for line in open(fn, encoding="utf-8"):
        if line.startswith("#done"):
            s = int(line.split()[1]); rows[s] = buf; buf = []
        elif line.startswith("#overflow"):
            over.append(line.split()[1])
        else:
            buf.append(line.rstrip("\n").split("\t"))
miss = [s for s in range(10000) if s not in rows or len(rows[s]) != 100]
if miss:
    print(f"まだ {len(miss)} 組足りない（例 {miss[:5]}）"); sys.exit(1)
tab = bytearray(1_000_000)
with gzip.open(os.path.join(res, "examples%s.tsv.gz" % sfx), "wt", encoding="utf-8") as g:
    for s in range(10000):
        for a in rows[s]:
            t, m = int(a[1]), int(a[2])
            assert int(a[0]) == s and 1 <= t <= 100 and 0 <= m <= 255
            tab[s * 100 + t - 1] = m
            g.write("\t".join(a[:4]) + "\n")
open(os.path.join(res, "min%s.bin" % sfx), "wb").write(bytes(tab))
from collections import Counter
c = Counter(tab)
print("min.bin を書いた。記号数の分布:", dict(sorted(c.items())))
print("打ち切り（overflow）:", over if over else "なし")
