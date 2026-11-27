// 毎日の通知（今日の 1 問）の口と、予約の一覧。画面は持たない（ボタンとベルは main.js）。
// 通知そのもの（LocalNotifications）はここに無い。iOS 版の native/native.js が attach() で提供元を渡す。Web 版では何も出ない。
//
// provider = { permission(): 'granted'|'denied'|'prompt', request(): Promise<bool>,
//              plan(list): Promise, clearToday(id): Promise, onOpen(fn) }
//   plan は渡した一覧で予約を全部入れ替える（空なら消すだけ）。list = [{ id, at: Date, text }]
import { dailyPuzzle } from './daily.js';

const KEY = 'four-digits.remind';   // { v: 1, asked, on }
export const REMIND_DAYS = 7;       // 今日から 7 日分。開かなければそこで止まる
export const REMIND_HOUR = 20;

const two = (n) => String(n).padStart(2, '0');
export const dateKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
export const idOf = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

// 予約の一覧。daily = { 'YYYY-MM-DD': 星 }。今日の 1 問の選び方は daily.js をそのまま使う（ホームのカードと同じ問題）
export function planReminders(now, daily, table, days = REMIND_DAYS) {
  if (!table) return [];
  const list = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), REMIND_HOUR, 0);
    const key = dateKey(day);
    if (daily && daily[key] > 0) continue;
    if (at.getTime() <= now.getTime()) continue;
    const [n, t] = dailyPuzzle(key, table);
    list.push({ id: idOf(day), at, text: `${day.getMonth() + 1}/${day.getDate()} ${String(n).padStart(4, '0')} → ${t}` });
  }
  return list;
}

// ---- 保存: four-digits.remind。読めなければ初期値、知らない項目は残す ----
const DEFAULT = { v: 1, asked: false, on: false };
export function parseState(raw) {
  try {
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (d && typeof d === 'object' && !Array.isArray(d)) return { ...d, v: 1, asked: d.asked === true, on: d.on === true };
  } catch { /* 読めなければ初期値 */ }
  return { ...DEFAULT };
}
export function readState() {
  try { return parseState(localStorage.getItem(KEY)); } catch { return { ...DEFAULT }; }
}
export function writeState(patch) {
  const s = { ...readState(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 保存できなくても遊べる */ }
  return s;
}

// ---- 見せるかどうかの判定（提供元がなければどちらも出さない）----
// 結果パネルのボタン: 今日の 1 問を解いた結果で、まだ聞いていないとき
export const askVisible = ({ available, asked, mode }) => !!available && !asked && mode === 'daily';
// ホームのベル: 結果パネルで一度聞いたあと。押された見た目は on かつ OS が許している間だけ
export const bellState = ({ available, asked, on, permission }) =>
  ({ hidden: !(available && asked), pressed: !!on && permission === 'granted' });

// ---- 提供元の口 ----
let provider = null;
let openFn = null;
const listeners = [];
export const attach = (p) => {
  provider = p || null;
  if (provider) { try { provider.onOpen(() => { if (openFn) openFn(); }); } catch { /* 開けなくても遊べる */ } }
  for (const fn of listeners) { try { fn(); } catch { /* 他の受け手を止めない */ } }
};
export const onAttach = (fn) => { listeners.push(fn); if (provider) fn(); };
export const available = () => !!provider;
export const onOpen = (fn) => { openFn = fn; };
export const permission = () => { try { return provider ? provider.permission() : 'denied'; } catch { return 'denied'; } };
export async function request() {
  if (!provider) return false;
  try { return !!(await provider.request()); } catch { return false; }
}
// 予約を作り直す（on でなければ空にして消す）。失敗しても遊びを止めない
export async function replan(now, daily, table, on) {
  if (!provider || !table) return;
  try { await provider.plan(on ? planReminders(now, daily, table) : []); } catch { /* 次に開いたとき作り直す */ }
}
// 今日の分の予約と、出たあとの通知を消す
export async function clearToday(now) {
  if (!provider) return;
  try { await provider.clearToday(idOf(now)); } catch { /* 消せなくても遊べる */ }
}

if (typeof window !== 'undefined') window.Remind = { attach, available };
