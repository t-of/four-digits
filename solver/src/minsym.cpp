// 4 桁の数字パズル: 各 4 桁 s と目標 t=1..100 の最小記号数を求める。
// 仕様は ../SPEC.md。探索の範囲は ../README.md の「再現手順」。
//
// 方法: 数字の区間 [i,j) ごとに、記号数 c ちょうどで作れる (値, 種類) を c の小さい順に作る。
// 種類（括弧が要るかを決める最上位の演算の高さ。使える場所の広さで 7 つにまとめた）:
//   0 ADDn : 足し引き（左端が単独のマイナス）   使える所: 全体, +−の左
//   1 ADD  : 足し引き                          全体, +−の左, +の右
//   2 NEGM : 単独のマイナス / 左端が単独のマイナスの掛け割り   全体, +−の左, ×÷の左
//   3 MUL  : 掛け割り                          上 + +の右, −の右, ×の右
//   4 POW  : 冪乗                              上 + ÷の右, 指数, 単独のマイナスの対象
//   5 U    : 階乗・√・部分階乗                 上 + 冪乗の底
//   6 PRIM : 数・括弧                          上 + 階乗・√・部分階乗の対象
// 括弧で包むと（+1 個）どの種類も PRIM になる。
//
// 使い方:
//   minsym one <abcd>                 1 組を解いて 100 行出す（s t m 式）
//   minsym run <W> <w> <outfile>      s ≡ w (mod W) を全部解く。outfile に追記。済んだ s は飛ばす
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <string>
#include <vector>
#include <set>
#include <chrono>
#include <cmath>

typedef __int128 i128;
typedef unsigned __int128 u128;

// ---- 探索の範囲（README に書く） ----
static i128 NMAX;          // |分子| ≤ 10^36
static i128 DMAX;          // 分母 ≤ 10^18
static int FACT_MAX = 1000; // N 重階乗の対象 n の上限（N=1 の階乗も同じ。値の上限でさらに切れる）
static int CMAX = 30;      // 記号数の上限（超えたら 255）
static int SUBF_CLS = 4;    // 部分階乗の種類。冪乗の底にするときは括弧が要る（2026-11-06 オーナー）。環境変数 SUBF_BASE=1 で旧仕様（底にできる）
// 使える記号（環境変数 OPSET。未設定=全部）。basic: 連結・＋−×÷・括弧だけ。mid: basic＋小数点・単独のマイナス・^・√・階乗（N=1 のみ）
static bool OP_DEC = true, OP_NEGOK = true, OP_POWOK = true, OP_SQRTOK = true, OP_FACT1 = true, OP_FACTN = true, OP_SUBFOK = true;
static size_t LEVEL_CAP = 60000000; // 1 区間の項目数の上限（メモリ保護。超えたら打ち切り＝255 扱い、ログに出す）

struct Rat { i128 n, d; };
static inline bool operator==(const Rat& a, const Rat& b) { return a.n == b.n && a.d == b.d; }

static inline u128 uabs(i128 x) { return x < 0 ? (u128)(-x) : (u128)x; }
static u128 gcdu(u128 a, u128 b) {
    if (!a) return b; if (!b) return a;
    while (b) { u128 t = a % b; a = b; b = t; }
    return a;
}
static inline bool inrange(const Rat& r) {
    return r.d > 0 && r.d <= DMAX && r.n <= NMAX && r.n >= -NMAX;
}
static inline bool mk(i128 n, i128 d, Rat& out) { // d>0 想定
    if (d < 0) { n = -n; d = -d; }
    u128 g = gcdu(uabs(n), (u128)d);
    if (g > 1) { n /= (i128)g; d /= (i128)g; }
    out.n = n; out.d = d;
    return inrange(out);
}
static inline bool r_add(const Rat& a, const Rat& b, Rat& o, int sign) {
    i128 g = (i128)gcdu((u128)a.d, (u128)b.d);
    i128 da = a.d / g, db = b.d / g, x, y, d;
    if (__builtin_mul_overflow(a.n, db, &x)) return false;
    if (__builtin_mul_overflow(b.n, da, &y)) return false;
    if (sign < 0) y = -y;
    if (__builtin_add_overflow(x, y, &x)) return false;
    if (__builtin_mul_overflow(a.d, db, &d)) return false;
    return mk(x, d, o);
}
static inline bool r_mul(const Rat& a, const Rat& b, Rat& o) {
    if (a.n == 0 || b.n == 0) { o.n = 0; o.d = 1; return true; }
    i128 g1 = (i128)gcdu(uabs(a.n), (u128)b.d), g2 = (i128)gcdu(uabs(b.n), (u128)a.d);
    i128 n, d;
    if (__builtin_mul_overflow(a.n / g1, b.n / g2, &n)) return false;
    if (__builtin_mul_overflow(a.d / g2, b.d / g1, &d)) return false;
    o.n = n; o.d = d;
    return inrange(o);
}
static inline bool r_div(const Rat& a, const Rat& b, Rat& o) {
    if (b.n == 0) return false;
    Rat r; r.n = b.d; r.d = b.n; if (r.d < 0) { r.n = -r.n; r.d = -r.d; }
    return r_mul(a, r, o);
}
static bool r_pow(const Rat& a, const Rat& e, Rat& o) {
    if (e.d != 1) return false;
    i128 k = e.n;
    if (a.n == 0) { if (k <= 0) return false; o.n = 0; o.d = 1; return true; }
    if (a.d == 1 && (a.n == 1 || a.n == -1)) { o.d = 1; o.n = (a.n == 1 || (k % 2 == 0)) ? 1 : -1; return true; }
    if (k == 0) { o.n = 1; o.d = 1; return true; }
    bool neg = k < 0; if (neg) k = -k;
    if (k > 130) return false; // |a|≠0,1 なら 2^130 > 10^36 なので値の上限で必ず外れる
    Rat r; r.n = 1; r.d = 1;
    for (i128 i = 0; i < k; i++) if (!r_mul(r, a, r)) return false;
    if (neg) { Rat one = {1, 1}; return r_div(one, r, o); }
    o = r; return true;
}
static bool isqrt_exact(i128 x, i128& r) {
    if (x < 0) return false;
    if (x == 0) { r = 0; return true; }
    long double f = sqrtl((long double)x);
    i128 s = (i128)f;
    for (i128 t = s - 2 > 0 ? s - 2 : 0; t <= s + 2; t++) if (t * t == x) { r = t; return true; }
    return false;
}

// ---- 種類と使える場所 ----
enum { ADDn = 0, ADD, NEGM, MUL, POW, U, PRIM, NCLS };
enum { C_TOP = 1, C_LADD = 2, C_RADD = 4, C_RSUB = 8, C_LMUL = 16, C_RMUL = 32, C_RDIV = 64, C_BASE = 128, C_EXP = 256, C_UMIN = 512, C_UNOP = 1024 };
static const int CTX[NCLS] = {
    C_TOP | C_LADD,
    C_TOP | C_LADD | C_RADD,
    C_TOP | C_LADD | C_LMUL,
    C_TOP | C_LADD | C_RADD | C_RSUB | C_LMUL | C_RMUL,
    C_TOP | C_LADD | C_RADD | C_RSUB | C_LMUL | C_RMUL | C_RDIV | C_EXP | C_UMIN,
    C_TOP | C_LADD | C_RADD | C_RSUB | C_LMUL | C_RMUL | C_RDIV | C_EXP | C_UMIN | C_BASE,
    C_TOP | C_LADD | C_RADD | C_RSUB | C_LMUL | C_RMUL | C_RDIV | C_EXP | C_UMIN | C_BASE | C_UNOP,
};
static int DOMBY[NCLS]; // DOMBY[k] = k を含む（使える場所が k 以上の）種類のビット集合

enum { OP_LIT, OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_POW, OP_NEG, OP_FACT, OP_SQRT, OP_SUBF, OP_PAREN };

struct Entry {
    Rat v;
    int32_t a, b;   // 子の項目番号（二項: a=左区間, b=右区間。単項: a=同じ区間）
    int32_t aux;    // 階乗の N、小数点の位置（-1 で整数）
    uint8_t cls, op, split, cost;
};

// 値 -> 種類ごとの項目番号 の開番地ハッシュ
struct Slot { Rat v; int32_t idx[NCLS]; };
struct Table {
    std::vector<Slot> slots; std::vector<uint8_t> used; size_t cnt = 0, mask = 0;
    void init(size_t cap) { slots.assign(cap, Slot()); used.assign(cap, 0); cnt = 0; mask = cap - 1; }
    static inline uint64_t h(const Rat& r) {
        uint64_t x = (uint64_t)r.n ^ ((uint64_t)(r.n >> 64) * 0x9E3779B97F4A7C15ULL) ^ ((uint64_t)r.d * 0xC2B2AE3D27D4EB4FULL) ^ (uint64_t)(r.d >> 64);
        x ^= x >> 33; x *= 0xff51afd7ed558ccdULL; x ^= x >> 33; return x;
    }
    void grow() {
        std::vector<Slot> os; os.swap(slots); std::vector<uint8_t> ou; ou.swap(used);
        init(os.size() * 2);
        for (size_t i = 0; i < os.size(); i++) if (ou[i]) { Slot* s = find(os[i].v, true); *s = os[i]; }
    }
    Slot* find(const Rat& r, bool create) {
        if (create && (cnt + 1) * 2 > slots.size()) grow();
        size_t i = h(r) & mask;
        while (used[i]) { if (slots[i].v == r) return &slots[i]; i = (i + 1) & mask; }
        if (!create) return nullptr;
        used[i] = 1; cnt++; slots[i].v = r; for (int k = 0; k < NCLS; k++) slots[i].idx[k] = -1;
        return &slots[i];
    }
};

struct Interval {
    int i, j;
    std::vector<Entry> E;
    std::vector<size_t> lv; // lv[c] = 記号数 c の項目の始まり。lv[c+1] が終わり
    Table T;
    bool overflow = false;
};

static int D[4];
static Interval IV[4][5];

static int found[101]; static int32_t foundIdx[101];
static int nfound;
static int curCost;

static inline void insert(Interval& I, const Rat& v, int cls, int op, int a, int b, int aux, int split) {
    if (I.overflow) return;
    Slot* s = I.T.find(v, true);
    int dm = DOMBY[cls];
    for (int k = 0; k < NCLS; k++) if ((dm >> k & 1) && s->idx[k] >= 0) return;
    if (I.E.size() >= LEVEL_CAP) { I.overflow = true; return; }
    Entry e; e.v = v; e.a = a; e.b = b; e.aux = aux; e.cls = (uint8_t)cls; e.op = (uint8_t)op; e.split = (uint8_t)split; e.cost = (uint8_t)curCost;
    s->idx[cls] = (int32_t)I.E.size();
    I.E.push_back(e);
    if (I.i == 0 && I.j == 4 && v.d == 1 && v.n >= 1 && v.n <= 100) {
        int t = (int)v.n;
        if (found[t] < 0) { found[t] = curCost; foundIdx[t] = (int32_t)I.E.size() - 1; nfound++; }
    }
}

static i128 SUBF[64]; static int SUBF_N;

static void level(Interval& I, int c) {
    curCost = c;
    I.lv.push_back(I.E.size()); // lv[c]
    int len = I.j - I.i;
    if (c == 0) {
        bool ok = len == 1 || D[I.i] != 0;
        if (ok) { i128 n = 0; for (int k = I.i; k < I.j; k++) n = n * 10 + D[k]; insert(I, Rat{n, 1}, PRIM, OP_LIT, 0, 0, -1, 0); }
        return;
    }
    if (c == 1 && OP_DEC) {
        for (int p = 1; p < len; p++) { // 小数点を p 桁目の後ろに
            if (p > 1 && D[I.i] == 0) continue;
            i128 n = 0, d = 1; for (int k = I.i; k < I.j; k++) n = n * 10 + D[k];
            for (int k = 0; k < len - p; k++) d *= 10;
            Rat r; if (mk(n, d, r)) insert(I, r, PRIM, OP_LIT, 0, 0, p, 0);
        }
    }
    // 二項演算
    for (int k = I.i + 1; k < I.j; k++) {
        Interval& L = IV[I.i][k]; Interval& R = IV[k][I.j];
        for (int cl = 0; cl <= c - 1; cl++) {
            int cr = c - 1 - cl;
            if ((int)L.lv.size() <= cl + 1 || (int)R.lv.size() <= cr + 1) continue;
            size_t l0 = L.lv[cl], l1 = L.lv[cl + 1], r0 = R.lv[cr], r1 = R.lv[cr + 1];
            for (size_t x = l0; x < l1; x++) {
                const Entry ea = L.E[x]; int ca = CTX[ea.cls];
                bool aneg = ea.cls == ADDn || ea.cls == NEGM;
                for (size_t y = r0; y < r1; y++) {
                    const Entry& eb = R.E[y]; int cb = CTX[eb.cls];
                    Rat o;
                    if (cb & C_RADD) { if (r_add(ea.v, eb.v, o, 1)) insert(I, o, aneg ? ADDn : ADD, OP_ADD, (int)x, (int)y, 0, k); }
                    if (cb & C_RSUB) { if (r_add(ea.v, eb.v, o, -1)) insert(I, o, aneg ? ADDn : ADD, OP_SUB, (int)x, (int)y, 0, k); }
                    if (ca & C_LMUL) {
                        if (cb & C_RMUL) { if (r_mul(ea.v, eb.v, o)) insert(I, o, ea.cls == NEGM ? NEGM : MUL, OP_MUL, (int)x, (int)y, 0, k); }
                        if (cb & C_RDIV) { if (r_div(ea.v, eb.v, o)) insert(I, o, ea.cls == NEGM ? NEGM : MUL, OP_DIV, (int)x, (int)y, 0, k); }
                    }
                    if (OP_POWOK && (ca & C_BASE) && (cb & C_EXP) && eb.v.d == 1) { if (r_pow(ea.v, eb.v, o)) insert(I, o, POW, OP_POW, (int)x, (int)y, 0, k); }
                }
            }
        }
    }
    // 単項演算（同じ区間の記号数 c-1 から）
    size_t p0 = I.lv[c - 1], p1 = I.lv[c];
    for (size_t x = p0; x < p1; x++) {
        Entry e = I.E[x]; // insert で E が伸びるので写す
        int ce = CTX[e.cls];
        if (e.cls != PRIM) { insert(I, e.v, PRIM, OP_PAREN, (int)x, 0, 0, 0); }
        if (OP_NEGOK && (ce & C_UMIN)) { insert(I, Rat{-e.v.n, e.v.d}, NEGM, OP_NEG, (int)x, 0, 0, 0); }
        if (ce & C_UNOP) {
            // √
            i128 a, b;
            if (OP_SQRTOK && e.v.n >= 0 && isqrt_exact(e.v.n, a) && isqrt_exact(e.v.d, b)) insert(I, Rat{a, b}, U, OP_SQRT, (int)x, 0, 0, 0);
            if (e.v.d == 1 && e.v.n >= 0) {
                i128 n = e.v.n;
                if (OP_SUBFOK && n < SUBF_N) insert(I, Rat{SUBF[n], 1}, SUBF_CLS, OP_SUBF, (int)x, 0, 0, 0);
                if (!OP_FACT1) {}
                else if (n <= 1) insert(I, Rat{1, 1}, U, OP_FACT, (int)x, 0, 1, 0);
                else if (n <= FACT_MAX) {
                    for (int N = 1; N <= (OP_FACTN ? n - 2 : (n >= 3 ? 1 : 0)); N++) {
                        i128 p = 1; bool ok = true;
                        for (i128 m = n; m > 0; m -= N) { if (__builtin_mul_overflow(p, m, &p) || p > NMAX) { ok = false; break; } }
                        if (ok) insert(I, Rat{p, 1}, U, OP_FACT, (int)x, 0, N, 0);
                    }
                }
            }
        }
    }
}

// ---- 式を文字にする ----
static const char* MINUS = "\xE2\x88\x92"; // U+2212
static std::string i128s(i128 x) { if (x == 0) return "0"; bool ng = x < 0; u128 u = uabs(x); std::string s; while (u) { s += char('0' + (int)(u % 10)); u /= 10; } if (ng) s += '-'; return std::string(s.rbegin(), s.rend()); }
static std::string show(int i, int j, int idx) {
    Interval& I = IV[i][j]; const Entry& e = I.E[idx];
    switch (e.op) {
    case OP_LIT: { std::string s; for (int k = i; k < j; k++) { if (e.aux >= 0 && k - i == e.aux) s += '.'; s += char('0' + D[k]); } return s; }
    case OP_ADD: return show(i, e.split, e.a) + "+" + show(e.split, j, e.b);
    case OP_SUB: return show(i, e.split, e.a) + MINUS + show(e.split, j, e.b);
    case OP_MUL: return show(i, e.split, e.a) + "\xC3\x97" + show(e.split, j, e.b);
    case OP_DIV: return show(i, e.split, e.a) + "\xC3\xB7" + show(e.split, j, e.b);
    case OP_POW: return show(i, e.split, e.a) + "^" + show(e.split, j, e.b);
    case OP_NEG: return std::string(MINUS) + show(i, j, e.a);
    case OP_PAREN: return "(" + show(i, j, e.a) + ")";
    case OP_SQRT: return "\xE2\x88\x9A" + show(i, j, e.a);
    case OP_SUBF: return "!" + show(i, j, e.a);
    case OP_FACT: {
        std::string s = show(i, j, e.a);
        if (e.aux <= 3) return s + std::string(e.aux, '!');
        return s + "!{" + std::to_string(e.aux) + "}";
    }
    }
    return "?";
}

static double solve(int s, std::string& out, size_t& maxEntries) {
    auto t0 = std::chrono::steady_clock::now();
    D[0] = s / 1000; D[1] = s / 100 % 10; D[2] = s / 10 % 10; D[3] = s % 10;
    for (int i = 0; i < 4; i++) for (int j = i + 1; j <= 4; j++) { Interval& I = IV[i][j]; I.i = i; I.j = j; I.E.clear(); I.E.shrink_to_fit(); I.lv.clear(); I.T.init(1 << 12); I.overflow = false; }
    for (int t = 0; t <= 100; t++) { found[t] = -1; foundIdx[t] = -1; }
    nfound = 0;
    bool over = false;
    for (int c = 0; c <= CMAX && nfound < 100; c++) {
        for (int len = 1; len <= 4; len++) for (int i = 0; i + len <= 4; i++) {
            Interval& I = IV[i][i + len];
            level(I, c);
            if (I.overflow) over = true;
        }
        if (over) break;
    }
    for (int i = 0; i < 4; i++) for (int j = i + 1; j <= 4; j++) IV[i][j].lv.push_back(IV[i][j].E.size());
    maxEntries = 0;
    for (int i = 0; i < 4; i++) for (int j = i + 1; j <= 4; j++) if (IV[i][j].E.size() > maxEntries) maxEntries = IV[i][j].E.size();
    char buf[64];
    out.clear();
    for (int t = 1; t <= 100; t++) {
        snprintf(buf, sizeof buf, "%04d\t%d\t%d\t", s, t, found[t] < 0 ? 255 : found[t]);
        out += buf;
        if (found[t] >= 0) out += show(0, 4, foundIdx[t]);
        out += "\n";
    }
    if (over) { snprintf(buf, sizeof buf, "#overflow %04d\n", s); out += buf; }
    return std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
}

int main(int argc, char** argv) {
    NMAX = 1; for (int k = 0; k < 36; k++) NMAX *= 10;
    DMAX = 1; for (int k = 0; k < 18; k++) DMAX *= 10;
    if (const char* op = getenv("OPSET")) {
        if (!strcmp(op, "basic")) { OP_DEC = OP_NEGOK = OP_POWOK = OP_SQRTOK = OP_FACT1 = OP_FACTN = OP_SUBFOK = false; }
        else if (!strcmp(op, "mid")) { OP_FACTN = OP_SUBFOK = false; }
        else if (*op && strcmp(op, "all")) { fprintf(stderr, "OPSET は basic / mid / all\n"); return 1; }
    }
    if (getenv("FACT_MAX")) FACT_MAX = atoi(getenv("FACT_MAX"));
    if (getenv("CMAX")) CMAX = atoi(getenv("CMAX"));
    if (getenv("SUBF_BASE")) SUBF_CLS = 5;
    if (getenv("LEVEL_CAP")) LEVEL_CAP = strtoull(getenv("LEVEL_CAP"), 0, 10);
    for (int k = 0; k < NCLS; k++) { DOMBY[k] = 0; for (int q = 0; q < NCLS; q++) if ((CTX[k] & CTX[q]) == CTX[k]) DOMBY[k] |= 1 << q; }
    // 部分階乗
    SUBF[0] = 1; SUBF[1] = 0; SUBF_N = 2;
    for (int n = 2; n < 64; n++) { i128 v; if (__builtin_mul_overflow((i128)(n - 1), SUBF[n - 1] + SUBF[n - 2], &v) || v > NMAX) break; SUBF[n] = v; SUBF_N = n + 1; }
    if (argc >= 3 && !strcmp(argv[1], "one")) {
        int s = atoi(argv[2]); std::string out; size_t me;
        double sec = solve(s, out, me);
        fputs(out.c_str(), stdout);
        fprintf(stderr, "time %.3f s, max entries %zu\n", sec, me);
        return 0;
    }
    if (argc >= 5 && !strcmp(argv[1], "run")) {
        int W = atoi(argv[2]), w = atoi(argv[3]); const char* fn = argv[4];
        std::set<int> done;
        if (FILE* f = fopen(fn, "r")) { char line[4096]; while (fgets(line, sizeof line, f)) { int x; if (sscanf(line, "#done %d", &x) == 1) done.insert(x); } fclose(f); }
        FILE* f = fopen(fn, "a");
        for (int s = w; s < 10000; s += W) {
            if (done.count(s)) continue;
            std::string out; size_t me;
            double sec = solve(s, out, me);
            char buf[128]; snprintf(buf, sizeof buf, "#done %04d %.3f %zu\n", s, sec, me);
            out += buf;
            fputs(out.c_str(), f); fflush(f);
        }
        fclose(f);
        return 0;
    }
    fprintf(stderr, "usage: minsym one <abcd> | minsym run <W> <w> <outfile>\n");
    return 1;
}
