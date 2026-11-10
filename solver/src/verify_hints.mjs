// data/expr/*.txt.gz を読み直し、全 100 万本をゲームの analyze で照合する（値が目標・数字が 4 桁どおり・記号数が m と一致）。
// 使い方: node solver/src/verify_hints.mjs   （m は results/examples.tsv.gz か results/min.bin から）
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { analyze, isTarget } from '../../src/expr.js';
const root = new URL('../../', import.meta.url).pathname;
const ex = gunzipSync(readFileSync(root + 'solver/results/examples.tsv.gz')).toString('utf8').split('\n');
const mOf = new Map();
for (const l of ex) { if (!l) continue; const [s, t, m] = l.split('\t'); mOf.set(s + ':' + t, +m); }
let n = 0, bad = 0;
for (let h = 0; h < 100; h++) {
  const lines = gunzipSync(readFileSync(root + `data/expr/${String(h).padStart(2, '0')}.txt.gz`)).toString('utf8').split('\n');
  if (lines.pop() !== '' || lines.length !== 10000) { console.log('行数が違う', h, lines.length); process.exit(1); }
  for (let j = 0; j < 10000; j++) {
    const digits = String(h).padStart(2, '0') + String(Math.floor(j / 100)).padStart(2, '0');
    const t = (j % 100) + 1, m = mOf.get(digits + ':' + t);
    const r = analyze(lines[j], digits);
    n++;
    if (r.status !== 'ok' || !r.complete || !isTarget(r.value, t) || r.symbols !== m) {
      console.log('不一致', digits, t, m, lines[j], r.status, r.symbols); if (++bad >= 10) process.exit(1);
    }
  }
}
console.log(n, '本を照合、不一致', bad);
process.exit(bad ? 1 : 0);
