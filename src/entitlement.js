// 「広告なし」の権利（GEAR ALIGN の entitlement.js と同じ形。鍵はなく、広告を消すだけ）。
// 買えるのは iOS アプリ（Capacitor）の中だけ。Web 版には広告もストアもないので、何も変わらない。
// 開発の確かめ用に、localhost だけ ?ads=1（ストアがある扱い）と ?full=1（買った扱い）を受け付ける。
//
// 「買った」かどうかはストアが決める。iOS 版では native.js が attachStore() でストア（StoreKit）をつなぎ、
// 起動時と戻ったときに権利を確かめて結果を setFull に入れる。
// ストアの答えが来たあとは、その答えだけを信じる。localStorage は答えが来る前（起動直後）の見た目の控え。
// 買った人にはごほうび広告の `▶` も出さない（コインの出入りを買った人と買わない人で同じにするため）。

const KEY = 'four-digits.noads';

let override = null;     // テスト用。{ full } を入れると環境の判定より優先する
const listeners = [];
let store = null;        // attachStore で渡されるストア
let storeFull = null;    // ストアが最後に答えた「買ったか」。null は未確認

const query = () => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(''); } };
const isLocalhost = () => { try { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname); } catch { return false; } };
const devAds = () => isLocalhost() && query().get('ads') === '1';

function readFull() {
  if (isLocalhost() && query().get('full') === '1') return true;
  if (storeFull !== null) return storeFull;   // ストアの答えが来たら、控えは見ない
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function isFull() {
  if (override && 'full' in override) return !!override.full;
  return readFull();
}

export const onChange = (fn) => { listeners.push(fn); };
const notify = () => { for (const fn of listeners) { try { fn(isFull()); } catch { /* 他の受け手を止めない */ } } };

// 購入・復元・権利の確認の結果を入れる口。控えに書き、変わったときだけ知らせる
export function setFull(v) {
  const was = isFull();
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* 保存できなくても今の画面は変わる */ }
  if (store) storeFull = !!v;
  if (isFull() !== was || !store) notify();
}

// ---- ストア（iOS の StoreKit。native.js から渡す）----
// store = { price(): Promise<string|null>, check(): Promise<boolean>, purchase(): Promise<'purchased'|'cancelled'|'pending'>, restore(): Promise<boolean> }
export function attachStore(s) { store = s; notify(); }   // つながったら入口を出せるので知らせる
export const hasStore = () => !!store;
export const storePrice = () => (store ? store.price().catch(() => null) : Promise.resolve(null));
// 権利の確認。確認できなかったとき（通信・ストアの不調）は今の表示を変えない
export async function refreshFromStore() {
  if (!store) return isFull();
  try { setFull(await store.check()); } catch { /* 確認できないときは控えのまま */ }
  return isFull();
}
export async function purchase() {
  if (!store) throw new Error('no store');
  const r = await store.purchase();
  if (r === 'purchased') setFull(true);
  return r;
}
export async function restore() {
  if (!store) throw new Error('no store');
  const full = await store.restore();
  setFull(full);
  return full;
}

// 広告が出る人か（ストアがつながっていて、買っていない）。ホームの入口もこれで決める
export const adsActive = () => (hasStore() || devAds()) && !isFull();

export const _override = (o) => { override = o; };
export const _resetStore = () => { store = null; storeFull = null; };

if (typeof window !== 'undefined') {
  window.Entitlement = { isFull, adsActive, onChange, setFull, attachStore, hasStore, storePrice, refreshFromStore, purchase, restore };
}
