// 文字のコレクションの中身のテスト。node test.mjs で走る（フレームワークなし）。
import assert from 'node:assert/strict';
import { insertTok, deleteSymbol, clearSymbols, moveBy, canDelete, isDigit } from './src/edit.js';
import { createAuto } from './src/auto.js';
import { ALL_ITEMS, GLYPH_CHARS, GLYPH_DESIGNS, tryDraw, drawCost, odds, ownedCount, designDone, allDone, parseGlyphs, revealPlan, pickDesign } from './src/glyphs.js';

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

// ---- 引く演出と文字のコーナー ----
const planMs = (rare, reduced) => revealPlan(rare, reduced).reduce((s, x) => s + x.ms, 0);

test('revealPlan: ふつう 2800・レア 3700、どちらも 2500〜4000', () => {
  assert.equal(planMs(false, false), 2800);
  assert.equal(planMs(true, false), 3700);
  assert.ok(planMs(true, false) > planMs(false, false));
  for (const r of [false, true]) { const t = planMs(r, false); assert.ok(t >= 2500 && t <= 4000); }
});

test('revealPlan: 動きを減らすと 1200・1600 で、a・b・c の段がない', () => {
  assert.equal(planMs(false, true), 1200);
  assert.equal(planMs(true, true), 1600);
  for (const r of [false, true]) {
    assert.ok(planMs(r, true) < 2000);
    assert.ok(!revealPlan(r, true).some((x) => 'abc'.includes(x.step)));
  }
});

test('pickDesign', () => {
  assert.equal(pickDesign([], null), 'neon');
  assert.equal(pickDesign(['neon:1'], 'ink:7'), 'ink');
  const neon = ALL_ITEMS.filter((id) => id.startsWith('neon:'));
  assert.equal(pickDesign(neon, null), 'ink');
  assert.equal(pickDesign(ALL_ITEMS, null), 'neon');
});

// ---- 式の解析（src/expr.js）----
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { analyze, starsFor } from './src/expr.js';

test('例の式 2,000 本: 値が目標・記号数が m と一致する', () => {
  const f = new URL('./solver/results/examples.tsv.gz', import.meta.url);
  if (!existsSync(f)) { console.log('  (examples.tsv.gz がないので飛ばす)'); return; }
  const rows = gunzipSync(readFileSync(f)).toString().split('\n').filter(Boolean);
  const step = Math.floor(rows.length / 2000);   // 行番号を固定（0, step, 2*step, …）
  for (let i = 0; i < 2000; i++) {
    const [d, t, m, expr] = rows[i * step].split('\t');
    const r = analyze(expr, d);
    const at = `行 ${i * step}: ${d} ${m} ${t} ${expr}`;
    assert.equal(r.status, 'ok', `${at} status=${r.status} ${r.message ?? ''}`);
    assert.equal(r.value.d === 1n && r.value.n, BigInt(t), `${at} 値`);
    assert.equal(r.symbols, Number(m), `${at} 記号数 ${r.symbols}`);
    assert.ok(r.complete, `${at} 数字を使い切っていない`);
  }
});

test('手で書いた式', () => {
  // [式, 4桁, 状態, 値(整数のとき), 記号数]
  const ok = [
    ['20+27', '2027', 47, 1],
    ['(2+2)×2', '2222', 8, 3],
    ['9!{3}', '9', 162, 1],
    ['!4', '4', 9, 1],
    ['−2^2', '22', -4, 2],
    ['2^!3', '23', 4, 2],
    ['(!2)^7', '27', 1, 3],
    ['2^0^2', '202', 1, 2],
    ['2^(−1)', '21', null, 3],
    ['3!!', '3', 3, 1],
    ['(3!)!', '3', 720, 3],
    ['√9', '9', 3, 1],
    ['0.2×5', '025', 1, 2],
    ['2.0', '20', 2, 1],
    ['20.27', '2027', null, 1],
    ['3×(−2)', '32', -6, 3],
  ];
  for (const [e, d, v, k] of ok) {
    const r = analyze(e, d);
    assert.equal(r.status, 'ok', `${e}: ${r.status} ${r.message ?? ''}`);
    if (v !== null) assert.ok(r.value.d === 1n && r.value.n === BigInt(v), `${e} の値 ${r.value.n}/${r.value.d}`);
    assert.equal(r.symbols, k, `${e} の記号数`);
  }
  assert.equal(analyze('2^(−1)', '21').value.n, 1n);
  assert.equal(analyze('2^(−1)', '21').value.d, 2n);
  const bad = [
    ['!2^7', '27', 'syntax'],
    ['02', '02', 'syntax'],
    ['.2', '2', 'syntax'],
    ['√8', '8', 'math'],
    ['−−2', '2', 'syntax'],
    ['2(3)', '23', 'syntax'],
    ['1÷0', '10', 'math'],
    ['2+3', '32', 'digits'],
  ];
  for (const [e, d, st] of bad) {
    const r = analyze(e, d);
    assert.equal(r.status, st, `${e}: ${r.status} ${r.message ?? ''}`);
  }
  assert.equal(analyze('', '2027').status, 'empty');
  assert.equal(analyze('2+', '27').status, 'incomplete');
});

test('starsFor', () => {
  for (const m of [1, 5, 9]) {
    assert.equal(starsFor(1, m), 3);
    assert.equal(starsFor(m, m), 3);
    assert.equal(starsFor(m + 1, m), 2);
    assert.equal(starsFor(m + 2, m), 2);
    assert.equal(starsFor(m + 3, m), 1);
  }
  assert.equal(starsFor(99, 255), 3);
  assert.equal(starsFor(99, undefined), 3);
});

// ---- 問題の表（puzzle.bin と puzzle2.bin） ----
import { lvFrom, mOf, lvOfByte, isTodayFit, SIZE } from './src/puzzle.js';
const old = readFileSync(new URL('./data/puzzle.bin', import.meta.url));
const tbl = readFileSync(new URL('./data/puzzle2.bin', import.meta.url));

test('puzzle2.bin: 全 100 万問で Lv が puzzle.bin と一致する', () => {
  assert.equal(old.length, SIZE); assert.equal(tbl.length, SIZE);
  for (let i = 0; i < SIZE; i++) assert.equal(lvOfByte(tbl[i]), old[i] >> 5, `添え字 ${i}`);
});
test('puzzle2.bin: 全 100 万問で m が puzzle.bin と一致する', () => {
  for (let i = 0; i < SIZE; i++) assert.equal(mOf(tbl[i]), old[i] & 31, `添え字 ${i}`);
});
test('puzzle2.bin: 今日向きの印は 33,269 問', () => {
  let n = 0;
  for (let i = 0; i < SIZE; i++) if (isTodayFit(tbl[i])) n++;
  assert.equal(n, 33269);
});
test('lvFrom: 段と m の表', () => {
  assert.deepEqual([lvFrom(0, 2), lvFrom(0, 3), lvFrom(1, 2), lvFrom(1, 4), lvFrom(2, 2), lvFrom(2, 3), lvFrom(2, 4), lvFrom(0, 5)], [1, 2, 2, 3, 3, 4, 5, 5]);
});

// ---- 今日の 1 問 ----
import { dailyPuzzle, SWITCH_DATE } from './src/daily.js';
const addDays = (key, n) => new Date(Date.parse(key) + n * 86400000).toISOString().slice(0, 10);
// 前の main.js の dailyPuzzle（難しさ 3 か 4 から選ぶ）をそのまま写したもの
function oldDaily(key) {
  const seed = (str) => {
    let h = 2166136261;
    for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  const rnd = seed(`four-digits:${key}`);
  for (;;) {
    const i = Math.floor(rnd() * 1000000);
    const lv = old[i] >> 5;
    if (lv === 3 || lv === 4) return [Math.floor(i / 100), (i % 100) + 1];
  }
}
const days365 = Array.from({ length: 365 }, (_, i) => addDays(SWITCH_DATE, i));

test('今日の 1 問: 切り替えの日の前の 30 日は、前と同じ問題', () => {
  for (let i = 1; i <= 30; i++) {
    const k = addDays(SWITCH_DATE, -i);
    assert.deepEqual(dailyPuzzle(k, tbl), oldDaily(k), k);
  }
});
test('今日の 1 問: 切り替えの日から 365 日、全部が今日向き', () => {
  for (const k of days365) { const [n, t] = dailyPuzzle(k, tbl); assert.ok(isTodayFit(tbl[n * 100 + t - 1]), k); }
});
test('今日の 1 問: 365 日で、同じ 4 桁が 30 日以内に 2 回出ない', () => {
  const ns = days365.map((k) => dailyPuzzle(k, tbl)[0]);
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < Math.min(ns.length, i + 31); j++) assert.notEqual(ns[i], ns[j], `${days365[i]} と ${days365[j]}`);
});
test('今日の 1 問: 同じ日付なら何度でも同じ（呼ぶ順によらない）', () => {
  const first = days365.map((k) => dailyPuzzle(k, tbl));
  for (const k of [...days365].reverse()) assert.deepEqual(dailyPuzzle(k, tbl), first[days365.indexOf(k)]);
});

// ---- 式の操作（src/edit.js） ----
const parse = (s) => { const i = s.indexOf('|'); return { toks: [...s.replace('|', '')], cur: i }; };
const show = ({ toks, cur }) => toks.slice(0, cur).join('') + '|' + toks.slice(cur).join('');

test('⌫ は左で一番近い記号を消し、数字は飛ばす', () => {
  const a = parse('2+|027');
  assert.equal(show(deleteSymbol(a.toks, a.cur)), '2|027');
  const b = parse('2+02|7');
  assert.equal(show(deleteSymbol(b.toks, b.cur)), '202|7');
});

test('左に記号がなければ ⌫ は消せない', () => {
  for (const s of ['|2027', '2027|', '20|27', '2|0+27']) {
    const a = parse(s);
    assert.equal(deleteSymbol(a.toks, a.cur), null, s);
    assert.equal(canDelete(a.toks, a.cur), false, s);
  }
});

test('数字はどの操作でも消えず、順番も変わらない（1,000 回）', () => {
  const digits = [...'2027'];
  const syms = ['+', '−', '×', '÷', '^', '(', ')', '.', '√', '!', '!{3}'];
  let st = { toks: [...digits], cur: 1 };
  for (let n = 0; n < 1000; n++) {
    const r = Math.random();
    let next;
    if (r < 0.4) next = insertTok(st.toks, st.cur, syms[Math.floor(Math.random() * syms.length)]);
    else if (r < 0.65) next = deleteSymbol(st.toks, st.cur);
    else if (r < 0.95) next = moveBy(st.toks, st.cur, Math.random() < 0.5 ? -1 : 1);
    else next = clearSymbols(st.toks);
    if (next) st = next;
    assert.deepEqual(st.toks.filter(isDigit), digits);
    assert.ok(st.cur >= 0 && st.cur <= st.toks.length);
  }
});

// ---- おまかせ（src/auto.js） ----
const mkAuto = (L = 1, saved = null) => {
  const store = {};
  if (saved) store.auto = saved;
  const A = createAuto({ load: (k, f) => (k in store ? store[k] : f), save: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); }, lvOf: () => 0, starsOf: () => 0, hasTable: () => false });
  if (!saved) A.state.L = L;
  return { A, store };
};
const play = (A, got) => { A.state.cur = [1234, 5]; return A.solved(got); };

test('おまかせ: ★3 を 2 問続けると Lv+1', () => {
  const { A } = mkAuto(2);
  assert.equal(play(A, 3), 0); assert.equal(A.state.L, 2);
  assert.equal(play(A, 3), 1); assert.equal(A.state.L, 3);
  assert.equal(A.state.streak, 0);
});
test('おまかせ: ★1 で −1、★2 は変わらず連続が切れる', () => {
  const { A } = mkAuto(3);
  assert.equal(play(A, 1), -1); assert.equal(A.state.L, 2);
  play(A, 3);
  assert.equal(play(A, 2), 0); assert.equal(A.state.L, 2);
  assert.equal(A.state.streak, 0);
});
test('おまかせ: Lv1 で下がらず、Lv5 で上がらない', () => {
  const a = mkAuto(1).A;
  assert.equal(play(a, 1), 0); assert.equal(a.state.L, 1);
  const b = mkAuto(5).A;
  play(b, 3); assert.equal(play(b, 3), 0); assert.equal(b.state.L, 5);
});
test('おまかせ: 保存の形は { v: 1, L, streak, recent, cur }', () => {
  const { A, store } = mkAuto(2);
  play(A, 3);
  assert.deepEqual(Object.keys(store.auto), ['v', 'L', 'streak', 'recent', 'cur']);
  assert.deepEqual(store.auto, { v: 1, L: 2, streak: 1, recent: [[1234, 5]], cur: null });
  const again = mkAuto(1, store.auto).A.state;
  assert.deepEqual([again.L, again.streak, again.recent], [2, 1, [[1234, 5]]]);
});
test('おまかせ: 「もっと短く」の 2 回目（cur なし）は数えない', () => {
  const { A } = mkAuto(2);
  assert.equal(A.solved(1), 0); assert.equal(A.state.L, 2);
});
