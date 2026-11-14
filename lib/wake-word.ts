// "Hey Claude Code": a hands-free wake phrase for the mascot, plus the pause that decides when the visitor has finished
// talking. No React in here, so it can be tested on its own (see use-wake-word.ts for the hook).
//
// How it works (and its limits). There is no custom keyword-spotting model: the browser's speech recognition (Web Speech
// API) listens continuously and this file looks for the phrase in what it hears. That is accurate enough for a portfolio
// and needs nothing to host, but in Chrome and Edge the audio is sent to the browser's speech service for as long as the
// listener is on. So the visitor can switch it off (and the browser asks before the microphone is used at all), it only
// listens while the tab is visible, and the page shows when the microphone is live. Two phases:
//   wake    — listening for the phrase; everything else that is said is ignored (and never stored or sent anywhere)
//   command — the phrase was heard; what comes next is the message. When the visitor stops talking for `pauseMs`, the
//             message is final and handed over (this is the "pause time" setting).

import type { Recognition, RecognitionClass, RecognitionResult } from "./recognition";

/* ---------- finding the phrase in what was heard ---------- */

// Words the recogniser often writes instead of what was said. Short words are matched from this list only, because a
// spelling tolerance would let ordinary words in; long words also tolerate a letter or two.
const ALIASES: Record<string, string[]> = {
  hey: ["hey", "hay", "hei", "hi"],
  claude: ["claude", "clod", "cloud", "claud", "clawed", "clawd", "cloude", "clode", "klaud", "klod"],
  code: ["code", "coat", "kode", "coed", "cod", "codes", "coded"],
};

const wordsOf = (text: string) => [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ w: m[0].toLowerCase(), end: (m.index ?? 0) + m[0].length }));

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

const forms = (target: string) => ALIASES[target] ?? [target];

function sameWord(target: string, heard: string): boolean {
  if (target === heard) return true;
  if (ALIASES[target]) return ALIASES[target].includes(heard);
  const limit = target.length >= 6 ? 2 : target.length >= 4 ? 1 : 0;
  return limit > 0 && distance(target, heard) <= limit;
}

/** The words of a phrase ("Hey Claude Code" → ["hey", "claude", "code"]), ready for `matchWake`. */
export function compilePhrase(phrase: string): string[] {
  const t = wordsOf(phrase).map((x) => x.w);
  return t.length ? t : ["hey", "claude", "code"];
}

/**
 * Is the phrase in `text`? Returns where it ends (so the words after it can be taken as the message), or null. It
 * tolerates the usual mishearings ("hey cloud code") and two words run together ("hey claudecode"), but needs every
 * word: "Claude Code is great" or "write a Claude Code plugin" do not wake it.
 */
export function matchWake(text: string, target: string[]): { end: number } | null {
  const spoken = wordsOf(text);
  for (let s = 0; s < spoken.length; s++) {
    let q = s;
    let j = 0;
    while (j < target.length && q < spoken.length) {
      if (sameWord(target[j], spoken[q].w)) {
        j++;
        q++;
      } else if (j + 1 < target.length && forms(target[j]).some((a) => forms(target[j + 1]).some((b) => a + b === spoken[q].w))) {
        j += 2;
        q++;
      } else break;
    }
    if (j === target.length) return { end: spoken[q - 1].end };
  }
  return null;
}

/** "bye", "goodbye", "ok thanks, bye", "that's all", "stop listening": the visitor is ending the conversation. */
const GOODBYE =
  /^(?:(?:ok(?:ay)?|alright|well|so|thanks?(?: you)?|thank you)[, ]+)*(?:good ?bye|bye(?: bye)?|see you(?: later)?|stop(?: listening)?|that'?s all|that is all|never ?mind|i'?m done)(?:[, ]+(?:thanks?(?: you)?|thank you|claude(?: code)?|mascot))?$/;
export const isGoodbye = (text: string) => GOODBYE.test(text.toLowerCase().replace(/[^a-z' ]+/g, " ").replace(/\s+/g, " ").trim());

/* ---------- telling the visitor's voice from the mascot's own ---------- */
// While the mascot talks, the microphone also hears it (through the speakers). The listener knows what the voice is
// saying, so words that match it are echo. Recognisers often write an echoed word slightly differently ("faithfulness"
// → "faith fullness"), so words are compared loosely: nearly the same spelling, or the same sound.

/** A recogniser that has said nothing for this long while the mascot was talking and someone talked over it is deaf. */
const DEAF_MS = 1500;

/** Once the recogniser has marked what was said as final, how much longer to wait before taking it as the whole message. */
const FINAL_PAUSE_MS = 600;
const FINAL_PAUSE_DANGLING_MS = 1400; // (when the sentence stops in the middle)
/** A sentence that ends in one of these has not ended. */
const DANGLING = new Set(
  ("and but so because or the a an to of in on at my your is are was were with that which if when then about for like as from by " +
    "what how why who also um uh").split(" "),
);

/* ---------- "continue" ---------- */
// After the mascot was interrupted, "continue" / "go on" / "carry on what you were saying" lets it go on from the same place.
const CONTINUE = /\b(continue|go on|carry on|keep going|keep talking|keep reading|resume|go ahead|proceed|finish)\b/;
const NOT_CONTINUE = /\b(don t|dont|do not|not|never|no)\s+(continue|go on|carry on|keep going|resume|proceed|finish)\b/;
// A request to continue is only that: every word is one of these. ("I want to continue my studies" is not one.)
const CONTINUE_WORDS = new Set(
  ("please ok okay yes yeah now just you were was are saying what that it on the previous last one message answer again thanks thank " +
    "go continue carry keep going talking reading resume ahead proceed with your from where left off stopped i said can could would " +
    "will we let s us to finish so then and a hey claude code mascot before earlier doing about telling me tell more rest of story " +
    "verse sentence").split(" "),
);
export function isContinue(text: string): boolean {
  const words = wordsOf(text).map((x) => x.w);
  if (!words.length || words.length > 10) return false;
  const joined = words.join(" ");
  return CONTINUE.test(joined) && !NOT_CONTINUE.test(joined) && words.every((w) => CONTINUE_WORDS.has(w));
}

/** A rough "how it sounds" key: words that sound alike ("claude", "cloud", "clawed") get the same key. */
function soundKey(word: string): string {
  const s = word
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/[cq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/^wr/, "r")
    .replace(/^kn/, "n")
    .replace(/h/g, "");
  if (!s) return word;
  return (s[0] + s.slice(1).replace(/[aeiouy]/g, "")).replace(/(.)\1+/g, "$1");
}

/** Are these two written words (probably) the same spoken word? Short words must match exactly: a loose match on "wait" and "want" would hide a real "wait". */
function looseSame(a: string, b: string): boolean {
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  if (shortest >= 6 && distance(a, b) <= (shortest >= 9 ? 2 : 1)) return true;
  return shortest >= 5 && soundKey(a) === soundKey(b);
}

/** Takes out of `text` every run of 3 or more words that the voice said (its own sound coming back through the microphone). */
export function stripEcho(text: string, echo: string): { text: string; removed: number } {
  const said = wordsOf(echo).map((x) => x.w);
  const heard = [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ raw: m[0], w: m[0].toLowerCase() }));
  const kept: string[] = [];
  let removed = 0;
  for (let i = 0; i < heard.length; ) {
    let best = 0;
    for (let j = 0; j < said.length; j++) {
      let n = 0;
      while (i + n < heard.length && j + n < said.length && looseSame(heard[i + n].w, said[j + n])) n++;
      if (n > best) best = n;
    }
    if (best >= 3) {
      i += best;
      removed += best;
    } else kept.push(heard[i++].raw);
  }
  return { text: kept.join(" "), removed };
}

/** Is this one word part of what the voice has been saying? */
function isEchoWord(word: string, echo: string[]): boolean {
  return echo.some((e) => looseSame(word, e) || (word.length >= 5 && e.length >= 5 && (e.includes(word) || word.includes(e))));
}

/** A place in the recogniser's results: which result, and what it said so far. */
type Mark = { i: number; t: string };
const START: Mark = { i: -1, t: "" };

/**
 * What `now` says beyond `before` (the same result, earlier). While a sentence is still being said the recogniser often
 * rewrites its guess ("cloud" becomes "claude"), so the text is not simply longer: counting characters would clip the first
 * letters of what came next. Words are compared instead, and if the guess was changed too much to tell, nothing before the
 * end of what was there is taken for new.
 */
export function since(before: string, now: string): string {
  if (!before) return now;
  if (now.startsWith(before)) return now.slice(before.length);
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const a = before.split(/\s+/).map(norm).filter(Boolean);
  const raw = now.split(/\s+/).filter((w) => norm(w));
  let i = 0;
  while (i < a.length && i < raw.length && norm(raw[i]) === a[i]) i++;
  // All of it is still there, only written differently (capital letters, punctuation): what follows is new. If just most of it
  // is, the last word was probably rewritten: it stays, rather than risk losing a new word.
  if (i >= Math.ceil(a.length * 0.6)) return raw.slice(i === a.length ? i : Math.max(i, a.length - 1)).join(" ");
  // rewritten too much to tell: assume the same length, but never cut a word in half (a whole word that was already there is better than losing a new one)
  let cut = Math.min(before.length, now.length);
  while (cut > 0 && /\p{L}/u.test(now[cut - 1]) && /\p{L}/u.test(now[cut] ?? "")) cut--;
  return now.slice(cut);
}

/** Is `text` only the first part of the phrase ("hey", "hey claude"), so the rest of it is still on its way? */
export function isPhrasePrefix(text: string, target: string[]): boolean {
  const words = wordsOf(text).map((x) => x.w);
  return words.length > 0 && words.length < target.length && words.every((w, i) => sameWord(target[i], w));
}

const tidy = (text: string) => text.replace(/\s+/g, " ").replace(/^[\s,.!?;:\-–—]+/, "").trim();

/* ---------- the listener ---------- */

export type WakePhase = "off" | "paused" | "wake" | "command";

export type WakeOptions = {
  Rec: RecognitionClass;
  phrase: string;
  lang?: string;
  /** How long the visitor must be quiet before the message counts as finished. Read at each pause, so a changed setting applies from the next one. */
  pauseMs: () => number;
  /** After the phrase, how long to wait for the first word before giving up. */
  firstWordMs?: number;
  /** The longest a single message may take. */
  maxMs?: number;
  /** In a conversation, how long to wait for the next message after the mascot has answered before going back to waiting for the phrase. */
  followUpMs?: number;
  /** Nobody spoke during a conversation: it is over (say "Hey Claude Code" to start another). */
  onIdle?: () => void;
  /** Is the mascot talking right now (or did it stop a moment ago, so its voice may still be coming through the microphone)? */
  speaking?: () => boolean;
  /** What the mascot has been saying, so that its voice is not mistaken for the visitor's. */
  echoText?: () => string;
  /**
   * The visitor spoke over the mascot: hold its voice right away. From then on what they say is their message (`onHeard`
   * shows it, `onCommand` gets it), and the mascot answers it instead of what it was saying. Needs `speaking` and `meter`.
   */
  onPause?: () => void;
  /** It was only a noise (nobody said anything): the voice goes on from where it was. */
  onResume?: () => void;
  /** How long to wait for them to start speaking after they talked over the mascot, before deciding it was only a noise. */
  interruptListenMs?: number;
  /** After a noise, how long before the microphone getting louder can stop the mascot again. */
  interruptCooldownMs?: number;
  /**
   * How loud the microphone is. Talking over the mascot only counts when the microphone is also clearly LOUDER than it was
   * while the mascot spoke on its own, so the mascot's voice (or any other sound that is just the speakers) cannot
   * interrupt it, whatever the recogniser makes of it. Without a working meter, only the phrase can interrupt.
   */
  meter?: { ready(): boolean; level(): number };
  /** How long the microphone has to stay louder before the mascot's voice is paused (a click is not a person). */
  interruptHoldMs?: number;
  /** How many loudness measurements of the mascot talking on its own are needed before someone talking over it can be told apart (default 20, a second). */
  interruptLearnSamples?: number;
  /** Loudness measurements per second are 1000 / this (default 50 ms). */
  meterEveryMs?: number;
  onPhase?: (phase: WakePhase) => void;
  /** The phrase was heard. */
  onWake?: () => void;
  /** The message so far (changes while the visitor talks). */
  onHeard?: (text: string) => void;
  /** The visitor stopped talking: this is the whole message. */
  onCommand?: (text: string) => void;
  /** The phrase was heard but nothing followed. */
  onGiveUp?: () => void;
  /** Something is wrong with the microphone (null: it is fine again). */
  onProblem?: (message: string | null) => void;
  /** Listening stopped for good (the microphone is blocked or missing): the switch should go back to off. */
  onStopped?: (message: string) => void;
  problems?: Record<string, string>;
  fatal?: ReadonlySet<string>;
};

type Timer = ReturnType<typeof setTimeout>;

export function createWakeListener(o: WakeOptions) {
  const target = compilePhrase(o.phrase);
  const firstWordMs = o.firstWordMs ?? 7000;
  const maxMs = o.maxMs ?? 30000;
  const followUpMs = o.followUpMs ?? 8000;
  const interruptHoldMs = o.interruptHoldMs ?? 100;
  const interruptCooldownMs = o.interruptCooldownMs ?? 3000;
  const interruptListenMs = o.interruptListenMs ?? 4000;
  const meterEveryMs = o.meterEveryMs ?? 50;
  const LOUD_WINDOW = 5; // measurements that make up "now" (5 × 50 ms = a quarter of a second)
  const LOUD_NEEDED = o.interruptLearnSamples ?? 20; // measurements of the mascot talking on its own needed before anyone can be told apart from it (1 s)
  const problems = o.problems ?? {};
  const fatal = o.fatal ?? new Set<string>();

  let want = false; // the visitor switched it on
  let held = false; // the app needs the microphone for something else for a moment
  let hidden = false; // the tab is in the background
  let blocked = false; // held || hidden
  let rec: Recognition | null = null;
  let phase: "wake" | "command" = "wake";
  let results: ArrayLike<RecognitionResult> | null = null;
  // What was already dealt with: every result before `skip.i`, and what `skip.t` says of that one (the browser may keep
  // adding to the last result, so the next "Hey Claude Code" can arrive inside it)
  let skip: Mark = START;
  let wakeAt = -1; // the result where the message starts (-1: it continues in a fresh session)
  let wakeBase = ""; // what that result had already said before the message started
  let wakeWords = 3; // how many words the phrase was (where the message starts, if the recogniser rewrites the phrase)
  let cmdPhrase = true; // the message came after the phrase (false: a follow-up in a conversation, no phrase needed)
  let conversing = false; // a message was answered: the next one can follow without the phrase
  let echoFrozen = ""; // what the mascot had said when this message began: left out of it (a follow-up or an interruption)
  let loud: number[] = []; // the microphone's loudness while the mascot talks
  let loudTimer: Timer | undefined; // takes the measurements
  let evidenceSince = 0; // since when the microphone has been clearly louder than the mascot alone makes it
  let evBase: Mark = START; // where the results stood at that moment
  let voiceHeld = false; // someone talked over the mascot: its voice is held and the listener is taking down what they say
  let cooldownUntil = 0;
  let lastResultAt = 0; // when the recogniser last said anything (it going quiet while there is sound is how a deaf one shows)
  let carry = ""; // the message so far from sessions that have ended
  let lastText = "";
  let startedAt = 0;
  let heardAny = false;
  let fails = 0;
  let shown: WakePhase | null = null;
  let pause: Timer | undefined;
  let idle: Timer | undefined;
  let cap: Timer | undefined;
  let restart: Timer | undefined;

  const current = (): WakePhase => (!want ? "off" : blocked ? "paused" : phase);
  const emit = () => {
    const p = current();
    if (p === shown) return;
    shown = p;
    o.onPhase?.(p);
  };

  const clearCommandTimers = () => {
    clearTimeout(pause);
    clearTimeout(idle);
    clearTimeout(cap);
  };

  /** Back to waiting for the phrase; whatever was said so far is left behind. */
  const leaveCommand = () => {
    clearCommandTimers();
    phase = "wake";
    skip = endOf(results ?? []);
    wakeAt = -1;
    carry = "";
    lastText = "";
    emit();
  };

  const finish = () => {
    const text = lastText;
    const followUp = !cmdPhrase;
    const interrupted = voiceHeld;
    leaveCommand();
    if (interrupted) {
      voiceHeld = false;
      evidenceSince = 0;
      if (!text || isContinue(text) || looksLikeEcho(text)) {
        // nobody said anything (it was only a noise, or the mascot's own voice, caught again), or they said "continue": the
        // mascot goes on with what it was saying
        cooldownUntil = Date.now() + interruptCooldownMs;
        conversing = true;
        o.onResume?.();
        return;
      }
      // They said something: that is what the mascot answers now (the answer it was giving is dropped when this one
      // starts). The recogniser has been listening while the voice played and was held, and some browsers leave it deaf
      // after that: it gets a fresh start.
      skip = START;
      results = null;
      clearTimeout(restart);
      abortRec();
      restart = setTimeout(begin, 120);
    }
    if (text) {
      conversing = !isGoodbye(text); // after "bye" the mascot still answers, but does not listen for more
      o.onCommand?.(text);
    } else {
      conversing = false;
      if (followUp) o.onIdle?.();
      else o.onGiveUp?.();
    }
  };

  const commandText = (res: ArrayLike<RecognitionResult>) => {
    let rest = "";
    for (let k = Math.max(wakeAt, 0); k < res.length; k++) {
      const t = res[k][0].transcript;
      if (k === wakeAt) {
        const tt = since(wakeBase, t);
        if (cmdPhrase) {
          const m = matchWake(tt, target);
          if (m) rest += tt.slice(m.end);
          else {
            // the recogniser rewrote the phrase itself ("hey claude code" → "a clawed coat"): what follows it is still the message
            const w = wordsOf(tt);
            if (w.length >= wakeWords) rest += tt.slice(w[wakeWords - 1].end);
          }
        } else rest += tt; // a follow-up starts after what was heard before
      } else rest += ` ${t}`;
    }
    let text = tidy(`${carry} ${rest}`);
    if (cmdPhrase) return text;
    if (echoFrozen) {
      // the mascot's own voice, caught by the microphone, is not part of the message...
      const s = stripEcho(text, echoFrozen);
      text = tidy(s.text);
      // ...and if all that is left of a long echo is one echoed word, nobody said anything
      const left = wordsOf(text);
      if (s.removed >= 3 && left.length <= 1 && left.every((x) => isEchoWord(x.w, wordsOf(echoFrozen).map((e) => e.w)))) text = "";
    }
    // a follow-up that starts with the phrase anyway ("Hey Claude Code, and another one"): the phrase is not part of the message
    const m = matchWake(text, target);
    if (m && wordsOf(text.slice(0, m.end)).length <= target.length + 1) return tidy(text.slice(m.end));
    // ...nor is half of it, while it is still being said ("Hey Claude" before "Code" arrives)
    return isPhrasePrefix(text, target) ? "" : text;
  };

  /**
   * Is this message mostly the mascot's own words (heard through the speakers)? Then nobody said it: sending it would have
   * the mascot answer itself, and repeat what it just said.
   */
  const looksLikeEcho = (text: string) => {
    const heard = wordsOf(text).map((x) => x.w);
    const echo = wordsOf(echoFrozen || (o.echoText?.() ?? "")).map((x) => x.w);
    if (heard.length < 2 || !echo.length) return false;
    return heard.filter((w) => isEchoWord(w, echo)).length / heard.length >= 0.7;
  };

  /** Does the message stop in the middle of a sentence ("...and", "...the", "...because")? Then they are probably still thinking. */
  const dangling = (text: string) => {
    const last = wordsOf(text).at(-1)?.w;
    return !!last && DANGLING.has(last);
  };
  /** How long to wait after the last word: the pause, and twice that when the sentence is unfinished. */
  const waitFor = (text: string) => (dangling(text) ? o.pauseMs() * 2 : o.pauseMs());

  /** The message changed, or time passed: wait for the pause again. */
  const arm = () => {
    clearTimeout(pause);
    clearTimeout(idle);
    if (lastText) pause = setTimeout(finish, waitFor(lastText));
    else idle = setTimeout(finish, voiceHeld ? interruptListenMs : cmdPhrase ? firstWordMs : followUpMs);
  };

  const hear = (res: ArrayLike<RecognitionResult>) => {
    const text = commandText(res);
    if (text === lastText) return;
    lastText = text;
    o.onHeard?.(text);
    arm();
  };

  /* Talking over the mascot works like talking to a person: the moment someone speaks over it, the mascot stops and
   * listens, and then answers what they said.
   *   1. The microphone becomes clearly louder than it was while the mascot spoke on its own: someone is talking. The
   *      mascot's voice is held at once (onPause), in the middle of the word. Its own voice can never do this: it is only
   *      louder than itself when a person adds to it.
   *   2. From then on what they say is taken down as their message (no phrase needed). When they stop talking for the
   *      pause time it is sent (onCommand), and the mascot answers it instead of what it was saying. If they said nothing
   *      at all (it was only a noise), the mascot carries on where it was (onResume). */

  // The microphone's loudness, noted while the mascot talks (that is what the mascot's voice alone sounds like to it)
  const stopMeasuring = () => {
    loud = [];
    evidenceSince = 0;
    voiceHeld = false;
  };
  const measure = () => {
    if (phase === "wake" && !blocked && o.speaking?.()) {
      loud.push(o.meter!.level());
      if (loud.length > 400) loud.shift();
      tryInterrupt(results ?? []);
    } else if (voiceHeld && phase === "command") {
      // taking down what they say after talking over the mascot: its voice stays held meanwhile
    } else if (loud.length || voiceHeld) stopMeasuring();
  };

  /** Is the microphone clearly louder right now than it was while the mascot spoke on its own? */
  const louderThanMascot = () => {
    if (!o.meter?.ready() || loud.length < LOUD_WINDOW + LOUD_NEEDED) return false;
    const now = loud.slice(-LOUD_WINDOW);
    const before = loud.slice(0, -LOUD_WINDOW);
    // Learn what the mascot's voice sounds like from the moments it is really sounding: its pauses between words and
    // sentences, and the quiet stretch before it starts and after it ends, are not it. Judged by its louder moments (a
    // stressed word is louder than the rest), and only after a good second of it, so that its own emphasis is never
    // taken for a person.
    const peak = Math.max(...before);
    const active = before.filter((v) => v > peak * 0.25).sort((a, b) => a - b);
    if (active.length < LOUD_NEEDED * 0.6) return false;
    const typical = active[Math.floor(active.length * 0.9)];
    const limit = typical * 1.5 + 0.01;
    return now.filter((v) => v > limit).length >= LOUD_WINDOW - 1;
  };

  /** Where the results end right now (a place to measure from later). */
  const endOf = (res: ArrayLike<RecognitionResult>): Mark => (res.length ? { i: res.length - 1, t: res[res.length - 1][0].transcript } : START);

  /**
   * Starts the recogniser over, keeping what was heard so far. In some browsers (Chrome on Windows especially) the
   * recogniser goes deaf while the voice plays and stays deaf after it stops, so right after the mascot's voice ends or is
   * stopped it gets a fresh start: otherwise the mascot talks, and then never hears the reply.
   */
  const freshRecogniser = () => {
    carry = lastText;
    wakeAt = -1;
    results = null;
    skip = START;
    clearTimeout(restart);
    abortRec();
    restart = setTimeout(begin, 120);
  };

  /** Someone is talking over the mascot: it stops talking and listens. */
  const takeTheFloor = (res: ArrayLike<RecognitionResult>) => {
    loud = [];
    evidenceSince = 0;
    voiceHeld = true;
    phase = "command";
    cmdPhrase = false;
    conversing = true;
    echoFrozen = o.echoText?.() ?? ""; // (the end of the mascot's voice may still come through the microphone: not part of the message)
    wakeAt = Math.max(evBase.i, 0); // (from the moment the microphone got louder, so their first words are not lost)
    wakeBase = evBase.i >= 0 ? evBase.t : "";
    carry = "";
    lastText = "";
    emit();
    arm();
    clearTimeout(cap);
    cap = setTimeout(finish, maxMs);
    o.onPause?.();
    hear(res);
    // If the recogniser has said nothing for a while although the mascot was talking (and someone clearly was too), it is
    // deaf: start it over now that the voice has stopped, keeping the words it did catch.
    if (Date.now() - lastResultAt > DEAF_MS) {
      freshRecogniser();
      echoFrozen = ""; // (the new session never heard the mascot)
    }
  };

  const tryInterrupt = (res: ArrayLike<RecognitionResult>) => {
    if (phase !== "wake" || blocked || !o.onPause || !o.speaking?.()) return;
    const now = Date.now();
    if (now < cooldownUntil || !louderThanMascot()) {
      evidenceSince = 0;
      return;
    }
    if (!evidenceSince) {
      evidenceSince = now;
      evBase = endOf(res);
      return;
    }
    if (now - evidenceSince < interruptHoldMs) return;
    takeTheFloor(res);
  };


  const onResult = (res: ArrayLike<RecognitionResult>) => {
    results = res;
    lastResultAt = Date.now();
    heardAny = true;
    fails = 0;
    const talking = phase === "wake" && !!o.speaking?.();
    if (phase === "wake") {
      // (if the voice itself says the phrase, that is not the visitor)
      const echoHasPhrase = talking && !!matchWake(o.echoText?.() ?? "", target);
      for (let k = Math.max(skip.i, 0); k < res.length && !echoHasPhrase; k++) {
        const from = k === skip.i ? skip.t : "";
        const seen = since(from, res[k][0].transcript);
        const m = matchWake(seen, target);
        if (!m) continue;
        phase = "command";
        cmdPhrase = true;
        echoFrozen = "";
        wakeAt = k;
        wakeBase = from;
        wakeWords = wordsOf(seen.slice(0, m.end)).length;
        carry = "";
        lastText = "";
        emit();
        arm();
        clearTimeout(cap);
        cap = setTimeout(finish, maxMs);
        o.onWake?.();
        break;
      }
      // not the phrase, but the visitor talking over the mascot: it stops, and they carry on
      if (talking) tryInterrupt(res);
    }
    if (phase === "command") {
      hear(res);
      // The recogniser itself says the sentence is over (its last result is final): no need to wait out the whole pause,
      // unless the sentence stops in the middle ("...and"), when they are most likely still thinking
      if (lastText && res.length && res[res.length - 1].isFinal) {
        clearTimeout(pause);
        pause = setTimeout(finish, Math.min(waitFor(lastText), dangling(lastText) ? FINAL_PAUSE_DANGLING_MS : FINAL_PAUSE_MS));
      }
    }
  };

  const abortRec = () => {
    const r = rec;
    rec = null;
    if (!r) return;
    r.onresult = r.onerror = r.onend = r.onstart = null; // nothing it says from now on matters
    try {
      r.abort();
    } catch {}
  };

  const onEnd = () => {
    rec = null;
    const lasted = Date.now() - startedAt;
    if (phase === "command") {
      carry = lastText; // the message carries on in the next session
      wakeAt = -1;
    }
    skip = START;
    results = null;
    if (!want || blocked) return;
    // A session that ran normally is replaced at once, so the gap where "Hey Claude Code" could be missed is as short as
    // possible. Sessions that end immediately, over and over (no network, say) are retried less and less often.
    fails = lasted < 1500 && !heardAny ? fails + 1 : 0;
    restart = setTimeout(begin, fails === 0 ? 0 : Math.min(10000, 250 * 2 ** Math.min(fails, 6)));
  };

  const onError = (code: string) => {
    if (code === "no-speech" || code === "aborted") return; // normal: nobody spoke
    const message = problems[code] ?? "Something went wrong with the microphone.";
    if (fatal.has(code)) {
      stop();
      o.onStopped?.(message);
      return;
    }
    fails++;
    o.onProblem?.(message);
  };

  function begin() {
    if (!want || blocked || rec) return;
    const r = new o.Rec();
    r.lang = o.lang || "en-US";
    r.continuous = true; // keeps listening through pauses until it is stopped
    r.interimResults = true; // the phrase is noticed as it is spoken, not after a sentence ends
    r.onstart = () => o.onProblem?.(null);
    r.onresult = (e) => onResult(e.results);
    r.onerror = (e) => onError(e.error);
    r.onend = () => {
      if (rec === r) onEnd();
    };
    rec = r;
    startedAt = Date.now();
    lastResultAt = startedAt;
    heardAny = false;
    try {
      r.start();
    } catch {
      rec = null;
      fails++;
      restart = setTimeout(begin, 1000);
    }
  }

  const applyBlock = () => {
    const b = held || hidden;
    if (b === blocked) return;
    blocked = b;
    if (b) {
      clearTimeout(restart);
      if (phase === "command") leaveCommand();
      conversing = false;
      if (voiceHeld) o.onResume?.(); // (the microphone is taken away: a held voice must not stay held)
      stopMeasuring();
      abortRec();
      skip = START;
      results = null;
    } else begin();
    emit();
  };

  const onVisibility = () => {
    hidden = document.hidden;
    applyBlock();
  };

  function stop() {
    want = false;
    conversing = false;
    clearTimeout(restart);
    clearInterval(loudTimer);
    loudTimer = undefined;
    if (voiceHeld) o.onResume?.();
    stopMeasuring();
    clearCommandTimers();
    abortRec();
    phase = "wake";
    wakeAt = -1;
    carry = "";
    lastText = "";
    skip = START;
    results = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    emit();
  }

  return {
    /** Starts listening for the phrase (call from a click: that is when the browser asks for the microphone). */
    start() {
      if (want) return;
      want = true;
      fails = 0;
      if (typeof document !== "undefined") {
        hidden = document.hidden;
        document.addEventListener("visibilitychange", onVisibility);
      }
      blocked = held || hidden;
      // while the mascot talks, note how loud the microphone is (only needed to tell a person from the mascot's own voice)
      if (o.meter && o.onPause) loudTimer = setInterval(measure, meterEveryMs);
      emit();
      begin();
    },
    stop,
    /** Lets go of the microphone for a moment (true) and takes it back (false), e.g. while the microphone button is used. */
    hold(on: boolean) {
      held = on;
      applyBlock();
    },
    /** Drops the message being listened to (the visitor typed it instead) and waits for the phrase again. */
    cancel() {
      if (phase !== "command") return;
      leaveCommand();
      conversing = false;
    },
    /** The conversation is over (the mascot was closed): back to waiting for the phrase. */
    end() {
      if (phase === "command") leaveCommand();
      conversing = false;
      voiceHeld = false;
    },
    /**
     * The mascot has finished answering: listen for the next message, no phrase needed. Does nothing unless a conversation
     * is going (the visitor has not said goodbye or gone quiet). Returns whether it is listening now.
     */
    resume(): boolean {
      if (!want || blocked || !conversing || phase === "command") return false;
      phase = "command";
      cmdPhrase = false;
      carry = "";
      lastText = "";
      // The mascot has just finished talking. Everything the recogniser heard so far (the mascot's own voice, and a recogniser
      // that may be deaf after it) is left behind: it starts over, and only what is said from now on is the reply. (So a
      // reply that repeats the mascot's own words, "I'm doing okay today", is not mistaken for its echo either.)
      echoFrozen = "";
      freshRecogniser();
      emit();
      arm();
      clearTimeout(cap);
      cap = setTimeout(finish, maxMs);
      return true;
    },
  };
}

export type WakeListener = ReturnType<typeof createWakeListener>;
