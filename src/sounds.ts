let ctx: AudioContext | null = null;
let muted = localStorage.getItem("nd_muted") === "1";

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.15) {
  const c = getCtx();
  if (!c) return;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration);
  } catch {
    /* ignore */
  }
}

export function soundPick() {
  tone(660, 0.1, "sine", 0.12);
}

export function soundCollision() {
  tone(140, 0.35, "sawtooth", 0.18);
  setTimeout(() => tone(90, 0.35, "sawtooth", 0.18), 90);
}

export function soundWin() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.2, "triangle", 0.16), i * 110));
}

export function soundLose() {
  const notes = [400, 330, 260];
  notes.forEach((f, i) => setTimeout(() => tone(f, 0.28, "sine", 0.14), i * 150));
}

export function isMuted() {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  localStorage.setItem("nd_muted", muted ? "1" : "0");
  return muted;
}
