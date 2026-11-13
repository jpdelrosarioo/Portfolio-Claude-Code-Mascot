// Text-to-speech for the AI chat, using the browser's built-in speech synthesis (Web Speech API).
// The voices are the pretrained neural voices that ship with the visitor's device/browser, so there is nothing to
// host, nothing to pay for, and the text is never sent anywhere. On by default; the visitor can switch it off in the chat.

const KEY = "voice";

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function isVoiceOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setVoiceOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  if (!on) stopSpeaking();
}

/* ---------- what gets read aloud ---------- */

/** Makes written text pleasant to hear: no markdown symbols, emoji or raw URLs. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](url) → label
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/[*_~>|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/([.!?])\s*\./g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Index just after the last finished sentence in `text` at or after `from` (a sentence is finished once whitespace follows its end). */
export function sentenceBoundary(text: string, from: number): number {
  let cut = from;
  const re = /[.!?\n](?=\s)/g;
  re.lastIndex = from;
  for (let m = re.exec(text); m; m = re.exec(text)) cut = m.index + 1;
  return cut;
}

// Long utterances get cut off by some browsers, so speech is queued a sentence or two at a time.
function chunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > 180) {
      out.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ---------- voice choice ---------- */

let chosen: SpeechSynthesisVoice | null = null;

// Prefer the most natural-sounding English voice the device offers.
function pickVoice(): SpeechSynthesisVoice | null {
  if (chosen) return chosen;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (!voices.length) return null;
  const rank = (v: SpeechSynthesisVoice) => {
    let s = 0;
    // Siri's voice is Apple's: a website can only use it where the visitor's device offers it (Safari on iPhone, iPad
    // and Mac list it). It is picked first whenever it is there.
    if (/siri/i.test(v.name)) s += 20;
    if (/premium|enhanced/i.test(v.name)) s += 4; // Apple's higher-quality downloadable voices
    if (/natural|neural/i.test(v.name)) s += 8; // Edge / Windows "Online (Natural)" voices
    if (/google/i.test(v.name)) s += 5;
    if (/samantha|ava|serena|aria|jenny|zira|daniel/i.test(v.name)) s += 3;
    if (v.lang.toLowerCase() === "en-us") s += 2;
    if (v.localService) s += 1;
    return s;
  };
  chosen = voices.reduce((best, v) => (rank(v) > rank(best) ? v : best), voices[0]);
  return chosen;
}

/* ---------- the speaking queue ---------- */

let pending = 0;
let generation = 0; // bumped on stop, so utterances cancelled earlier don't update the count
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeSpeaking(fn: () => void) {
  listeners.add(fn);
  if (speechSupported()) {
    // voices load asynchronously in some browsers
    window.speechSynthesis.addEventListener("voiceschanged", clearVoice);
  }
  return () => {
    listeners.delete(fn);
    if (speechSupported()) window.speechSynthesis.removeEventListener("voiceschanged", clearVoice);
  };
}
function clearVoice() {
  chosen = null;
}

export function isSpeaking(): boolean {
  return pending > 0;
}

/** What the voice is doing, so the words on screen can follow it. `fraction` (0–1) is how far through the text given to
 *  `speak` the voice is. "start": the first sound is playing. "word": a word was just spoken (only some voices report
 *  this). "chunk": a later part of a long text began or ended. "end": all of it was spoken. "error": it could not be
 *  spoken (for example the browser blocks speech before the visitor has clicked something). */
export type SpeechEvent = { type: "start" | "word" | "chunk" | "end" | "error"; fraction: number };

/** Adds text to the end of what is being said. Safe to call repeatedly while an answer streams in.
 *  `pitch` / `rate` change the character of the voice (the mascot speaks a little higher).
 *  `onSpeech` reports the voice's progress. */
export function speak(
  text: string,
  { pitch = 1, rate = 1.02, onSpeech }: { pitch?: number; rate?: number; onSpeech?: (e: SpeechEvent) => void } = {},
) {
  if (!speechSupported()) {
    onSpeech?.({ type: "error", fraction: 0 });
    return;
  }
  const clean = cleanForSpeech(text);
  if (!clean) return; // nothing to hear (only an emoji, say)
  const synth = window.speechSynthesis;
  const gen = generation;
  const parts = chunks(clean);
  const total = Math.max(1, parts.reduce((n, p) => n + p.length + 1, -1));
  let before = 0;
  parts.forEach((part, i) => {
    const from = before;
    before += part.length + 1;
    const lastPart = i === parts.length - 1;
    const u = new SpeechSynthesisUtterance(part);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-US";
    u.rate = rate;
    u.pitch = pitch;
    const live = () => gen === generation; // false once speech was stopped
    const done = () => {
      if (!live()) return;
      pending = Math.max(0, pending - 1);
      emit();
    };
    u.onstart = () => {
      if (live()) onSpeech?.({ type: i === 0 ? "start" : "chunk", fraction: from / total });
    };
    u.onboundary = (e) => {
      if (!live() || (e.name && e.name !== "word")) return;
      let stop = part.indexOf(" ", e.charIndex); // the end of the word being spoken
      if (stop < 0) stop = part.length;
      onSpeech?.({ type: "word", fraction: Math.min(1, (from + stop) / total) });
    };
    u.onend = () => {
      const was = live();
      done();
      if (was) onSpeech?.({ type: lastPart ? "end" : "chunk", fraction: Math.min(1, (from + part.length) / total) });
    };
    u.onerror = (e) => {
      const was = live();
      done();
      if (was && e.error !== "canceled" && e.error !== "interrupted") onSpeech?.({ type: "error", fraction: from / total });
    };
    pending++;
    synth.speak(u);
  });
  emit();
}

export function stopSpeaking() {
  if (!speechSupported()) return;
  generation++;
  pending = 0;
  window.speechSynthesis.cancel();
  emit();
}
