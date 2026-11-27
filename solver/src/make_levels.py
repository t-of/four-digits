# data/need.bin（1 問 4 ビット × 100 万 = 500,000 バイト）を作り、ステージの表を出す。
# need = その問題の「段に合う表の例の式」に入る記号のうち、紹介順で一番あとのもの。
#   1 ＋−×÷ / 3 括弧 / 4 ^ / 5 √ / 6 小数点 / 7 階乗 / 8 単独の − / 9 N 重階乗 / 10 部分階乗
# 段 0 → results/basic/examples_basic.tsv.gz、段 1 → results/mid/examples_mid.tsv.gz、段 2 → results/examples.tsv.gz
# 添え字 i の値は i が偶数なら下 4 ビット、奇数なら上 4 ビット。段・m は data/puzzle2.bin から。
# 仕様: t-of.github.io/docs/private/specs/four-digits-levels.md 2 節。ステージの条件は src/levels.js の stageHas と同じ。
import gzip, os
from collections import Counter
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
data = os.path.join(root, '../data')

def need_of(e):
    need = 1; n = len(e); i = 0
    while i < n:
        c = e[i]
        if c == '(': need = max(need, 3)
        elif c == '^': need = max(need, 4)
        elif c == '√': need = max(need, 5)
        elif c == '.': need = max(need, 6)
        elif c == '−' and (i == 0 or e[i - 1] == '('): need = max(need, 8)
        elif c == '!':
            if i + 1 < n and e[i + 1] == '{':
                need = max(need, 9); i = e.index('}', i)
            else:
                j = i
                while j < n and e[j] == '!': j += 1
                if j - i >= 2: need = max(need, 9)
                elif i > 0 and (e[i - 1].isdigit() or e[i - 1] == ')'): need = max(need, 7)
                else: need = max(need, 10)
                i = j - 1
        i += 1
    return need

def stage_has(S, need, m):
    if S == 1: return need == 1 and m == 1
    if S == 2: return need == 1 and m == 2
    if S == 3: return need <= 3 and m == 3
    if 4 <= S <= 7: return 4 <= need <= S and m <= 3
    if S == 8: return (4 <= need <= 8 and m <= 4) or (need <= 3 and 4 <= m <= 5)
    if S == 9: return need == 9 and m <= 3
    return not any(stage_has(k, need, m) for k in range(1, 10))

def load(path):
    d = {}
    for line in gzip.open(path, 'rt', encoding='utf-8'):
        s, t, m, e = line.rstrip('\n').split('\t')
        if e: d[int(s) * 100 + int(t) - 1] = (int(m), e)
    return d
ex = [load(os.path.join(root, 'results/basic/examples_basic.tsv.gz')),
      load(os.path.join(root, 'results/mid/examples_mid.tsv.gz')),
      load(os.path.join(root, 'results/examples.tsv.gz'))]
tbl = open(os.path.join(data, 'puzzle2.bin'), 'rb').read()
nd = [0] * 10**6
for i in range(10**6):
    m = tbl[i] & 31; tier = (tbl[i] >> 5) & 3
    assert i in ex[tier], (i, tier)
    em, e = ex[tier][i]
    assert em == m, (i, em, m)
    nd[i] = need_of(e)
out = bytearray(500000)
for i in range(0, 10**6, 2): out[i // 2] = nd[i] | (nd[i + 1] << 4)
open(os.path.join(data, 'need.bin'), 'wb').write(out)

# 表
tiers_ok = all((nd[i] <= 3) == (((tbl[i] >> 5) & 3) == 0) and (4 <= nd[i] <= 8) == (((tbl[i] >> 5) & 3) == 1) and (nd[i] >= 9) == (((tbl[i] >> 5) & 3) == 2) for i in range(10**6))
print('段と need の対応', tiers_ok)
print('need ごと', sorted(Counter(nd).items()))
NEW = {3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10}
cnt = Counter(); cntNew = Counter()
for i in range(10**6):
    m = tbl[i] & 31
    for S in range(1, 11):
        if stage_has(S, nd[i], m):
            cnt[S] += 1
            if NEW.get(S) == nd[i]: cntNew[S] += 1
print('S, 問題の数, 新しい記号の need の数')
for S in range(1, 11): print(S, cnt[S], cntNew[S] if S in NEW else '-')
print('S1〜9 のどれにも入らない（S10）', cnt[10], ' 合計の重なりなし確認:', sum(1 for i in range(10**6) if sum(stage_has(S, nd[i], tbl[i] & 31) for S in range(1, 11)) != 1))
