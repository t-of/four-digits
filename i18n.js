// ---- 画面の言葉（日本語・英語） ----
// 言語は起動したときに 1 回だけ決める。切り替えたら読み込み直す（途中で混ざらないように）。
//   1. URL の ?lang=en / ?lang=ja（確かめる用）
//   2. ホームで選んだもの（four-digits.lang）
//   3. 端末の言語。日本語なら日本語、それ以外は英語
//
// main.js の文言は I18n.L('日本語', 'English') でその場に並べて書く。
// index.html の文言は日本語をそのまま書き、英語はここの HTML に置く。
// 要素に data-i18n="キー" を付けると中身（innerHTML）を、data-i18n-aria="キー" を付けると
// aria-label（title があれば title も）を英語に替える。
const I18n = (() => {
  const KEY = 'four-digits.lang';
  const LANGS = ['ja', 'en'];

  function detect() {
    try {
      const q = new URLSearchParams(location.search).get('lang');
      if (LANGS.includes(q)) return q;
    } catch (e) { /* location が無い場所では次へ */ }
    try {
      const saved = localStorage.getItem(KEY);
      if (LANGS.includes(saved)) return saved;
    } catch (e) { /* 保存が読めなければ端末の言語 */ }
    try {
      const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
      return String(list[0] || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
    } catch (e) { return 'ja'; }
  }

  const lang = detect();
  const L = (ja, en) => (lang === 'en' ? en : ja);

  const TITLE = 'SHORT MATH — Make 1 to 100 from 4 digits with the fewest symbols';
  const DESC = 'Use four digits in order to make every number from 1 to 100. The fewer the symbols, the more the stars. A number puzzle: find the shortest expression.';
  const DESC_SHORT = 'Use four digits in order to make every number from 1 to 100. The fewer the symbols, the more the stars.';

  const HTML = {
    coin: 'Coins',
    themeLight: 'Switch to light theme',
    themeDark: 'Switch to dark theme',
    sound: 'Sound effects',
    auto: 'Auto',
    level: 'Level',
    daily: 'Daily puzzle',
    free: 'Free',
    zukan: 'Collection',
    install: 'Install app',
    share: 'Share',
    contact: 'Contact',
    back: 'Back',
    help: 'How to play &amp; symbols',
    expr: 'Expression',
    minus: 'Minus',
    pow: 'Power',
    sqrt: 'Square root',
    dot: 'Decimal point',
    delSym: 'Delete the symbol before the cursor',
    left: 'Move cursor left',
    right: 'Move cursor right',
    fact: 'Factorial',
    factN: 'N-fold factorial',
    clearAll: 'Clear all symbols',
    nMinus: 'Decrease N',
    nPlus: 'Increase N',
    cancel: 'Cancel',
    add: 'Add',
    next: 'Next',
    shorter: 'Shorter',
    shareResult: 'Share result',
    pass: 'Pass',
    toHome: 'Home',
    picked: 'Chosen 4 digits',
    play: 'Play',
    random: 'Random',
    del1: 'Delete one digit',
    tabDigits: '4 digits',
    tabNumbers: 'Targets',
    howTitle: 'How to play',
    howStep2: 'Insert symbols. Digits you don\'t separate stay joined.',
    howStep3: 'Fewer symbols, more ★',
    howParen: '<code>(2+2)×2</code> &nbsp;1 pair = 1 symbol',
    howFact: '<code>4!</code> = 4×3×2×1 = 24<br><code>7!!</code> = 7×5×3×1 = 105<br><small>Two ! skip every other number, three skip two</small>',
    howFactN: '<code>9!⁽³⁾</code> = 9×6×3 = 162<br><small>Multiply, stepping down by N (N-fold factorial). Always 1 symbol, whatever N is</small>',
    howSub: '<code>!0</code> = 1 &nbsp;<code>!3</code> = 2 &nbsp;<code>!4</code> = 9 &nbsp;<code>!5</code> = 44<br><small>Ways for n people to swap gifts so that nobody gets their own (subfactorial)</small>',
    shop: 'Shop',
  };

  // index.html の data-i18n* と <head> を英語に替える。日本語のときは何もしない（HTML がそのまま日本語）
  function apply(root) {
    document.documentElement.lang = lang;
    if (lang === 'ja') return;
    root = root || document;
    document.title = TITLE;
    const meta = (sel, v) => { const m = document.querySelector(sel); if (m) m.setAttribute('content', v); };
    meta('meta[name="description"]', DESC);
    meta('meta[property="og:title"]', TITLE);
    meta('meta[property="og:description"]', DESC_SHORT);
    meta('meta[property="og:locale"]', 'en_US');
    for (const el of root.querySelectorAll('[data-i18n]')) {
      const s = HTML[el.dataset.i18n];
      if (s !== undefined) el.innerHTML = s;
    }
    for (const el of root.querySelectorAll('[data-i18n-aria]')) {
      const s = HTML[el.dataset.i18nAria];
      if (s === undefined) continue;
      el.setAttribute('aria-label', s.replace(/&amp;/g, '&'));
      if (el.title) el.title = s;
    }
  }

  // ホームで選んだ言語を覚えて読み込み直す
  function set(next) {
    if (!LANGS.includes(next) || next === lang) return;
    try { localStorage.setItem(KEY, next); } catch (e) { /* 覚えられなくても、この読み込みでは切り替える */ }
    try {
      const u = new URL(location.href);
      u.searchParams.delete('lang');
      location.replace(u.toString());
    } catch (e) { location.reload(); }
  }

  return { lang, L, HTML, apply, set, LANGS };
})();
I18n.apply();
