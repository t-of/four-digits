# SHORT MATH — 4つの数字で1〜100を最短の式で

4つの数字を並んだ順のまま使い、1〜100を作るテンパズル。記号が少ないほど星が増える。

## 🔗 リンク

- 遊ぶ: https://t-of.github.io/four-digits/
- 制作: [T.OF...](https://t-of.github.io/)

## 遊び方

- 4 つの数字を、並んだ順のまま全部使って目標の数を作る（`2027` で `47` → `20+27`）。
- 数字は最初から並んでいる。式をタップするか ◀ ▶ で場所を選び、記号を差し込む。何も入れなければ数字はつながる。
- 使える記号: `+ − × ÷ ( ) ^ √ .`、階乗 `!`・N 重階乗 `!⁽ᴺ⁾`、数の前の `!` は部分階乗。細かい決まりは `solver/SPEC.md`。
- 記号が少ないほど ★ が増える。いちばん短い式で ★★★。
- 遊び方は 3 つ: おまかせ（腕前に合わせて次の 1 問）、今日の 1 問（全員同じ）、フリー（4 桁を選んで 1〜100 を埋める）。解いた式は図鑑に残る。
- PC ではキーボードでも打てる（`+ - * / ^ ( ) . !`、`r` で √、`n` で N 重階乗、← →、Backspace、Enter）。

## アプリとして入れる（PWA）

- iPhone / iPad: Safari で開き、共有 → 「ホーム画面に追加」
- Android / PC の Chrome・Edge: 画面の「アプリにする」ボタン、またはアドレスバーのインストールボタン

## 開発

ビルド不要。フォルダをそのまま静的サーバで開く。

```sh
python3 -m http.server 8000   # → http://localhost:8000/
```

## 書体

数字とラテン文字は [Jost](https://github.com/indestructible-type/Jost)（SIL Open Font License 1.1、`fonts/OFL.txt`）。`fonts/jost.woff2` は wght 400–800 の可変フォントを、ラテン・数字・使う記号だけに絞ったもの。日本語はシステムフォント。

ショップで売る数字の書体（どれも 0〜9 と「.」だけに絞った woff2、各 1〜3 KB。数字の板と目標の数字にだけ使う）。
- `fonts/seg.woff2`: [DSEG7 Classic](https://github.com/keshikan/DSEG) Regular（OFL 1.1、`fonts/OFL-DSEG.txt`）。電卓の 7 セグメント。太さは 1 種類のみ。
- `fonts/mono.woff2`: [IBM Plex Mono](https://github.com/IBM/plex) Medium 500（OFL 1.1、`fonts/OFL-IBMPlexMono.txt`）。活字の等幅。JetBrains Mono より字面が活字らしく、板の数字に合う。
- `fonts/serif.woff2`: [Playfair Display](https://github.com/clauseggers/Playfair) の可変フォントを wght 600 に固定（OFL 1.1、`fonts/OFL-PlayfairDisplay.txt`）。銅版のセリフ。既定がオールドスタイル数字なので、`font-feature-settings: "lnum"`（ライニング）で使う。EB Garamond より 2 と 7 の太細の差がはっきりして読みやすい。
