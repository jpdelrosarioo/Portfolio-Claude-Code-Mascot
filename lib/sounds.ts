// Tiny UI sound effects, synthesised with the Web Audio API (no audio files).
// Off by default; the visitor turns them on with the speaker button.

export type SoundName = "tick" | "open" | "close" | "chime" | "success";

const KEY = "sound";
let ctx: AudioContext | null = null;

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event("sound-change"));
  if (on) play("chime", true);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, peak: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t = ac.currentTime + at;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// [frequency Hz, start s, duration s, volume]
const PATTERNS: Record<SoundName, [number, number, number, number][]> = {
  tick: [[1320, 0, 0.05, 0.035]],
  open: [[660, 0, 0.12, 0.05], [990, 0.06, 0.16, 0.045]],
  close: [[880, 0, 0.1, 0.045], [587, 0.05, 0.14, 0.04]],
  chime: [[1046.5, 0, 0.22, 0.07], [1568, 0.09, 0.26, 0.06]],
  success: [[784, 0, 0.14, 0.06], [988, 0.1, 0.14, 0.06], [1319, 0.2, 0.28, 0.06]],
};

export function play(name: SoundName, force = false) {
  if (!force && !isSoundOn()) return;
  const ac = audio();
  if (!ac) return;
  for (const [freq, at, dur, peak] of PATTERNS[name]) tone(ac, freq, at, dur, peak);
}
