// 文字のコレクション（コインで引く。デザインごと・だぶりはかけら）。仕様は本部の docs/private/specs/four-digits-gacha.md。
// ここは画面を持たない純粋な部分（品の一覧・抽選・確率・かけら）。main.js が使い、test.mjs が確かめる。

// 文字は 20 個で固定。増やすのはデザインだけ（末尾に足す。消さない・並べ替えない）。
export const GLYPH_CHARS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'add', 'sub', 'mul', 'div', 'lp', 'rp', 'pow', 'sqrt', 'fact', 'dot'];
export const GLYPH_DESIGNS = [
  { id: 'neon', rare: ['pow', 'sqrt', 'fact', 'dot'] },
  { id: 'ink', rare: ['pow', 'sqrt', 'fact', 'dot'] },
  { id: 'pixel', rare: ['pow', 'sqrt', 'fact', 'dot'] },
  { id: 'gem', rare: ['pow', 'sqrt', 'fact', 'dot'] },
  { id: 'stitch', rare: ['pow', 'sqrt', 'fact', 'dot'] },
];
// 画面に出す 1 文字
export const GLYPH_LABEL = { add: '+', sub: '−', mul: '×', div: '÷', lp: '(', rp: ')', pow: '^', sqrt: '√', fact: '!', dot: '.' };
export const glyphLabel = (c) => GLYPH_LABEL[c] || c;

export const GLYPH_PRICE = 25;
export const W_NORMAL = 3, W_RARE = 1;

// 品の id は「<デザイン>:<文字>」
export const ALL_ITEMS = GLYPH_DESIGNS.flatMap((d) => GLYPH_CHARS.map((c) => `${d.id}:${c}`));
export const isRare = (id) => {
  const [d, c] = id.split(':');
  const dd = GLYPH_DESIGNS.find((x) => x.id === d);
  return !!dd && dd.rare.includes(c);
};
const weightOf = (id) => (isRare(id) ? W_RARE : W_NORMAL);

// 今の一覧にある品だけ数える（知らない id は保存データに残るが数えない）
export const ownedSet = (got) => new Set(got.filter((id) => ALL_ITEMS.includes(id)));
export const ownedCount = (got) => ownedSet(got).size;
export const designDone = (got, designId) => {
  const s = ownedSet(got);
  return GLYPH_CHARS.every((c) => s.has(`${designId}:${c}`));
};
export const allDone = (got) => ownedCount(got) >= ALL_ITEMS.length;

// かけら 10 個で、そのデザインのまだ持っていない好きな 1 文字（レアも同じ）
export const SHARD_COST = 10;

export const designItems = (designId) => GLYPH_CHARS.map((c) => `${designId}:${c}`);
// そのデザインでまだ持っていない品
export const remaining = (got, designId) => { const s = ownedSet(got); return designItems(designId).filter((id) => !s.has(id)); };

// 何も持っていない最初の 1 回だけ 0（全体で 1 回。どのデザインで使ってもよい）
export const drawCost = (got) => (ownedCount(got) === 0 ? 0 : GLYPH_PRICE);

// rnd は 0 以上 1 未満を返す関数。そのデザインの 20 文字すべてから、重みで 1 個選ぶ（持っているものも出る）
export function pickGlyph(designId, rnd) {
  const all = designItems(designId);
  let r = rnd() * all.reduce((a, id) => a + weightOf(id), 0);
  for (const id of all) { r -= weightOf(id); if (r < 0) return id; }
  return all[all.length - 1];
}

// 引けるか。足りない・そろい終わっているときは { ok: false }（何も変えない）
// 出たものが持っているものなら dupe: true（呼ぶ側が addShard する）
export function tryDraw(got, balance, rnd, designId) {
  const cost = drawCost(got);
  if (!GLYPH_DESIGNS.some((d) => d.id === designId) || designDone(got, designId) || balance < cost) return { ok: false, cost };
  const id = pickGlyph(designId, rnd);
  return { ok: true, cost, id, dupe: ownedSet(got).has(id) };
}

// かけら（デザイン id → 個数）
export const shardsOf = (shards, designId) => { const n = shards && shards[designId]; return Number.isInteger(n) && n > 0 ? n : 0; };
export const addShard = (shards, designId) => ({ ...shards, [designId]: shardsOf(shards, designId) + 1 });
// 交換できるか: そのデザインの、まだ持っていない品で、かけらが足りる
export const canExchange = (got, shards, id) => {
  const d = String(id).split(':')[0];
  return GLYPH_DESIGNS.some((x) => x.id === d) && ALL_ITEMS.includes(id) && !ownedSet(got).has(id) && shardsOf(shards, d) >= SHARD_COST;
};
// 交換する。できなければ { ok: false }。できたら新しい got と shards（元は変えない）
export function exchange(got, shards, id) {
  if (!canExchange(got, shards, id)) return { ok: false };
  const d = id.split(':')[0];
  return { ok: true, got: [...got, id], shards: { ...shards, [d]: shardsOf(shards, d) - SHARD_COST } };
}

// そのデザインの確率（%）と個数。1 個あたりの確率は常に同じ。{ normal: { n, pct }, rare: { n, pct } }
export function odds(designId) {
  const all = designItems(designId);
  const nR = all.filter(isRare).length, nN = all.length - nR;
  const total = nN * W_NORMAL + nR * W_RARE;
  const pct = (w) => Math.round((w / total) * 1000) / 10;
  return { normal: { n: nN, pct: pct(W_NORMAL) }, rare: { n: nR, pct: pct(W_RARE) } };
}

// 保存データの読み書き。知らない id・知らない項目も消さずに残す。shards が無い・壊れているときは空（0 個）
export function parseGlyphs(d) {
  if (d && d.v === 1 && Array.isArray(d.got)) {
    const got = [];
    for (const id of d.got) if (typeof id === 'string' && !got.includes(id)) got.push(id);
    const shards = {};
    if (d.shards && typeof d.shards === 'object' && !Array.isArray(d.shards)) {
      for (const [k, n] of Object.entries(d.shards)) if (Number.isInteger(n) && n > 0) shards[k] = n;
    }
    return { ...d, v: 1, got, seen: Array.isArray(d.seen) ? d.seen.filter((s) => typeof s === 'string') : [], shards };
  }
  return { v: 1, got: [], seen: [], shards: {} };
}

// 引く演出の段と秒数（ms）。main.js はこの表どおりに流す。仕様 B-4
// a 入れる / b ためる / c 光る / d 裏返る / e 見せる / f しまう。動きを減らすときは d・e・f だけ（フェード）
// そろったときの 0.8 秒の光は表に含めない（main.js の SET_LAP_MS）
export const SET_LAP_MS = 800;
export function revealPlan(rare, reduced) {
  if (reduced) return [{ step: 'd', ms: 300 }, { step: 'e', ms: rare ? 1000 : 600 }, { step: 'f', ms: 300 }];
  return rare
    ? [{ step: 'a', ms: 300 }, { step: 'b', ms: 700 }, { step: 'c', ms: 700 }, { step: 'd', ms: 500 }, { step: 'e', ms: 1100 }, { step: 'f', ms: 400 }]
    : [{ step: 'a', ms: 300 }, { step: 'b', ms: 700 }, { step: 'c', ms: 400 }, { step: 'd', ms: 400 }, { step: 'e', ms: 600 }, { step: 'f', ms: 400 }];
}

// コーナーを開いたときに選ぶデザイン。最後に引いた品のデザイン → そろっていない最初 → 先頭
export function pickDesign(got, lastId) {
  const last = lastId && GLYPH_DESIGNS.find((d) => d.id === String(lastId).split(':')[0]);
  if (last) return last.id;
  const open = GLYPH_DESIGNS.find((d) => !designDone(got, d.id));
  return (open || GLYPH_DESIGNS[0]).id;
}
