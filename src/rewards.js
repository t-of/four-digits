// 広告まわりの判定と、iOS 版（native/native.js）とのつなぎ口（gear-align の rewards.js と同じ形）。
// 広告そのもの（AdMob）はここに無い。Web 版では何も出ない。iOS 版の native.js が attach() で広告の出し方を渡す。
//
// 決まり（2026-11-14 オーナー。数字は仮の値）:
//   - 数えるのは「解いた」問題（パス・あきらめは数えない）。
//   - 全画面は、通算で FREE_SOLVES 問を超えて解いていて、かつ 前の広告から MIN_SOLVES 問以上・MIN_MINUTES 分以上たったとき。
//     出すのは結果を離れるとき（「次へ」「ホーム」のあと）。解けた瞬間には出さない。
//   - 「前の広告」は実際に出したとき。native 側が出したら shown() を呼ぶ。
//   - ごほうび広告は、パスで Lv を守る・連続記録を守るの、コインの代わり。コインは渡さない。

const KEY = 'four-digits.ad';          // { v: 1, count, since, at }
export const FREE_SOLVES = 10;          // 通算 10 問までは出さない
export const MIN_SOLVES = 4;            // 前の広告から 4 問以上
export const MIN_MINUTES = 4;           // 前の広告から 4 分以上

// count: 通算で解いた数、since: 前の広告から解いた数、elapsedMs: 前の広告からの時間（出したことがなければ Infinity）
export const interstitialDue = (count, since, elapsedMs) =>
  count > FREE_SOLVES && since >= MIN_SOLVES && elapsedMs >= MIN_MINUTES * 60000;

const read = () => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.v === 1 && Number.isInteger(d.count) && Number.isInteger(d.since) && Number.isFinite(d.at)) return d;
  } catch { /* 読めなくても遊べる */ }
  return { v: 1, count: 0, since: 0, at: 0 };
};
const write = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 数えられなくても遊べる */ } };
const send = (name, detail) => {
  try { if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* 通知できなくても遊べる */ }
};
const dueOf = (d, now) => interstitialDue(d.count, d.since, d.at ? now - d.at : Infinity);

// 解いた問題を 1 問数えて、'fourdigits:clear' を送る。出す回か（due）を返す
export function recordSolve(now = Date.now()) {
  const d = read();
  d.count += 1; d.since += 1;
  write(d);
  const detail = { count: d.count, since: d.since, due: dueOf(d, now) };
  send('fourdigits:clear', detail);
  return detail;
}

// 結果を離れるときに呼ぶ（main.js が、出す回のあとにだけ呼ぶ）。
// 出すかどうか（iOS・読み込み済みか）は受け手（native.js）が決める。遊びは待たせない。
export const requestInterstitial = () => send('fourdigits:interstitial');

// native 側が全画面を実際に出したら呼ぶ。「前の広告から」を数え直す
export function shown(now = Date.now()) {
  const d = read();
  d.since = 0; d.at = now;
  write(d);
}

// ---- ごほうび広告の口 ----
// provider = { show(): Promise<'earned'|'dismissed'|'failed'> }  見終わって報酬が出たときだけ 'earned'
let provider = null;
const listeners = [];
export const attach = (p) => { provider = p; for (const fn of listeners) { try { fn(); } catch { /* 他の受け手を止めない */ } } };
export const onAttach = (fn) => { listeners.push(fn); if (provider) fn(); };
export const available = () => !!provider;
export async function watch() {
  if (!provider) return 'failed';
  try {
    const r = await provider.show();
    return r === 'earned' ? 'earned' : r === 'failed' ? 'failed' : 'dismissed';
  } catch { return 'failed'; }
}

if (typeof window !== 'undefined') window.Rewards = { attach, onAttach, available, interstitialDue, shown };
