// おまかせの 10 段（S）と、問題の印 need（data/need.bin）。DOM を触らない。
// need = その問題の最短に届くのに要る、一番あとで紹介する記号（1 ＋−×÷ / 3 括弧 / 4 ^ / 5 √ / 6 小数点 / 7 階乗 / 8 単独の − / 9 N 重階乗 / 10 部分階乗）
// need.bin: 1 問 4 ビット（2 問で 1 バイト、500,000 バイト）。添え字は puzzle2.bin と同じ。作り方は solver/src/make_levels.py
export const NEED_SIZE = 500000;
export const needOf = (tbl, i) => (i & 1 ? tbl[i >> 1] >> 4 : tbl[i >> 1] & 15);

// seen の id（紹介の順）と、それを覚えると見える need
export const SEEN_IDS = ['ops', 'par', 'pow', 'sqrt', 'dot', 'fact', 'neg', 'factn', 'subf'];
export const NEED_ID = { 1: 'ops', 3: 'par', 4: 'pow', 5: 'sqrt', 6: 'dot', 7: 'fact', 8: 'neg', 9: 'factn', 10: 'subf' };

// S に出す問題か（need と最短の記号数 m）。S10 は S1〜9 に入らない残り全部
export function stageHas(S, need, m) {
  if (S === 1) return need === 1 && m === 1;
  if (S === 2) return need === 1 && m === 2;
  if (S === 3) return need <= 3 && m === 3;
  if (S >= 4 && S <= 7) return need >= 4 && need <= S && m <= 3;
  if (S === 8) return (need >= 4 && need <= 8 && m <= 4) || (need <= 3 && m >= 4 && m <= 5);
  if (S === 9) return need === 9 && m <= 3;
  for (let k = 1; k <= 9; k++) if (stageHas(k, need, m)) return false;
  return true;
}

// S で新しく出る記号の need（半分の確率でこの need の問題を出す）。S1・S2 は無し（0）
export const newNeed = (S) => (S >= 3 && S <= 10 ? S : 0);

// 紹介の 1 問（2-4）。start = 最初の式（記号を入れておく）、cursor = start の文字位置、key = 光る記号の seen の id
export const INTRO = [
  // 仕様の 1230 → 90 は全記号で記号 2 つ（12!{7}+30）になるので、仕様の予備の 2314 → 70 に替えた
  { S: 3, digits: '2314', target: 70, start: '2×31+4', cursor: 2, key: 'par', solved: '2×(31+4)' },
  { S: 4, digits: '1052', target: 35, start: '10+52', cursor: 4, key: 'pow', solved: '10+5^2', spare: { digits: '7732', target: 86, start: '77+32', solved: '77+3^2' } },
  { S: 5, digits: '1016', target: 14, start: '10+16', cursor: 3, key: 'sqrt', solved: '10+√16', spare: { digits: '2049', target: 27, start: '20+49', solved: '20+√49' } },
  { S: 6, digits: '2027', target: 54, start: '20×27', cursor: 4, key: 'dot', solved: '20×2.7', spare: { digits: '2512', target: 30, start: '25×12', solved: '25×1.2' } },
  { S: 7, digits: '1003', target: 94, start: '100−3', cursor: 5, key: 'fact', solved: '100−3!', spare: { digits: '1204', target: 96, start: '120−4', solved: '120−4!' } },
  { S: 8, digits: '7497', target: 23, start: '74+97', cursor: 0, key: 'neg', solved: '−74+97' },
  { S: 9, digits: '1005', target: 85, start: '100−5', cursor: 5, key: 'factn', solved: '100−5!!', spare: { digits: '1004', target: 92, start: '100−4', solved: '100−4!!' } },
  { S: 10, digits: '2254', target: 25, start: '225÷4', cursor: 4, key: 'subf', solved: '225÷!4' },
];

// キーの見え方（2-5）。返すのはキーの名前（記号のキーは記号そのまま、ほかは back / left / right / clear / factn）。
// おまかせは seen のキーだけ。今日の 1 問・フリー・all（引き継いだ人）は全部
export const ALL_KEYS = ['+', '−', '×', '÷', '(', ')', '^', '√', '.', '!', 'factn', 'back', 'left', 'right', 'clear'];
const SEEN_KEYS = { ops: ['+', '−', '×', '÷'], par: ['(', ')'], pow: ['^'], sqrt: ['√'], dot: ['.'], fact: ['!'], factn: ['factn'] };
export function visibleKeys(mode, seen, all) {
  if (mode !== 'auto' || all) return [...ALL_KEYS];
  const s = new Set(['back', 'left', 'right', 'clear']);
  for (const id of ['ops', ...(seen || [])]) for (const k of SEEN_KEYS[id] || []) s.add(k);
  return ALL_KEYS.filter((k) => s.has(k));
}
// S に上がったとき紹介する記号の seen の id（S1・S2 は無し）
export const introKeyOf = (S) => INTRO.find((x) => x.S === S)?.key || null;
// その S までに紹介する記号の seen の id を全部（引き継ぎ用）
export const seenUpTo = (S) => ['ops', ...INTRO.filter((x) => x.S <= S).map((x) => x.key)];
// ホームの「覚えた記号」の列（2-6）。SEEN_IDS と同じ順に、覚えたかどうか
export const learnedRow = (seen) => SEEN_IDS.map((id) => id === 'ops' || (seen || []).includes(id));
