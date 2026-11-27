// 式の操作（差し込む・消す・カーソル）。toks（かたまりの並び）と cur（カーソル位置）を受けて、新しい { toks, cur } を返す。
// 動かせないときは null。数字は消えず、順番も変わらない。
export const isDigit = (t) => /^\d$/.test(t);

// カーソルより左で一番近い記号の位置（なければ -1）。数字は飛ばす
export function nearestSymbolLeft(toks, cur) {
  for (let i = cur - 1; i >= 0; i--) if (!isDigit(toks[i])) return i;
  return -1;
}
export const canDelete = (toks, cur) => nearestSymbolLeft(toks, cur) >= 0;

export function insertTok(toks, cur, tok) {
  const t = [...toks];
  t.splice(cur, 0, tok);
  return { toks: t, cur: cur + 1 };
}
// カーソルは今いる数字のすき間に残る（消えた分だけ左に詰まる）
export function deleteSymbol(toks, cur) {
  const j = nearestSymbolLeft(toks, cur);
  if (j < 0) return null;
  const t = [...toks];
  t.splice(j, 1);
  return { toks: t, cur: cur - 1 };
}
// 記号を全部消し、数字だけに戻す（カーソルは 1 つ目の数字のあと）
export function clearSymbols(toks) {
  const t = toks.filter(isDigit);
  if (t.length === toks.length) return null;
  return { toks: t, cur: 1 };
}
export function moveBy(toks, cur, d) {
  const c = Math.max(0, Math.min(toks.length, cur + d));
  return c === cur ? null : { toks, cur: c };
}
