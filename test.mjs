// 文字のコレクションの中身のテスト。node test.mjs で走る（フレームワークなし）。
import assert from 'node:assert/strict';
import { ALL_ITEMS, GLYPH_CHARS, GLYPH_DESIGNS, tryDraw, drawCost, odds, ownedCount, designDone, allDone, parseGlyphs } from './src/glyphs.js';

const test = (name, fn) => { fn(); console.log('✓', name); };

test('60 個ある', () => assert.equal(ALL_ITEMS.length, GLYPH_DESIGNS.length * GLYPH_CHARS.length));

test('60 回引くと 60 個そろい、かぶらない', () => {
  for (const rnd of [Math.random, () => 0, () => 0.999999]) {
    const got = [];
    for (let i = 0; i < 60; i++) {
      const r = tryDraw(got, 1000, rnd);
      assert.ok(r.ok);
      assert.ok(!got.includes(r.id), 'かぶった');
      got.push(r.id);
    }
    assert.equal(ownedCount(got), 60);
    assert.ok(allDone(got));
    assert.ok(GLYPH_DESIGNS.every((d) => designDone(got, d.id)));
    assert.equal(tryDraw(got, 1000, rnd).ok, false);
  }
});

test('最初の 1 回は 0、次から 25', () => {
  assert.equal(drawCost([]), 0);
  const r = tryDraw([], 0, Math.random);
  assert.ok(r.ok && r.cost === 0);
  assert.equal(drawCost([r.id]), 25);
});

test('コイン 24 では引けない、25 なら引ける', () => {
  const got = ['neon:7'];
  assert.equal(tryDraw(got, 24, Math.random).ok, false);
  assert.equal(tryDraw(got, 25, Math.random).ok, true);
});

test('確率は仕様の値（最初 1.9% と 0.6%、最後の 1 個は 100%）', () => {
  const o = odds([]);
  assert.deepEqual([o.normal.n, o.normal.pct, o.rare.n, o.rare.pct], [48, 1.9, 12, 0.6]);
  const got = ALL_ITEMS.slice(0, 59);
  const last = odds(got);
  assert.equal(last.normal.n + last.rare.n, 1);
  assert.equal(last.normal.n ? last.normal.pct : last.rare.pct, 100);
});

test('知らない id は残り、数えない', () => {
  const s = parseGlyphs({ v: 1, got: ['neon:7', 'future:7'], seen: ['neon'] });
  assert.deepEqual(s.got, ['neon:7', 'future:7']);
  assert.equal(ownedCount(s.got), 1);
  assert.deepEqual(parseGlyphs(null), { v: 1, got: [], seen: [] });
});

// ---- 節目のコイン ----
import { WEEK_EXTRA, STAR_STEPS, LV_STEPS, parseMilestones, weekExtra, due } from './src/milestones.js';
const sum = (a) => a.reduce((s, x) => s + (Array.isArray(x) ? x[1] : x), 0);
const total = (list) => list.reduce((s, x) => s + x.gain, 0);

test('節目の合計は 235・50・65（350）', () => {
  assert.equal(sum(STAR_STEPS), 235);
  assert.equal(sum(LV_STEPS), 50);
  assert.equal(sum(WEEK_EXTRA), 65);
});

test('due: ★3 が 9 なら s1 s5、10 なら s10 も。渡したら空', () => {
  const ms = parseMilestones(null, null);
  assert.deepEqual(due(ms, 9, [0, 0, 0, 0, 0, 0]).map((x) => x.id), ['s1', 's5']);
  const d = due(ms, 10, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(d.map((x) => x.id), ['s1', 's5', 's10']);
  ms.paid.push(...d.map((x) => x.id));
  assert.deepEqual(due(ms, 10, [0, 0, 0, 0, 0, 0]), []);
});

test('まとめ渡し: ★3 400・Lv1〜4 が 10 問ずつで 175', () => {
  assert.equal(total(due(parseMilestones(null, null), 400, [0, 10, 10, 10, 10, 3])), 175);
});

test('★3 の数が減っても戻さず、新しくも出ない', () => {
  const ms = parseMilestones(null, null);
  ms.paid.push(...due(ms, 50, [0, 0, 0, 0, 0, 0]).map((x) => x.id));
  assert.deepEqual(due(ms, 3, [0, 0, 0, 0, 0, 0]), []);
});

test('weekExtra: 8 回で 20 20 5 5 5 5 5 0', () => {
  const ms = parseMilestones(null, null);
  const got = [];
  for (let i = 0; i < 8; i++) { const r = weekExtra(ms); got.push(r.gain); ms.wk = r.wk; }
  assert.deepEqual(got, [20, 20, 5, 5, 5, 5, 5, 0]);
});

test('引き継ぎ: coins なし 0、run 3 → 3、run 12 → 7、保存済みはそれを使う', () => {
  assert.equal(parseMilestones(null, { last: '', run: 0 }).wk, 0);
  assert.equal(parseMilestones(null, { last: '2026-11-20', run: 3 }).wk, 3);
  assert.equal(parseMilestones(null, { last: '2026-11-20', run: 12 }).wk, 7);
  const s = parseMilestones({ v: 1, paid: ['s1', 'x9'], wk: 2 }, { last: '2026-11-20', run: 12 });
  assert.deepEqual([s.wk, s.paid], [2, ['s1', 'x9']]);
});
