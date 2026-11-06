// 効果音（Web Audio で作る。音声ファイルなし）。
// 方針: 入力は短く乾いた「カチッ」、結果は澄んだ鐘の音。どれも小さめで、考える邪魔をしない。

let ctx = null;
let on = true;

// iPhone のマナーモードでも鳴らす（Safari 16.4 以降）。
// 'playback' にすると音楽アプリの曲が止まるので、アプリの音がオンのときだけにする。
function setAudioSession(soundOn) {
  try { if (navigator.audioSession) navigator.audioSession.type = soundOn ? 'playback' : 'auto'; } catch { /* 対応していない */ }
}

function ac() {
  if (!on) return null;
  try {
    if (!ctx) {
      setAudioSession(true);
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

export function setSound(v) {
  on = v;
  setAudioSession(v);
  if (!v && ctx) { try { ctx.suspend(); } catch { /* なし */ } }
}

// 1 音。f: 周波数、d: 長さ（秒）
function tone(f, d, { type = 'sine', gain = 0.06, at = 0, to = null, attack = 0.004 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + d);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + d + 0.02);
}

// 鐘のような音（基音＋少しずらした倍音）
function bell(f, at = 0, gain = 0.07) {
  tone(f, 0.9, { type: 'sine', gain, at, attack: 0.003 });
  tone(f * 2.01, 0.5, { type: 'sine', gain: gain * 0.35, at });
  tone(f * 3.98, 0.25, { type: 'sine', gain: gain * 0.12, at });
}

export const sfx = {
  // 記号を入れた
  key() { tone(1250, 0.045, { type: 'triangle', gain: 0.045 }); },
  // カーソルを動かした
  move() { tone(820, 0.035, { type: 'sine', gain: 0.03 }); },
  // 消した
  del() { tone(520, 0.06, { type: 'triangle', gain: 0.04, to: 380 }); },
  // 押せない・入らない
  nope() { tone(170, 0.09, { type: 'square', gain: 0.018 }); },
  // 画面を開く・選ぶ
  tap() { tone(980, 0.04, { type: 'sine', gain: 0.035 }); },
  // 目標に届いた瞬間
  hit() { bell(784, 0, 0.05); bell(1175, 0.06, 0.04); },
  // 星 1 つ（i = 0,1,2 で音が上がる）
  star(i) { bell([1047, 1319, 1568][i] || 1568, 0, 0.06); },
  // 星の空き
  empty() { tone(330, 0.12, { type: 'sine', gain: 0.03 }); },
  // 最小を更新
  record() { [1568, 1976, 2349, 3136].forEach((f, i) => bell(f, i * 0.07, 0.035)); },
};

// 最初に触ったときに AudioContext を起こしておく（触る前の音はブラウザが止める）
export function unlockOnFirstTouch() {
  const h = () => { ac(); window.removeEventListener('pointerdown', h); window.removeEventListener('keydown', h); };
  window.addEventListener('pointerdown', h, { once: false });
  window.addEventListener('keydown', h, { once: false });
}
