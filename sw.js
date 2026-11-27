// オフライン用のサービスワーカー。
//
// 自分のファイルは network-first（つながっていれば常に最新、圏外なら保存しておいた版）。
// 外部のフォント（Google Fonts）は cache-first。Jost は自前の fonts/ に置き、SHELL に入れてある。
//
// 注意: キャッシュ（CacheStorage）は t-of.github.io のすべてのアプリで共有されている。
// 古いキャッシュを消すときは、必ず自分の PREFIX で始まるものだけを消す。
// keys.filter(k => k !== CACHE) のように書くと、ほかのアプリのキャッシュまで消してしまう。
// ブラウザの HTTP キャッシュを通さない（install は reload、fetch は no-cache）。古い main.js と新しい index.html が混ざって動かなくなるのを防ぐ。

const PREFIX = 'four-digits-';
const VERSION = 'v67';
const CACHE = `${PREFIX}${VERSION}`;
const FONT_CACHE = `${PREFIX}fonts`;
// 答えのデータ（data/ans/）は版で消えない別のキャッシュ（cache-first）。パスしたときだけ読む。SHELL には入れない。
// 古い four-digits-expr-v1 などは下の activate で消える（PREFIX で始まり、CACHE・FONT_CACHE・ANS_CACHE でないもの）
const ANS_CACHE = `${PREFIX}ans-v1`;

const SHELL = [
  './',
  './index.html',
  './style.css',
  './i18n.js',
  './main.js',
  './src/expr.js',
  './src/sfx.js',
  './src/rewards.js',
  './src/glyphs.js',
  './src/milestones.js',
  './src/puzzle.js',
  './src/daily.js',
  './src/edit.js',
  './src/tut.js',
  './src/levels.js',
  './src/zukan.js',
  './src/auto.js',
  './src/answers.js',
  './src/remind.js',
  './src/entitlement.js',
  './glyphs/neon.svg',
  './glyphs/ink.svg',
  './glyphs/pixel.svg',
  './glyphs/gem.svg',
  './glyphs/stitch.svg',
  './glyphs/back.svg',
  './data/puzzle2.bin',
  './data/need.bin',
  './fonts/jost.woff2',
  './fonts/seg.woff2',
  './fonts/mono.woff2',
  './fonts/serif.woff2',
  './manifest.webmanifest',
  './webapp-kit/webapp-kit.css',
  './webapp-kit/webapp-kit.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((k) => k.startsWith(PREFIX) && k !== CACHE && k !== FONT_CACHE && k !== ANS_CACHE)
      .map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.includes('/data/ans/')) {
    e.respondWith(cacheFirst(req, ANS_CACHE));
  } else if (url.origin === location.origin) {
    e.respondWith(networkFirst(req));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req, FONT_CACHE));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('./index.html')) || Response.error();
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
