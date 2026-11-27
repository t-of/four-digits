// 節目のコイン（1 回きり）の純粋な部分。保存は four-digits.milestones = { v: 1, paid: ["s1", "l1"], wk: 3 }。
// paid: 渡した節目（s<★3 の数>、l<Lv>）。知らない id も消さずに残す。wk: 上乗せを渡したログインの日数（0〜7）。
export const WEEK_EXTRA = [20, 20, 5, 5, 5, 5, 5];
export const STAR_STEPS = [[1, 10], [5, 15], [10, 25], [50, 20], [100, 25], [200, 25], [300, 25], [500, 40], [1000, 50]];
export const LV_STEPS = [[1, 5], [2, 5], [3, 10], [4, 10], [5, 20]];
export const LV_NEED = 10;

// saved: 保存された中身（無ければ null）、coins: 今の coins（{ last, run }）
export function parseMilestones(saved, coins) {
  if (saved && saved.v === 1 && Array.isArray(saved.paid)) {
    return { v: 1, paid: saved.paid.filter((x) => typeof x === 'string'), wk: Math.min(7, Math.max(0, saved.wk | 0)) };
  }
  const wk = coins && coins.last ? Math.min(7, Math.max(0, (coins.run | 0))) : 0;
  return { v: 1, paid: [], wk };
}

// その日の上乗せ。{ gain, wk }（wk は進めたあとの日数。ms は書き換えない）
export function weekExtra(ms) {
  if (ms.wk >= 7) return { gain: 0, wk: ms.wk };
  return { gain: WEEK_EXTRA[ms.wk], wk: ms.wk + 1 };
}

// まだ渡していない節目。lvThree = [0, Lv1 の ★3 数, …, Lv5]
export function due(ms, three, lvThree) {
  const out = [];
  for (const [n, gain] of STAR_STEPS) {
    const id = `s${n}`;
    if (three >= n && !ms.paid.includes(id)) out.push({ id, gain, kind: 's', n });
  }
  for (const [n, gain] of LV_STEPS) {
    const id = `l${n}`;
    if ((lvThree[n] || 0) >= LV_NEED && !ms.paid.includes(id)) out.push({ id, gain, kind: 'l', n });
  }
  return out;
}
