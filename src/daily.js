// 今日の 1 問の選び方。日付の文字列から決まる（全端末で同じ結果）。
// 切り替えの日より前は、前からの選び方（難しさ 3 か 4）のまま。過去の記録・共有した文面と食い違わない。
// 切り替えの日からは、今日向きの印（data/puzzle2.bin の一番上のビット）がある問題から選び、
// 同じ 4 桁が 30 日以内に出ないようにする。
import { SIZE, isTodayFit, lvOfByte } from './puzzle.js';

export const SWITCH_DATE = '2026-11-29';
export const NO_REPEAT_DAYS = 30;

// 日付の文字列から決まった乱数列を作る（FNV-1a → mulberry32）
export function seeded(str) {
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

// 前からの選び方（難しさ 3 か 4）。table が無ければ最初の 1 つ目をそのまま返す
export function legacyDailyPuzzle(key, table) {
  const rnd = seeded(`four-digits:${key}`);
  for (;;) {
    const i = Math.floor(rnd() * SIZE);
    const n = Math.floor(i / 100), t = (i % 100) + 1;
    if (!table) return [n, t];
    const lv = lvOfByte(table[i]);
    if (lv === 3 || lv === 4) return [n, t];
  }
}

const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const keyOf = (num) => new Date(num * 86400000).toISOString().slice(0, 10);

// 切り替えの日から前日までの選び方を順にたどる（30 日の重なりよけが前の日に頼るため）
let cache = { table: null, list: [] };
export function dailyPuzzle(key, table) {
  if (!table || key < SWITCH_DATE) return legacyDailyPuzzle(key, table);
  if (cache.table !== table) cache = { table, list: [] };
  const day = dayNum(key) - dayNum(SWITCH_DATE);
  while (cache.list.length <= day) {
    const k = keyOf(dayNum(SWITCH_DATE) + cache.list.length);
    const recent = new Set(cache.list.slice(-NO_REPEAT_DAYS).map(([n]) => n));
    const rnd = seeded(`four-digits:today:${k}`);
    for (;;) {
      const i = Math.floor(rnd() * SIZE);
      const n = Math.floor(i / 100);
      if (isTodayFit(table[i]) && !recent.has(n)) { cache.list.push([n, (i % 100) + 1]); break; }
    }
  }
  return cache.list[day];
}
