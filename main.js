import { analyze, isTarget, starsFor, formatValue, display, digitsOf } from './src/expr.js';

// localStorage はほかのアプリと共有される（同じ t-of.github.io のため）。
// キーは必ず 'four-digits.' で始める。
const STORE = 'four-digits.';

function load(key, fallback) {
  try {
    const v = localStorage.getItem(STORE + key);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch { /* 保存できなくても遊べる */ }
}

WebAppKit.init({ title: 'four-digits', text: '4つの数字を順番どおりに使い、目標の数を作る数字パズル。' });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

const $ = (id) => document.getElementById(id);
const pad4 = (n) => String(n).padStart(4, '0');

// ---- 問題の表（data/puzzle.bin。1 問 1 バイト、添え字 = 4 桁×100 + 目標−1）。星の計算に使うので先に読む ----
// 下 5 ビット = 最小記号数（255 は未計算）、上 3 ビット = 難しさ 1〜5
let minTable = null;
try {
  const r = await fetch('./data/puzzle.bin');
  const b = await r.arrayBuffer();
  if (b.byteLength === 1000000) minTable = new Uint8Array(b);
} catch { /* 読めなければ未計算として遊べる（おまかせ・今日の 1 問は難しさの区別なし） */ }
const minOf = (digits, t) => (minTable ? minTable[Number(digits) * 100 + t - 1] & 31 : 255);
const lvOf = (n, t) => (minTable ? minTable[n * 100 + t - 1] >> 5 : 0);

// ---- 記録: four-digits.best = { v: 2, s: { "0123": { "45": [k, "式"] } } } ----
// 遊んだ問題だけを持つ。k は式の記号数、式は !{N} を含む打った形のまま。
// 星は保存せず、k と最小記号数から出す。
// 旧版（four-digits.stars）から引き継いだ問題は式がないので [null, null, 星]。
let best = {};
{
  const d = load('best', null);
  if (d && d.v === 2 && d.s && typeof d.s === 'object') best = d.s;
  else {
    const old = load('stars', null);   // { v: 1, s: { "0123:45": 星 } }
    if (old && old.v === 1 && old.s && typeof old.s === 'object') {
      for (const [key, val] of Object.entries(old.s)) {
        const m = /^(\d{4}):(\d+)$/.exec(key);
        if (m && val >= 1 && val <= 3) (best[m[1]] ||= {})[m[2]] = [null, null, val];
      }
      save('best', { v: 2, s: best });
    }
  }
}
const entryOf = (digits, t) => (best[digits] && best[digits][t]) || null;
const starsOfEntry = (digits, t, e) => (e[0] == null ? e[2] : starsFor(e[0], minOf(digits, t)));
const starsOf = (digits, t) => { const e = entryOf(digits, t); return e ? starsOfEntry(digits, t, e) : 0; };
const sums = new Uint16Array(10000);   // 4 桁ごとの星の合計
for (const [d, row] of Object.entries(best)) {
  for (const t of Object.keys(row)) sums[Number(d)] += starsOfEntry(d, Number(t), row[t]);
}
// 解いた式を残す。前より記号数が少なければ更新（同じなら前のまま）。返すのは今の星
function saveBest(digits, t, k, expr) {
  const old = entryOf(digits, t);
  const oldStars = old ? starsOfEntry(digits, t, old) : 0;
  const got = starsFor(k, minOf(digits, t));
  const better = !old || (old[0] == null ? got >= oldStars : k < old[0]);
  if (!better) return oldStars;
  (best[digits] ||= {})[t] = [k, expr];
  const now = starsFor(k, minOf(digits, t));
  sums[Number(digits)] += now - oldStars;
  save('best', { v: 2, s: best });
  return now;
}
const totalStars = () => sums.reduce((a, b) => a + b, 0);

// ---- 画面の切り替え ----
const screens = { home: $('s-home'), list: $('s-list'), zukan: $('s-zukan'), targets: $('s-targets'), puzzle: $('s-puzzle') };
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
}

// ================= 1. 4 桁の一覧（見えている行だけ作る） =================
const ROW = 54, GAP = 6, MINW = 62;
const scroller = $('list-scroll'), spacer = $('list-spacer'), rowsEl = $('list-rows');
let cols = 5, rowsTotal = 2000, drawn = '', marked = -1, savedTop = 0, lastDigits = null;

function level(n) {
  const s = sums[n];
  return s === 0 ? 0 : Math.min(5, Math.ceil(s / 60));
}

function layout() {
  const w = scroller.clientWidth;
  if (!w) return;
  const c = Math.max(3, Math.min(10, Math.floor((w + GAP) / (MINW + GAP))));
  if (c !== cols) {
    const first = Math.floor(scroller.scrollTop / ROW) * cols;
    cols = c;
    scroller.scrollTop = Math.floor(first / cols) * ROW;
  }
  rowsTotal = Math.ceil(10000 / cols);
  spacer.style.height = `${rowsTotal * ROW}px`;
  drawn = '';
  render();
}

function render() {
  const vh = scroller.clientHeight;
  if (!vh) return;
  const top = scroller.scrollTop;
  const first = Math.max(0, Math.floor(top / ROW) - 3);
  const last = Math.min(rowsTotal - 1, Math.ceil((top + vh) / ROW) + 3);
  const sig = `${first}-${last}-${cols}-${marked}`;
  if (sig === drawn) return;
  drawn = sig;
  rowsEl.style.transform = `translateY(${first * ROW}px)`;
  let html = '';
  for (let r = first; r <= last; r++) {
    html += `<div class="list__row" style="grid-template-columns:repeat(${cols},1fr)">`;
    for (let c = 0; c < cols; c++) {
      const n = r * cols + c;
      if (n >= 10000) break;
      const lv = level(n);
      html += `<button class="n${lv ? ` lv${lv}` : ''}${n === marked ? ' mark' : ''}" data-n="${n}">${pad4(n)}</button>`;
    }
    html += '</div>';
  }
  rowsEl.innerHTML = html;
}

function scrollToNumber(n) {
  const row = Math.floor(n / cols);
  scroller.scrollTop = Math.max(0, row * ROW - (scroller.clientHeight - ROW) / 2);
  render();
}

let raf = 0;
scroller.addEventListener('scroll', () => {
  if (raf) return;
  raf = requestAnimationFrame(() => { raf = 0; render(); });
}, { passive: true });
new ResizeObserver(layout).observe(scroller);

scroller.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-n]');
  if (b) openTargets(pad4(b.dataset.n));
});

const jump = $('jump');
jump.addEventListener('input', () => {
  const v = jump.value.replace(/\D/g, '').slice(0, 4);
  if (v !== jump.value) jump.value = v;
  if (!v) { marked = -1; render(); return; }
  const n = Number(v.padEnd(4, '0'));   // 途中までなら、その続きの先頭へ
  marked = v.length === 4 ? n : -1;
  drawn = '';
  scrollToNumber(n);
});
jump.addEventListener('keydown', (e) => { if (e.key === 'Enter') jump.blur(); });

function showList() {
  show('list');
  $('list-sum').textContent = `★ ${totalStars()} / 30000`;
  if (lastDigits !== null) marked = Number(lastDigits);
  drawn = '';
  layout();
  scroller.scrollTop = savedTop;
  render();
}

// ================= 2. 目標の一覧 =================
let digits = '0000';
let mode = 'free';   // 'free' | 'auto' | 'daily'

let from = 'list';   // 目標の一覧に来た場所（戻り先）
function openTargets(d, origin = 'list') {
  from = origin;
  digits = d;
  lastDigits = d;
  if (origin === 'list') savedTop = scroller.scrollTop;
  show('targets');
  showTargets();
}

function showTargets() {
  show('targets');
  $('targets-digits').textContent = digits;
  $('targets-sum').textContent = `★ ${sums[Number(digits)]} / 300`;
  let html = '';
  for (let t = 1; t <= 100; t++) {
    const s = starsOf(digits, t);
    html += `<button class="t${s ? ` st${s}` : ''}" data-t="${t}"><b>${t}</b><small>${'★'.repeat(s)}${'☆'.repeat(3 - s)}</small></button>`;
  }
  $('targets').innerHTML = html;
}

$('targets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-t]');
  if (b) openPuzzle(Number(b.dataset.t));
});
$('targets-back').addEventListener('click', () => (from === 'zukan' ? showZukan() : showList()));

// ================= 3. パズル =================
const MAXLEN = 60;
// 式は「かたまり」の並び（1 文字か !{N}）とカーソル位置で持つ。text は並びをつないだもの
let target = 1, toks = [], cur = 0, solved = false;
let locked = null;   // 「もっと短く」で戻ったときの式。同じ式のままでは解けた扱いにしない
let pauseTimer = 0;
const text = () => toks.join('');
const isDigit = (t) => /^\d$/.test(t);
// 数字は最初から並べておき、プレイヤーは記号だけを差し込む（数字は消せないので順番は崩れない）
const canDelete = () => cur > 0 && !isDigit(toks[cur - 1]);
const startToks = () => [...digits];

function openPuzzle(t, md = 'free') {
  mode = md;
  target = t;
  toks = startToks(); cur = 1;   // 1 つ目と 2 つ目の数字の間から始める
  solved = false; locked = null; clearTimeout(pauseTimer);
  resetView();
  show('puzzle');
  $('puzzle-target').textContent = t;
  $('puzzle-tag').textContent = md === 'daily' ? '今日の 1 問' : md === 'auto' ? `Lv ${auto.L}` : '';
  $('puzzle-back').textContent = md === 'free' ? '‹ 目標' : '‹ ホーム';
  $('giveup').hidden = md !== 'auto';
  $('nsel').hidden = true;
  showMine();
  update();
}

// その問題の自分の一番良い式（最小記号数は出さない）
function showMine() {
  const e = entryOf(digits, target);
  $('mine').textContent = !e ? '' : e[0] == null ? '解いたことがある' : `自分の一番: ${display(e[1])}（記号 ${e[0]} 個）`;
}

function renderExpr() {
  const el = $('expr');
  const parts = toks.map((t, i) => `<span data-i="${i}">${display(t)}</span>`);
  parts.splice(cur, 0, '<span class="caret" aria-hidden="true"></span>');
  el.innerHTML = `<span class="expr__in">${parts.join('')}</span>`;
}

function update() {
  $('puzzle-digits').innerHTML = [...digits].map((c) => `<i>${c}</i>`).join('');

  renderExpr();
  $('key-back').disabled = solved || !canDelete();
  $('key-left').disabled = cur === 0 || solved;
  $('key-right').disabled = cur === toks.length || solved;

  const a = analyze(text(), digits);
  const val = $('value');
  val.className = 'info__value';
  if (a.status === 'empty') { val.textContent = ''; }
  else if (a.status === 'incomplete') { val.textContent = '未完成'; val.classList.add('dim'); }
  else if (a.status === 'ok') {
    val.textContent = `${formatValue(a.value)}${a.complete ? '' : '（数字がまだ残っている）'}`;
    if (!a.complete) val.classList.add('dim');
  } else { val.textContent = a.message; val.classList.add('warn'); }
  $('count').textContent = `記号 ${a.symbols} 個`;

  if (!solved && text() !== locked && a.status === 'ok' && a.complete && isTarget(a.value, target)) finish(a.symbols);
}

// その 4 桁で、今の目標の後ろから回って最初の ★3 でない目標（無ければ 0）
function nextOpen() {
  for (let i = 1; i < 100; i++) {
    const t = ((target - 1 + i) % 100) + 1;
    if (starsOf(digits, t) < 3) return t;
  }
  return 0;
}

// 解けたら: 式を残して値を光らせ、少し間を置いてから星と結果を出す
function finish(k) {
  solved = true;
  const m = minOf(digits, target);
  const got = starsFor(k, m);
  const prev = starsOf(digits, target);
  const bestStars = saveBest(digits, target, k, text());
  $('value').classList.add('hit');
  showMine();
  $('nsel').hidden = true;
  renderExpr();
  $('r-stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < got ? 'on' : 'off'}" style="animation-delay:${i * 180}ms">${i < got ? '★' : '☆'}</span>`).join('');
  $('r-text').textContent = `記号 ${k} 個`;
  let sub = '';
  if (m < 255 && k < m) sub = '最小を更新！';
  else if (got < 3) sub = 'もっと短い式がある';
  if (prev > got) sub += `${sub ? ' ・ ' : ''}この問題の最高は ${'★'.repeat(bestStars)}`;
  $('r-sub').textContent = sub;
  $('r-sub').classList.toggle('record', m < 255 && k < m);
  if (mode === 'auto') {
    autoSolved(got);
    $('r-next').textContent = '次の 1 問';
  } else if (mode === 'daily') {
    if (bestStars > (daily[dailyDate] || 0)) { daily[dailyDate] = bestStars; save('daily', daily); }
    $('r-next').textContent = 'ホームへ';
  } else {
    const nt = nextOpen();
    $('r-next').textContent = nt ? '次へ' : '制覇！ 目標の一覧へ';
    $('r-next').dataset.t = nt;
  }
  $('giveup').hidden = true;
  $('r-retry').hidden = got >= 3;
  pauseTimer = setTimeout(() => { $('keys').hidden = true; $('result').hidden = false; }, 800);
}

function resetView() {
  clearTimeout(pauseTimer);
  $('keys').hidden = false;
  $('result').hidden = true;
}

// カーソルの位置に 1 かたまり入れる
function press(tok) {
  if (solved || text().length + tok.length > MAXLEN) return;
  toks.splice(cur, 0, tok);
  cur++;
  update();
}

$('keys').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || solved) return;
  if (b.dataset.ch) return press(b.dataset.ch);
  const k = b.dataset.key;
  if (k === 'back') {
    if (canDelete()) { toks.splice(cur - 1, 1); cur--; update(); }
  } else if (k === 'left') {
    if (cur > 0) { cur--; update(); }
  } else if (k === 'right') {
    if (cur < toks.length) { cur++; update(); }
  } else if (k === 'clear') {
    toks = startToks(); cur = 1;
    update();
  } else if (k === 'factn') {
    $('keys').hidden = true;
    $('nsel').hidden = false;
  }
});

// 式をタップした場所にカーソルを置く（かたまりの左半分なら前、右半分なら後ろ）
$('expr').addEventListener('click', (e) => {
  if (solved) return;
  const sp = e.target.closest('span[data-i]');
  if (!sp) { cur = toks.length; update(); return; }
  const r = sp.getBoundingClientRect();
  const i = Number(sp.dataset.i);
  cur = e.clientX < r.left + r.width / 2 ? i : i + 1;
  update();
});

const nInput = $('n-input');
const getN = () => Math.max(1, Math.min(999, parseInt(nInput.value, 10) || 1));
nInput.addEventListener('input', () => { nInput.value = nInput.value.replace(/\D/g, '').slice(0, 3); });
$('n-minus').addEventListener('click', () => { nInput.value = Math.max(1, getN() - 1); });
$('n-plus').addEventListener('click', () => { nInput.value = Math.min(999, getN() + 1); });
function closeN() { $('nsel').hidden = true; $('keys').hidden = false; }
$('n-cancel').addEventListener('click', closeN);
$('n-ok').addEventListener('click', () => { const n = getN(); closeN(); press(`!{${n}}`); });

$('puzzle-back').addEventListener('click', () => { resetView(); if (mode === 'free') showTargets(); else showHome(); });
$('giveup').addEventListener('click', () => { autoGiveUp(); openAuto(); });
$('r-next').addEventListener('click', () => {
  if (mode === 'auto') return openAuto();
  if (mode === 'daily') { resetView(); return showHome(); }
  const nt = Number($('r-next').dataset.t);
  resetView();
  if (nt) openPuzzle(nt); else showTargets();
});
// もっと短く: 今の式のまま入力に戻る
$('r-retry').addEventListener('click', () => {
  locked = text(); solved = false;
  resetView();
  update();
});

// ================= 図鑑 =================
let tab = 'digits', numPick = 0;
const zbody = $('z-body');

function showZukan() {
  show('zukan');
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
  if (tab === 'digits') renderDigitsTab(); else if (numPick) renderNumberDetail(); else renderNumbersTab();
}

function renderDigitsTab() {
  const ds = Object.keys(best).filter((d) => Object.keys(best[d]).length).sort();
  let full = 0, cards = '';
  for (const d of ds) {
    let cells = '', n3 = 0;
    for (let t = 1; t <= 100; t++) {
      const s = starsOf(d, t);
      if (s === 3) n3++;
      cells += `<i class="c${s}"></i>`;
    }
    const gold = n3 === 100;
    if (gold) full++;
    cards += `<button class="card${gold ? ' gold' : ''}" data-n="${d}"><b>${d}</b>${gold ? '<small>制覇</small>' : ''}<span class="map">${cells}</span></button>`;
  }
  zbody.innerHTML = `<div class="zsum">遊んだ ${ds.length} 組 ・ 制覇 ${full} 組</div>`
    + (ds.length ? `<div class="cards">${cards}</div>` : '<div class="zempty">まだ解いた問題がない。解くとここに並ぶ。</div>');
}

// 数 t を作った 4 桁の一覧（4 桁の昇順）
function makersOf(t) {
  const out = [];
  for (const d of Object.keys(best).sort()) if (best[d][t]) out.push(d);
  return out;
}

function renderNumbersTab() {
  let cells = '';
  for (let t = 1; t <= 100; t++) {
    const c = makersOf(t).length;
    cells += `<button class="num${c ? '' : ' zero'}" data-t="${t}"><b>${t}</b><small>${c}</small></button>`;
  }
  zbody.innerHTML = `<div class="zsum">数ごとに、何種類の 4 桁から作ったか</div><div class="nums">${cells}</div>`;
}

function renderNumberDetail() {
  let rows = '';
  for (const d of makersOf(numPick)) {
    const e = best[d][numPick];
    const s = starsOfEntry(d, numPick, e);
    rows += `<button class="mk" data-n="${d}"><b>${d}</b><span>${e[1] ? display(e[1]) : '（式なし）'}</span><small>${'★'.repeat(s)}</small></button>`;
  }
  zbody.innerHTML = `<div class="zhead"><button class="back" id="num-back">‹ 数</button><b class="zbig">${numPick}</b></div>`
    + (rows ? `<div class="mks">${rows}</div>` : '<div class="zempty">まだこの数を作っていない。</div>');
}

zbody.addEventListener('click', (e) => {
  if (e.target.closest('#num-back')) { numPick = 0; return showZukan(); }
  const num = e.target.closest('button.num');
  if (num) { numPick = Number(num.dataset.t); return showZukan(); }
  const c = e.target.closest('button[data-n]');
  if (c) openTargets(c.dataset.n, 'zukan');
});
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab; numPick = 0; showZukan();
});
$('zukan-btn').addEventListener('click', showZukan);
$('zukan-back').addEventListener('click', () => showHome());
$('list-back').addEventListener('click', () => showHome());
$('free-btn').addEventListener('click', showList);

// ================= ホーム・おまかせ・今日の 1 問 =================
// four-digits.auto = { v: 1, L: 難しさ, streak: ★3 の連続, recent: [[4桁, 目標], …新しい順に最大 30], cur: [4桁, 目標] | null }
const RECENT_DIGITS = 30, RECENT_TARGET = 5;
let auto = { L: 1, streak: 0, recent: [], cur: null };
{
  const d = load('auto', null);
  if (d && d.v === 1 && d.L >= 1 && d.L <= 5 && Array.isArray(d.recent)) {
    auto = { L: d.L, streak: d.streak | 0, recent: d.recent.slice(0, RECENT_DIGITS), cur: Array.isArray(d.cur) ? d.cur : null };
  }
}
const saveAuto = () => save('auto', { v: 1, ...auto });
// four-digits.daily = { "2026-11-06": 星, … }（解いた日だけ。その日の最高）
const daily = (() => { const d = load('daily', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; })();

const two = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
let dailyDate = dateKey(new Date());   // 今開いている「今日の 1 問」の日付

// 日付の文字列から決まった乱数列を作る（全端末で同じ結果。FNV-1a → mulberry32）
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 難しさ 3 か 4 の問題を、条件に合うまで引く。[4桁の数, 目標]
function dailyPuzzle(key) {
  const rnd = seeded(`four-digits:${key}`);
  for (;;) {
    const i = Math.floor(rnd() * 1000000);
    const n = Math.floor(i / 100), t = (i % 100) + 1;
    if (!minTable) return [n, t];
    const lv = lvOf(n, t);
    if (lv === 3 || lv === 4) return [n, t];
  }
}

// 続けて解いた日数。今日まだなら昨日までの連続を数える
function dailyStreak() {
  const d = new Date();
  if (!daily[dateKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (daily[dateKey(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function showHome() {
  show('home');
  $('auto-lv').innerHTML = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= auto.L ? 'on' : ''}"></i>`).join('') + `<em>Lv ${auto.L}</em>`;
  dailyDate = dateKey(new Date());
  const [, mo, da] = dailyDate.split('-');
  $('daily-date').textContent = `${Number(mo)}月${Number(da)}日`;
  const s = daily[dailyDate] || 0;
  $('daily-st').textContent = s ? `${'★'.repeat(s)}${'☆'.repeat(3 - s)}` : '☆☆☆';
  $('daily-st').classList.toggle('done', s > 0);
  const st = dailyStreak();
  $('daily-streak').textContent = st ? `${st} 日連続` : '';
}

$('daily-btn').addEventListener('click', () => {
  dailyDate = dateKey(new Date());
  const [n, t] = dailyPuzzle(dailyDate);
  digits = pad4(n);
  openPuzzle(t, 'daily');
});

// 次のおまかせの問題を選ぶ。[4桁の数, 目標]
function pickAuto() {
  const rd = auto.recent.slice(0, RECENT_DIGITS).map((r) => r[0]);
  const rt = auto.recent.slice(0, RECENT_TARGET).map((r) => r[1]);
  for (let tries = 0; tries < 5000; tries++) {
    const i = Math.floor(Math.random() * 1000000);
    const n = Math.floor(i / 100), t = (i % 100) + 1;
    if (minTable && lvOf(n, t) !== auto.L) continue;
    if (rd.includes(n) || rt.includes(t) || starsOf(pad4(n), t) >= 3) continue;
    return [n, t];
  }
  return [Math.floor(Math.random() * 10000), 1 + Math.floor(Math.random() * 100)];
}

function openAuto() {
  if (!auto.cur) { auto.cur = pickAuto(); saveAuto(); }
  digits = pad4(auto.cur[0]);
  openPuzzle(auto.cur[1], 'auto');
}
function autoPush() {
  auto.recent.unshift(auto.cur);
  auto.recent.length = Math.min(auto.recent.length, RECENT_DIGITS);
  auto.cur = null;
}
// 解けた: ★3 が 2 問続けば L+1、★1 なら L−1、★2 はそのまま（連続は切れる）
function autoSolved(got) {
  if (!auto.cur) return;   // 「もっと短く」の 2 回目以降は数えない
  if (got >= 3) {
    auto.streak++;
    if (auto.streak >= 2) { auto.L = Math.min(5, auto.L + 1); auto.streak = 0; }
  } else {
    auto.streak = 0;
    if (got <= 1) auto.L = Math.max(1, auto.L - 1);
  }
  autoPush(); saveAuto();
}
function autoGiveUp() {
  auto.L = Math.max(1, auto.L - 1); auto.streak = 0;
  autoPush(); saveAuto();
}
$('auto-btn').addEventListener('click', openAuto);

showHome();
