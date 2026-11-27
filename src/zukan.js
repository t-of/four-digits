// 図鑑の数え方（画面なし）。保存は変えず、best から数えるだけ。
import { starsFor } from './expr.js';

// 1〜100 の数それぞれを ★3 で作ったことがあるか（100 個の真偽）。
// best = { "0123": { "45": [k, "式"] } }。旧版の引き継ぎ [null, null, 星] は星のまま見る。
export function numberGold(best, minOf) {
  const gold = Array(100).fill(false);
  for (const d of Object.keys(best)) {
    for (const t of Object.keys(best[d])) {
      const n = Number(t);
      if (!(n >= 1 && n <= 100) || gold[n - 1]) continue;
      const e = best[d][t];
      const s = e[0] == null ? e[2] : starsFor(e[0], minOf(d, n));
      if (s === 3) gold[n - 1] = true;
    }
  }
  return gold;
}

// 4 桁の並べ方。★ の多い順（同じなら 4 桁の順）。★ が small 以下は一覧にまとめる
export function splitDigits(rows, small = 3) {
  const sorted = [...rows].sort((a, b) => b.stars - a.stars || (a.d < b.d ? -1 : 1));
  return { cards: sorted.filter((r) => r.stars > small), list: sorted.filter((r) => r.stars <= small) };
}
