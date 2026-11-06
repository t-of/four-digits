#!/usr/bin/env python3
"""例の式を SPEC.md の文法で読み直し、値・数字の順番・記号数を確かめる（探索とは別に書いた）。

使い方: check.py <examples.tsv または .tsv.gz> [抜き出す数 (既定: 全部)] [乱数の種]
行の形: s TAB t TAB m TAB 式（m=255 は式なしで飛ばす）
"""
import gzip
import random
import sys
from fractions import Fraction

MINUS, TIMES, DIV, SQRT = "−", "×", "÷", "√"


class Bad(Exception):
    pass


def isqrt_exact(n):
    if n < 0:
        raise Bad("負の√")
    r = int(n ** 0.5)
    for c in range(max(0, r - 2), r + 3):
        if c * c == n:
            return c
    import math
    c = math.isqrt(n)
    if c * c == n:
        return c
    raise Bad("√が有理数でない")


def subfact(n):
    a, b = 1, 0  # !0, !1
    if n == 0:
        return 1
    for k in range(2, n + 1):
        a, b = b, (k - 1) * (a + b)
    return b


def multifact(n, N):
    p = 1
    while n > 0:
        p *= n
        n -= N
    return p


class P:
    """再帰下降。返り値は (値, 種類)。種類: 'num' 'paren' 'other'"""

    def __init__(self, s):
        self.s, self.i, self.cnt, self.digits = s, 0, 0, ""

    def peek(self):
        return self.s[self.i] if self.i < len(self.s) else ""

    def eat(self, ch):
        if self.peek() != ch:
            raise Bad(f"{ch!r} がない位置 {self.i}")
        self.i += 1

    def parse(self):
        v, _ = self.add()
        if self.i != len(self.s):
            raise Bad(f"余り {self.s[self.i:]!r}")
        return v

    # add := neg_mul (('+'|'−') mul)*
    def add(self):
        v, k = self.mul(allow_neg=True)
        while self.peek() in ("+", MINUS):
            op = self.peek(); self.i += 1; self.cnt += 1
            w, _ = self.mul(allow_neg=False)
            v = v + w if op == "+" else v - w
            k = "other"
        return v, k

    # mul := unary (('×'|'÷') pow)*   右側は単独のマイナスで始められない
    def mul(self, allow_neg):
        v, k = self.unary() if allow_neg else self.pow()
        while self.peek() in (TIMES, DIV):
            op = self.peek(); self.i += 1; self.cnt += 1
            w, _ = self.pow()
            if op == TIMES:
                v = v * w
            else:
                if w == 0:
                    raise Bad("0 で割る")
                v = v / w
            k = "other"
        return v, k

    # unary := '−' unary | pow
    def unary(self):
        if self.peek() == MINUS:
            self.i += 1; self.cnt += 1
            v, _ = self.unary()
            return -v, "other"
        return self.pow()

    # pow := post ('^' pow)?   右結合。指数は単独のマイナスで始められない
    def pow(self):
        v, k = self.post()
        if self.peek() == "^":
            self.i += 1; self.cnt += 1
            e, _ = self.pow()
            if e.denominator != 1:
                raise Bad("指数が整数でない")
            e = int(e)
            if v == 0 and e <= 0:
                raise Bad("0 の 0 以下乗")
            if abs(e) > 10000 and abs(v) != 1 and v != 0:
                raise Bad("指数が大きすぎる")
            v = v ** e
            k = "other"
        return v, k

    # post := atom ( '!'+ | '!{N}' )?   階乗の対象は数か括弧だけ
    def post(self):
        v, k = self.atom()
        if self.peek() == "!":
            if k not in ("num", "paren"):
                raise Bad("階乗の対象が数・括弧でない")
            N = 0
            while self.peek() == "!":
                self.i += 1; N += 1
            if self.peek() == "{":
                if N != 1:
                    raise Bad("!!{N}")
                self.i += 1
                j = self.s.index("}", self.i)
                N = int(self.s[self.i:j])
                self.i = j + 1
                if N < 1:
                    raise Bad("N<1")
            self.cnt += 1
            if v.denominator != 1 or v < 0:
                raise Bad("階乗の対象が 0 以上の整数でない")
            v = Fraction(multifact(int(v), N))
            k = "other"
        return v, k

    # atom := number | '(' add ')' | '√' prim | '!' prim
    def atom(self):
        c = self.peek()
        if c == "(":
            self.i += 1
            v, _ = self.add()
            self.eat(")")
            self.cnt += 1
            return v, "paren"
        if c in (SQRT, "!"):
            self.i += 1; self.cnt += 1
            v, k = self.atom()
            if k not in ("num", "paren"):
                raise Bad("√・部分階乗の対象が数・括弧でない")
            if c == SQRT:
                if v < 0:
                    raise Bad("負の√")
                return Fraction(isqrt_exact(v.numerator), isqrt_exact(v.denominator)), "other"
            if v.denominator != 1 or v < 0:
                raise Bad("部分階乗の対象")
            return Fraction(subfact(int(v))), "other"
        if c.isdigit():
            j = self.i
            while j < len(self.s) and (self.s[j].isdigit() or self.s[j] == "."):
                j += 1
            tok = self.s[self.i:j]
            self.i = j
            if tok.count(".") > 1 or tok.startswith(".") or tok.endswith("."):
                raise Bad(f"数 {tok}")
            ip = tok.split(".")[0]
            if len(ip) > 1 and ip[0] == "0":
                raise Bad(f"先頭 0 {tok}")
            if "." in tok:
                self.cnt += 1
            self.digits += tok.replace(".", "")
            return Fraction(tok), "num"
        raise Bad(f"読めない {c!r} 位置 {self.i}")


def check_line(s, t, m, expr):
    p = P(expr)
    v = p.parse()
    errs = []
    if v != t:
        errs.append(f"値 {v} ≠ {t}")
    if p.digits != s:
        errs.append(f"数字 {p.digits} ≠ {s}")
    if p.cnt != m:
        errs.append(f"記号数 {p.cnt} ≠ {m}")
    return errs


def main():
    fn = sys.argv[1]
    k = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    op = gzip.open if fn.endswith(".gz") else open
    rows = []
    with op(fn, "rt", encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            a = line.rstrip("\n").split("\t")
            if len(a) < 4 or a[2] == "255":
                continue
            rows.append((a[0], int(a[1]), int(a[2]), a[3]))
    if k and k < len(rows):
        rows = random.Random(seed).sample(rows, k)
    bad = 0
    for s, t, m, e in rows:
        try:
            errs = check_line(s, t, m, e)
        except Bad as ex:
            errs = [f"解析できない: {ex}"]
        if errs:
            bad += 1
            if bad <= 20:
                print(f"NG {s} {t} {m} {e}: {'; '.join(errs)}")
    print(f"確かめた {len(rows)} 問、合わない {bad} 問")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
