# data/ans/00.txt.gz〜99.txt.gz を作る（パスのあとの答え。仕様 3-2）。
# 1 問 1 本: その問題の段（data/puzzle2.bin）に合う表の例の式。段 0 → results/basic/examples_basic.tsv.gz、
# 段 1 → results/mid/examples_mid.tsv.gz、段 2 → results/examples.tsv.gz。
# だからおまかせで出る問題の答えは、その段のキーだけでできている（need ≤ S）。
# 4 桁の上 2 桁で分ける。1 行 1 式・10,000 行、行番号 = (4 桁 % 100) × 100 + (目標 − 1)。字は SPEC の書き方のまま。
# 照合は src/verify_answers.mjs（ゲームの analyze で全 100 万本）。
import gzip, os
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
out = os.path.join(root, '../data/ans'); os.makedirs(out, exist_ok=True)

def load(path):
    d = {}
    for line in gzip.open(path, 'rt', encoding='utf-8'):
        s, t, m, e = line.rstrip('\n').split('\t')
        if e: d[int(s) * 100 + int(t) - 1] = (int(m), e)
    return d
ex = [load(os.path.join(root, 'results/basic/examples_basic.tsv.gz')),
      load(os.path.join(root, 'results/mid/examples_mid.tsv.gz')),
      load(os.path.join(root, 'results/examples.tsv.gz'))]
tbl = open(os.path.join(root, '../data/puzzle2.bin'), 'rb').read()
rows = [None] * 10**6
for i in range(10**6):
    m = tbl[i] & 31; tier = (tbl[i] >> 5) & 3
    em, e = ex[tier][i]
    assert em == m and '\n' not in e and e, (i, tier)
    rows[i] = e
for h in range(100):
    # mtime=0 で毎回同じバイト列にする
    with open(os.path.join(out, '%02d.txt.gz' % h), 'wb') as f:
        f.write(gzip.compress(('\n'.join(rows[h * 10000:(h + 1) * 10000]) + '\n').encode('utf-8'), 9, mtime=0))
print('ok')
