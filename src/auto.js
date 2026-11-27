// おまかせ: four-digits.auto = { v: 1, L, streak, recent: [[4桁, 目標], …], cur: [4桁, 目標] | null }
// 画面を持たない。保存と問題の表は main.js から渡す（deps: load, save, lvOf, starsOf, hasTable）。
export const RECENT_DIGITS = 30, RECENT_TARGET = 5;
const pad4 = (n) => String(n).padStart(4, '0');

export function createAuto({ load, save, lvOf, starsOf, hasTable }) {
  const auto = { L: 1, streak: 0, recent: [], cur: null };
  const d = load('auto', null);
  if (d && d.v === 1 && d.L >= 1 && d.L <= 5 && Array.isArray(d.recent)) {
    Object.assign(auto, { L: d.L, streak: d.streak | 0, recent: d.recent.slice(0, RECENT_DIGITS), cur: Array.isArray(d.cur) ? d.cur : null });
  }
  const saveAuto = () => save('auto', { v: 1, ...auto });

  function pick() {
    const rd = auto.recent.slice(0, RECENT_DIGITS).map((r) => r[0]);
    const rt = auto.recent.slice(0, RECENT_TARGET).map((r) => r[1]);
    for (let tries = 0; tries < 5000; tries++) {
      const i = Math.floor(Math.random() * 1000000);
      const n = Math.floor(i / 100), t = (i % 100) + 1;
      if (hasTable() && lvOf(n, t) !== auto.L) continue;
      if (rd.includes(n) || rt.includes(t) || starsOf(pad4(n), t) >= 3) continue;
      return [n, t];
    }
    return [Math.floor(Math.random() * 10000), 1 + Math.floor(Math.random() * 100)];
  }
  function push() {
    auto.recent.unshift(auto.cur);
    auto.recent.length = Math.min(auto.recent.length, RECENT_DIGITS);
    auto.cur = null;
  }
  // 解けた: ★3 が 2 問続けば L+1、★1 なら L−1、★2 はそのまま（連続は切れる）。返すのは Lv の上下
  function solved(got) {
    if (!auto.cur) return 0;   // 「もっと短く」の 2 回目以降は数えない
    const before = auto.L;
    if (got >= 3) {
      auto.streak++;
      if (auto.streak >= 2) { auto.L = Math.min(5, auto.L + 1); auto.streak = 0; }
    } else {
      auto.streak = 0;
      if (got <= 1) auto.L = Math.max(1, auto.L - 1);
    }
    push(); saveAuto();
    return auto.L - before;
  }
  function giveUp() {
    auto.L = Math.max(1, auto.L - 1); auto.streak = 0;
    push(); saveAuto();
  }
  return { state: auto, save: saveAuto, pick, push, solved, giveUp };
}
