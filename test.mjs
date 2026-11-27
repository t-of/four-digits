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
