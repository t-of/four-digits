# data/expr/00.txt.gz〜99.txt.gz を作る（ヒント 2 用）: results/examples.tsv.gz（4桁 目標 m 式）を 4 桁の上 2 桁で分ける。
# 中身は 1 行 1 式・10,000 行。行番号 = (4 桁 % 100) × 100 + (目標 − 1)。字は examples の書き方のまま。
# 照合は src/verify_hints.mjs（ゲームの analyze で全 100 万本）。
import gzip, os, sys
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
out = os.path.join(root, '../data/expr'); os.makedirs(out, exist_ok=True)
rows = [None] * 10**6
for line in gzip.open(os.path.join(root, 'results/examples.tsv.gz'), 'rt', encoding='utf-8'):
    s, t, m, e = line.rstrip('\n').split('\t')
    i = int(s) * 100 + int(t) - 1
    assert 1 <= int(t) <= 100 and len(s) == 4 and rows[i] is None, line
    assert '\n' not in e and e, line
    rows[i] = e
assert all(r is not None for r in rows)
for h in range(100):
    # mtime=0 で毎回同じバイト列にする
    with open(os.path.join(out, '%02d.txt.gz' % h), 'wb') as f:
        f.write(gzip.compress(('\n'.join(rows[h * 10000:(h + 1) * 10000]) + '\n').encode('utf-8'), 9, mtime=0))
print('ok')
