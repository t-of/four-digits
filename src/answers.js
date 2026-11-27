// パスのあとの答え（data/ans/NN.txt.gz。4 桁の上 2 桁で 1 ファイル、10,000 行）。DOM を触らない。
// 行番号 = (4 桁 % 100) × 100 + 目標 − 1。作り方は solver/src/make_answers.py
export const ansLine = (n, t) => (Number(n) % 100) * 100 + t - 1;
export const ansFile = (n) => `./data/ans/${String(Math.floor(Number(n) / 100)).padStart(2, '0')}.txt.gz`;

// 式の need（levels.js と同じ決め方。solver/src/make_levels.py の need_of と同じ）
export function needOfExpr(e) {
  let need = 1;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === '(') need = Math.max(need, 3);
    else if (c === '^') need = Math.max(need, 4);
    else if (c === '√') need = Math.max(need, 5);
    else if (c === '.') need = Math.max(need, 6);
    else if (c === '−' && (i === 0 || e[i - 1] === '(')) need = Math.max(need, 8);
    else if (c === '!') {
      if (e[i + 1] === '{') { need = Math.max(need, 9); i = e.indexOf('}', i); }
      else {
        let j = i;
        while (e[j] === '!') j++;
        if (j - i >= 2) need = Math.max(need, 9);
        else if (i > 0 && (/\d/.test(e[i - 1]) || e[i - 1] === ')')) need = Math.max(need, 7);
        else need = Math.max(need, 10);
        i = j - 1;
      }
    }
  }
  return need;
}
