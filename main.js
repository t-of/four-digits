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

// ---- 記録: { v: 1, s: { "0123:45": 星 } } ----
let stars = {};
const sums = new Uint16Array(10000);   // 4 桁ごとの星の合計
{
  const d = load('stars', null);
  if (d && d.v === 1 && d.s && typeof d.s === 'object') stars = d.s;
  for (const [key, val] of Object.entries(stars)) {
    const m = /^(\d{4}):(\d+)$/.exec(key);
    if (m && val >= 1 && val <= 3) sums[Number(m[1])] += val;
  }
}
const starsOf = (digits, t) => stars[`${digits}:${t}`] || 0;
function saveStars(digits, t, n) {
  const key = `${digits}:${t}`;
  const old = stars[key] || 0;
  if (n <= old) return old;
  stars[key] = n;
  sums[Number(digits)] += n - old;
  save('stars', { v: 1, s: stars });
  return n;
}
const totalStars = () => sums.reduce((a, b) => a + b, 0);

// ---- 最小記号数の表（data/min.bin。255 は未計算） ----
let minTable = null;
fetch('./data/min.bin')
  .then((r) => r.arrayBuffer())
  .then((b) => { if (b.byteLength === 1000000) minTable = new Uint8Array(b); })
  .catch(() => { /* 読めなければ未計算として遊べる */ });
const minOf = (digits, t) => (minTable ? minTable[Number(digits) * 100 + t - 1] : 255);

// ---- 画面の切り替え ----
const screens = { list: $('s-list'), targets: $('s-targets'), puzzle: $('s-puzzle') };
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

function openTargets(d) {
  digits = d;
  lastDigits = d;
  savedTop = scroller.scrollTop;
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
$('targets-back').addEventListener('click', showList);

// ================= 3. パズル =================
const MAXLEN = 60;
let target = 1, text = '', solved = false;

function openPuzzle(t) {
  target = t;
  text = '';
  solved = false;
  show('puzzle');
  $('puzzle-target').textContent = t;
  $('nsel').hidden = true;
  update();
}

function update() {
  const used = digitsOf(text).length;
  $('puzzle-digits').innerHTML = [...digits]
    .map((c, i) => `<i class="${i === used ? 'next' : ''}">${c}</i>`).join('');
  [...$('puzzle-digits').children].forEach((el, i) => { el.style.opacity = i < used ? '0.35' : '1'; });

  $('expr').textContent = display(text);
  const key = $('key-next');
  key.disabled = used >= 4 || solved;
  key.innerHTML = used >= 4 ? '数字は使い切った' : `次の数字<b>${digits[used]}</b>`;

  const a = analyze(text, digits);
  const val = $('value');
  val.className = 'info__value';
  if (a.status === 'empty') { val.textContent = ''; }
  else if (a.status === 'incomplete') { val.textContent = '未完成'; val.classList.add('dim'); }
  else if (a.status === 'ok') {
    val.textContent = `= ${formatValue(a.value)}${a.complete ? '' : '（数字がまだ残っている）'}`;
    if (!a.complete) val.classList.add('dim');
  } else { val.textContent = a.message; val.classList.add('warn'); }
  $('count').textContent = `記号 ${a.symbols} 個`;

  if (!solved && a.status === 'ok' && a.complete && isTarget(a.value, target)) finish(a.symbols);
}

function finish(k) {
  solved = true;
  const m = minOf(digits, target);
  const got = starsFor(k, m);
  const best = saveStars(digits, target, got);
  $('keys').hidden = true;
  $('nsel').hidden = true;
  $('result').hidden = false;
  $('r-stars').textContent = '★'.repeat(got) + '☆'.repeat(3 - got);
  $('r-text').textContent = `${display(text)} = ${target}`;
  $('r-sub').textContent = `記号 ${k} 個 ・ ${m >= 255 ? '最小は未計算' : `最小は ${m} 個`} ・ この問題の最高 ${'★'.repeat(best)}`;
  $('r-next').hidden = target >= 100;
  $('key-next').disabled = true;
}

function resetView() {
  $('keys').hidden = false;
  $('result').hidden = true;
}

function press(ch) {
  if (solved || text.length >= MAXLEN) return;
  text += ch;
  update();
}

$('keys').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || solved) return;
  if (b.dataset.ch) return press(b.dataset.ch);
  const k = b.dataset.key;
  if (k === 'next') {
    const used = digitsOf(text).length;
    if (used < 4) press(digits[used]);
  } else if (k === 'back') {
    // !{N} は 1 つのまとまりとして消す
    text = text.replace(/!\{\d+\}$/, '').length < text.length ? text.replace(/!\{\d+\}$/, '') : text.slice(0, -1);
    update();
  } else if (k === 'clear') {
    text = '';
    update();
  } else if (k === 'factn') {
    $('keys').hidden = true;
    $('nsel').hidden = false;
  }
});

const nInput = $('n-input');
const getN = () => Math.max(1, Math.min(999, parseInt(nInput.value, 10) || 1));
nInput.addEventListener('input', () => { nInput.value = nInput.value.replace(/\D/g, '').slice(0, 3); });
$('n-minus').addEventListener('click', () => { nInput.value = Math.max(1, getN() - 1); });
$('n-plus').addEventListener('click', () => { nInput.value = Math.min(999, getN() + 1); });
function closeN() { $('nsel').hidden = true; $('keys').hidden = false; }
$('n-cancel').addEventListener('click', closeN);
$('n-ok').addEventListener('click', () => { const n = getN(); closeN(); press(`!{${n}}`); });

$('puzzle-back').addEventListener('click', () => { resetView(); showTargets(); });
$('r-list').addEventListener('click', () => { resetView(); showList(); });
$('r-next').addEventListener('click', () => { resetView(); openPuzzle(target + 1); });

showList();
