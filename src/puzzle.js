// 問題の表（data/puzzle2.bin）の読み方。1 問 1 バイト、添え字 = 4 桁×100 + 目標−1。
// 下 5 ビット = 最小記号数 m（31 は未計算）、次の 2 ビット = 段（0〜2）、一番上の 1 ビット = 今日向き。
// 作り方は solver/src/make_puzzle.py。
export const SIZE = 1000000;
export const mOf = (b) => b & 31;
export const tierOf = (b) => (b >> 5) & 3;
export const isTodayFit = (b) => (b & 128) !== 0;
// 難しさ 1〜5。段 0 = ＋−×÷と括弧だけ、1 = ^ √ ! 単独− 小数点まで、2 = N 重階乗・部分階乗が要る
export function lvFrom(tier, m) {
  if (m >= 5) return 5;
  if (tier === 0) return m <= 2 ? 1 : 2;
  if (tier === 1) return m <= 2 ? 2 : 3;
  return m <= 2 ? 3 : (m === 3 ? 4 : 5);
}
export const lvOfByte = (b) => lvFrom(tierOf(b), mOf(b));

// 目標の下の ○。k = いまの記号の数、m = 最短。塗る数・空の数・超えた数
export const parDots = (k, m) => ({ filled: Math.min(k, m), empty: Math.max(m - k, 0), over: Math.max(k - m, 0) });
