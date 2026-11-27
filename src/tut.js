// はじめの 2 問。four-digits.tut = true（今の人。2 問目は出さない）| 1（1 問目済み）| 2（済み）| 無し
// 1 問目は + を 1 つ差し込めば解ける 20+27=47。2 問目は素直に打つと記号 2 つ、うまくやると 1 つの 1446 → 24
export const TUTS = [[2027, 47], [1446, 24]];

// いま出すのは何問目か（0 は出さない）。played はこれまでに解いた数
export function tutStep(tut, played) {
  if (tut === true || tut === 2) return 0;
  if (tut === 1) return 2;
  return played === 0 ? 1 : 0;
}

// 出す問題か（段 1 or 2、4 桁、目標）
export const tutOf = (step, n, t) => step > 0 && TUTS[step - 1][0] === n && TUTS[step - 1][1] === t;
