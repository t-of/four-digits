// ヒント 2 の記号の分け方。DOM を触らない純粋なモジュール（node からも読める）。
// 最短の式を「数字」と「記号の 1 つぶん」に分け、見せる順に並べる。
// 記号の数え方は expr.js の countSymbols と同じ（括弧は開きと閉じで 1 つ、!{N} や !! も 1 つ）。
//
// 見せる順: 2 項（+ − × ÷ ^）を左から → 1 項（√ ! 部分階乗 小数点 単独の −）→ 括弧

import { display } from './expr.js';

const BIN = '+×÷^';   // − は前が「(」か先頭なら単独（1 項）、それ以外は 2 項

// 式を並びの順に分ける。cells: { d: 数字 } | { s: 記号の番号, v: 見せる字 }、items: 記号の組（括弧は 2 つの cells）
export function split(expr) {
  const cells = [];
  const items = [];
  const open = [];   // 開き括弧の item の番号
  const sym = (cat, v) => { items.push({ cat, first: cells.length }); cells.push({ s: items.length - 1, v: display(v) }); };
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c >= '0' && c <= '9') cells.push({ d: c });
    else if (c === '(') { sym(2, c); open.push(items.length - 1); }
    else if (c === ')') { const n = open.pop(); cells.push({ s: n, v: ')' }); }
    else if (c === '!') {
      let j = i + 1;
      if (expr[j] === '{') j = expr.indexOf('}', j) + 1; else while (expr[j] === '!') j++;
      sym(1, expr.slice(i, j)); i = j - 1;
    }
    else if (c === '−') sym(i === 0 || expr[i - 1] === '(' ? 1 : 0, c);
    else if (BIN.includes(c)) sym(0, c);
    else sym(1, c);   // √ .
  }
  return { cells, items };
}

// 見せる順の item の番号。最後の 1 つは見せないので、長さは m − 1
export function order(expr) {
  const { items } = split(expr);
  return items.map((it, i) => i).sort((a, b) => items[a].cat - items[b].cat || items[a].first - items[b].first).slice(0, -1);
}

// 骨組み。shown 個ぶん見せたときの { parts: [{ d } | { v }], rest: まだの個数 }
// shown = 0 のときは数字も出さず ○ だけ（ヒント 1 と同じ）
export function skeleton(expr, shown) {
  const { cells, items } = split(expr);
  const m = items.length;
  const on = new Set(order(expr).slice(0, shown));
  if (shown <= 0) return { parts: [], rest: m };
  const parts = cells.filter((c) => c.d !== undefined || on.has(c.s)).map((c) => (c.d !== undefined ? { d: c.d } : { v: c.v }));
  return { parts, rest: m - on.size };
}
