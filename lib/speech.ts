// Text-to-speech for the AI chat, using the browser's built-in speech synthesis (Web Speech API).
// The voices are the pretrained neural voices that ship with the visitor's device/browser, so there is nothing to
// host, nothing to pay for, and the text is never sent anywhere. On by default; the visitor can switch it off in the chat.

import { buildTimeline, levelAt, wordAt, type Timeline } from "./mouth";

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

/* ---------- the mouth ---------- */
// The sentence being spoken right now, with its timetable (see lib/mouth.ts): the mascot's mouth is drawn from it.
type Track = { part: string; tl: Timeline; rate: number; startAt: number; pausedAt: number; pausedMs: number; startedAt: number };
let current: Track | null = null;
let sylMs = 240; // how long a syllable takes at normal speed: corrected to the voice's real pace after every sentence

/** How open the mascot's mouth should be right now (0 closed, 1 wide), following the words the voice is saying. */
export function mouthLevel(): number {
  const c = current;
  if (!c || c.pausedAt) return 0; // between sentences, or held: closed
  const t = performance.now() - c.startAt;
  // the voice is still going after the timetable ran out (it speaks slower than expected): a quiet mumble until it stops
  if (t > c.tl.total) return 0.3 + 0.2 * Math.sin(t / 70);
  return levelAt(c.tl, t);
}

let lastQueued = ""; // the last text given to the voice, and when (see `speak`)
let lastQueuedAt = 0;
let source = ""; // who gave the voice its text last ("mascot", "chat"...)

/** Who is speaking: whoever asked the voice to say something last. The mascot only reacts to being talked over when it is
 *  the one speaking, not when the chat box is. */
export function speechSource(): string {
  return source;
}

let lastEventAt = 0; // when the voice last did anything (was given text, started, said a word, finished)
let held = false; // the voice is paused on purpose (see `pauseSpeaking`)

/** Is the voice speaking? If the browser has lost track of the queue (it can, after a pause and a cancel: the count says
 *  "speaking" but nothing is playing and no event will ever come), that is noticed, so the mascot does not wait forever
 *  for a voice that is not there and never listens again. */
export function isSpeaking(): boolean {
  if (pending > 0 && !held && speechSupported() && Date.now() - lastEventAt > 2000) {
    const s = window.speechSynthesis;
    if (!s.speaking && !s.pending) {
      generation++; // (whatever the browser still reports for these is stale)
      pending = 0;
      current = null;
      endedAt = Date.now();
    }
  }
  return pending > 0;
}

let endedAt = 0; // when the voice last went quiet
let said = ""; // the words most recently given to the voice, whoever asked (the mascot, the chat...)

/** What the voice has been saying lately. Anything listening through the microphone uses it to tell the voice's own
 *  words, coming back through the speakers, from a person talking. */
export function recentSpeech(): string {
  return said;
}

/** Milliseconds since the voice stopped (0 while it is speaking). Its last words can still be coming back through a
 *  microphone for a moment after it stops. */
export function msSinceSpeech(): number {
  return isSpeaking() ? 0 : Date.now() - endedAt;
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
  { pitch = 1, rate = 1.02, onSpeech, from = "" }: { pitch?: number; rate?: number; onSpeech?: (e: SpeechEvent) => void; from?: string } = {},
) {
  if (!speechSupported()) {
    onSpeech?.({ type: "error", fraction: 0 });
    return;
  }
  const clean = cleanForSpeech(text);
  if (!clean) return; // nothing to hear (only an emoji, say)
  // the very same sentence given to the voice twice in a row, while it is still talking, is a repeat by mistake
  if (pending > 0 && clean === lastQueued && Date.now() - lastQueuedAt < 1500) return;
  lastQueued = clean;
  lastQueuedAt = Date.now();
  source = from;
  if (pending === 0 && Date.now() - endedAt > 10000) said = ""; // a new speech: forget the last one
  said = `${said} ${clean}`.slice(-2000);
  const synth = window.speechSynthesis;
  if (!held && synth.paused) synth.resume(); // (a voice left paused by accident would swallow this)
  lastEventAt = Date.now();
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
      lastEventAt = Date.now();
      if (!live()) return;
      pending = Math.max(0, pending - 1);
      if (pending === 0) endedAt = Date.now();
      emit();
    };
    // the mouth: this sentence's timetable, started when its first sound plays
    let track: Track | null = null;
    const endTrack = (finished: boolean) => {
      if (!track) return;
      if (current === track) {
        current = null; // (the mouth closes the moment the voice stops, whatever the timetable says)
        // Learn the voice's real pace: if the sentence took longer than the timetable said, a syllable takes longer
        const real = performance.now() - track.startedAt - track.pausedMs;
        if (finished && track.tl.total > 600 && real > 400) {
          sylMs = Math.min(480, Math.max(120, sylMs * (0.5 + 0.5 * (real / track.tl.total))));
        }
      }
      track = null;
    };
    u.onstart = () => {
      lastEventAt = Date.now();
      if (!live()) return;
      const now = performance.now();
      track = { part, tl: buildTimeline(part, sylMs / rate), rate, startAt: now, pausedAt: 0, pausedMs: 0, startedAt: now };
      current = track;
      onSpeech?.({ type: i === 0 ? "start" : "chunk", fraction: from / total });
    };
    u.onboundary = (e) => {
      lastEventAt = Date.now();
      if (!live() || (e.name && e.name !== "word")) return;
      // The voice says which word it is on: line the mouth up with it right now (this is what keeps it in step with the voice)
      if (track && current === track && !track.pausedAt) {
        const w = wordAt(track.tl, e.charIndex);
        if (w >= 0) track.startAt = performance.now() - track.tl.words[w].t0;
      }
      let stop = part.indexOf(" ", e.charIndex); // the end of the word being spoken
      if (stop < 0) stop = part.length;
      onSpeech?.({ type: "word", fraction: Math.min(1, (from + stop) / total) });
    };
    u.onend = () => {
      const was = live();
      endTrack(was);
      done();
      if (was) onSpeech?.({ type: lastPart ? "end" : "chunk", fraction: Math.min(1, (from + part.length) / total) });
    };
    u.onerror = (e) => {
      const was = live();
      endTrack(false);
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
  const synth = window.speechSynthesis;
  // (Cancelling a voice that is idle does nothing useful, and in some browsers the sentence given to it right afterwards is dropped.)
  const active = pending > 0 || synth.speaking || synth.pending || synth.paused;
  generation++;
  pending = 0;
  held = false;
  current = null; // (the mouth closes at once)
  endedAt = Date.now();
  lastEventAt = Date.now();
  if (active) {
    synth.cancel();
    synth.resume(); // (a cancelled voice that was paused would otherwise stay silent for the next thing it says)
  }
  emit();
}

/** Holds the voice mid-word, so that it can go on from the same place (see `resumeSpeaking`). The words on screen follow
 *  the voice, so they wait too. */
export function pauseSpeaking() {
  // (also between two sentences: the next one is then held too, and goes on with `resumeSpeaking`)
  if (!speechSupported()) return;
  held = true;
  if (current && !current.pausedAt) current.pausedAt = performance.now(); // (the mouth stops with the voice)
  window.speechSynthesis.pause();
}

export function resumeSpeaking() {
  held = false;
  lastEventAt = Date.now();
  if (current?.pausedAt) {
    // (the time it was held does not count: the mouth goes on from the same word)
    const gone = performance.now() - current.pausedAt;
    current.startAt += gone;
    current.pausedMs += gone;
    current.pausedAt = 0;
  }
  if (speechSupported()) window.speechSynthesis.resume();
}
