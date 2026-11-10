import { analyze, isTarget, starsFor, formatValue, display } from './src/expr.js';
import { sfx, setSound, unlockOnFirstTouch } from './src/sfx.js';

// =====================================================================
// 保存（localStorage はほかのアプリと共有。キーは必ず 'four-digits.' で始める）
// =====================================================================
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

WebAppKit.init({ title: 'OCCAM', text: '4つの数字を、いちばん短い式で。1〜100を作るテンパズル。' });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

const $ = (id) => document.getElementById(id);
const pad4 = (n) => String(n).padStart(4, '0');
const starStr = (s) => '★'.repeat(s) + '☆'.repeat(3 - s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms = 6) => { try { navigator.vibrate?.(ms); } catch { /* なし */ } };

// ---- 設定: four-digits.settings = { v: 1, sound: true } ----
const settings = (() => {
  const d = load('settings', null);
  return d && d.v === 1 ? { sound: d.sound !== false } : { sound: true };
})();
setSound(settings.sound);
unlockOnFirstTouch();

// =====================================================================
// 問題の表（data/puzzle.bin。1 問 1 バイト、添え字 = 4 桁×100 + 目標−1）
// 下 5 ビット = 最小記号数（31 は未計算）、上 3 ビット = 難しさ 1〜5
// 1MB あるので、画面を先に出してから読む
// =====================================================================
let minTable = null;
const tableReady = (async () => {
  try {
    const r = await fetch('./data/puzzle.bin');
    const b = await r.arrayBuffer();
    if (b.byteLength === 1000000) minTable = new Uint8Array(b);
  } catch { /* 読めなければ未計算として遊べる */ }
})();
const minOf = (digits, t) => (minTable ? minTable[Number(digits) * 100 + t - 1] & 31 : 255);
const lvOf = (n, t) => (minTable ? minTable[n * 100 + t - 1] >> 5 : 0);

// =====================================================================
// 記録: four-digits.best = { v: 2, s: { "0123": { "45": [k, "式"] } } }
// k は式の記号数、式は !{N} を含む打った形のまま。星は k と最小記号数から出す。
// 旧版（four-digits.stars）から引き継いだ問題は [null, null, 星]。
// =====================================================================
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
const starSum = (digits) => {
  const row = best[digits];
  if (!row) return 0;
  let s = 0;
  for (const t of Object.keys(row)) s += starsOfEntry(digits, Number(t), row[t]);
  return s;
};
// 解いた式を残す。前より記号数が少なければ更新（同じなら前のまま）。返すのは今の星
function saveBest(digits, t, k, expr) {
  const old = entryOf(digits, t);
  const oldStars = old ? starsOfEntry(digits, t, old) : 0;
  const got = starsFor(k, minOf(digits, t));
  const better = !old || (old[0] == null ? got >= oldStars : k < old[0]);
  if (!better) return oldStars;
  (best[digits] ||= {})[t] = [k, expr];
  save('best', { v: 2, s: best });
  return got;
}
function totals() {
  let solved = 0, three = 0, stars = 0, full = 0, played = 0;
  for (const d of Object.keys(best)) {
    const ts = Object.keys(best[d]);
    if (!ts.length) continue;
    played++;
    let n3 = 0;
    for (const t of ts) {
      const s = starsOfEntry(d, Number(t), best[d][t]);
      solved++; stars += s;
      if (s === 3) { three++; n3++; }
    }
    if (n3 === 100) full++;
  }
  return { solved, three, stars, full, played };
}

// =====================================================================
// おまかせ: four-digits.auto = { v: 1, L, streak, recent: [[4桁, 目標], …], cur: [4桁, 目標] | null }
// =====================================================================
const RECENT_DIGITS = 30, RECENT_TARGET = 5;
let auto = { L: 1, streak: 0, recent: [], cur: null };
{
  const d = load('auto', null);
  if (d && d.v === 1 && d.L >= 1 && d.L <= 5 && Array.isArray(d.recent)) {
    auto = { L: d.L, streak: d.streak | 0, recent: d.recent.slice(0, RECENT_DIGITS), cur: Array.isArray(d.cur) ? d.cur : null };
  }
}
const saveAuto = () => save('auto', { v: 1, ...auto });

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
// はじめての人の最初の 1 問は、+ を 1 つ差し込めば解ける問題（20+27=47）。遊び方を読ませずに触って覚える
const TUT = [2027, 47];
const needTut = () => !load('tut', false) && totals().played === 0;
function ensureAuto() {
  if (!auto.cur) { auto.cur = needTut() ? TUT : pickAuto(); saveAuto(); }
  return auto.cur;
}
function autoPush() {
  auto.recent.unshift(auto.cur);
  auto.recent.length = Math.min(auto.recent.length, RECENT_DIGITS);
  auto.cur = null;
}
// 解けた: ★3 が 2 問続けば L+1、★1 なら L−1、★2 はそのまま（連続は切れる）。返すのは Lv の上下
function autoSolved(got) {
  if (!auto.cur) return 0;   // 「もっと短く」の 2 回目以降は数えない
  const before = auto.L;
  if (got >= 3) {
    auto.streak++;
    if (auto.streak >= 2) { auto.L = Math.min(5, auto.L + 1); auto.streak = 0; }
  } else {
    auto.streak = 0;
    if (got <= 1) auto.L = Math.max(1, auto.L - 1);
  }
  autoPush(); saveAuto();
  return auto.L - before;
}
function autoGiveUp() {
  auto.L = Math.max(1, auto.L - 1); auto.streak = 0;
  autoPush(); saveAuto();
}

// =====================================================================
// コイン: four-digits.coins = { v: 1, n: 残高, last: 最後にボーナスを渡した日, run: ログインの連続日数, day: { d, r } }
// 増やす・減らすのはこの 2 つの関数だけ（★3 のごほうび・ヒント・パスはここを通す）
// =====================================================================
const coins = (() => {
  const d = load('coins', null);
  const ok = d && d.v === 1 && Number.isFinite(d.n) && d.n >= 0;
  return ok ? { v: 1, n: Math.floor(d.n), last: typeof d.last === 'string' ? d.last : '', run: Math.max(0, d.run | 0), day: d.day && typeof d.day.d === 'string' ? { d: d.day.d, r: Math.max(0, d.day.r | 0) } : { d: '', r: 0 } }
    : { v: 1, n: 0, last: '', run: 0, day: { d: '', r: 0 } };
})();
const saveCoins = () => save('coins', coins);
function coinAdd(n) { coins.n += Math.max(0, Math.floor(n)); saveCoins(); renderCoins(); }
// 足りなければ false（何も引かない）
function coinSpend(n) {
  if (!(n > 0) || coins.n < n) return false;
  coins.n -= n; saveCoins(); renderCoins();
  return true;
}
function renderCoins() { $('coin-n').textContent = coins.n; $('shop-n').textContent = coins.n; $('p-coin-n').textContent = coins.n; }

// ショップ: four-digits.shop = { v: 1, owned: ["font-seg"], font: "font-seg" | null, pal: null }（null は標準）
const FONT_IDS = ['font-seg', 'font-mono', 'font-serif'];
const FONT_PRICE = 120;
const PAL_IDS = ['pal-chalk', 'pal-grid', 'pal-print'];
const shop = (() => {
  const d = load('shop', null);
  if (!d || d.v !== 1) return { v: 1, owned: [], font: null, pal: null };
  const owned = Array.isArray(d.owned) ? d.owned.filter((x) => typeof x === 'string') : [];
  return { v: 1, owned, font: FONT_IDS.includes(d.font) && owned.includes(d.font) ? d.font : null, pal: PAL_IDS.includes(d.pal) && owned.includes(d.pal) ? d.pal : null };
})();
const saveShop = () => save('shop', shop);
let shopAsk = null;   // 買う確認に変わっているカード
const COIN_SVG = '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M6 19.5L18.5 4.5"/></svg>';
function applyFont() {
  if (shop.font) document.documentElement.dataset.font = shop.font; else delete document.documentElement.dataset.font;
}
const PAL_PRICE = 200;
const PAL_BG = { 'pal-chalk': '#12291d', 'pal-grid': '#f8f4e2', 'pal-print': '#0c2552' };
const palNow = () => (PAL_IDS.includes(shop.pal) && shop.owned.includes(shop.pal) ? shop.pal : null);
// 配色を使っている間は ☀/☾ を隠し、theme-color を配色の地にする。標準に戻したら元の theme に戻る
function applyPal() {
  const p = palNow(), h = document.documentElement;
  if (p) h.dataset.pal = p; else delete h.dataset.pal;
  $('theme-btn').hidden = !!p;
  const t = h.getAttribute('data-theme');
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const c = p ? PAL_BG[p] : (dark ? '#0d1017' : '#f6f4ef');
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    m.setAttribute('content', c);
    if (p || t) m.removeAttribute('media');
  }
}
const SHOP_KINDS = {
  font: { el: 'shop-fonts', ids: FONT_IDS, price: FONT_PRICE, apply: applyFont },
  pal: { el: 'shop-pals', ids: PAL_IDS, price: PAL_PRICE, apply: applyPal },
};
const PAL_EG = '<span class="shopcard__eg shopcard__eg--pal"><b>2</b><b>0</b><i>+</i><b>2</b><b>7</b></span>';
function renderShop() {
  $('shop-n').textContent = coins.n;
  for (const [kind, k] of Object.entries(SHOP_KINDS)) {
    $(k.el).innerHTML = ['', ...k.ids].map((id) => {
      const own = !id || shop.owned.includes(id);
      const ask = shopAsk === id && !own;
      const cls = `shopcard${(shop[kind] || '') === id ? ' cur' : ''}${ask ? ' ask' : ''}${!own && !ask && coins.n < k.price ? ' poor' : ''}`;
      const price = own ? '' : `<span class="shopcard__price">${COIN_SVG}${k.price}${ask ? ' ✓' : ''}</span>`;
      const eg = kind === 'pal' ? PAL_EG : '<span class="shopcard__eg">2027</span>';
      return `<button class="${cls}" data-id="${id}"${id ? ` data-${kind}="${id}"` : ''}>${eg}${price}</button>`;
    }).join('');
  }
}
for (const [kind, k] of Object.entries(SHOP_KINDS)) {
  $(k.el).addEventListener('click', (e) => {
    const c = e.target.closest('[data-id]');
    if (!c) return;
    const id = c.dataset.id;
    const own = !id || shop.owned.includes(id);
    if (own) {
      shopAsk = null; shop[kind] = id || null; saveShop(); k.apply(); sfx.tap();
    } else if (shopAsk !== id) {
      if (coins.n < k.price) { shopAsk = null; sfx.nope(); } else { shopAsk = id; sfx.tap(); }
    } else if (coinSpend(k.price)) {
      shopAsk = null; shop.owned.push(id); shop[kind] = id; saveShop(); k.apply(); sfx.pay();
    } else { shopAsk = null; sfx.nope(); }
    renderShop();
  });
}
// ほかを押したら確認を戻す
$('shop').addEventListener('click', (e) => {
  if (shopAsk && !e.target.closest(`[data-id="${shopAsk}"]`)) { shopAsk = null; renderShop(); }
});
applyFont();

// ログインボーナス: 1 日目 5 → 毎日 +1 → 6 日目以降 10。1 日あけたら 1 日目。日付を戻したときは渡さない
const prevDay = (key) => { const [y, m, d] = key.split('-').map(Number); return dateKey(new Date(y, m - 1, d - 1)); };
let bandTimer = 0;
function claimLogin() {
  const today = dateKey(new Date());
  if (coins.last && today <= coins.last) return;
  coins.run = coins.last && prevDay(today) === coins.last ? coins.run + 1 : 1;
  coins.last = today;
  const gain = Math.min(4 + coins.run, 10);
  const from = coins.n;
  coins.n += gain; saveCoins();
  showBand(from, gain, Math.min(coins.run, 7));
}
function showBand(from, gain, day) {
  const band = $('coin-band');
  $('coin-plus').textContent = `+${gain}`;
  $('coin-dots').textContent = '●'.repeat(day) + '○'.repeat(7 - day);
  $('coin-n').textContent = from;
  band.classList.add('show');
  sfx.coin();
  let k = 0;
  const step = reduceMotion ? gain : 1;
  const t = setInterval(() => {
    k += step;
    $('coin-n').textContent = from + Math.min(k, gain);
    if (k >= gain) clearInterval(t);
  }, 90);
  clearTimeout(bandTimer);
  bandTimer = setTimeout(() => { band.classList.remove('show'); renderCoins(); }, 2000);
}
// ★3 のごほうび: 初めての ★3 だけ puzzle.bin の Lv 別（1〜2 → 1、3〜4 → 2、5 → 3）で 1 日 30 まで。
// 今日の 1 問の ★3 は ＋5（上限の外）。渡した数を返す
const REWARD_CAP = 30;
function star3Reward(isFirst, isDaily) {
  const lv = lvOf(digits, target);
  let gain = 0;
  if (isFirst && lv >= 1) {
    const today = dateKey(new Date());
    if (coins.day.d !== today) coins.day = { d: today, r: 0 };
    const base = Math.min(lv >= 5 ? 3 : lv >= 3 ? 2 : 1, REWARD_CAP - coins.day.r);
    coins.day.r += base; gain += base;
  }
  if (isDaily) gain += 5;
  if (gain) coinAdd(gain);
  return gain;
}
// 星のあとに、結果の行から上のコイン表示へコインが飛んでいき、届くたびに残高が増える
function showReward(gain) {
  const from = coins.n - gain;
  const rc = $('r-coin'), pc = $('p-coin');
  rc.classList.add('in');
  sfx.coin();
  const n = reduceMotion ? 1 : Math.min(gain, 10);
  const a = rc.querySelector('.coin').getBoundingClientRect();
  const b = pc.querySelector('.coin').getBoundingClientRect();
  for (let i = 0; i < n; i++) later(() => {
    if (!reduceMotion) flyCoin(a, b);
    later(() => {
      const v = from + Math.round((gain * (i + 1)) / n);
      $('p-coin-n').textContent = v;
      pc.classList.remove('bump'); void pc.offsetWidth; pc.classList.add('bump');
      sfx.coinTick(i);
      if (i === n - 1) {
        const pl = $('p-coin-plus');
        pl.textContent = `+${gain}`;
        pl.classList.remove('show'); void pl.offsetWidth; pl.classList.add('show');
      }
    }, reduceMotion ? 0 : 460);
  }, i * 80);
}
function flyCoin(a, b) {
  const el = document.createElement('div');
  el.className = 'coin-fly';
  el.innerHTML = COIN_SVG;
  el.style.left = `${a.left}px`; el.style.top = `${a.top}px`;
  document.body.appendChild(el);
  const dx = b.left - a.left, dy = b.top - a.top;
  const sx = (Math.random() - 0.5) * 70;
  el.animate([
    { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
    { transform: `translate(${sx}px, -26px) scale(1.2)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.85)`, opacity: 1 },
  ], { duration: 460, easing: 'cubic-bezier(.45,0,.7,1)' }).onfinish = () => el.remove();
}
$('coin-chip').addEventListener('click', () => { sfx.tap(); shopAsk = null; renderShop(); openSheet('shop'); });

// =====================================================================
// 今日の 1 問: four-digits.daily = { "2026-11-06": 星, … }（解いた日だけ。その日の最高）
// =====================================================================
const daily = (() => { const d = load('daily', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; })();
const two = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
let dailyDate = dateKey(new Date());

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
// 難しさ 3 か 4 の問題を引く。[4桁の数, 目標]
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
// 守った日（four-digits.guard）は数えないがつなぐ。星の記録（daily）には書かない
const guard = (() => { const d = load('guard', []); return Array.isArray(d) ? d.filter((x) => typeof x === 'string') : []; })();
const GUARD_COST = 30;
function streakFrom(d) {
  let n = 0;
  for (;;) {
    const k = dateKey(d);
    if (daily[k] > 0) n++;
    else if (!guard.includes(k)) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function dailyStreak() {
  const d = new Date();
  if (!(daily[dateKey(d)] > 0)) d.setDate(d.getDate() - 1);
  return streakFrom(d);
}
// 守れるとき、守る前の連続日数（おととい以前で 2 日以上）。守れないときは 0
function guardable() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = dateKey(d);
  if (daily[y] > 0 || guard.includes(y)) return 0;
  d.setDate(d.getDate() - 1);
  const n = streakFrom(d);
  return n >= 2 ? n : 0;
}
function untilTomorrow() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((next - now) / 1000));
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

// =====================================================================
// 画面の切り替え
// =====================================================================
const screens = { home: $('s-home'), puzzle: $('s-puzzle'), free: $('s-free'), board: $('s-board'), zukan: $('s-zukan') };
let current = 'home';
function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  const el = screens[name];
  if (current !== name && !reduceMotion) {
    el.classList.remove('enter');
    void el.offsetWidth;
    el.classList.add('enter');
  }
  current = name;
  if (name === 'home') startClock(); else stopClock();
}

let toastTimer = 0;
function toast(msg, ms = 1800) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// =====================================================================
// ホーム
// =====================================================================
let clock = 0;
function startClock() { stopClock(); clock = setInterval(renderDailyCard, 1000); }
function stopClock() { clearInterval(clock); clock = 0; }

function renderDailyCard() {
  dailyDate = dateKey(new Date());
  const [, mo, da] = dailyDate.split('-');
  $('daily-date').textContent = `${Number(mo)}月${Number(da)}日`;
  const s = daily[dailyDate] || 0;
  const st = $('daily-st');
  st.textContent = starStr(s);
  st.classList.toggle('done', s > 0);
  const gn = guardable();
  const streak = gn || dailyStreak();
  const parts = [];
  if (streak) parts.push(`${streak} 日連続`);
  if (s) parts.push(`次の問題まで ${untilTomorrow()}`);
  $('daily-meta').textContent = parts.join(' ・ ');
  $('daily-meta').classList.toggle('broken', !!gn);
  $('guard-btn').hidden = !(gn && coins.n >= GUARD_COST);
  $('daily-btn').classList.toggle('is-done', s > 0);
}

function renderHome() {
  $('auto-lv').innerHTML = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= auto.L ? 'on' : ''}"></i>`).join('') + `<em>Lv ${auto.L}</em>`;
  if (minTable || tableTried) {
    const [n, t] = ensureAuto();
    $('auto-digits').textContent = pad4(n);
    $('auto-target').textContent = t;
    $('auto-preview').classList.add('ready');
  }
  renderDailyCard();
  const tt = totals();
  $('zukan-sub').textContent = tt.played ? `★ ${tt.stars}` : '';
}
let tableTried = false;
tableReady.then(() => { tableTried = true; if (current === 'home') renderHome(); });

function showHome() {
  show('home');
  renderHome();
  renderCoins();
  if (!needTut()) claimLogin();   // はじめての日は最初の 1 問のあと、ホームに戻ったときに渡す
}

$('auto-btn').addEventListener('click', async () => { sfx.tap(); await tableReady; openAuto(); });
$('daily-btn').addEventListener('click', async () => {
  sfx.tap();
  await tableReady;
  dailyDate = dateKey(new Date());
  const [n, t] = dailyPuzzle(dailyDate);
  digits = pad4(n);
  openPuzzle(t, 'daily');
});
$('guard-btn').addEventListener('click', () => {
  if (!guardable() || !coinSpend(GUARD_COST)) return;
  const d = new Date(); d.setDate(d.getDate() - 1);
  guard.push(dateKey(d)); save('guard', guard);
  sfx.pay();
  renderDailyCard();
});
$('free-btn').addEventListener('click', () => { sfx.tap(); openFree(); });
$('zukan-btn').addEventListener('click', () => { sfx.tap(); openZukan(); });
function renderSound() {
  const b = $('sound-btn');
  b.setAttribute('aria-pressed', String(settings.sound));
  b.classList.toggle('muted', !settings.sound);
}
renderSound();

// ---- 配色: four-digits.theme = "light" | "dark"（押すまでは保存せず端末の設定に合わせる） ----
const darkNow = () => {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  applyPal();
}
// ボタンには「押すとなる配色」の絵を出す（暗いときは ☀、明るいときは ☾）
function renderTheme() {
  const dark = darkNow();
  const b = $('theme-btn');
  b.classList.toggle('is-dark', dark);
  b.setAttribute('aria-label', dark ? '明るい配色にする' : '暗い配色にする');
}
renderTheme();
applyPal();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTheme);
$('theme-btn').addEventListener('click', () => {
  const t = darkNow() ? 'light' : 'dark';
  applyTheme(t); save('theme', t); renderTheme(); sfx.tap();
});
$('sound-btn').addEventListener('click', () => {
  settings.sound = !settings.sound;
  setSound(settings.sound);
  save('settings', { v: 1, sound: settings.sound });
  renderSound();
  if (settings.sound) sfx.tap();
});

function openAuto() {
  const [n, t] = ensureAuto();
  digits = pad4(n);
  openPuzzle(t, 'auto');
}

// =====================================================================
// パズル
// =====================================================================
const MAXLEN = 60;
// 式は「かたまり」の並び（1 文字か !{N}）とカーソル位置で持つ
let digits = '0000';
let mode = 'free';   // 'free' | 'auto' | 'daily'
let target = 1, toks = [], cur = 0, solved = false, popAt = -1;
let tut = false;     // はじめての 1 問の最中（+ キーを光らせ、カーソルを 20|27 に置く）
let locked = null;   // 「もっと短く」で戻ったときの式。同じ式のままでは解けた扱いにしない
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const text = () => toks.join('');
const isDigit = (t) => /^\d$/.test(t);
// 数字は最初から並べておき、記号だけを差し込む（数字は消せないので順番は崩れない）
const canDelete = () => cur > 0 && !isDigit(toks[cur - 1]);

function openPuzzle(t, md = 'free') {
  mode = md;
  target = t;
  tut = md === 'auto' && digits === pad4(TUT[0]) && t === TUT[1] && needTut();
  toks = [...digits]; cur = tut ? 2 : 1; popAt = -1;
  solved = false; locked = null;
  $('key-plus').classList.toggle('hint', tut);
  resetPad();
  show('puzzle');
  $('puzzle-target').textContent = t;
  $('puzzle-tag').innerHTML = md === 'daily' ? '今日の 1 問'
    : md === 'auto' ? `おまかせ <em>Lv ${auto.L}</em>` : `フリー <em>${digits}</em>`;
  passReset();
  $('giveup').hidden = md !== 'auto';
  $('expr').classList.remove('won');
  showMine();
  update(true);
}

function showMine() {
  const e = entryOf(digits, target);
  const el = $('mine');
  if (!e) { el.textContent = ''; return; }
  el.textContent = e[0] == null ? '✓' : `式 ${display(e[1])}`;
}

// 数字のかたまり（数字と、数字にはさまれた小数点）は 1 枚の板に見せる
function numeric(i) {
  const t = toks[i];
  if (t === undefined) return false;
  if (isDigit(t)) return true;
  return t === '.' && isDigit(toks[i - 1] || '') && isDigit(toks[i + 1] || '');
}
function clsOf(i) {
  const t = toks[i];
  if (numeric(i)) {
    let c = isDigit(t) ? 't t-d' : 't t-d t-dot';
    if (numeric(i - 1)) c += ' jl';
    if (numeric(i + 1)) c += ' jr';
    return c;
  }
  if (t === '(' || t === ')') return 't t-par';
  if ('+−×÷'.includes(t)) return 't t-op';
  return 't t-fn';
}
function tokHtml(t) {
  if (t === '^') return '^';
  const m = /^!\{(\d+)\}$/.exec(t);
  if (m) return `!<sup>${m[1]}</sup>`;
  return t;
}

function renderExpr() {
  const el = $('expr');
  let html = '<span class="expr__in">';
  for (let i = 0; i <= toks.length; i++) {
    if (i === cur && !solved) html += '<i class="caret" aria-hidden="true"></i>';
    if (i === toks.length) break;
    html += `<span class="${clsOf(i)}${i === popAt ? ' pop' : ''}" data-i="${i}" style="--k:${i}">${tokHtml(toks[i])}</span>`;
  }
  el.innerHTML = html + '</span>';
  fitExpr();
}
// 1 行に収まるまで字を小さくする。最小でもはみ出すなら折り返す
function fitExpr() {
  const el = $('expr');
  const n = toks.length;
  let fs = n <= 5 ? 60 : n <= 8 ? 52 : n <= 11 ? 44 : n <= 15 ? 36 : 30;
  el.classList.remove('wrap');
  el.style.setProperty('--fs', `${fs}px`);
  while (el.scrollWidth > el.clientWidth + 1 && fs > 20) {
    fs -= 2;
    el.style.setProperty('--fs', `${fs}px`);
  }
  if (el.scrollWidth > el.clientWidth + 1) el.classList.add('wrap');
}

function update(first = false) {
  renderExpr();
  $('key-back').disabled = solved || !canDelete();
  $('key-left').disabled = cur === 0 || solved;
  $('key-right').disabled = cur === toks.length || solved;

  const a = analyze(text(), digits);
  const val = $('value');
  val.className = 'value';
  if (a.status === 'ok' && a.complete) {
    val.innerHTML = `<span class="value__eq">=</span>${formatValue(a.value)}`;
    if (isTarget(a.value, target)) val.classList.add('hit');
  } else if (a.status !== 'empty') {
    val.innerHTML = '<span class="value__eq">=</span>?';
    val.classList.add('dim');
  }
  const k = a.symbols;
  $('count').textContent = `記号 ${k}`;
  if (!first && !solved && text() !== locked && a.status === 'ok' && a.complete && isTarget(a.value, target)) finish(k);
}

// その 4 桁で、今の目標の後ろから回って最初の ★3 でない目標（無ければ 0）
function nextOpen() {
  for (let i = 1; i < 100; i++) {
    const t = ((target - 1 + i) % 100) + 1;
    if (starsOf(digits, t) < 3) return t;
  }
  return 0;
}

let lastShare = '';
// 解けたら: 式を残して値を光らせ、間を置いてから星を 1 つずつ押す
function finish(k) {
  solved = true;
  if (tut) { tut = false; save('tut', true); $('key-plus').classList.remove('hint'); }
  const m = minOf(digits, target);
  const got = starsFor(k, m);
  const before = starsOf(digits, target);   // saveBest で上書きされる前の星（初めての ★3 の判定）
  const dailyBefore = daily[dailyDate] || 0;
  const bestStars = saveBest(digits, target, k, text());
  const reward = got >= 3 ? star3Reward(before < 3, mode === 'daily' && dailyBefore < 3) : 0;
  const record = m < 255 && k < m;
  sfx.hit(); buzz(12);
  renderExpr();
  $('expr').classList.add('won');
  $('value').classList.add('hit');
  showMine();
  $('nsel').hidden = true;
  $('giveup').hidden = true; passReset();

  // 結果パネルの中身
  $('r-stars').innerHTML = [0, 1, 2].map((i) => `<span class="st ${i < got ? 'on' : 'off'}">★</span>`).join('');
  $('r-text').textContent = got >= 3 || !(m < 255) ? `記号 ${k}` : `記号 ${k} ・ 最短 ${m}`;
  let sub = record ? '最小を更新！' : '';
  const rs = $('r-sub');
  rs.textContent = sub;
  rs.classList.toggle('record', record);
  $('r-retry').hidden = got >= 3;
  const rc = $('r-coin');
  rc.hidden = !reward; rc.classList.remove('in');
  if (reward) { $('r-coin-n').textContent = `×${reward}`; $('p-coin-n').textContent = coins.n - reward; }
  $('r-share').hidden = mode !== 'daily';
  $('r-daily').hidden = mode !== 'daily';
  const next = $('r-next');
  if (mode === 'auto') {
    const dl = autoSolved(got);
    next.textContent = '次の 1 問';
    if (dl) sub = [sub, `Lv ${auto.L} ${dl > 0 ? '↑' : '↓'}`].filter(Boolean).join(' ・ ');
    rs.textContent = sub;
  } else if (mode === 'daily') {
    if (bestStars > (daily[dailyDate] || 0)) { daily[dailyDate] = bestStars; save('daily', daily); }
    const streak = dailyStreak();
    $('r-daily').textContent = `${streak} 日連続 ・ 次の問題まで ${untilTomorrow()}`;
    const [, mo, da] = dailyDate.split('-');
    lastShare = `OCCAM 今日の1問 ${Number(mo)}/${Number(da)}\n${starStr(bestStars)} 記号 ${k} 個${streak > 1 ? `（${streak} 日連続）` : ''}`;
    next.textContent = 'おまかせで続ける';
  } else {
    const nt = nextOpen();
    next.textContent = nt ? '次へ' : '制覇！';
    next.dataset.t = nt;
  }

  const wait = reduceMotion ? 300 : 750;
  later(() => {
    $('keys').hidden = true;
    $('result').hidden = false;
    const stars = [...$('r-stars').children];
    stars.forEach((s, i) => later(() => {
      s.classList.add('in');
      if (i < got) sfx.star(i); else sfx.empty();
      if (i === 2 && record) later(() => sfx.record(), 180);
    }, 160 + i * 220));
    if (reward) later(() => showReward(reward), 160 + 2 * 220 + 200 + (record ? 180 : 0));
  }, wait);
}

function resetPad() {
  clearTimers();
  $('keys').hidden = false;
  $('result').hidden = true;
  $('nsel').hidden = true;
}

function press(tok) {
  if (solved) return;
  if (cur === 0 && '×÷^).'.includes(tok)) { sfx.nope(); return; }
  if (text().length + tok.length > MAXLEN) { sfx.nope(); return; }
  toks.splice(cur, 0, tok);
  popAt = cur;
  cur++;
  sfx.key(); buzz();
  update();
  popAt = -1;
}
function backspace() {
  if (solved) return;
  if (!canDelete()) { sfx.nope(); return; }
  toks.splice(cur - 1, 1); cur--;
  sfx.del(); buzz();
  update();
}
function moveCaret(d) {
  if (solved) return;
  const c = Math.max(0, Math.min(toks.length, cur + d));
  if (c === cur) { sfx.nope(); return; }
  cur = c; sfx.move(); update();
}
function clearSymbols() {
  if (solved) return;
  if (toks.length === digits.length) { sfx.nope(); return; }
  toks = [...digits]; cur = 1;
  sfx.del(); buzz();
  update();
}

$('keys').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || solved) return;
  if (b.dataset.ch) return press(b.dataset.ch);
  const k = b.dataset.key;
  if (k === 'back') backspace();
  else if (k === 'left') moveCaret(-1);
  else if (k === 'right') moveCaret(1);
  else if (k === 'clear') clearSymbols();
  else if (k === 'factn') openN();
});

// 式をタップした場所に一番近い「すき間」にカーソルを置く
$('expr').addEventListener('click', (e) => {
  if (solved) return;
  const spans = [...$('expr').querySelectorAll('span[data-i]')];
  if (!spans.length) return;
  let bestPos = cur, bestD = Infinity;
  for (const sp of spans) {
    const r = sp.getBoundingClientRect();
    const i = Number(sp.dataset.i);
    const dy = Math.abs(e.clientY - (r.top + r.height / 2)) * 3;
    for (const [x, pos] of [[r.left, i], [r.right, i + 1]]) {
      const d = Math.abs(e.clientX - x) + dy;
      if (d < bestD) { bestD = d; bestPos = pos; }
    }
  }
  if (bestPos !== cur) { cur = bestPos; sfx.move(); update(); }
});

// ---- N 重階乗の N ----
const nInput = $('n-input');
const getN = () => Math.max(1, Math.min(99, parseInt(nInput.value, 10) || 1));
function renderN() {
  const n = getN();
  $('n-eg').textContent = `x!⁽${n}⁾ = x × (x−${n}) × (x−${2 * n}) × …`;
  for (const c of $('n-chips').children) c.classList.toggle('on', Number(c.dataset.n) === n);
}
$('n-chips').innerHTML = [2, 3, 4, 5, 6, 8].map((n) => `<button class="chip" data-n="${n}">${n}</button>`).join('');
$('n-chips').addEventListener('click', (e) => {
  const c = e.target.closest('[data-n]');
  if (c) { nInput.value = c.dataset.n; sfx.move(); renderN(); }
});
function openN() { $('keys').hidden = true; $('nsel').hidden = false; renderN(); sfx.tap(); }
function closeN() { $('nsel').hidden = true; $('keys').hidden = false; }
nInput.addEventListener('input', () => { nInput.value = nInput.value.replace(/\D/g, '').slice(0, 2); renderN(); });
$('n-minus').addEventListener('click', () => { nInput.value = Math.max(1, getN() - 1); sfx.move(); renderN(); });
$('n-plus').addEventListener('click', () => { nInput.value = Math.min(99, getN() + 1); sfx.move(); renderN(); });
$('n-cancel').addEventListener('click', () => { closeN(); sfx.del(); });
$('n-ok').addEventListener('click', () => { const n = getN(); closeN(); press(n === 1 ? '!' : `!{${n}}`); });

// ---- 結果パネルのボタン ----
function leavePuzzle() {
  resetPad();
  if (mode === 'free') openBoard(digits, boardFrom); else showHome();
}
$('puzzle-back').addEventListener('click', () => { sfx.tap(); leavePuzzle(); });
$('puzzle-help').addEventListener('click', () => openSheet('help'));
// パス: Lv が下がる（Lv2 以上）ときだけ、押すとボタンが 2 つに分かれる（`Lv 3 → 2` と `◎5 Lv 3`）。3 秒触らなければ戻る
const KEEP_COST = 5;
let splitTimer = 0;
function passReset() {
  clearTimeout(splitTimer); splitTimer = 0;
  $('giveup').textContent = 'パス';
  $('giveup-keep').hidden = true;
}
function passDone(keep) {
  const was = auto.L;
  passReset();
  if (keep) { auto.streak = 0; autoPush(); saveAuto(); sfx.pay(); }
  else { sfx.del(); autoGiveUp(); }
  toast(keep ? `Lv ${was} のまま` : auto.L === was ? 'パス' : `パス ・ Lv ${was} → ${auto.L}`, 2400);
  openAuto();
}
$('giveup').addEventListener('click', () => {
  if (!$('giveup-keep').hidden || auto.L < 2 || coins.n < KEEP_COST) { passDone(false); return; }
  sfx.tap();
  $('giveup').textContent = `Lv ${auto.L} → ${auto.L - 1}`;
  $('giveup-keep').textContent = `◎${KEEP_COST} Lv ${auto.L}`;
  $('giveup-keep').hidden = false;
  splitTimer = setTimeout(passReset, 3000);
});
$('giveup-keep').addEventListener('click', () => { if (coinSpend(KEEP_COST)) passDone(true); else passReset(); });
$('r-next').addEventListener('click', () => {
  sfx.tap();
  if (mode === 'auto' || mode === 'daily') return openAuto();
  const nt = Number($('r-next').dataset.t);
  resetPad();
  if (nt) openPuzzle(nt); else openBoard(digits, boardFrom);
});
// もっと短く: 今の式のまま入力に戻る
$('r-retry').addEventListener('click', () => {
  sfx.tap();
  locked = text(); solved = false;
  resetPad();
  $('expr').classList.remove('won');
  update(true);
});
$('r-share').addEventListener('click', () => { WebAppKit.share({ text: lastShare }); });

// =====================================================================
// フリー（4 桁を選ぶ）: four-digits.recent = { v: 1, list: ["2027", …] }
// =====================================================================
let pick = '';
let recent = (() => { const d = load('recent', null); return d && d.v === 1 && Array.isArray(d.list) ? d.list.filter((x) => /^\d{4}$/.test(x)).slice(0, 8) : []; })();

function miniMap(d, cls = 'map') {
  let cells = '';
  for (let t = 1; t <= 100; t++) cells += `<i class="c${starsOf(d, t)}"></i>`;
  return `<span class="${cls}">${cells}</span>`;
}

function renderFree() {
  let html = '';
  for (let i = 0; i < 4; i++) html += `<span class="slot${i === pick.length ? ' active' : ''}${pick[i] ? ' filled' : ''}">${pick[i] || ''}</span>`;
  $('slots').innerHTML = html;
  const pv = $('free-preview');
  if (pick.length === 4) {
    const s = starSum(pick);
    let n3 = 0;
    for (let t = 1; t <= 100; t++) if (starsOf(pick, t) === 3) n3++;
    pv.innerHTML = `${miniMap(pick)}<span class="free__nums"><b>★ ${s}</b> / 300<br><span class="b3">★★★</span> ${n3} / 100</span>`;
    pv.classList.add('ready');
  } else {
    pv.innerHTML = '';
    pv.classList.remove('ready');
  }
  $('free-go').disabled = pick.length !== 4;
  $('recent').innerHTML = recent.length
    ? `${recent.map((d) => `<button class="chip" data-r="${d}">${d}</button>`).join('')}`
    : '';
}
function openFree() { show('free'); renderFree(); }
function freeKey(d) {
  if (d === 'back') { if (!pick.length) return sfx.nope(); pick = pick.slice(0, -1); sfx.del(); }
  else if (d === 'rand') { pick = pad4(Math.floor(Math.random() * 10000)); sfx.key(); }
  else { if (pick.length >= 4) pick = ''; pick += d; sfx.key(); }
  buzz();
  renderFree();
}
$('numpad').addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (b) freeKey(b.dataset.d); });
$('slots').addEventListener('click', () => { if (pick.length) { pick = ''; sfx.del(); renderFree(); } });
function goFree(d) {
  recent = [d, ...recent.filter((x) => x !== d)].slice(0, 8);
  save('recent', { v: 1, list: recent });
  openBoard(d, 'free');
}
$('free-go').addEventListener('click', () => { if (pick.length === 4) { sfx.tap(); goFree(pick); } });
$('recent').addEventListener('click', (e) => { const c = e.target.closest('[data-r]'); if (c) { sfx.tap(); pick = c.dataset.r; goFree(pick); } });
$('free-back').addEventListener('click', () => { sfx.tap(); showHome(); });

// =====================================================================
// 4 桁の 1〜100
// =====================================================================
let boardFrom = 'free';
function openBoard(d, from = 'free') {
  digits = d;
  boardFrom = from;
  show('board');
  $('board-digits').innerHTML = [...d].map((c) => `<i>${c}</i>`).join('');
  const s = starSum(d);
  let n3 = 0, html = '';
  for (let t = 1; t <= 100; t++) {
    const st = starsOf(d, t);
    if (st === 3) n3++;
    html += `<button class="cell s${st}" data-t="${t}" aria-label="${t}（${st ? `星 ${st}` : '未'}）"><b>${t}</b><small>${'<i></i>'.repeat(3)}</small></button>`;
  }
  $('board-grid').innerHTML = html;
  $('board-bar').style.width = `${(s / 300) * 100}%`;
  $('board-stars').innerHTML = `<b>★ ${s}</b> / 300`;
  $('board-full').innerHTML = n3 === 100 ? '制覇！' : `<span class="b3">★★★</span> ${n3} / 100`;
}
$('board-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-t]');
  if (b) { sfx.tap(); openPuzzle(Number(b.dataset.t), 'free'); }
});
$('board-back').addEventListener('click', () => { sfx.tap(); if (boardFrom === 'zukan') openZukan(); else openFree(); });

// =====================================================================
// 図鑑
// =====================================================================
let tab = 'digits', numPick = 0;
const zbody = $('z-body');

function openZukan() {
  show('zukan');
  const tt = totals();
  $('z-stats').innerHTML = [
    ['解いた', tt.solved], ['★3', tt.three], ['4 桁', tt.played], ['制覇', tt.full],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('');
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
  if (tab === 'digits') renderDigitsTab(); else if (numPick) renderNumberDetail(); else renderNumbersTab();
}

function renderDigitsTab() {
  const ds = Object.keys(best).filter((d) => Object.keys(best[d]).length).sort();
  if (!ds.length) { zbody.innerHTML = '<div class="zempty">まだ空っぽ</div>'; return; }
  let cards = '';
  for (const d of ds) {
    let n3 = 0;
    for (let t = 1; t <= 100; t++) if (starsOf(d, t) === 3) n3++;
    const gold = n3 === 100;
    cards += `<button class="zcard${gold ? ' gold' : ''}" data-n="${d}"><span class="zcard__head"><b>${d}</b><small>${gold ? '制覇' : `★ ${starSum(d)}`}</small></span>${miniMap(d)}</button>`;
  }
  zbody.innerHTML = `<div class="zcards">${cards}</div>`;
}

function makersOf(t) {
  const out = [];
  for (const d of Object.keys(best).sort()) if (best[d][t]) out.push(d);
  return out;
}

function renderNumbersTab() {
  let cells = '';
  for (let t = 1; t <= 100; t++) {
    const c = makersOf(t).length;
    cells += `<button class="cell num${c ? ' has' : ''}" data-t="${t}"><b>${t}</b><small>${c || ''}</small></button>`;
  }
  zbody.innerHTML = `<p class="zlead">その数を、何種類の 4 桁から作ったか</p><div class="grid100">${cells}</div>`;
}

function renderNumberDetail() {
  let rows = '';
  for (const d of makersOf(numPick)) {
    const e = best[d][numPick];
    const s = starsOfEntry(d, numPick, e);
    rows += `<button class="mk" data-n="${d}"><b>${d}</b><span>${e[1] ? display(e[1]) : '—'}</span><small class="s${s}">${starStr(s)}</small></button>`;
  }
  zbody.innerHTML = `<div class="zhead"><button class="link-btn" id="num-back">‹ 数の一覧</button><b class="zbig">${numPick}</b></div>`
    + (rows ? `<div class="mks">${rows}</div>` : '<div class="zempty">—</div>');
}

zbody.addEventListener('click', (e) => {
  if (e.target.closest('#num-back')) { numPick = 0; sfx.tap(); return openZukan(); }
  const num = e.target.closest('button.num');
  if (num) { numPick = Number(num.dataset.t); sfx.tap(); return openZukan(); }
  const c = e.target.closest('button[data-n]');
  if (c) { sfx.tap(); openBoard(c.dataset.n, 'zukan'); }
});
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b) return;
  tab = b.dataset.tab; numPick = 0; sfx.move(); openZukan();
});
$('zukan-back').addEventListener('click', () => { sfx.tap(); showHome(); });

// =====================================================================
// シート（遊び方）
// =====================================================================
let openSheetId = null;
function openSheet(id) {
  closeSheet();
  const s = $(id);
  s.hidden = false;
  openSheetId = id;
  requestAnimationFrame(() => s.classList.add('open'));
}
function closeSheet() {
  if (!openSheetId) return;
  const s = $(openSheetId);
  s.classList.remove('open');
  s.hidden = true;
  if (openSheetId === 'help') save('help', true);
  shopAsk = null;
  openSheetId = null;
}
for (const s of document.querySelectorAll('.sheet')) {
  s.addEventListener('click', (e) => {
    if (e.target === s || e.target.closest('[data-close]')) { sfx.tap(); closeSheet(); }
  });
}

// =====================================================================
// キーボード（PC 用の追加）
// =====================================================================
const KEYMAP = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷', '^': '^', '(': '(', ')': ')', '.': '.', '!': '!', r: '√', s: '√' };
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (openSheetId) { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closeSheet(); } return; }
  if (current === 'puzzle') {
    if (!$('nsel').hidden) {
      if (e.target === nInput && /^\d$/.test(e.key)) return;
      if (e.key === 'Enter') { e.preventDefault(); $('n-ok').click(); }
      else if (e.key === 'Escape') closeN();
      return;
    }
    if (!$('result').hidden) {
      if (e.key === 'Enter') { e.preventDefault(); $('r-next').click(); }
      else if (e.key === 'Escape') leavePuzzle();
      return;
    }
    if (KEYMAP[e.key]) { e.preventDefault(); press(KEYMAP[e.key]); }
    else if (e.key === 'n') openN();
    else if (e.key === 'ArrowLeft') moveCaret(-1);
    else if (e.key === 'ArrowRight') moveCaret(1);
    else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
    else if (e.key === 'Delete') clearSymbols();
    else if (e.key === 'Escape') leavePuzzle();
  } else if (current === 'free') {
    if (/^\d$/.test(e.key)) freeKey(e.key);
    else if (e.key === 'Backspace') freeKey('back');
    else if (e.key === 'Enter') $('free-go').click();
    else if (e.key === 'Escape') showHome();
  } else if (e.key === 'Escape' && current !== 'home') {
    if (current === 'board') $('board-back').click(); else showHome();
  }
});

showHome();
