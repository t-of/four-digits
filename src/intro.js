// はじめの説明（遊び方 2 枚・コインとガチャ 2 枚）。保存は four-digits.intro = { v: 1, how, gacha }。
// 前半は画面を持たない純粋な部分（いつ出すか）で、test.mjs が確かめる。後半の createIntro が画面（#intro）を動かす。
import * as G from './glyphs.js';
import * as M from './milestones.js';
import { tutStep } from './tut.js';

// 読めない・壊れているときは「まだ見ていない」として始める
export function parseIntro(d) {
  if (d && d.v === 1) return { v: 1, how: d.how === true, gacha: d.gacha === true };
  return { v: 1, how: false, gacha: false };
}

// 遊び方（1・2 枚目）: はじめの 1 問の前。はじめての人（tutStep が 1）で、まだ見ていない
export const howDue = (step, st) => step === 1 && !st.how;
// コインとガチャ（3・4 枚目）: はじめの 2 問のあと（今の人も同じ）。まだ 1 つも引いていなくて、まだ見ていない
export const gachaDue = (step, st, gotCount) => step === 0 && !st.gacha && gotCount === 0;
// 保存の中身から直接決める版（main.js はこちらを使う）
export const howNow = (tut, played, st) => howDue(tutStep(tut, played), st);
export const gachaNow = (tut, played, st, gotCount) => gachaDue(tutStep(tut, played), st, gotCount);

export const CARDS = ['how1', 'how2', 'coin', 'gacha'];
// how = 遊び方 2 枚、gacha = コインとガチャ 2 枚、all = 4 枚（もう一度見る）
export const cardsFor = (mode) => (mode === 'how' ? CARDS.slice(0, 2) : mode === 'gacha' ? CARDS.slice(2) : CARDS);

// コインの入り方の数字。main.js の claimLogin（1 日目 5 から）・star3Reward（Lv で 1〜3）と、milestones.js に合わせる
export const LOGIN_MIN = 5, STAR3_MIN = 1, STAR3_MAX = 3;
export function coinFacts() {
  const gains = [...M.STAR_STEPS, ...M.LV_STEPS].map((x) => x[1]);
  return { star3: [STAR3_MIN, STAR3_MAX], login: LOGIN_MIN, ms: [Math.min(...gains), Math.max(...gains)] };
}

// ---- 画面 ----
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// 式の記号だけ青にする（数字は地の色）
const ex = (s) => esc(s).replace(/[^0-9]/g, (c) => `<i>${c}</i>`);
const stars = (n) => `<span class="ist">${'★'.repeat(n)}<s>${'★'.repeat(3 - n)}</s></span>`;
const range = (a, b) => (a === b ? `+${a}` : `+${a}〜${b}`);

// deps: $・L・coinSvg・glyphTile(id)・sfx・reduced()
export function createIntro(deps) {
  const { $, L, coinSvg, glyphTile, sfx } = deps;
  let list = [], at = 0, mode = 'all', done = null, from = null, open = false, dir = 1;

  const price = G.GLYPH_PRICE;
  // かけら 10 個で好きな 1 文字（だぶると、そのデザインのかけらが 1 つたまる）
  const SHARDS = G.SHARD_COST;
  const facts = coinFacts();

  const cards = {
    how1: () => `<h2>${L('数字のあいだに、記号を入れる', 'Put symbols between the digits')}</h2>`
      + `<div class="ifig"><div class="ifig__goal"><span class="eg__d">2027</span> → <b class="eg__t">47</b></div>`
      + `<div class="irow"><span class="itile">2</span><span class="itile">0</span><span class="iplug"><b>+</b></span><span class="itile">2</span><span class="itile">7</span></div>`
      + `<div class="ifig__eq"><code>${ex('20+27')}</code></div></div>`
      + `<p>${L('4 つの数字は、並んだ順にぜんぶ使う。何も入れなければ、つながる', 'Use all 4 digits in order. Leave a gap and they join.')}</p>`,
    how2: () => `<h2>${L('記号が少ないほど、★が多い', 'Fewer symbols, more ★')}</h2>`
      + `<div class="ifig"><div class="ifig__goal"><span class="eg__d">2027</span> → <b class="eg__t">9</b></div>`
      + `<div class="irows">${[['2+0×2+7', 3], ['2+(0×2)+7', 2], ['(2)+(0×2)+(7)', 1]].map(([e, n]) => `<div class="irowx"><code>${ex(e)}</code>${stars(n)}</div>`).join('')}</div></div>`,
    coin: () => `<h2>${L('コインがたまる', 'Collect coins')}</h2>`
      + `<div class="ifig"><div class="isrcs">`
      + `<div class="isrc"><span class="isrc__k">${stars(3)}</span><b>${coinSvg}${range(...facts.star3)}</b></div>`
      + `<div class="isrc"><span class="isrc__k">${L('毎日', 'Daily')}<br><span class="idots">●●●</span></span><b>${coinSvg}+${facts.login}〜</b></div>`
      + `<div class="isrc"><span class="isrc__k">${L('節目', 'Goals')}<br><span class="ist">★</span> 10</span><b>${coinSvg}${range(...facts.ms)}</b></div>`
      + `</div><div class="iuse">${[L('ヒント', 'Hint'), L('パス', 'Pass'), L('ショップ', 'Shop'), L('ガチャ', 'Gacha')].map((t) => `<span>${t}</span>`).join('')}</div></div>`
      + `<p>${L('★3 は、はじめて解いた問題だけ', 'Only the first ★3 on each puzzle counts.')}</p>`,
    gacha: () => `<h2>${L('ガチャで文字を集める', 'Collect glyphs')}</h2>`
      + `<div class="ifig"><div class="igt"><span class="gdraw__tile"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="#back"/></svg></span><b class="iarrow">→</b>`
      + `${['neon:7', 'ink:add', 'gem:3', 'stitch:sqrt'].map((id) => `<span class="igt__t">${glyphTile(id)}</span>`).join('')}</div>`
      + `<div class="iuse iuse--c"><span>${coinSvg}${price}</span><span>${L('最初の 1 回は無料', 'First pull free')}</span></div>`
      + `<div class="iuse"><span>${L('だぶり → かけら 1', 'Duplicate → 1 shard')}</span><span>${L(`かけら ${SHARDS} → 好きな 1 文字`, `${SHARDS} shards → any 1 glyph`)}</span></div></div>`
      + `<p>${L(`デザインごとに引く。数字・記号 ${G.GLYPH_CHARS.length} 文字 × ${G.GLYPH_DESIGNS.length} デザイン。集めるだけで、ゲームは強くならない`, `Pull per design. ${G.GLYPH_CHARS.length} glyphs × ${G.GLYPH_DESIGNS.length} designs. Just for collecting; no gameplay boost.`)}</p>`,
  };

  const q = (id) => $(id);
  const ask = (reason) => {
    if (!open) return;
    open = false;
    const el = q('intro');
    el.hidden = true;
    document.documentElement.classList.remove('intro-open');
    q('intro-view').innerHTML = '';
    const cb = done; done = null;
    if (from && from.isConnected && !from.disabled) { try { from.focus(); } catch { /* なし */ } }
    from = null;
    if (cb) cb(reason);
  };

  function render() {
    const last = at === list.length - 1;
    const v = q('intro-view');
    v.style.setProperty('--dx', `${dir * 24}px`);
    v.innerHTML = `<div class="icard" data-card="${list[at]}">${cards[list[at]]()}</div>`;
    q('intro-dots').innerHTML = list.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('');
    q('intro-live').textContent = `${at + 1} / ${list.length}`;
    q('intro-prev').disabled = at === 0;
    q('intro-next').disabled = last;
    q('intro-skip').hidden = last;
    q('intro-skip').textContent = L('スキップ', 'Skip');
    const go = q('intro-go'), later = q('intro-later');
    go.hidden = !last;
    later.hidden = !(last && mode === 'gacha');
    go.textContent = mode === 'how' ? L('やってみる', 'Try it') : mode === 'gacha' ? L('ガチャへ', 'To gacha') : L('とじる', 'Close');
    later.textContent = L('あとで', 'Later');
    q('intro-prev').setAttribute('aria-label', L('前へ', 'Previous'));
    q('intro-next').setAttribute('aria-label', L('次へ', 'Next'));
  }
  function move(d) {
    const n = at + d;
    if (n < 0 || n >= list.length) return;
    dir = d; at = n; sfx.move();
    const had = document.activeElement;
    render();
    // 押していたボタンが無効になったら、いま押せる方へ
    if (had && had.disabled) (q('intro-go').hidden ? q('intro-next') : q('intro-go')).focus();
  }
  const finish = (reason) => { sfx.tap(); ask(reason); };

  q('intro-prev').addEventListener('click', () => move(-1));
  q('intro-next').addEventListener('click', () => move(1));
  q('intro-skip').addEventListener('click', () => finish('skip'));
  q('intro-go').addEventListener('click', () => finish(mode === 'gacha' ? 'go' : 'done'));
  q('intro-later').addEventListener('click', () => finish('later'));

  // スワイプ（横に 40px 以上、縦より横が大きいとき）
  let sx = 0, sy = 0, sid = null;
  const view = q('intro-view');
  view.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; sid = e.pointerId; });
  view.addEventListener('pointerup', (e) => {
    if (e.pointerId !== sid) return;
    sid = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  });
  view.addEventListener('pointercancel', () => { sid = null; });

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); finish(mode === 'gacha' ? 'later' : 'skip'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    else if (e.key === 'Tab') {
      // フォーカスはこの中で回す
      const bs = [...q('intro').querySelectorAll('button')].filter((b) => !b.hidden && !b.disabled);
      if (!bs.length) return;
      const i = bs.indexOf(document.activeElement);
      if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === bs.length - 1)) { e.preventDefault(); bs[e.shiftKey ? bs.length - 1 : 0].focus(); }
    }
  });

  return {
    isOpen: () => open,
    // m: 'how' | 'gacha' | 'all'。onClose(reason): 'done' | 'skip' | 'go' | 'later'
    open(m, onClose) {
      mode = m; list = cardsFor(m); at = 0; dir = 1; done = onClose || null;
      from = document.activeElement;
      open = true;
      const el = q('intro');
      el.setAttribute('aria-label', L('はじめの説明', 'Introduction'));
      el.hidden = false;
      document.documentElement.classList.add('intro-open');
      render();
      (list.length > 1 ? q('intro-next') : q('intro-go')).focus();
    },
    // 絵が読み終わったとき、開いていれば描き直す（ガチャの絵が仮のままにならないように）
    refresh() { if (open) { const d = dir; dir = 0; render(); dir = d; } },
  };
}
