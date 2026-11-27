// パスのあとの答え（data/ans/NN.txt.gz。4 桁の上 2 桁で 1 ファイル、10,000 行）。DOM を触らない。
// 行番号 = (4 桁 % 100) × 100 + 目標 − 1。作り方は solver/src/make_answers.py
export const ansLine = (n, t) => (Number(n) % 100) * 100 + t - 1;
export const ansFile = (n) => `./data/ans/${String(Math.floor(Number(n) / 100)).padStart(2, '0')}.txt.gz`;

// 式の need（levels.js と同じ決め方。solver/src/make_levels.py の need_of と同じ）
export function needOfExpr(e) {
  let need = 1;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === '(') need = Math.max(need, 3);
    else if (c === '^') need = Math.max(need, 4);
    else if (c === '√') need = Math.max(need, 5);
    else if (c === '.') need = Math.max(need, 6);
    else if (c === '−' && (i === 0 || e[i - 1] === '(')) need = Math.max(need, 8);
    else if (c === '!') {
      if (e[i + 1] === '{') { need = Math.max(need, 9); i = e.indexOf('}', i); }
      else {
        let j = i;
        while (e[j] === '!') j++;
        if (j - i >= 2) need = Math.max(need, 9);
        else if (i > 0 && (/\d/.test(e[i - 1]) || e[i - 1] === ')')) need = Math.max(need, 7);
        else need = Math.max(need, 10);
        i = j - 1;
      }
    }
  }
  return need;
}

// 答えの式を取る。読めなければ null（圏外で未取得、3 秒で打ち切り）。
// キャッシュは SW が担当（sw.js の ANS_CACHE。cache-first）。iOS は www/data/ans に同梱されていて、同じ fetch で読める
export async function fetchAnswer(n, t, { timeout = 3000 } = {}) {
  if (typeof DecompressionStream === 'undefined') return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(ansFile(n), { signal: ctl.signal });
    if (!res.ok) return null;
    const text = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text();
    return text.split('\n')[ansLine(n, t)] || null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// 式を打つ単位（1 文字か !{N}）に分ける
export const toksOf = (e) => e.match(/!\{\d+\}|[\s\S]/gu) || [];

// 答えを見た問題: four-digits.shown = { v: 1, list: ["1446:24", …] }（新しいものが先頭、500 件まで）
export const SHOWN_MAX = 500;
export function parseShown(d) {
  if (!d || d.v !== 1 || !Array.isArray(d.list)) return [];
  return d.list.filter((x) => typeof x === 'string' && /^\d{4}:\d+$/.test(x)).slice(0, SHOWN_MAX);
}
// key を先頭に足した新しい一覧（重複は前に寄せ、500 件で切る）
export const shownAdd = (list, key) => [key, ...list.filter((x) => x !== key)].slice(0, SHOWN_MAX);
// ★3 の初回のコインを出すか。答えを見た問題には出さない
export const star3Pays = (first, shownHas) => !!first && !shownHas;
