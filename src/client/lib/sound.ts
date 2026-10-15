let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = localStorage.getItem("evade:muted") === "1";
} catch {}

/** Tarayıcılar sesi ilk dokunuştan sonra açar. */
export function unlockAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  } catch {
    ctx = null;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("evade:muted", m ? "1" : "0");
  } catch {}
}

function tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.08, slide = 0) {
  if (muted || !ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  tick: () => tone(660, 0.09, "square", 0.05),
  go: () => {
    tone(1320, 0.12, "square", 0.06);
    setTimeout(() => tone(1760, 0.22, "square", 0.06), 90);
  },
  tag: () => {
    tone(220, 0.18, "sawtooth", 0.09, -120);
    setTimeout(() => tone(140, 0.3, "sawtooth", 0.07, -60), 120);
  },
  evade: () => {
    tone(880, 0.1, "triangle", 0.08);
    setTimeout(() => tone(1175, 0.1, "triangle", 0.08), 100);
    setTimeout(() => tone(1568, 0.2, "triangle", 0.08), 200);
  },
  dash: () => tone(420, 0.12, "triangle", 0.04, 300),
  vault: () => tone(300, 0.18, "sine", 0.06, 500),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.08), i * 120)),
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
