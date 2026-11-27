import { analyze, isTarget, starsFor, formatValue, display } from './src/expr.js';
import { sfx, setSound, unlockOnFirstTouch } from './src/sfx.js';
import * as Rewards from './src/rewards.js';
import * as Remind from './src/remind.js';
import * as Ent from './src/entitlement.js';
import * as G from './src/glyphs.js';
import * as M from './src/milestones.js';
import { dailyPuzzle } from './src/daily.js';
import { createAuto } from './src/auto.js';
import * as E from './src/edit.js';
import { TUTS, tutStep, tutOf } from './src/tut.js';
import { SIZE as TABLE_SIZE, mOf, lvOfByte } from './src/puzzle.js';

// 画面の言葉。L('日本語', 'English') で、起動時に決めた言語のほうを使う（i18n.js）
const L = I18n.L;
// 記号の個数（英語は 1 symbol / 2 symbols）
const symN = (k) => L(`記号 ${k}`, `${k} symbol${k === 1 ? '' : 's'}`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayName = (mo, da) => L(`${Number(mo)}月${Number(da)}日`, `${MONTHS[Number(mo) - 1]} ${Number(da)}`);
const streakName = (n) => L(`${n} 日連続`, `${n}-day streak`);
const nextIn = () => L(`次の問題まで ${untilTomorrow()}`, `Next in ${untilTomorrow()}`);

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

WebAppKit.init({ title: 'SHORT MATH', text: L('4つの数字を、いちばん短い式で。1〜100を作るテンパズル。', 'Four digits, the shortest expression. A puzzle to make 1 to 100.'), lang: I18n.lang });
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
// 問題の表（data/puzzle2.bin。1 問 1 バイト、添え字 = 4 桁×100 + 目標−1。読み方は src/puzzle.js）
// 下 5 ビット = 最小記号数（31 は未計算）、次の 2 ビット = 段、上 1 ビット = 今日向き
// 1MB あるので、画面を先に出してから読む
// =====================================================================
let minTable = null;
const tableReady = (async () => {
  try {
    const r = await fetch('./data/puzzle2.bin');
    const b = await r.arrayBuffer();
    if (b.byteLength === TABLE_SIZE) minTable = new Uint8Array(b);
  } catch { /* 読めなければ未計算として遊べる */ }
})();
const minOf = (digits, t) => (minTable ? mOf(minTable[Number(digits) * 100 + t - 1]) : 255);
const lvOf = (n, t) => (minTable ? lvOfByte(minTable[n * 100 + t - 1]) : 0);

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
// おまかせ（中身は src/auto.js）
// =====================================================================
const A = createAuto({ load, save, lvOf, starsOf, hasTable: () => !!minTable });
const auto = A.state;
// はじめの 2 問（src/tut.js）。遊び方を読ませずに触って覚える
const tutNow = () => tutStep(load('tut', false), totals().played);
function ensureAuto() {
  if (!auto.cur) { const st = tutNow(); auto.cur = st ? [...TUTS[st - 1]] : A.pick(); A.save(); }
  return auto.cur;
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

// 節目のコイン: four-digits.milestones = { v: 1, paid, wk }（src/milestones.js）。coins には足さない。
// 渡すときは paid を先に保存してから coinAdd（途中で閉じても二重にならない）
const ms = M.parseMilestones(load('milestones', null), coins);
const saveMs = () => save('milestones', ms);
if (load('milestones', null) === null) saveMs();
// Lv ごとの ★3 の数 [0, Lv1, …, Lv5]。問題の表が読めていなければ null（渡さない。あとでホームが拾う）
function lvThreeCounts() {
  if (!minTable) return null;
  const c = [0, 0, 0, 0, 0, 0];
  for (const d of Object.keys(best)) for (const t of Object.keys(best[d])) {
    if (starsOfEntry(d, Number(t), best[d][t]) === 3) c[lvOf(Number(d), Number(t))]++;
  }
  return c;
}
function msDue() {
  const lv = lvThreeCounts();
  return lv ? M.due(ms, totals().three, lv) : [];
}
function msPay(list) {
  const gain = list.reduce((s, x) => s + x.gain, 0);
  ms.paid.push(...list.map((x) => x.id)); saveMs();
  if (gain) coinAdd(gain);
  return gain;
}
function renderCoins() { $('coin-n').textContent = coins.n; $('shop-n').textContent = coins.n; $('p-coin-n').textContent = coins.n; $('g-coin-n').textContent = coins.n; }

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
const COIN_SVG = '<svg class="coin" viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="10.5" rx="8.5" ry="5.5"/><path d="M3.5 10.5v3c0 3 3.8 5.5 8.5 5.5s8.5-2.5 8.5-5.5v-3"/></svg>';
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
  // 文字の入口（一番下に 1 枚）。押すとコーナーへ
  const gAll = G.allDone(glyphs.got), gCost = G.drawCost(glyphs.got);
  $('shop-glyph').innerHTML = `<button class="shopcard shopcard--glyph${glyphsNew() ? ' new' : ''}${!gAll && coins.n < gCost ? ' poor' : ''}" id="shop-glyph-go" aria-label="${L('文字', 'Glyphs')}">`
    + `<span class="gdraw__tile" aria-hidden="true"><svg viewBox="0 0 100 100"><use href="#back"/></svg></span>`
    + (gAll ? `<span class="gcount gold">${G.ownedCount(glyphs.got)}/${G.ALL_ITEMS.length}</span>` : `<span class="shopcard__price">${COIN_SVG}${gCost}</span>`)
    + '</button>';
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
  if (e.target.closest('#shop-glyph-go')) { sfx.tap(); closeSheet(); return openGlyphs(); }
  if (shopAsk && !e.target.closest(`[data-id="${shopAsk}"]`)) { shopAsk = null; renderShop(); }
});
applyFont();

// ログインボーナス: 1 日目 5 → 毎日 +1 → 6 日目以降 10、7 日目（14・21…日目も）だけ 20。1 日あけたら 1 日目。日付を戻したときは渡さない
const prevDay = (key) => { const [y, m, d] = key.split('-').map(Number); return dateKey(new Date(y, m - 1, d - 1)); };
let bandTimer = 0;
let bumpTimer = 0;
function claimLogin() {
  const today = dateKey(new Date());
  if (coins.last && today <= coins.last) return false;
  coins.run = coins.last && prevDay(today) === coins.last ? coins.run + 1 : 1;
  coins.last = today;
  const wx = M.weekExtra(ms);
  const gain = (coins.run % 7 === 0 ? 20 : Math.min(4 + coins.run, 10)) + wx.gain;
  const from = coins.n;
  if (wx.gain) { ms.wk = wx.wk; saveMs(); }
  coins.n += gain; saveCoins();
  showBand(from, gain, (coins.run - 1) % 7 + 1);
  return true;
}
// tag があれば点の代わりに金の札（まとめ渡し）
function showBand(from, gain, day, tag) {
  const band = $('coin-band');
  $('coin-plus').textContent = `+${gain}`;
  // 7 つ目の ● は金（＋20 の日）
  $('coin-dots').innerHTML = tag ? `<i class="on">${tag}</i>` : '●'.repeat(Math.min(day, 6)) + '○'.repeat(6 - Math.min(day, 6))
    + `<i class="${day === 7 ? 'on' : ''}">${day === 7 ? '●' : '○'}</i>`;
  $('coin-n').textContent = from;
  band.classList.add('show');
  if (tag) sfx.milestone(); else sfx.coin();
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
// ★3 のごほうび: 初めての ★3 だけ 問題の表の Lv 別（1〜2 → 1、3〜4 → 2、5 → 3）で 1 日 30 まで。
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
function showReward(gain, from = coins.n - gain, rc = $('r-coin')) {
  const pc = $('p-coin');
  rc.classList.add('in');
  sfx.coin();
  const n = reduceMotion ? 1 : Math.min(gain, 5);
  const a = rc.querySelector('.coin').getBoundingClientRect();
  const b = pc.querySelector('.coin').getBoundingClientRect();
  for (let i = 0; i < n; i++) later(() => {
    if (!reduceMotion) flyCoin(a, b);
    later(() => {
      const v = from + Math.round((gain * (i + 1)) / n);
      $('p-coin-n').textContent = v;
      pc.classList.remove('bump'); void pc.offsetWidth; pc.classList.add('bump');
      clearTimeout(bumpTimer); bumpTimer = setTimeout(() => pc.classList.remove('bump'), reduceMotion ? 600 : 300);
      if (i === 0 || i === n - 1) sfx.coinTick(i);
      if (i === n - 1) {
        const pl = $('p-coin-plus');
        pl.textContent = `+${gain}`;
        pl.classList.remove('show'); void pl.offsetWidth; pl.classList.add('show');
        pl.addEventListener('animationend', () => pl.classList.remove('show'), { once: true });
      }
    }, reduceMotion ? 0 : 460);
  }, i * 80);
}
function flyCoin(a, b, z, ms = 460) {
  const el = document.createElement('div');
  el.className = 'coin-fly';
  el.innerHTML = COIN_SVG;
  el.style.left = `${a.left}px`; el.style.top = `${a.top}px`;
  if (z) el.style.zIndex = z;
  document.body.appendChild(el);
  const dx = b.left - a.left, dy = b.top - a.top;
  const sx = (Math.random() - 0.5) * 70;
  el.animate([
    { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
    { transform: `translate(${sx}px, -26px) scale(1.2)`, opacity: 1, offset: 0.25 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.85)`, opacity: 1 },
  ], { duration: ms, easing: 'cubic-bezier(.45,0,.7,1)' }).onfinish = () => el.remove();
}
$('coin-chip').addEventListener('click', () => { sfx.tap(); shopAsk = null; renderShop(); openSheet('shop'); });

// =====================================================================
// 今日の 1 問: four-digits.daily = { "2026-11-06": 星, … }（解いた日だけ。その日の最高）
// =====================================================================
const daily = (() => { const d = load('daily', {}); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; })();
const two = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
let dailyDate = dateKey(new Date());

// 今日の 1 問は src/daily.js（切り替えの日から選び方が変わる）
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
const screens = { home: $('s-home'), puzzle: $('s-puzzle'), free: $('s-free'), board: $('s-board'), zukan: $('s-zukan'), glyphs: $('s-glyphs') };
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

let guardHtml = '';
function renderDailyCard() {
  dailyDate = dateKey(new Date());
  const [, mo, da] = dailyDate.split('-');
  $('daily-date').textContent = dayName(mo, da);
  const s = daily[dailyDate] || 0;
  const st = $('daily-st');
  st.textContent = starStr(s);
  st.classList.toggle('done', s > 0);
  const gn = guardable();
  const streak = gn || dailyStreak();
  const parts = [];
  if (streak) parts.push(streakName(streak));
  if (s) parts.push(nextIn());
  $('daily-meta').textContent = parts.join(' ・ ');
  $('daily-meta').classList.toggle('broken', !!gn);
  const gPay = coins.n >= GUARD_COST;
  $('guard-btn').hidden = !(gn && (gPay || Rewards.available()));
  const gHtml = gPay ? L(`${COIN_SVG}${GUARD_COST} で守る`, `Keep streak ${COIN_SVG}${GUARD_COST}`) : `▶ ${L('で守る', 'Keep streak')}`;
  if (gHtml !== guardHtml) { guardHtml = gHtml; $('guard-btn').innerHTML = gHtml; }
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
  $('glyph-btn').classList.toggle('new', glyphsDot());
}
let tableTried = false;
tableReady.then(() => { tableTried = true; if (current === 'home') renderHome(); });

function showHome() {
  show('home');
  renderHome();
  renderCoins();
  // はじめての日は最初の 1 問のあと、ホームに戻ったときに渡す
  const band = !tutNow() && claimLogin();
  // 届いているのに渡していない節目は、ホームでまとめて渡す
  tableReady.then(() => setTimeout(() => {
    if (current !== 'home') return;
    const list = msDue();
    if (!list.length) return;
    const from = coins.n, gain = msPay(list);
    showBand(from, gain, 0, '★3');
  }, band ? 2300 : 0));
}

$('auto-btn').addEventListener('click', async () => { sfx.tap(); await tableReady; openAuto(); });
async function openDaily() {
  await tableReady;
  dailyDate = dateKey(new Date());
  const [n, t] = dailyPuzzle(dailyDate, minTable);
  digits = pad4(n);
  openPuzzle(t, 'daily');
}
$('daily-btn').addEventListener('click', () => { sfx.tap(); if (tutNow()) openAuto(); else openDaily(); });
$('guard-btn').addEventListener('click', async () => {
  if (!guardable()) return;
  if (coins.n >= GUARD_COST) { if (!coinSpend(GUARD_COST)) return; }
  else if (await Rewards.watch() !== 'earned') return;
  const d = new Date(); d.setDate(d.getDate() - 1);
  guard.push(dateKey(d)); save('guard', guard);
  sfx.pay();
  renderDailyCard();
});
// =====================================================================
// 毎日の通知（src/remind.js）。iOS 版が提供元をつなぐまで、ボタンもベルも出ない
// =====================================================================
let remind = Remind.readState();
const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 1.5h-15zM10 20.5h4"/></svg>';
const BELL_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function renderRemind() {
  const st = Remind.bellState({ available: Remind.available(), asked: remind.asked, on: remind.on, permission: Remind.permission() });
  const b = $('remind-btn');
  b.hidden = st.hidden;
  b.setAttribute('aria-pressed', String(st.pressed));
  b.classList.toggle('muted', !st.pressed);
}
// 予約を全部入れ直す。起動して表を読み終えたとき・戻ったとき・解いたとき・ベルを押したとき
async function replanRemind() {
  if (!Remind.available()) return;
  await tableReady;
  await Remind.replan(new Date(), daily, minTable, remind.on);
  renderRemind();
}
Remind.onAttach(() => { renderRemind(); replanRemind(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderRemind(); replanRemind(); } });
// 通知を押したとき。遊んでいる最中は邪魔しない。解いていれば今日の 1 問、解いていなければホーム
Remind.onOpen(async () => {
  await tableReady;
  if (current === 'puzzle') return;
  closeSheet();
  if (daily[dateKey(new Date())] > 0) { if (current !== 'home') showHome(); return; }
  openDaily();
});
$('remind-btn').addEventListener('click', async () => {
  sfx.tap();
  if ($('remind-btn').getAttribute('aria-pressed') === 'true') remind = Remind.writeState({ on: false });
  else {
    const p = Remind.permission();
    if (p === 'denied') { toast(L('設定 → 通知 → SHORT MATH', 'Settings → Notifications → SHORT MATH'), 3000); return; }
    if (p === 'prompt' && !(await Remind.request())) { renderRemind(); return; }
    remind = Remind.writeState({ on: true });
  }
  renderRemind();
  replanRemind();
});
// 結果パネルのボタン（聞くのはここで 1 回だけ。離れたら聞いたことにする）
let askTimer = 0;
function showRemindAsk() {
  clearTimeout(askTimer);
  const b = $('r-remind');
  b.hidden = true;
  if (mode === 'daily') {
    Remind.clearToday(new Date());
    replanRemind();
  }
  if (!Remind.askVisible({ available: Remind.available(), asked: remind.asked, mode })) return;
  remind = Remind.writeState({ asked: true });
  b.innerHTML = `${BELL}<span>${L('毎日 20:00', 'Daily 8:00 PM')}</span>`;
  b.setAttribute('aria-label', L('毎日 20 時に今日の 1 問を知らせる', 'Remind me of the daily puzzle at 8 PM'));
  b.hidden = false;
}
$('r-remind').addEventListener('click', async () => {
  sfx.tap();
  const b = $('r-remind');
  const ok = await Remind.request();
  remind = Remind.writeState({ asked: true, on: ok });
  if (ok) { b.innerHTML = BELL_OK; askTimer = setTimeout(() => { b.hidden = true; }, 800); } else b.hidden = true;
  renderRemind();
  replanRemind();
});
tableReady.then(replanRemind);

// 広告なし（src/entitlement.js）。iOS で、ストアがつながっていて、まだ買っていないときだけ入口を出す
function renderNoads() { $('noads-btn').hidden = !Ent.adsActive(); }
Ent.onChange((full) => {
  renderNoads();
  if (!full) return;
  Rewards.attach(null);   // 買ったら、ごほうび広告の口を外す（守るの ▶ が消える）
  if (openSheetId === 'noads') { closeSheet(); sfx.star(2); }
});
$('noads-btn').addEventListener('click', () => { sfx.tap(); openSheet('noads'); });
renderNoads();

$('free-btn').addEventListener('click', () => { sfx.tap(); openFree(); });
$('zukan-btn').addEventListener('click', () => { sfx.tap(); openZukan(); });
$('glyph-btn').addEventListener('click', () => { sfx.tap(); openGlyphs(); });
function renderSound() {
  const b = $('sound-btn');
  b.setAttribute('aria-pressed', String(settings.sound));
  b.classList.toggle('muted', !settings.sound);
}
renderSound();

// 言語: ホームの「日本語 / English」。選ぶと four-digits.lang に覚えて読み込み直す（i18n.js）
for (const b of $('lang-seg').querySelectorAll('button')) {
  b.setAttribute('aria-pressed', String(b.dataset.v === I18n.lang));
  b.addEventListener('click', () => I18n.set(b.dataset.v));
}

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
  b.setAttribute('aria-label', dark ? I18n.HTML.themeLight : I18n.HTML.themeDark);
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
let tut = 0;         // はじめの何問目の最中か（1 は + キーを光らせる。カーソルは 20|27 / 14|46 に置く。0 は通常）
let locked = null;   // 「もっと短く」で戻ったときの式。同じ式のままでは解けた扱いにしない
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
const text = () => toks.join('');
const isDigit = E.isDigit;
// 数字は最初から並べておき、記号だけを差し込む（数字は消せないので順番は崩れない）
const canDelete = () => E.canDelete(toks, cur);

function openPuzzle(t, md = 'free') {
  mode = md;
  target = t;
  const st = tutNow();
  tut = md === 'auto' && tutOf(st, Number(digits), t) ? st : 0;
  toks = [...digits]; cur = tut ? 2 : 1; popAt = -1;
  solved = false; locked = null;
  $('p-coin-plus').classList.remove('show');
  $('key-plus').classList.toggle('hint', tut === 1);
  $('r-retry').classList.remove('hint');
  resetPad();
  show('puzzle');
  $('puzzle-target').textContent = t;
  $('puzzle-tag').innerHTML = md === 'daily' ? L('今日の 1 問', 'Daily puzzle')
    : md === 'auto' ? `${L('おまかせ', 'Auto')} <em>Lv ${auto.L}</em>` : `${L('フリー', 'Free')} <em>${digits}</em>`;
  passReset();
  $('giveup').hidden = md !== 'auto' || !!tut;
  $('expr').classList.remove('won');
  showMine();
  update(true);
}

function showMine() {
  const e = entryOf(digits, target);
  const el = $('mine');
  if (!e) { el.textContent = ''; return; }
  el.textContent = e[0] == null ? '✓' : `${L('式', 'Best')} ${display(e[1])}`;
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
  $('count').textContent = symN(k);
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
let adDue = false;   // この結果を離れるときに全画面広告を出す回か（rewards.js が数える）
function leaveResult() {
  if (!adDue) return;
  adDue = false;
  Rewards.requestInterstitial();
}
// 解けたら: 式を残して値を光らせ、間を置いてから星を 1 つずつ押す
function finish(k) {
  solved = true;
  if (locked === null) adDue = Rewards.recordSolve().due;   // 「もっと短く」の解き直しは数えない
  const tutDone = tut;
  if (tut) { save('tut', tut); tut = 0; $('key-plus').classList.remove('hint'); }
  const m = minOf(digits, target);
  const got = starsFor(k, m);
  const before = starsOf(digits, target);   // saveBest で上書きされる前の星（初めての ★3 の判定）
  const dailyBefore = daily[dailyDate] || 0;
  const bestStars = saveBest(digits, target, k, text());
  const reward = got >= 3 ? star3Reward(before < 3, mode === 'daily' && dailyBefore < 3) : 0;
  const mdue = got >= 3 ? msDue() : [];
  const mgain = mdue.length ? msPay(mdue) : 0;
  const record = m < 255 && k < m;
  sfx.hit(); buzz(12);
  renderExpr();
  $('expr').classList.add('won');
  $('value').classList.add('hit');
  $('mine').textContent = '';   // 解いた直後は上の式と同じなので出さない
  $('nsel').hidden = true;
  $('giveup').hidden = true; passReset();

  // 結果パネルの中身
  $('r-stars').innerHTML = [0, 1, 2].map((i) => `<span class="st ${i < got ? 'on' : 'off'}">★</span>`).join('');
  $('r-text').textContent = got >= 3 || !(m < 255) ? symN(k) : `${symN(k)} ・ ${L('最短', 'min')} ${m}`;
  let sub = record ? L('最小を更新！', 'New best!') : '';
  const rs = $('r-sub');
  rs.textContent = sub;
  rs.classList.toggle('record', record);
  $('r-retry').hidden = got >= 3;
  $('r-retry').classList.toggle('hint', tutDone === 2 && got < 3);   // 2 問目は「もっと短く」を光らせる
  // コインは 1 行の合計。節目に届いたときだけ、同じ行に金の札（小さな名前＋大きな数）を並べる
  const total = reward + mgain;
  const rc = $('r-coin');
  rc.hidden = !total; rc.classList.remove('in');
  if (total) $('r-coin-n').textContent = `+${total}`;
  if (total) $('p-coin-n').textContent = coins.n - total;
  const rms = $('r-ms');
  rms.innerHTML = mdue.map((x) => `<span class="result__ms" aria-label="${x.kind === 'l' ? `Lv ${x.n} ★3 ${M.LV_NEED}` : `★3 ${x.n}`}">${x.kind === 'l' ? `<i>Lv${x.n} ★3</i><b>${M.LV_NEED}</b>` : `<i>★3</i><b>${x.n}</b>`}</span>`).join('');
  $('r-share').hidden = mode !== 'daily';
  $('r-daily').hidden = mode !== 'daily';
  const next = $('r-next');
  if (mode === 'auto') {
    const dl = A.solved(got);
    next.textContent = L('次の 1 問', 'Next puzzle');
    if (dl) sub = [sub, `Lv ${auto.L} ${dl > 0 ? '↑' : '↓'}`].filter(Boolean).join(' ・ ');
    rs.textContent = sub;
  } else if (mode === 'daily') {
    if (bestStars > (daily[dailyDate] || 0)) { daily[dailyDate] = bestStars; save('daily', daily); }
    const streak = dailyStreak();
    $('r-daily').textContent = `${streakName(streak)} ・ ${nextIn()}`;
    const [, mo, da] = dailyDate.split('-');
    lastShare = L(`SHORT MATH 今日の1問 ${Number(mo)}/${Number(da)}\n${starStr(bestStars)} 記号 ${k} 個${streak > 1 ? `（${streak} 日連続）` : ''}`,
      `SHORT MATH Daily puzzle ${dayName(mo, da)}\n${starStr(bestStars)} ${symN(k)}${streak > 1 ? ` (${streakName(streak)})` : ''}`);
    next.textContent = L('おまかせで続ける', 'Continue in Auto');
  } else {
    const nt = nextOpen();
    next.textContent = nt ? L('次へ', 'Next') : L('制覇！', 'Complete!');
    next.dataset.t = nt;
  }
  showRemindAsk();

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
    const t0 = 160 + 2 * 220 + 200 + (record ? 180 : 0);
    if (total) later(() => {
      showReward(total, coins.n - total);
      if (mdue.length) later(() => { [...rms.children].forEach((c) => c.classList.add('in')); sfx.milestone(); }, reduceMotion ? 0 : 300);
    }, t0);
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
  popAt = cur;
  ({ toks, cur } = E.insertTok(toks, cur, tok));
  sfx.key(); buzz();
  update();
  popAt = -1;
}
function backspace() {
  if (solved) return;
  if (!canDelete()) { sfx.nope(); return; }
  ({ toks, cur } = E.deleteSymbol(toks, cur));
  sfx.del(); buzz();
  update();
}
function moveCaret(d) {
  if (solved) return;
  const r = E.moveBy(toks, cur, d);
  if (!r) { sfx.nope(); return; }
  ({ toks, cur } = r); sfx.move(); update();
}
function clearSymbols() {
  if (solved) return;
  const r = E.clearSymbols(toks);
  if (!r) { sfx.nope(); return; }
  ({ toks, cur } = r);
  sfx.del(); buzz();
  update();
}

// ⌫ を長押しすると記号を全部消す（離したときの click は数えない）
let longPressed = false, longTimer = 0;
const stopLong = () => { clearTimeout(longTimer); longTimer = 0; };
$('key-back').addEventListener('pointerdown', () => {
  longPressed = false; stopLong();
  longTimer = setTimeout(() => { longTimer = 0; longPressed = true; clearSymbols(); }, 500);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('key-back').addEventListener(ev, stopLong);

$('keys').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || solved) return;
  if (b.dataset.ch) return press(b.dataset.ch);
  const k = b.dataset.key;
  if (k === 'back') { if (longPressed) longPressed = false; else backspace(); }
  else if (k === 'left') moveCaret(-1);
  else if (k === 'right') moveCaret(1);
  else if (k === 'clear') clearSymbols();
  else if (k === 'factn') openN();
});

// 式の上の x, y に一番近い「すき間」の位置
function gapAt(x, y) {
  const spans = [...$('expr').querySelectorAll('span[data-i]')];
  let bestPos = cur, bestD = Infinity;
  for (const sp of spans) {
    const r = sp.getBoundingClientRect();
    const i = Number(sp.dataset.i);
    const dy = Math.abs(y - (r.top + r.height / 2)) * 3;
    for (const [px, pos] of [[r.left, i], [r.right, i + 1]]) {
      const d = Math.abs(x - px) + dy;
      if (d < bestD) { bestD = d; bestPos = pos; }
    }
  }
  return bestPos;
}
function placeCaret(pos) {
  if (pos === cur) return;
  cur = pos; sfx.move(); update();
}
// 式をタップした場所に一番近いすき間にカーソルを置く。横になぞると指についてくる
let swipe = null, swiped = false;
$('expr').addEventListener('pointerdown', (e) => {
  if (solved) return;
  swipe = { id: e.pointerId, x: e.clientX, on: false };
  swiped = false;
});
$('expr').addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id || solved) return;
  if (!swipe.on) {
    if (Math.abs(e.clientX - swipe.x) < 10) return;
    swipe.on = true; swiped = true;
    try { $('expr').setPointerCapture(e.pointerId); } catch { /* なくても動く */ }
  }
  if ($('expr').querySelector('span[data-i]')) placeCaret(gapAt(e.clientX, e.clientY));
});
for (const ev of ['pointerup', 'pointercancel']) $('expr').addEventListener(ev, () => { swipe = null; });
$('expr').addEventListener('click', (e) => {
  if (swiped) { swiped = false; return; }
  if (solved) return;
  if (!$('expr').querySelector('span[data-i]')) return;
  placeCaret(gapAt(e.clientX, e.clientY));
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
  if (solved) leaveResult();
  resetPad();
  if (mode === 'free') openBoard(digits, boardFrom); else showHome();
}
$('puzzle-back').addEventListener('click', () => { sfx.tap(); leavePuzzle(); });
$('puzzle-help').addEventListener('click', () => openSheet('help'));
// パス: Lv が下がる（Lv2 以上）ときだけ、押すとボタンが 2 つに分かれる（`Lv 3 → 2` と コイン 5 の Lv 3）。3 秒触らなければ戻る
const KEEP_COST = 5;
let splitTimer = 0;
function passReset() {
  clearTimeout(splitTimer); splitTimer = 0;
  $('giveup').textContent = L('パス', 'Pass');
  $('giveup-keep').hidden = true;
}
function passDone(keep) {
  const was = auto.L;
  passReset();
  if (keep) { auto.streak = 0; A.push(); A.save(); sfx.pay(); }
  else { sfx.del(); A.giveUp(); }
  toast(keep ? L(`Lv ${was} のまま`, `Staying at Lv ${was}`) : auto.L === was ? L('パス', 'Pass') : `${L('パス', 'Pass')} ・ Lv ${was} → ${auto.L}`, 2400);
  openAuto();
}
$('giveup').addEventListener('click', () => {
  if (!$('giveup-keep').hidden || auto.L < 2 || (coins.n < KEEP_COST && !Rewards.available())) { passDone(false); return; }
  sfx.tap();
  $('giveup').textContent = `Lv ${auto.L} → ${auto.L - 1}`;
  $('giveup-keep').innerHTML = `${coins.n >= KEEP_COST ? `${COIN_SVG}${KEEP_COST}` : '▶'} Lv ${auto.L}`;
  $('giveup-keep').hidden = false;
  splitTimer = setTimeout(passReset, 3000);
});
$('giveup-keep').addEventListener('click', async () => {
  if (coins.n >= KEEP_COST) { if (coinSpend(KEEP_COST)) passDone(true); else passReset(); return; }
  clearTimeout(splitTimer);
  if (await Rewards.watch() === 'earned') passDone(true); else passReset();
});
$('r-next').addEventListener('click', () => {
  sfx.tap();
  leaveResult();
  if (mode === 'auto' || mode === 'daily') return openAuto();
  const nt = Number($('r-next').dataset.t);
  resetPad();
  if (nt) openPuzzle(nt); else openBoard(digits, boardFrom);
});
// もっと短く: 今の式のまま入力に戻る
$('r-retry').addEventListener('click', () => {
  sfx.tap();
  locked = text(); solved = false;
  $('r-retry').classList.remove('hint');
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
    html += `<button class="cell s${st}" data-t="${t}" aria-label="${t}${L('（', ' (')}${st ? L(`星 ${st}`, `${st} star${st === 1 ? '' : 's'}`) : L('未', 'unsolved')}${L('）', ')')}"><b>${t}</b><small>${'<i></i>'.repeat(3)}</small></button>`;
  }
  $('board-grid').innerHTML = html;
  $('board-bar').style.width = `${(s / 300) * 100}%`;
  $('board-stars').innerHTML = `<b>★ ${s}</b> / 300`;
  $('board-full').innerHTML = n3 === 100 ? L('制覇！', 'Complete!') : `<span class="b3">★★★</span> ${n3} / 100`;
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

// ---- 文字のコレクション: four-digits.glyphs = { v: 1, got: ["neon:7", …], seen: ["neon", …] } ----
// 知らない id も消さずに残す（版を戻しても失わない）。seen は「新しい」の印用（まだ使わない）
const glyphs = G.parseGlyphs(load('glyphs', null));
const saveGlyphs = () => save('glyphs', glyphs);
// 見たことのないデザインがあれば「新しい」の印（金の点）。コーナーでそのデザインを選んだら seen に足して消す
const glyphsNew = () => G.GLYPH_DESIGNS.some((d) => !glyphs.seen.includes(d.id));
const rnd01 = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch { return Math.random(); } };
const DESIGN_NAME = { neon: L('ネオン', 'Neon'), ink: L('墨', 'Ink'), pixel: L('ドット', 'Pixel') };

// 本物の絵（glyphs/<デザイン>.svg。<symbol id="neon-7"> の形）があれば使い、なければ仮の描き方（Jost ＋ 色の板）
// 読めたデザインは document に差し込み、symbol が見つかったタイルだけ <use> にする
const spriteReady = new Set();
const spriteBox = document.createElement('div');
// display:none だと filter やグラデーションが効かないので、見えない大きさで置く
spriteBox.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
document.body.appendChild(spriteBox);
for (const d of [...G.GLYPH_DESIGNS, { id: 'back' }]) {
  fetch(`./glyphs/${d.id}.svg`).then((r) => (r.ok ? r.text() : '')).then((t) => {
    if (!t || !/<symbol/.test(t)) return;
    const w = document.createElement('div');
    w.innerHTML = t;
    // 動きを減らす設定のときは、絵の中の明滅（SMIL）も止める
    if (reduceMotion) w.querySelectorAll('animate, animateTransform, animateMotion, set').forEach((a) => a.remove());
    spriteBox.appendChild(w);
    spriteReady.add(d.id);
    if (current === 'glyphs' && !drawing) renderGlyphs();
  }).catch(() => { /* なければ仮の描き方 */ });
}
// タイル 1 枚の絵。品の id（"neon:7"）から作る。ここだけを差し替えればよい
function glyphTile(id) {
  const [d, c] = id.split(':');
  const rare = G.isRare(id) ? ' rare' : '';
  const sym = `${d}-${c}`;
  if (spriteReady.has(d) && document.getElementById(sym)) {
    return `<span class="gt gt--${d}${rare}"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${sym}"/></svg></span>`;
  }
  const sign = /^\d$/.test(c) ? '' : ' sign';
  return `<span class="gt gt--${d}${rare}${sign}"><i>${G.glyphLabel(c)}</i></span>`;
}
// 持っていない品の影（何の文字がまだかは分かる）
const glyphShadow = (id) => `<span class="gt gt--shadow${G.isRare(id) ? ' rare' : ''}"><i>${G.glyphLabel(id.split(':')[1])}</i></span>`;

// ---- 文字のコーナー（s-glyphs）----
// 選んでいるデザイン。開いたときに決める（保存しない）
let gsel = G.GLYPH_DESIGNS[0].id, lastGlyph = null;
// 演出中は、引いた品をまだ影のまま見せる（しまう段で入れる）
let pending = null;
const gotView = () => (pending ? glyphs.got.filter((id) => id !== pending) : glyphs.got);
const glyphsDot = () => !tutNow() && (glyphsNew() || (!G.allDone(glyphs.got) && G.drawCost(glyphs.got) === 0));
const designCount = (got, d) => G.GLYPH_CHARS.filter((c) => G.ownedSet(got).has(`${d}:${c}`)).length;

function renderGlyphs() {
  const got = gotView(), owned = G.ownedSet(got), done = G.allDone(got), cost = G.drawCost(got);
  $('g-stage').classList.toggle('done', done);
  $('g-drawrow').innerHTML = done
    ? `<span class="gcount gold" aria-label="${G.ALL_ITEMS.length}/${G.ALL_ITEMS.length}">${G.ownedCount(got)}/${G.ALL_ITEMS.length}</span>`
    : `<button class="btn btn--primary${coins.n < cost ? ' poor' : ''}" id="g-draw" aria-label="${cost ? L('引く（コイン 25）', 'Draw (25 coins)') : L('引く（無料）', 'Draw (free)')}">${COIN_SVG}${cost}</button>`;
  const tabs = G.GLYPH_DESIGNS.map((d) => {
    const n = designCount(got, d.id), full = n === G.GLYPH_CHARS.length;
    const nm = DESIGN_NAME[d.id] || d.id;
    return `<button class="gtab gt-name--${d.id}${d.id === gsel ? ' on' : ''}${full ? ' gold' : ''}${glyphs.seen.includes(d.id) ? '' : ' new'}" role="tab" aria-selected="${d.id === gsel}" data-d="${d.id}" aria-label="${nm} ${n}/${G.GLYPH_CHARS.length}">`
      + `<span class="gtab__name">${GLYPH_TAB_NAME[d.id] || nm}</span><b>${n}/${G.GLYPH_CHARS.length}</b></button>`;
  }).join('');
  $('g-tabs').innerHTML = tabs;
  let tiles = '';
  for (const c of G.GLYPH_CHARS) {
    const id = `${gsel}:${c}`, nm = DESIGN_NAME[gsel] || gsel, ch = G.glyphLabel(c);
    tiles += owned.has(id)
      ? `<button class="gcell" data-g="${id}" aria-label="${ch} · ${nm}">${glyphTile(id)}</button>`
      : `<span class="gcell" data-g="${id}" role="img" aria-label="${ch} · ${nm} ${L('（まだ）', '(not yet)')}">${glyphShadow(id)}</span>`;
  }
  $('g-grid').innerHTML = tiles;
  $('g-grid').classList.toggle('gold', G.designDone(got, gsel));
}
// デザインの札に出す名前（札の見た目で。ネオンは NEON、墨は 墨、ドットは PIXEL）
const GLYPH_TAB_NAME = { neon: 'NEON', ink: L('墨', 'INK'), pixel: 'PIXEL' };

function selectDesign(id) {
  gsel = id;
  if (!glyphs.seen.includes(id)) { glyphs.seen.push(id); saveGlyphs(); }
}
function openGlyphs() {
  show('glyphs');
  selectDesign(G.pickDesign(glyphs.got, lastGlyph));
  renderGlyphs();
  $('g-stage').style.visibility = '';
}

// 持っている品を大きく出す（もう一度押すか外を押すと閉じる）
function zoomGlyph(id) {
  sfx.tap();
  const z = document.createElement('div');
  z.className = 'gzoom';
  z.style.setProperty('--gz', `${Math.round(Math.min(innerWidth * 0.6, innerHeight * 0.5, 280))}px`);
  z.innerHTML = `<div class="gzoom__tile">${glyphTile(id)}</div>`;
  z.addEventListener('pointerdown', () => { sfx.tap(); z.remove(); });
  document.body.appendChild(z);
}

// 引く。品とコインは押した瞬間に保存してから演出を始める（演出の途中で閉じても失わない）
let drawing = false;
function drawGlyph() {
  if (drawing) return;
  const r = G.tryDraw(glyphs.got, coins.n, rnd01);
  if (!r.ok) { sfx.nope(); return; }
  if (r.cost > 0 && !coinSpend(r.cost)) { sfx.nope(); return; }
  drawing = true;
  glyphs.got.push(r.id); saveGlyphs();
  lastGlyph = r.id;
  if (r.cost > 0) sfx.pay();
  playReveal(r.id, r.cost > 0).then(() => { drawing = false; });
}

// 演出は G.revealPlan の表どおりに流す。画面を押すと最後の形まで飛ばす（200 ms は受けない）
async function playReveal(id, paid) {
  const rare = G.isRare(id), design = id.split(':')[0];
  const plan = G.revealPlan(rare, reduceMotion);
  pending = id;
  renderGlyphs();
  const stage = $('g-stage');

  const finish = (quick) => {
    pending = null;
    selectDesign(design);
    renderGlyphs();
    stage.style.visibility = '';
    const cell = $('g-grid').querySelector(`[data-g="${id}"]`);
    if (cell && !quick) cell.classList.add('fresh');
  };

  // 小さな端末で演出が作れないとき（animate がない）は表の音だけ
  if (!stage.animate) { sfx[rare ? 'record' : 'reveal'](); finish(true); return; }

  const S = Math.round(Math.min(innerWidth * 0.6, innerHeight * 0.4, 240));
  const sr = stage.getBoundingClientRect();
  const ov = document.createElement('div');
  ov.className = 'gfx';
  ov.style.setProperty('--gfx', `${S}px`);
  ov.innerHTML = '<div class="gfx__rays"></div><div class="gfx__pos"><div class="gfx__card' + '">'
    + '<div class="gfx__face gfx__back"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#back"/></svg></div>'
    + `<div class="gfx__face gfx__front">${glyphTile(id)}</div><i class="gfx__clip"><i class="gfx__slash"></i></i></div></div>`;
  document.body.appendChild(ov);
  const pos = ov.querySelector('.gfx__pos'), card = ov.querySelector('.gfx__card');
  const back = ov.querySelector('.gfx__back'), front = ov.querySelector('.gfx__front');
  const slash = ov.querySelector('.gfx__slash'), rays = ov.querySelector('.gfx__rays');
  front.style.display = 'none';
  stage.style.visibility = 'hidden';
  ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: 'forwards' });

  let skipped = false, shown = false, passedD = false;
  const live = new Set();
  const wait = (ms) => new Promise((res) => { const t = setTimeout(res, ms); live.add(() => { clearTimeout(t); res(); }); });
  const play = (el, kf, ms, opt = {}) => { const a = el.animate(kf, { duration: ms, fill: 'forwards', ...opt }); live.add(() => a.cancel()); return a.finished.catch(() => {}); };
  const showFront = () => {
    if (shown) return; shown = true;
    back.style.display = 'none'; front.style.display = '';
    sfx[rare ? 'record' : 'reveal']();
  };
  const startedAt = Date.now();
  ov.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (skipped || Date.now() - startedAt < 200) return;
    skipped = true;
    // 裏返る前なら、表の音を 1 回だけ鳴らす
    if (!passedD) showFront();
    for (const f of [...live]) f();
  });

  const targetCell = () => { selectDesign(design); const c = $('g-grid').querySelector(`[data-g="${id}"]`); return c; };
  const dim = (a) => { ov.style.background = `rgba(0,0,0,${a})`; };
  dim(0.55);
  // 中央の場所（pos は画面の中央に S×S で置いてある）
  const toCenter = () => {
    const pr = pos.getBoundingClientRect();
    return { dx: sr.left + sr.width / 2 - (pr.left + pr.width / 2), dy: sr.top + sr.height / 2 - (pr.top + pr.height / 2), k: sr.width / pr.width };
  };

  for (const { step, ms } of plan) {
    if (skipped) break;
    if (step === 'a') {
      const c = toCenter();
      if (paid) {
        const cb = $('g-coin').querySelector('.coin').getBoundingClientRect();
        flyCoin(cb, { left: sr.left + sr.width / 2 - 10, top: sr.top + sr.height / 2 - 10 }, 1000, ms);
      }
      await play(pos, [{ transform: `translate(${c.dx}px, ${c.dy}px) scale(${c.k})` }, { transform: 'none' }], ms, { easing: 'ease-out' });
    } else if (step === 'b') {
      const per = ms / 3;
      const rot = [2, 4, 6];
      for (let i = 0; i < 3; i++) {
        if (skipped) break;
        sfx.charge(i);
        const sc = 1 + 0.04 * ((i + 1) / 3);
        if (rare && i === 2) { card.classList.add('flash'); later80(card); }
        await play(card, [{ transform: 'rotate(0) scale(1)' }, { transform: `rotate(${-rot[i]}deg) scale(${sc})`, offset: 0.3 }, { transform: `rotate(${rot[i]}deg) scale(${sc})`, offset: 0.7 }, { transform: `rotate(0) scale(${1 + 0.04 * (i / 3)})` }], per);
      }
    } else if (step === 'c') {
      sfx.rise(rare);
      if (!rare) {
        await play(card, [{ boxShadow: '0 0 0 0 rgba(255,255,255,0)' }, { boxShadow: '0 0 28px 8px rgba(255,255,255,0.75)' }], ms);
      } else {
        dim(0.7);
        await play(slash, [{ transform: 'translateX(-130%) skewX(-16deg)', opacity: 1 }, { transform: 'translateX(130%) skewX(-16deg)', opacity: 1 }], 300);
        slash.style.display = 'none';
        if (skipped) break;
        for (let i = 0; i < 8; i++) {
          const dot = document.createElement('i');
          dot.className = 'gfx__dot';
          pos.appendChild(dot);
          const ang = (i / 8) * Math.PI * 2, r0 = S * 0.52, r1 = S * 0.8;
          play(dot, [{ transform: `translate(${Math.cos(ang) * r0}px, ${Math.sin(ang) * r0}px) scale(0.4)`, opacity: 0 }, { transform: `translate(${Math.cos(ang) * r1}px, ${Math.sin(ang) * r1}px) scale(1)`, opacity: 1, offset: 0.4 }, { transform: `translate(${Math.cos(ang) * r1}px, ${Math.sin(ang) * r1}px) scale(0.6)`, opacity: 0 }], 400);
        }
        await play(card, [{ boxShadow: '0 0 0 3px #d9a93b, 0 0 0 0 rgba(217,169,59,0)' }, { boxShadow: '0 0 0 3px #d9a93b, 0 0 36px 12px rgba(217,169,59,0.8)' }], ms - 300);
      }
    } else if (step === 'd') {
      if (reduceMotion) {
        showFront();
        passedD = true;
        front.style.opacity = '0';
        await Promise.all([play(front, [{ opacity: 0 }, { opacity: 1 }], ms), play(back, [{ opacity: 1 }, { opacity: 0 }], ms)]);
      } else {
        const half = ms / 2;
        await play(card, [{ transform: 'perspective(600px) rotateY(0)' }, { transform: 'perspective(600px) rotateY(90deg)' }], half, { easing: 'ease-in' });
        if (skipped) break;
        showFront();
        passedD = true;
        if (rare) card.classList.add('rare');
        await play(card, rare
          ? [{ transform: 'perspective(600px) rotateY(-90deg)' }, { transform: 'perspective(600px) rotateY(10deg)', offset: 0.7 }, { transform: 'perspective(600px) rotateY(0)' }]
          : [{ transform: 'perspective(600px) rotateY(-90deg)' }, { transform: 'perspective(600px) rotateY(0)' }], half, { easing: 'ease-out' });
      }
    } else if (step === 'e') {
      if (reduceMotion) { if (rare) card.classList.add('rare'); await wait(ms); }
      else if (rare) {
        rays.style.display = 'block';
        play(rays, [{ transform: 'rotate(0)', opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: `rotate(${30 * ms / 1000}deg)`, opacity: 1 }], ms, { easing: 'linear' });
        await wait(400);
        if (!skipped) sfx.rareTail();
        await wait(ms - 400);
      } else await wait(ms);
    } else if (step === 'f') {
      dim(0.55);
      const cell = targetCell();
      stage.style.visibility = '';
      if (reduceMotion || !cell) {
        await Promise.all([play(ov, [{ opacity: 1 }, { opacity: 0 }], ms)]);
      } else {
        sfx.move();
        const a = pos.getBoundingClientRect(), b = cell.getBoundingClientRect();
        const k = b.width / a.width;
        ov.style.background = 'rgba(0,0,0,0)';
        ov.style.transition = 'background 0.3s';
        rays.style.display = 'none';
        await play(pos, [{ transform: 'none' }, { transform: `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(${k})` }], ms, { easing: 'ease-in' });
      }
    }
  }
  // 飛ばしたときも同じ形に着く。覆いは 300 ms 残し、飛ばした指が下のボタンを押さないようにする
  const wasSkipped = skipped;
  skipped = true;
  finish(wasSkipped);
  ov.classList.add('gfx--gone');
  ov.style.transition = '';
  await new Promise((res) => setTimeout(res, 300));
  ov.remove();
  // デザインがそろったとき: 札と表の枠を金の光が 1 周し、`hit`（飛ばしたら印だけ）
  if (G.designDone(glyphs.got, design) && !wasSkipped) {
    const els = [$('g-grid'), $('g-tabs').querySelector(`[data-d="${design}"]`)].filter(Boolean);
    for (const el of els) el.classList.add('lap');
    sfx.hit();
    await new Promise((res) => setTimeout(res, G.SET_LAP_MS));
    for (const el of els) el.classList.remove('lap');
  }
}
const later80 = (el) => setTimeout(() => el.classList.remove('flash'), 80);

function renderOdds() {
  const o = G.odds(glyphs.got);
  const row = (cls, v) => (v.n ? `<div class="odds__row"><span class="odds__mark ${cls}"></span><b>${v.pct}%</b><span>× ${v.n}</span></div>` : '');
  $('odds-body').innerHTML = row('n', o.normal) + row('r', o.rare);
}

function openZukan() {
  show('zukan');
  const tt = totals();
  $('z-stats').innerHTML = [
    [L('解いた', 'Solved'), tt.solved], ['★3', tt.three], [L('4 桁', '4 digits'), tt.played], [L('制覇', 'Complete'), tt.full],
  ].map(([k, v]) => `<div class="stat"><b>${v}</b><small>${k}</small></div>`).join('');
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === tab);
  if (tab === 'digits') renderDigitsTab(); else if (numPick) renderNumberDetail(); else renderNumbersTab();
}

function renderDigitsTab() {
  const ds = Object.keys(best).filter((d) => Object.keys(best[d]).length).sort();
  if (!ds.length) { zbody.innerHTML = `<div class="zempty">${L('まだ空っぽ', 'Nothing yet')}</div>`; return; }
  let cards = '';
  for (const d of ds) {
    let n3 = 0;
    for (let t = 1; t <= 100; t++) if (starsOf(d, t) === 3) n3++;
    const gold = n3 === 100;
    cards += `<button class="zcard${gold ? ' gold' : ''}" data-n="${d}"><span class="zcard__head"><b>${d}</b><small>${gold ? L('制覇', 'Complete') : `★ ${starSum(d)}`}</small></span>${miniMap(d)}</button>`;
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
  zbody.innerHTML = `<p class="zlead">${L('その数を、何種類の 4 桁から作ったか', 'How many 4-digit sets made each number')}</p><div class="grid100">${cells}</div>`;
}

function renderNumberDetail() {
  let rows = '';
  for (const d of makersOf(numPick)) {
    const e = best[d][numPick];
    const s = starsOfEntry(d, numPick, e);
    rows += `<button class="mk" data-n="${d}"><b>${d}</b><span>${e[1] ? display(e[1]) : '—'}</span><small class="s${s}">${starStr(s)}</small></button>`;
  }
  zbody.innerHTML = `<div class="zhead"><button class="link-btn" id="num-back">${L('‹ 数の一覧', '‹ All numbers')}</button><b class="zbig">${numPick}</b></div>`
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
$('glyphs-back').addEventListener('click', () => { if (drawing) return; sfx.tap(); showHome(); });
$('g-odds').addEventListener('click', () => { sfx.tap(); renderOdds(); openSheet('odds'); });
$('s-glyphs').addEventListener('click', (e) => {
  if (drawing) return;
  if (e.target.closest('#g-draw')) return drawGlyph();
  const t = e.target.closest('.gtab');
  if (t) { sfx.move(); selectDesign(t.dataset.d); return renderGlyphs(); }
  const c = e.target.closest('button.gcell');
  if (c) zoomGlyph(c.dataset.g);
});
$('zukan-back').addEventListener('click', () => { sfx.tap(); showHome(); });

// =====================================================================
// シート（遊び方）
// =====================================================================
let openSheetId = null;
function openSheet(id) {
  closeSheet();
  clearTimeout(toastTimer); $('toast').hidden = true;
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

// はじめの 2 問が済むまでは、ホームを通さずはじめの問題へ
if (tutNow()) { screens.home.hidden = true; tableReady.then(openAuto); } else showHome();
