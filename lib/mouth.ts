// The mascot's mouth follows what the voice says. The browser's voice gives no sound to measure, so the mouth is driven
// by the words themselves: when each syllable is spoken is worked out from the text (a syllable takes about a quarter of
// a second, a comma a short breath, a full stop a longer one), and the mouth opens and closes with each syllable, wide for
// "a" and "o", narrow for "e" and "i". That timetable is lined up with the voice again at every word the browser reports,
// and corrected to the voice's real pace after every sentence (see lib/speech.ts), so it keeps in step instead of drifting.

const OPENING: Record<string, number> = { a: 1, o: 0.95, u: 0.7, e: 0.6, i: 0.5, y: 0.5 };
const GAP = 35; // ms between two words
const BREATH: [RegExp, number][] = [
  [/[.!?…]/, 330],
  [/[;:—–]/, 190],
  [/,/, 130],
];

/** One entry per syllable of the word: how wide the mouth opens for it (0 to 1). */
export function syllableOpenings(word: string): number[] {
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return Array.from({ length: Math.min(6, Math.ceil(w.length * 1.2)) }, () => 0.8); // numbers: a few syllables
  const groups = [...w.matchAll(/[aeiouy]+/g)].map((m) => m[0]);
  // a silent final "e" ("make", "time") is not a syllable of its own
  if (groups.length > 1 && /[^aeiouyl]e$/.test(w) && groups[groups.length - 1] === "e") groups.pop();
  if (!groups.length) return [0.4]; // "hmm", "mm": no vowel, a closed hum
  return groups.map((g) => OPENING[g[0]] ?? 0.6);
}

export type Word = { from: number; to: number; t0: number; t1: number; open: number[] };
/** When each word of a text is spoken, in milliseconds from its start. */
export type Timeline = { words: Word[]; total: number };

/** The timetable of `text` if a syllable takes `sylMs`. */
export function buildTimeline(text: string, sylMs: number): Timeline {
  const words: Word[] = [];
  let t = 0;
  for (const m of text.matchAll(/[\p{L}\p{N}']+|[,;:.!?…—–]+/gu)) {
    const tok = m[0];
    const at = m.index ?? 0;
    if (/^[\p{L}\p{N}']+$/u.test(tok)) {
      const open = syllableOpenings(tok);
      const dur = open.length * sylMs;
      words.push({ from: at, to: at + tok.length, t0: t, t1: t + dur, open });
      t += dur + GAP;
    } else t += BREATH.find(([re]) => re.test(tok))?.[1] ?? 0;
  }
  return { words, total: t };
}

/** How open the mouth is `t` ms into the text (0 = closed, 1 = wide): open in the middle of each syllable, closed between. */
export function levelAt(tl: Timeline, t: number): number {
  if (t < 0) return 0;
  let lo = 0;
  let hi = tl.words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = tl.words[mid];
    if (t < w.t0) hi = mid - 1;
    else if (t >= w.t1) lo = mid + 1;
    else {
      const n = w.open.length;
      const per = (w.t1 - w.t0) / n;
      const k = Math.min(n - 1, Math.floor((t - w.t0) / per));
      const phase = (t - w.t0 - k * per) / per;
      return w.open[k] * Math.sin(Math.PI * phase) ** 0.6;
    }
  }
  return 0; // between words, or in a pause
}

/** Which word is being spoken when the voice reports character `charIndex` (the next one, if it points at a space). -1: none. */
export function wordAt(tl: Timeline, charIndex: number): number {
  let lo = 0;
  let hi = tl.words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (tl.words[mid].from <= charIndex) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return tl.words.length ? 0 : -1;
  if (charIndex >= tl.words[found].to && found + 1 < tl.words.length) return found + 1;
  return found;
}
