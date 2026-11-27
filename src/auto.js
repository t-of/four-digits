// おまかせ: four-digits.auto = { v: 1, L, S, seen, all?, intro?, streak, recent: [[4桁, 目標], …], cur: [4桁, 目標] | null }
// S = 1〜10 の段（画面の Lv）。L は古い版のために S から計算して書き続ける（5 段）。seen = 覚えた記号の id。
// all = 引き継いだ人（キーを全部出す）、intro = 紹介の 1 問を出す S。
// 画面を持たない。保存と問題の表は main.js から渡す（deps: load, save, starsOf, hasTable, infoOf, isShown）。
// infoOf(n, 目標) は { need, m } か null、isShown(4桁, 目標) は答えを見た問題か。
import { stageHas, newNeed, INTRO, SEEN_IDS, introKeyOf, seenUpTo } from './levels.js';
export const RECENT_DIGITS = 30, RECENT_TARGET = 5;
const pad4 = (n) => String(n).padStart(4, '0');
const L_OF_S = [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5];
const S_OF_L = [0, 2, 4, 6, 8, 10];   // 5 段の人の引き継ぎ先

export function createAuto({ load, save, starsOf, hasTable, infoOf = () => null, isShown = () => false }) {
  const auto = { L: 1, S: 1, seen: ['ops'], all: 0, intro: 0, streak: 0, recent: [], cur: null };
  const d = load('auto', null);
  if (d && d.v === 1 && d.L >= 1 && d.L <= 5 && Array.isArray(d.recent)) {
    const hasS = Number.isInteger(d.S) && d.S >= 1 && d.S <= 10;
    const S = hasS ? d.S : S_OF_L[d.L];
    Object.assign(auto, {
      S, L: L_OF_S[S], streak: d.streak | 0, recent: d.recent.slice(0, RECENT_DIGITS), cur: Array.isArray(d.cur) ? d.cur : null,
      seen: hasS && Array.isArray(d.seen) ? SEEN_IDS.filter((id) => id === 'ops' || d.seen.includes(id)) : seenUpTo(S),
      all: hasS ? (d.all ? 1 : 0) : 1,
      intro: hasS && d.intro >= 3 && d.intro <= 10 ? d.intro : 0,
    });
  }
  const saveAuto = () => {
    auto.L = L_OF_S[auto.S];
    const { L, S, seen, all, intro, streak, recent, cur } = auto;
    save('auto', { v: 1, L, S, seen, ...(all ? { all: 1 } : {}), ...(intro ? { intro } : {}), streak, recent, cur });
  };

  // 紹介の 1 問（intro の S の問題）。なければ null
  const introOf = () => (auto.intro ? INTRO.find((x) => x.S === auto.intro) || null : null);

  function pick() {
    const it = introOf();
    if (it) return [Number(it.digits), it.target];
    const rd = auto.recent.slice(0, RECENT_DIGITS).map((r) => r[0]);
    const rt = auto.recent.slice(0, RECENT_TARGET).map((r) => r[1]);
    const want = newNeed(auto.S) && Math.random() < 0.5 ? newNeed(auto.S) : 0;   // 半分は、この S で新しく出た記号の問題
    for (let tries = 0; tries < 5000; tries++) {
      const i = Math.floor(Math.random() * 1000000);
      const n = Math.floor(i / 100), t = (i % 100) + 1;
      if (hasTable()) {
        const f = infoOf(n, t);
        if (!f || !stageHas(auto.S, f.need, f.m)) continue;
        if (want && tries < 3000 && f.need !== want) continue;
      }
      if (rd.includes(n) || rt.includes(t) || starsOf(pad4(n), t) >= 3 || isShown(pad4(n), t)) continue;
      return [n, t];
    }
    return [Math.floor(Math.random() * 10000), 1 + Math.floor(Math.random() * 100)];
  }
  function push() {
    auto.recent.unshift(auto.cur);
    auto.recent.length = Math.min(auto.recent.length, RECENT_DIGITS);
    auto.cur = null;
  }
  // 解けた: ★3 が 2 問続けば S+1（S10 で止まる）、★1 なら S−1（S1 で止まる）、★2 はそのまま（連続は切れる）。返すのは S の上下。
  // 紹介の 1 問は数えず、記号を seen に足すだけ
  function solved(got) {
    if (!auto.cur) return 0;   // 「もっと短く」の 2 回目以降は数えない
    const it = introOf();
    if (it && auto.cur[0] === Number(it.digits) && auto.cur[1] === it.target) {
      if (!auto.seen.includes(it.key)) auto.seen.push(it.key);
      auto.seen = SEEN_IDS.filter((id) => auto.seen.includes(id));
      auto.intro = 0;
      push(); saveAuto();
      return 0;
    }
    const before = auto.S;
    if (got >= 3) {
      auto.streak++;
      if (auto.streak >= 2) { auto.S = Math.min(10, auto.S + 1); auto.streak = 0; }
    } else {
      auto.streak = 0;
      if (got <= 1) auto.S = Math.max(1, auto.S - 1);
    }
    // 上がった先の記号をまだ覚えていなければ、次の 1 問は紹介
    if (auto.S > before) { const k = introKeyOf(auto.S); if (k && !auto.seen.includes(k)) auto.intro = auto.S; }
    push(); saveAuto();
    return auto.S - before;
  }
  function giveUp() {
    auto.S = Math.max(1, auto.S - 1); auto.streak = 0;
    push(); saveAuto();
  }
  return { state: auto, save: saveAuto, pick, push, solved, giveUp, introOf };
}
