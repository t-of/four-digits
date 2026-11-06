// 式の解析・計算・記号の数え方。DOM を触らない純粋なモジュール（node からも読める）。
// 仕様は ~/research/4桁の数字パズル/SPEC.md。値は BigInt の正確な有理数。
//
// 文字: + − (U+2212) × ÷ ^ √ ( ) .  階乗は ! !! !!! と !{N}、部分階乗は数か括弧の前の !

export const LIMIT = 10n ** 60n;   // 分子か分母がこれを超えたら「大きすぎる」

export class ExprError extends Error {
  // kind: 'syntax'（書き方）| 'math'（計算できない）| 'big'（大きすぎる）
  // incomplete: 式の終わりで続きを待っている（未完成）
  constructor(kind, message, incomplete = false) {
    super(message);
    this.kind = kind;
    this.incomplete = incomplete;
  }
}

const SINGLE = '+−×÷^√().';

// ---- 字句 ----
function tokenize(text) {
  const toks = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c >= '0' && c <= '9') { toks.push({ t: 'd', v: c }); i++; }
    else if (SINGLE.includes(c)) { toks.push({ t: c }); i++; }
    else if (c === '!') {
      if (text[i + 1] === '{') {
        const m = /^!\{(\d{1,6})\}/.exec(text.slice(i));
        if (!m) throw new ExprError('syntax', '!{N} の書き方がおかしい', /^!\{\d{0,6}$/.test(text.slice(i)));
        const n = BigInt(m[1]);
        if (n < 1n) throw new ExprError('syntax', 'N は 1 以上');
        toks.push({ t: '!', n });
        i += m[0].length;
      } else {
        let j = i;
        while (text[j] === '!') j++;
        toks.push({ t: '!', n: BigInt(j - i), run: true });
        i = j;
      }
    } else throw new ExprError('syntax', `使えない文字 ${c}`);
  }
  return toks;
}

// ---- 構文木 ----
// { k:'num', n, d } { k:'neg', a } { k:'bin', op, l, r } { k:'pow', l, r }
// { k:'sqrt', a } { k:'fact', n, a } { k:'pfact', a } { k:'paren', a }
export function parse(text) {
  const toks = tokenize(text);
  if (toks.length === 0) throw new ExprError('syntax', '式がない', true);
  let p = 0;
  const peek = () => toks[p];
  const fail = (msg, inc = p >= toks.length) => { throw new ExprError('syntax', msg, inc); };

  function addLevel(allowNeg) {
    let l = mulLevel(allowNeg);
    while (peek() && (peek().t === '+' || peek().t === '−')) {
      const op = toks[p++].t;
      l = { k: 'bin', op, l, r: mulLevel(false) };
    }
    return l;
  }
  function mulLevel(allowNeg) {
    let l = unary(allowNeg);
    while (peek() && (peek().t === '×' || peek().t === '÷')) {
      const op = toks[p++].t;
      l = { k: 'bin', op, l, r: unary(false) };
    }
    return l;
  }
  // 単独のマイナスは式の先頭か「(」の直後だけ。2 項演算の右側・指数は括弧で包む
  function unary(allowNeg) {
    if (peek() && peek().t === '−') {
      if (!allowNeg) fail('ここのマイナスは括弧で包む');
      p++;
      return { k: 'neg', a: power() };
    }
    return power();
  }
  function power() {
    const l = postfix();
    if (peek() && peek().t === '^') {
      p++;
      return { k: 'pow', l, r: power() };   // 右結合
    }
    return l;
  }
  function postfix() {
    let a = atom();
    if (peek() && peek().t === '!') {
      a = { k: 'fact', n: toks[p++].n, a };
      if (peek() && peek().t === '!') fail('階乗の階乗は括弧で包む', false);
    }
    return a;
  }
  function atom() {
    const t = peek();
    if (!t) fail('式の続きが要る');
    if (t.t === 'd') return number();
    if (t.t === '(') return paren();
    if (t.t === '√') { p++; return { k: 'sqrt', a: operand() }; }
    if (t.t === '!') {
      if (t.run && t.n === 1n) { p++; return { k: 'pfact', a: operand() }; }
      fail('! が続きすぎ・位置がおかしい', false);
    }
    return fail(`ここに ${t.t} は置けない`, false);
  }
  // √ と部分階乗の対象は、数か括弧
  function operand() {
    const t = peek();
    if (!t) fail('対象が要る');
    if (t.t === 'd') return number();
    if (t.t === '(') return paren();
    return fail('√ と ! の対象は数か括弧', false);
  }
  function paren() {
    p++;
    const a = addLevel(true);
    if (!peek()) fail('閉じ括弧が要る');
    if (peek().t !== ')') fail(`ここに ${peek().t} は置けない`, false);
    p++;
    return { k: 'paren', a };
  }
  function number() {
    let ip = '';
    while (peek() && peek().t === 'd') ip += toks[p++].v;
    if (ip.length > 1 && ip[0] === '0') fail('先頭が 0 の数は使えない', false);
    let fp = '';
    if (peek() && peek().t === '.') {
      p++;
      while (peek() && peek().t === 'd') fp += toks[p++].v;
      if (fp === '') fail('小数点の後に数字が要る');
    }
    return { k: 'num', n: BigInt(ip + fp), d: 10n ** BigInt(fp.length) };
  }

  const tree = addLevel(true);
  if (p < toks.length) fail(`ここに ${toks[p].t === 'd' ? toks[p].v : toks[p].t} は置けない`, false);
  return tree;
}

// ---- 有理数 ----
const big = () => new ExprError('big', '大きすぎる');
const bad = (m) => new ExprError('math', m);
const abs = (x) => (x < 0n ? -x : x);
function gcd(a, b) { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; }
function mk(n, d) {
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  n /= g; d /= g;
  if (abs(n) > LIMIT || d > LIMIT) throw big();
  return { n, d };
}
const bits = (x) => x.toString(2).length;
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((bits(n) + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

function power(a, b) {
  if (b.d !== 1n) throw bad('指数は整数');
  const e = b.n;
  if (a.n === 0n) {
    if (e <= 0n) throw bad('0 の 0 以下乗は作れない');
    return mk(0n, 1n);
  }
  if (a.d === 1n && a.n === 1n) return mk(1n, 1n);
  if (a.d === 1n && a.n === -1n) return mk(e % 2n === 0n ? 1n : -1n, 1n);
  const ae = abs(e);
  if (ae > 200n) throw big();
  const L = bits(abs(a.n) > a.d ? abs(a.n) : a.d);
  if (BigInt(L - 1) * ae > 210n) throw big();
  let pn = a.n ** ae, pd = a.d ** ae;
  if (e < 0n) [pn, pd] = [pd, pn];
  return mk(pn, pd);
}

function sqrt(a) {
  if (a.n < 0n) throw bad('負の数の √ は作れない');
  const rn = isqrt(a.n), rd = isqrt(a.d);
  if (rn * rn !== a.n || rd * rd !== a.d) throw bad('√ が有理数にならない');
  return mk(rn, rd);
}

function factorial(a, N) {
  if (a.d !== 1n || a.n < 0n) throw bad('階乗の対象は 0 以上の整数');
  let r = 1n;
  for (let k = a.n; k > 0n; k -= N) {
    r *= k;
    if (r > LIMIT) throw big();
  }
  return mk(r, 1n);
}

function subfactorial(a) {
  if (a.d !== 1n || a.n < 0n) throw bad('部分階乗の対象は 0 以上の整数');
  if (a.n > 200n) throw big();
  const n = Number(a.n);
  if (n === 0) return mk(1n, 1n);
  let p2 = 1n, p1 = 0n;   // !(i-2), !(i-1)
  for (let i = 2; i <= n; i++) {
    const cur = BigInt(i - 1) * (p1 + p2);
    if (cur > LIMIT) throw big();
    p2 = p1; p1 = cur;
  }
  return mk(p1, 1n);
}

export function evaluate(node) {
  switch (node.k) {
    case 'num': return mk(node.n, node.d);
    case 'paren': return evaluate(node.a);
    case 'neg': { const a = evaluate(node.a); return mk(-a.n, a.d); }
    case 'bin': {
      const a = evaluate(node.l), b = evaluate(node.r);
      if (node.op === '+') return mk(a.n * b.d + b.n * a.d, a.d * b.d);
      if (node.op === '−') return mk(a.n * b.d - b.n * a.d, a.d * b.d);
      if (node.op === '×') return mk(a.n * b.n, a.d * b.d);
      if (b.n === 0n) throw bad('0 で割れない');
      return mk(a.n * b.d, a.d * b.n);
    }
    case 'pow': return power(evaluate(node.l), evaluate(node.r));
    case 'sqrt': return sqrt(evaluate(node.a));
    case 'fact': return factorial(evaluate(node.a), node.n);
    case 'pfact': return subfactorial(evaluate(node.a));
    default: throw new Error('unknown node');
  }
}

// ---- 記号の個数（打った括弧はすべて数える。開き括弧 1 個で 1） ----
export function countSymbols(text) {
  let k = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '!') {
      k++;
      if (text[i + 1] === '{') { while (i < text.length && text[i] !== '}') i++; }
      else while (text[i + 1] === '!') i++;
    } else if ('+−×÷^√(.'.includes(c)) k++;
  }
  return k;
}

// 式に使われた数字を、出てきた順に並べた文字列（!{N} の N は含めない）
export function digitsOf(text) {
  return text.replace(/!\{\d*\}?/g, '!').replace(/\D/g, '');
}

// 打っている途中の式を調べる。status: empty | incomplete | syntax | digits | math | big | ok
export function analyze(text, digits) {
  if (text === '') return { status: 'empty', symbols: 0 };
  const symbols = countSymbols(text);
  let value;
  try {
    value = evaluate(parse(text));
  } catch (e) {
    if (!(e instanceof ExprError)) throw e;
    if (e.kind === 'syntax') return { status: e.incomplete ? 'incomplete' : 'syntax', message: e.message, symbols };
    return { status: e.kind, message: e.message, symbols };
  }
  const used = digitsOf(text);
  if (!digits.startsWith(used)) return { status: 'digits', message: '数字を順番どおりに使っていない', symbols };
  return { status: 'ok', value, symbols, complete: used === digits };
}

export function isTarget(value, t) { return value.d === 1n && value.n === BigInt(t); }

// 星: 最小記号数 m（255 は未計算）、プレイヤーの記号数 k
export function starsFor(k, m) {
  if (m === undefined || m >= 255 || k <= m) return 3;
  return k <= m + 2 ? 2 : 1;
}

export function formatValue(v) {
  if (v.d === 1n) return v.n.toString().replace('-', '−');
  const neg = v.n < 0n;
  const scaled = (abs(v.n) * 1000000n) / v.d;
  const s = scaled.toString().padStart(7, '0');
  const dec = `${s.slice(0, -6)}.${s.slice(-6)}`.replace(/0+$/, '').replace(/\.$/, '');
  return `${v.n.toString().replace('-', '−')}/${v.d} ≈ ${neg ? '−' : ''}${dec}`;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
// 画面に出す形（!{N} を !⁽ᴺ⁾ に）
export function display(text) {
  return text.replace(/!\{(\d+)\}/g, (_, n) => `!⁽${[...n].map((c) => SUP[c]).join('')}⁾`);
}
