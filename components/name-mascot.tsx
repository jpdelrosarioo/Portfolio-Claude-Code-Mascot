"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mascot, site, tour } from "@/data/site";
import { findReference, lookUp, markedReferences, withoutMarkers, type VerseLookup } from "@/lib/bible";
import { useDictation } from "@/lib/dictation";
import { useWakeWord } from "@/lib/use-wake-word";
import { play } from "@/lib/sounds";
import { moderate, moderationMessage } from "@/lib/moderation";
import { tourSeen, tourWillAutoStart } from "@/lib/tour-state";
import { isSpeaking, mouthLevel, msSinceSpeech, pauseSpeaking, recentSpeech, resumeSpeaking, sentenceBoundary, speechSource, subscribeSpeaking, speak, speechSupported, stopSpeaking, type SpeechEvent } from "@/lib/speech";
import { createPortal } from "react-dom";
import { analyze, type Analysis } from "@/lib/nlp";
import { createMood, hear as moodHear, isRadiant, labelOf, pet as moodPet, say as moodSay, shine as moodShine, tick as moodTick, POSTURE, type Emote, type Mood, type MoodState } from "@/lib/mood";
import { quickReply } from "@/lib/mascot-replies";
import { useRoam } from "@/lib/use-roam";
import type { Pose } from "@/lib/roam";
import { Icon } from "./icons";
import { MascotSprite } from "./mascot-sprite";

type Verse = { text: string; ref: string };
type Step = "hidden" | "greet" | "ask" | "verse" | "chat";
/** `local`: shown in the bubble but never sent to the AI (a blocked message and the mascot's reply to it).
 *  `cut`: the visitor interrupted this answer; `content` is only what had been said when they did (the AI is told, so
 *  "continue" can pick it up from there). */
type Msg = { role: "user" | "assistant"; content: string; local?: boolean; cut?: boolean };

const SEEN = "mascot-greeted"; // the greeting opens by itself once per visit; afterwards the mascot is clicked to talk
const VOICE_KEY = "mascot-voice"; // the visitor's choice: the mascot speaks out loud, or not
const VOICE = { pitch: 1.35, rate: 1.05 }; // a little higher and brighter than the chat voice: a small, cheerful character
const MAX_INPUT = 300; // longest message the visitor can type
const MAX_SPOKEN = 500; // ...and say (the longest the server takes: a long sentence is not cut short)
const REQUEST_STALL = 25000; // no word from the AI for this long (ms): give up, so a stuck request does not freeze the conversation
const noSubscribe = () => () => {};
const BLOCKED = "I can’t talk out loud yet: your browser needs you to click or tap the page once. Then I will speak. You can read me here meanwhile.";

// How fast the words appear when no voice is leading (characters per millisecond: about the old typing speed)...
const FAST = 0.045;
// ...and while the voice is speaking: an average speaking speed, corrected after every sentence from what was measured
const PACE = 0.0145 * VOICE.rate;
// If the voice has not started within this many milliseconds, the words stop waiting for it
const STALL = 2200;

type Track = {
  shown: number; // characters on screen (fractional while moving)
  want: number; // characters that have been handed over to be said
  segEnd: number; // how far the voice has got: the words never run past it while it is speaking
  pace: number;
  t0: number;
  last: number;
  voiced: boolean;
  active: boolean;
  words: boolean; // this voice reports each word, so its position is exact
  token: number; // changes with every new text, so a voice still finishing the old one is ignored
};

/**
 * Text that appears in step with the voice that reads it. The words are revealed as the voice speaks them (to the word
 * when the voice reports its words, otherwise at a speaking pace that is corrected after every sentence) and never run
 * ahead of it. Without a voice (muted, unsupported, blocked by the browser) they simply appear quickly, like typing.
 */
function useSpokenText() {
  const [n, setN] = useState(0);
  const [talking, setTalking] = useState(false);
  const r = useRef<Track>({ shown: 0, want: 0, segEnd: 0, pace: PACE, t0: 0, last: 0, voiced: false, active: false, words: false, token: 0 });
  const quiet = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let prev = performance.now();
    const id = window.setInterval(() => {
      const s = r.current;
      const now = performance.now();
      const dt = now - prev;
      prev = now;
      const waiting = s.voiced && (s.active || now - s.last < STALL);
      const limit = waiting ? s.segEnd : s.want;
      if (s.shown >= limit) return;
      const speed = !waiting ? FAST : s.words ? s.pace * 2 : s.pace;
      s.shown = reduce ? limit : Math.min(limit, s.shown + speed * dt);
      setN(Math.floor(s.shown));
    }, 33);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(quiet.current);
    };
  }, []);

  /** A new text starts: nothing is on screen yet. `voiced`: a voice is going to read it. */
  const begin = useCallback((voiced: boolean) => {
    const s = r.current;
    Object.assign(s, { token: s.token + 1, shown: 0, want: 0, segEnd: 0, pace: PACE, voiced, active: false, words: false, last: performance.now() });
    setN(0);
  }, []);
  /** The text now reaches `to` characters (they are shown as soon as the voice says them). */
  const grow = useCallback((to: number) => {
    const s = r.current;
    s.want = Math.max(s.want, to);
    if (!s.active) s.last = performance.now();
  }, []);
  /** The voice was switched off: show the rest without waiting for it. */
  const release = useCallback((to: number) => {
    const s = r.current;
    s.voiced = false;
    s.want = Math.max(s.want, to);
  }, []);
  const token = useCallback(() => r.current.token, []);
  /** What the voice reports for the piece of text that sits at characters `from`–`to`. */
  const heard = useCallback((tok: number, from: number, to: number, e: SpeechEvent) => {
    const s = r.current;
    if (tok !== s.token) return;
    const now = performance.now();
    s.last = now;
    if (e.type === "start") {
      s.active = true;
      s.words = false;
      s.t0 = now;
      s.segEnd = to;
      s.shown = Math.max(s.shown, from);
      window.clearTimeout(quiet.current);
      setTalking(true);
    } else if (e.type === "word" || e.type === "chunk") {
      s.active = true;
      if (e.type === "word") s.words = true;
      if (s.words) s.segEnd = Math.min(to, from + e.fraction * (to - from));
      window.clearTimeout(quiet.current);
      setTalking(true);
    } else if (e.type === "end") {
      s.active = false;
      // when this was the last thing the voice had to say, whatever is left (a trailing emoji, say) can appear too
      s.segEnd = isSpeaking() ? to : Math.max(to, s.want);
      const took = now - s.t0;
      if (!s.words && took > 300 && to - from > 15) s.pace = Math.min(0.03, Math.max(0.008, (s.pace + (to - from) / took) / 2));
      window.clearTimeout(quiet.current);
      quiet.current = window.setTimeout(() => setTalking(false), 220); // a short breath between sentences is not a pause
    } else {
      s.active = false;
      s.last = -1e9; // the voice cannot speak: stop waiting for it
      setTalking(false);
    }
  }, []);

  return { n, talking, begin, grow, release, token, heard };
}

const pick = (list: Verse[], not?: Verse) => {
  const options = list.length > 1 && not ? list.filter((v) => v.ref !== not.ref) : list;
  return options[Math.floor(Math.random() * options.length)];
};

/** What the mascot says when a verse can't be shown. */
function verseTrouble(v: { reference: string; error: string }) {
  if (v.error === "not_found" || v.error === "bad_reference")
    return `I couldn't find “${v.reference}”. Try a reference like John 3:16 or Psalm 23.`;
  if (v.error === "rate_limited") return "That's a lot of verses! Let's pause for a moment and try again.";
  return "I couldn't open the Bible just now. Please try again in a moment.";
}

// what the mascot says when it can't reach the AI
const TROUBLE: Record<string, string> = {
  not_configured: "I can't chat right now, but I'm really glad you stopped by. 🙂",
  rate_limited: "Let's take a little break. Talk to me again in a bit?",
  upstream: "I lost my words for a second. Could you try again?",
};

/** The page title (your name) with the mascot. The mascot lives on the intro: it perches on the surname (where its chat box
 *  opens), sitting or standing as its mood says, and wanders around the portrait. The mascot and its bubble sit next to the
 *  heading, not inside it, so screen readers still read the heading as just your name. */
export function NameMascot({ name, className }: { name: string; className?: string }) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const surname = rest.join(" ");
  const surnameRef = useRef<HTMLSpanElement>(null);
  const [spot, setSpot] = useState<{ left: number; top: number; width: number; em: number; room: number } | null>(null);
  // the intro the mascot lives in (it walks over the whole of it), and the word it perches on
  const [surnameEl, setSurnameEl] = useState<HTMLElement | null>(null);
  const [header, setHeader] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = surnameRef.current;
    setSurnameEl(el);
    setHeader(el?.closest("header") ?? null);
  }, [surname]);

  // keep the mascot lined up with the surname (it moves when the layout or the font size changes)
  useEffect(() => {
    const el = surnameRef.current;
    if (!el) return;
    const measure = () =>
      setSpot({
        left: el.offsetLeft,
        top: el.offsetTop,
        width: el.offsetWidth,
        em: parseFloat(getComputedStyle(el).fontSize),
        // how far the speech bubble may reach to the right: the edge of the screen (minus the page margin)
        room: window.innerWidth - el.parentElement!.getBoundingClientRect().left - 16,
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(el.parentElement!);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [surname]);

  const [step, setStep] = useState<Step>("hidden");
  const [answer, setAnswer] = useState<"okay" | "notOkay">("okay");
  const [verse, setVerse] = useState<Verse | null>(null);
  const [waving, setWaving] = useState(false);
  const [voice, setVoice] = useState(true);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<VerseLookup[]>([]); // verses looked up for the latest message
  const [units, setUnits] = useState(0); // how many of those verses have been read out so far (shown as they are read)
  const [minimized, setMinimized] = useState(false); // the bubble shrunk to its title bar (the mascot keeps talking)
  const [pos, setPos] = useState({ x: 0, y: 0 }); // how far the visitor has dragged the bubble from its place under the name
  const [dragging, setDragging] = useState(false);
  const endDrag = useRef<(() => void) | null>(null); // stops following the pointer (a drag in progress)
  const justDragged = useRef(false);
  const reveal = useSpokenText();
  const bodyRef = useRef<HTMLSpanElement>(null);
  const stick = useRef(true); // keep the bubble scrolled to the newest words, unless the visitor scrolled up
  const timer = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const lastSpoken = useRef({ text: "", at: 0 }); // the last message that was said out loud (see send)
  const request = useRef(0); // counts the questions sent, so an old one finishing late can't clear a newer one's "busy"
  const voiceRef = useRef(true);

  const canSpeak = useSyncExternalStore(noSubscribe, speechSupported, () => false);

  // The mouth follows the words the voice is saying (not a fixed wiggle): while the mascot speaks, it is read about thirty
  // times a second from the voice's timetable (lib/mouth.ts, lib/speech.ts), which is lined up with the voice at every word
  // the browser reports. It is shut between syllables, between sentences and while the voice is held.
  const voiceOn = useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);
  const [mouth, setMouth] = useState<0 | 1 | 2>(0);
  useEffect(() => {
    if (!voiceOn) {
      setMouth(0);
      return;
    }
    const id = window.setInterval(() => {
      const level = speechSource() === "mascot" ? mouthLevel() : 0; // (the chat box's voice is not the mascot's)
      const next = level > 0.62 ? 2 : level > 0.18 ? 1 : 0;
      setMouth((m) => (m === next ? m : next));
    }, 33);
    return () => window.clearInterval(id);
  }, [voiceOn]);

  // The mascot's mood (lib/mood.ts): it starts from the time of day, moves with what the visitor says (lib/nlp.ts works out how
  // they feel and what they mean), and settles back by itself. Its name decides whether the mascot sits or stands.
  const moodRef = useRef<MoodState | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [emote, setEmote] = useState<Emote | null>(null); // a heart, a sparkle or a drop floating up for a moment
  const [radiant, setRadiant] = useState(false); // God was mentioned: it shines (a bright glow round its head and body)
  const emoteTimer = useRef(0);
  const syncMood = useCallback(() => {
    const s = moodRef.current;
    if (!s) return;
    const now = Date.now();
    setMood(labelOf(s, now));
    setRadiant(isRadiant(s, now));
  }, []);
  useEffect(() => {
    moodRef.current = createMood(Date.now());
    syncMood();
    const id = window.setInterval(() => {
      const s = moodRef.current;
      if (s) {
        moodTick(s, Date.now());
        syncMood();
      }
    }, 1000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(emoteTimer.current);
    };
  }, [syncMood]);
  const showEmote = useCallback((e: Emote | null) => {
    if (!e) return;
    setEmote(e);
    window.clearTimeout(emoteTimer.current);
    emoteTimer.current = window.setTimeout(() => setEmote(null), 2200);
  }, []);
  /** The visitor said something: the mascot feels it. */
  const feel = (a: Analysis) => {
    const s = moodRef.current;
    if (!s) return;
    showEmote(moodHear(s, a, Date.now()));
    syncMood();
  };

  // Talking instead of typing: the spoken words are added after whatever was already in the box
  const typed = useRef("");
  const dictation = useDictation((spoken) => setInput(`${typed.current} ${spoken}`.trim().slice(0, MAX_INPUT)));
  const { listening, stop: stopListening } = dictation;

  // Hands-free: the visitor says the wake phrase ("Hey Claude Code") and the mascot opens and listens; when they stop
  // talking for the pause time, the message is sent (see lib/wake-word.ts). It starts by itself when the page opens.
  const WAKE = mascot.wakeWord;
  const [handsFree, setHandsFree] = useState(false);
  const pauseSec = WAKE.pauseSeconds;
  const [missed, setMissed] = useState(false); // the phrase was heard but nothing followed
  const [heldVoice, setHeldVoice] = useState(false); // the voice is held because someone is talking over it: the mascot is listening
  const [awaiting, setAwaiting] = useState(false); // a spoken message was sent: once the mascot has finished answering, it listens again
  const [followUp, setFollowUp] = useState(false); // listening for the next message of a conversation (no phrase needed)
  const [liveWords, setLiveWords] = useState(""); // what is being said after the phrase (shown in the bubble, never put in the text box)
  const [wakeProblem, setWakeProblem] = useState<string | null>(null);
  const [voiceBlocked, setVoiceBlocked] = useState(false); // the browser would not let the mascot speak (it needs the page to have been clicked once)
  // When the visitor interrupts an answer, it stays in the conversation, cut where they interrupted it (what had been said
  // so far), so that the mascot, and the AI, still know exactly where it was: "continue" can then pick it up from there.
  const cutLast = (h: Msg[]): Msg[] => {
    const i = h.length - 1;
    const last = h[i];
    if (!last || last.role !== "assistant" || last.local || last.cut || !last.content) return h;
    const full = withoutMarkers(last.content);
    const said = voice && canSpeak ? Math.min(full.length, reveal.n) : full.length; // (the words on screen follow the voice)
    if (said >= full.length) return h; // it had been said all the way: nothing was cut
    const copy = h.slice();
    copy[i] = { ...last, content: full.slice(0, said).trimEnd(), cut: true };
    return copy;
  };

  // The visitor said the phrase: the mascot stops whatever it was doing, and the bubble shows it is listening
  const makeRoom = () => {
    setHistory(cutLast);
    setHeldVoice(false);
    stopSpeaking();
    abort.current?.abort();
    setBusy(false); // (the cancelled answer is over: nothing is being waited for)
    stopListening();
    setMissed(false);
    setLiveWords("");
    setAwaiting(false);
    setFollowUp(false);
    setCards([]);
    setMinimized(false);
    setStep((s) => (s === "hidden" ? s : "chat")); // (the chat box opens only when they click the mascot: voice works without it)
    stick.current = true;
  };
  const wake = useWakeWord({
    enabled: WAKE.enabled && handsFree,
    phrase: WAKE.phrase,
    followUpMs: WAKE.followUpSeconds * 1000,
    interrupt: WAKE.interrupt,
    // (the mascot is the one talking, with or without its chat box open: the voice is going or just stopped, and its last
    // words come back through the microphone for a moment. The chat box's own voice is not the mascot's)
    speaking: () => speechSource() === "mascot" && msSinceSpeech() < 1200,
    echoText: recentSpeech, // (whatever the voice says, the chat's too)
    pauseMs: pauseSec * 1000,
    onWake: () => {
      // The phrase answers at once: a tiny tick and the mascot waves (nothing pops up: the chat box is opened by clicking the
      // mascot, and everything works by voice without it). The tick is short and quiet so it doesn't get in the way of the
      // first words after the phrase.
      play("tick", true);
      makeRoom();
      setWaving(true);
      window.setTimeout(() => setWaving(false), 1800);
    },
    onPause: () => {
      // Someone is talking over the mascot: its voice (and the words that follow it) stops at once, and it listens. What they
      // say is sent as their message and the mascot answers that instead (see onCommand).
      pauseSpeaking();
      setHeldVoice(true);
      setAwaiting(false);
      setFollowUp(false);
      setLiveWords("");
    },
    onResume: () => {
      // It was only a noise: the mascot goes on where it was, and listens again when it is done
      resumeSpeaking();
      setHeldVoice(false);
      setLiveWords("");
      setAwaiting(WAKE.conversation);
    },
    onHeard: (text) => {
      setLiveWords(text.slice(0, MAX_SPOKEN));
      if (text) {
        // If the chat box is open, their words appear in it (whatever the mascot was showing, a greeting or a verse, steps
        // aside). If it is closed it stays closed.
        setStep((s) => (s === "hidden" ? s : "chat"));
        setMinimized(false);
        stick.current = true;
      }
    },
    onCommand: (text) => {
      setHeldVoice(false); // (the answer it was giving is dropped when the new one starts)
      setFollowUp(false);
      setLiveWords("");
      setAwaiting(WAKE.conversation); // when the answer is finished, listen for the next message
      void send(text.slice(0, MAX_SPOKEN), true);
    },
    onGiveUp: () => setMissed(true),
    onIdle: () => setFollowUp(false), // the conversation went quiet
    onStopped: (message) => {
      // the microphone is blocked or missing: nothing to listen with (the browser remembers a "no", so it won't ask again)
      setHandsFree(false);
      setWakeProblem(message);
    },
  });
  const hearing = wake.phase === "command";
  // Is the visitor talking to it? With the chat box open it goes to its perch (so the box opens where it always has); by
  // voice, with the box closed, it stops where it is and listens; otherwise it is free to wander.
  const engaged: "none" | "voice" | "chat" = step !== "hidden" ? "chat" : hearing || busy || awaiting || heldVoice || voiceOn ? "voice" : "none";
  const roam = useRoam({ target: header, surname: surnameEl, mood, posture: mood ? POSTURE[mood] : "stand", engaged, still: !mascot.roam });
  const wakeHold = wake.hold;
  const wakeCancel = wake.cancel;
  const wakeEnd = wake.end;
  const wakeResume = wake.resume;

  // A conversation: once the mascot has finished answering (the text is all in, and the voice has stopped), it listens
  // for the next message without needing the phrase. A short quiet spell first, so it doesn't catch its own voice fading.
  useEffect(() => {
    if (!awaiting || busy) return;
    let quiet = 0;
    const id = window.setInterval(() => {
      if (isSpeaking()) {
        quiet = 0;
        return;
      }
      quiet += 150;
      if (quiet < 600) return;
      window.clearInterval(id);
      setAwaiting(false);
      if (wakeResume()) {
        setLiveWords("");
        setFollowUp(true);
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [awaiting, busy, wakeResume]);

  // Listening starts by itself when the page opens, so "Hey Claude Code" works without touching anything. The first time,
  // the browser asks for the microphone; after that it remembers the answer. A visitor who said no is left alone.
  useEffect(() => {
    if (!WAKE.enabled) return;
    let gone = false;
    const turnOn = () => {
      if (!gone) setHandsFree(true);
    };
    if (!navigator.permissions) {
      turnOn();
      return;
    }
    navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((s) => s.state !== "denied" && turnOn())
      .catch(turnOn); // (this browser can't tell in advance: just try)
    return () => {
      gone = true;
    };
  }, [WAKE.enabled]);

  // Only one thing can use the microphone at a time: the wake listener steps aside while the microphone button is in use
  const listeningNow = useRef(false);
  useEffect(() => {
    listeningNow.current = listening;
    if (listening) return;
    const id = window.setTimeout(() => wakeHold(false), 300);
    return () => window.clearTimeout(id);
  }, [listening, wakeHold]);
  const toggleMic = () => {
    if (listening) return stopListening();
    stopSpeaking(); // so the microphone doesn't hear the mascot's own voice
    typed.current = input;
    wakeHold(true);
    window.setTimeout(() => dictation.start(), 200); // (the browser needs a moment to let go of the microphone)
    window.setTimeout(() => !listeningNow.current && wakeHold(false), 6000); // it never started: give the microphone back
  };

  // the visitor's voice choice is remembered
  useEffect(() => {
    try {
      const on = localStorage.getItem(VOICE_KEY) !== "off";
      setVoice(on);
      voiceRef.current = on;
    } catch {}
  }, []);

  const { begin, grow, release, token, heard } = reveal;
  const voiced = () => voiceRef.current && speechSupported();

  /**
   * Says something out loud in the mascot's voice (if the visitor has the voice on).
   * `at`: this text sits at that character of the text on screen, which then appears as the voice says it.
   * `onEvent`: follows the voice (used to show each verse as it is read).
   */
  const say = useCallback(
    (text: string, { queue = false, at, onEvent }: { queue?: boolean; at?: number; onEvent?: (e: SpeechEvent) => void } = {}) => {
      const to = at === undefined ? 0 : at + text.length;
      if (at !== undefined) grow(to);
      if (!text) return;
      if (!voiceRef.current || !speechSupported()) {
        onEvent?.({ type: "error", fraction: 0 });
        return;
      }
      if (!queue) stopSpeaking();
      const tok = token();
      speak(text, {
        ...VOICE,
        from: "mascot",
        onSpeech: (e) => {
          if (at !== undefined) heard(tok, at, to, e);
          onEvent?.(e);
          // Browsers do not let a page speak until the visitor has clicked or tapped it once. Someone who only used their voice
          // would get silence, with the chat box closed: so it opens, the answer can be read, and it says what to do.
          if (e.type === "error") {
            setVoiceBlocked(true);
            setStep((s) => (s === "hidden" ? "chat" : s));
            setMinimized(false);
          } else if (e.type === "start") setVoiceBlocked(false);
        },
      });
    },
    [grow, heard, token],
  );

  /** A new line on screen (the greeting, a question, ...), said and shown together. */
  const speakLine = useCallback(
    (line: string, queue = false) => {
      begin(voiceRef.current && speechSupported());
      say(line, { queue, at: 0 });
    },
    [begin, say],
  );

  const lines: Record<Step, string> = {
    hidden: "",
    greet: mascot.greeting,
    ask: mascot.question,
    verse: answer === "okay" ? "Glad to hear it! Here's a verse for you:" : "I'm sorry it's been hard. You're not alone. Here's a verse for you:",
    chat: "",
  };
  const line = lines[step];
  const shown = line.slice(0, reveal.n);
  const done = line.length > 0 && reveal.n >= line.length;

  const greet = useCallback(() => {
    setWaving(true);
    window.setTimeout(() => setWaving(false), 2800);
    setStep("greet");
    setMinimized(false);
    speakLine(mascot.greeting);
  }, [speakLine]);

  const close = useCallback(() => {
    setPos({ x: 0, y: 0 }); // it opens in its usual place next time
    setStep("hidden");
    stopSpeaking();
    stopListening();
    wakeEnd(); // closing the mascot ends the conversation
    setHeldVoice(false);
    setAwaiting(false);
    setFollowUp(false);
    setMissed(false);
    abort.current?.abort();
  }, [stopListening, wakeEnd]);

  // Optional (mascot.autoGreet, off by default): greet by itself once per visit. (Browsers only allow speech after the visitor has
  // clicked or tapped something, so this first greeting may be silent; everything after a click is spoken.)
  useEffect(() => {
    if (!mascot.enabled || !mascot.autoGreet) return; // by default it only opens when clicked
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN) === "1";
    } catch {}
    if (seen) return;
    const hello = () => {
      try {
        sessionStorage.setItem(SEEN, "1");
      } catch {}
      greet();
    };
    if (tourWillAutoStart()) {
      // A first visit: the tour goes first, and the mascot says hello once it is over (or at once if the tour never started).
      const onEnd = () => {
        timer.current = window.setTimeout(hello, 2200);
      };
      window.addEventListener("tour-end", onEnd, { once: true });
      const fallback = window.setTimeout(() => {
        if (!tourSeen()) hello();
      }, tour.autoStartDelay + 1500);
      return () => {
        window.removeEventListener("tour-end", onEnd);
        window.clearTimeout(fallback);
        window.clearTimeout(timer.current);
      };
    }
    try {
      sessionStorage.setItem(SEEN, "1");
    } catch {}
    timer.current = window.setTimeout(greet, 1400);
    return () => window.clearTimeout(timer.current);
  }, [greet]);

  // after the greeting has been typed, move on to the question
  useEffect(() => {
    if (step !== "greet" || !done) return;
    const id = window.setTimeout(() => {
      setStep("ask");
      speakLine(mascot.question, true);
    }, 900);
    return () => window.clearTimeout(id);
  }, [step, done, speakLine]);

  // the layout changed (turned the phone, resized the window): put the bubble back where it belongs
  useEffect(() => {
    const back = () => setPos({ x: 0, y: 0 });
    window.addEventListener("resize", back);
    return () => window.removeEventListener("resize", back);
  }, []);

  // Escape closes the bubble; leaving the page stops the voice
  useEffect(() => {
    if (step === "hidden") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, close]);
  useEffect(() => () => {
    endDrag.current?.();
    stopSpeaking();
    abort.current?.abort();
  }, []);

  const showVerse = (a: "okay" | "notOkay", previous?: Verse) => {
    const v = pick(a === "okay" ? mascot.okay : mascot.notOkay, previous);
    setVerse(v);
    return v;
  };

  const reply = (a: "okay" | "notOkay") => {
    setMinimized(false);
    setAnswer(a);
    const v = showVerse(a);
    setStep("verse");
    speakLine(a === "okay" ? "Glad to hear it! Here's a verse for you:" : "I'm sorry it's been hard. You're not alone. Here's a verse for you:");
    say(`${v.text} ${v.ref}.`, { queue: true });
  };

  const toggleVoice = () => {
    const on = !voice;
    setVoice(on);
    voiceRef.current = on;
    try {
      localStorage.setItem(VOICE_KEY, on ? "on" : "off");
    } catch {}
    if (!on) {
      stopSpeaking();
      release(line.length);
      setUnits(Infinity);
    }
  };

  /**
   * Reads verses aloud: the reference, then the words (a long passage: the first few verses, the rest is on screen).
   * Each verse appears on screen as the voice starts reading it.
   */
  const readVerses = (list: VerseLookup[], intro = "", alreadyNamed: boolean[] = []) => {
    const showUpTo = (k: number) => (e: SpeechEvent) => {
      if (e.type === "start" || e.type === "error") setUnits((u) => Math.max(u, k));
    };
    if (intro) say(intro, { queue: true, at: 0 });
    let base = 0;
    for (const [k, v] of list.entries()) {
      if ("error" in v) {
        say(verseTrouble(v), { queue: true, onEvent: showUpTo(base + 1) });
        base += 1;
        continue;
      }
      // (with an intro, or when the mascot's own sentence already said it, "Here is Psalm 23:1-4", the reference was just said:
      // saying it again would be a repeat)
      if (!intro && !alreadyNamed[k]) say(`${v.reference}.`, { queue: true });
      v.verses.slice(0, 6).forEach((x, j) => say(x.text, { queue: true, onEvent: showUpTo(base + j + 1) }));
      if (v.verses.length > 6) say("… and more on the screen.", { queue: true, onEvent: showUpTo(base + v.verses.length) });
      base += v.verses.length;
    }
  };

  // Safety net: verses wait for the voice, but if nothing is being said (muted, blocked by the browser) show them all
  useEffect(() => {
    if (!cards.length || units === Infinity) return;
    const id = window.setInterval(() => {
      if (!isSpeaking()) setUnits(Infinity);
    }, 400);
    return () => window.clearInterval(id);
  }, [cards, units]);

  // keep the newest words in view while the bubble fills up (unless the visitor has scrolled up to read)
  useEffect(() => {
    const el = bodyRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [reveal.n, units, cards, history, step, hearing, liveWords]);

  // The visitor writes to the mascot: it reads the message and answers through the AI, in its own caring voice.
  const send = async (raw: string, bySpeech = false) => {
    const text = raw.trim();
    // (a spoken message is never dropped because the answer it interrupted has not finished clearing: that one was cancelled)
    if (!text || (busy && !bySpeech)) return;
    if (bySpeech) {
      // the same spoken message twice in a row, a moment apart, is one message heard twice (not two questions): it would
      // get the same answer said twice
      const same = lastSpoken.current.text === text.toLowerCase() && Date.now() - lastSpoken.current.at < 4000;
      lastSpoken.current = { text: text.toLowerCase(), at: Date.now() };
      if (same) return;
      abort.current?.abort();
    }
    const mine = ++request.current; // (only the newest request may say it is finished)
    stopListening();
    wakeCancel(); // (typed it instead of saying it: stop listening for the rest of a spoken message)
    setHeldVoice(false);
    setMissed(false);
    setInput("");
    setMinimized(false);
    setStep((s) => (s === "hidden" ? s : "chat")); // (said out loud with the chat box closed: it stays closed, the mascot just answers)
    stick.current = true;

    // the same filter as the chat: bad words, spam, harmful requests get a kind, instant answer and are never sent
    const why = moderate(text);
    if (why) {
      const msg = moderationMessage(why, site.name) ?? "Let's keep it kind. 🙂";
      // kept out of the conversation sent to the AI, so one blocked message doesn't get every later message blocked too
      setHistory((h): Msg[] =>
        [...cutLast(h), { role: "user" as const, content: text, local: true }, { role: "assistant" as const, content: msg, local: true }].slice(-8),
      );
      setCards([]);
      begin(voiced());
      say(msg, { at: 0 });
      return;
    }

    // What did they mean, and how do they feel? The mascot feels it too (lib/nlp.ts works it out, lib/mood.ts moves the mood)
    const a = analyze(text);
    feel(a);

    setCards([]);
    stopSpeaking();
    begin(voiced());
    const controller = new AbortController();
    abort.current = controller;

    // The visitor typed a reference ("John 3:16", "Psalm 23"): look it up straight away, no AI needed.
    const direct = findReference(text);
    if (direct) {
      const own = moodRef.current;
      if (own) {
        moodShine(own, Date.now()); // (God's word: it is glad and it shines)
        syncMood();
        showEmote("sparkle");
      }
      setHistory((h): Msg[] =>
        [...cutLast(h), { role: "user" as const, content: text, local: true }, { role: "assistant" as const, content: "", local: true }].slice(-8),
      );
      setBusy(true);
      const found = await lookUp(direct, controller.signal);
      if (request.current === mine) setBusy(false);
      if ("error" in found && found.error === "aborted") return;
      // "Here's Psalms 23:" with the proper name, or nothing when it wasn't found (the card explains)
      const intro = "error" in found ? "" : `Here's ${found.reference}:`;
      setHistory((h) => {
        const copy = h.slice();
        copy[copy.length - 1] = { role: "assistant", content: intro, local: true };
        return copy;
      });
      setCards([found]);
      setUnits(voiced() ? 0 : Infinity);
      readVerses([found], intro.replace(/:$/, "."));
      return;
    }

    // Simple things (a hello, a thank-you, "how are you?", "sit down") are answered at once, without the AI: it is faster, and
    // the answer fits how the mascot feels. Anything else goes to the AI.
    const quick = mascot.quickReplies ? quickReply(a, mood ?? "happy", new Date().getHours()) : null;
    if (quick) {
      setHistory((h): Msg[] => [...cutLast(h), { role: "user" as const, content: text }, { role: "assistant" as const, content: quick.text }].slice(-8));
      if (quick.command) roam.command(quick.command); // "sit down", "go for a walk"...
      const s = moodRef.current;
      if (s) {
        moodSay(s, analyze(quick.text), Date.now());
        syncMood();
      }
      say(quick.text, { at: 0 });
      return;
    }

    const next: Msg[] = [...cutLast(history), { role: "user" as const, content: text }].slice(-8);
    setHistory([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    let answerText = "";
    let spoken = 0;
    const update = (t: string) =>
      setHistory((h) => {
        const copy = h.slice();
        copy[copy.length - 1] = { role: "assistant", content: t };
        return copy;
      });
    // If the AI says nothing for a long while the request is given up on, so a stuck connection can not freeze the
    // conversation (the mascot would otherwise wait for it for ever and never listen again)
    let timedOut = false;
    let stall: number | undefined;
    const watch = () => {
      window.clearTimeout(stall);
      stall = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_STALL);
    };
    watch();
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "mascot",
          // how the mascot feels, and how the visitor seems to feel (worked out here, see lib/nlp.ts), so the answer has the right tone
          mood: mood ?? undefined,
          feeling: a.emotion !== "neutral" ? a.emotion : undefined,
          // (an answer the visitor interrupted is sent as far as it got, marked, so "continue" can pick it up from there)
          messages: next
            .filter((m) => m.content && !m.local)
            .map(({ role, content, cut }) => ({ role, content: cut ? `${content} … [the visitor interrupted you here]` : content })),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        const code = data?.error ?? "upstream";
        throw new Error(TROUBLE[code] ?? moderationMessage(code, site.name) ?? TROUBLE.upstream);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        if (request.current !== mine) break; // (a newer message has taken over: this answer is not wanted any more)
        watch();
        answerText += decoder.decode(value, { stream: true });
        update(answerText);
        // speak each sentence as soon as it is complete ([[references]] are read as plain references); the words on
        // screen follow the voice
        const clean = withoutMarkers(answerText);
        const cut = sentenceBoundary(clean, spoken);
        if (cut > spoken) {
          say(clean.slice(spoken, cut), { queue: true, at: spoken });
          spoken = cut;
        }
      }
      const clean = withoutMarkers(answerText);
      if (spoken < clean.length) say(clean.slice(spoken), { queue: true, at: spoken });
      // what it just said lifts or lowers it a little too (it is hard to say something kind and not feel it)
      const own = moodRef.current;
      if (own) {
        moodSay(own, analyze(clean), Date.now());
        syncMood();
      }

      // The AI only chose the references; the exact King James text is fetched here and shown below its words.
      const refs = markedReferences(answerText);
      if (refs.length) {
        const found = await Promise.all(refs.map((r) => lookUp(r, controller.signal)));
        // which references the mascot's own sentence already said out loud ("Here is Psalm 23:1-4, a comfort for you")
        const spokenWords = withoutMarkers(answerText).toLowerCase();
        const kept = found
          .map((f, i) => ({ f, named: spokenWords.includes(refs[i].toLowerCase()) }))
          .filter(({ f }) => !("error" in f && f.error === "aborted"));
        const shown = kept.map(({ f }) => f);
        setCards(shown);
        setUnits(voiced() ? 0 : Infinity);
        readVerses(
          shown,
          "",
          kept.map(({ named }) => named),
        );
      }
    } catch (e) {
      // (an abort is the visitor interrupting: nothing to say. A timeout is a real problem.)
      if ((e as Error).name !== "AbortError" || timedOut) {
        const msg = timedOut ? TROUBLE.upstream : (e as Error).message || TROUBLE.upstream;
        if (!answerText) {
          update(msg);
          begin(voiced());
          say(msg, { at: 0 });
        }
      }
    } finally {
      window.clearTimeout(stall);
      if (request.current === mine) setBusy(false);
    }
  };

  if (!mascot.enabled || !surname) return <h1 className={className}>{name}</h1>;

  // Where the speech bubble goes: under the name, lined up with the end of the surname when there is room, but always
  // fully on screen (on a phone it shifts left). Its tail keeps pointing at the mascot.
  const bubble = (() => {
    if (!spot) return { left: 0, width: 320, tail: 24 };
    const width = Math.min(320, spot.room);
    const right = spot.left + spot.width;
    const left = Math.max(0, Math.min(right - width, spot.room - width));
    const mascotCentre = right - 0.55 * spot.em - 22; // the mascot button is 44px wide, 0.55em in from the end
    return { left, width, tail: Math.max(14, Math.min(width - 26, mascotCentre - left - 6)) };
  })();

  // Dragging the bubble by its title bar (mouse or finger). It can go anywhere on the screen, but never completely out of
  // it. Moves are followed on the window, so a quick drag that leaves the title bar is not lost.
  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-nodrag]")) return;
    const bubbleEl = e.currentTarget.parentElement;
    if (!bubbleEl) return;
    const d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y, rect: bubbleEl.getBoundingClientRect(), moved: false };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      const dx = ev.clientX - d.sx;
      const dy = ev.clientY - d.sy;
      if (!d.moved) {
        if (Math.hypot(dx, dy) < 5) return; // a click, not a drag
        d.moved = true;
        setDragging(true);
      }
      const margin = 8;
      const x = Math.min(Math.max(dx, margin - d.rect.left), window.innerWidth - margin - d.rect.right);
      const y = Math.min(Math.max(dy, margin - d.rect.top), window.innerHeight - 44 - d.rect.top);
      setPos({ x: d.bx + x, y: d.by + y });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== d.id) return;
      stop();
      if (d.moved) {
        setDragging(false);
        justDragged.current = true; // the click that follows a drag must not minimize the bubble
        window.setTimeout(() => (justDragged.current = false), 0);
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      endDrag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    endDrag.current = stop;
  };
  const away = Math.hypot(pos.x, pos.y) > 36; // moved off the mascot: the tail pointing at it would mislead

  const btn =
    "rounded-full border border-g300 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors duration-200 hover:border-ink max-lg:py-2.5";
  const iconBtn = "grid size-7 place-items-center rounded-md text-g400 transition-colors hover:bg-g100 hover:text-ink max-lg:size-9";
  // what the mascot is doing (waving hello, when it has just been greeted, unless it is on the move or asleep)
  const shownPose: Pose = waving && roam.pose !== "walk" && roam.pose !== "hop" && roam.pose !== "sleep" ? "wave" : roam.pose;
  // verses already read out (all of them when nothing is being read)
  let counted = 0;

  return (
    <div className="relative">
      <h1 className={className}>
        {first} <span ref={surnameRef}>{surname}</span>
      </h1>
      {spot && (
        <span
          className="pointer-events-none absolute block font-pixel text-[clamp(2.1rem,8vw,2.6rem)] leading-none"
          style={{ left: spot.left, top: spot.top, width: spot.width, height: "1em" }}
        >
          {step !== "hidden" && (
            <span
              role="status"
              aria-live="polite"
              className="bubble-in pointer-events-auto absolute top-full z-30 mt-3 block rounded-2xl border border-g200 bg-bg text-left font-sans text-[13px] font-normal leading-[1.55] tracking-normal text-ink shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)]"
              style={{
                left: bubble.left - spot.left,
                width: minimized ? Math.min(bubble.width, 184) : bubble.width,
                translate: pos.x || pos.y ? `${pos.x}px ${pos.y}px` : undefined,
              }}
            >
              {/* little tail pointing up at the mascot */}
              <span
                aria-hidden
                className={`absolute -top-[7px] size-3 rotate-45 border-l border-t border-g200 bg-bg ${away ? "hidden" : ""}`}
                style={{ left: minimized ? Math.max(14, Math.min(bubble.tail, 184 - 26)) : bubble.tail }}
              />

              {/* header: who is talking, the voice switch and close */}
              <span
                onPointerDown={startDrag}
                title="Drag to move"
                className={`flex touch-none select-none items-center justify-between gap-1 py-0.5 pl-1.5 pr-1 ${dragging ? "cursor-grabbing" : "cursor-grab"} ${minimized ? "" : "border-b border-g200"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!justDragged.current) setMinimized((m) => !m);
                  }}
                  aria-expanded={!minimized}
                  aria-label={minimized ? "Expand the mascot's message" : "Minimize the mascot's message"}
                  className="micro flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-g500 transition-colors hover:text-ink max-lg:py-2.5"
                >
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full transition-colors ${(reveal.talking && !heldVoice) || hearing ? "animate-pulse bg-ink" : heldVoice ? "bg-ink" : "bg-g300"}`}
                  />
                  {hearing ? "Listening" : reveal.talking ? "Speaking" : "Mascot"}
                </button>
                <span className="flex items-center">
                  {canSpeak && !minimized && (
                    <button
                      type="button"
                      onClick={toggleVoice}
                      aria-pressed={voice}
                      aria-label={voice ? "Mute the mascot" : "Let the mascot speak"}
                      title={voice ? "Voice on" : "Voice off"}
                      data-nodrag
                      className={iconBtn}
                    >
                      <Icon name={voice ? "volume" : "volumeOff"} className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMinimized((m) => !m)}
                    aria-label={minimized ? "Expand" : "Minimize"}
                    title={minimized ? "Expand" : "Minimize"}
                    data-nodrag
                    className={iconBtn}
                  >
                    {minimized ? "+" : "−"}
                  </button>
                  <button type="button" onClick={close} aria-label="Close" data-nodrag className={iconBtn}>
                    ×
                  </button>
                </span>
              </span>

              {/* the conversation: scrolls when it gets long, and follows the words as they are spoken */}
              <span
                ref={bodyRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                }}
                className={`${minimized ? "hidden" : "block"} max-h-[min(40vh,250px)] overflow-y-auto overscroll-contain px-3.5 py-2.5`}
              >
                {step !== "chat" && <span className="block">{shown}</span>}

                {step === "ask" && done && (
                  <span className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={btn} onClick={() => reply("okay")}>
                      I&apos;m okay 🙂
                    </button>
                    <button type="button" className={btn} onClick={() => reply("notOkay")}>
                      Not really
                    </button>
                  </span>
                )}

                {step === "verse" && done && verse && (
                  <>
                    <span className="mt-3 block rounded-xl border border-g200 bg-g50 p-3">
                      <span className="block font-serif text-[14px] italic leading-[1.6] text-g700">“{verse.text}”</span>
                      <span className="micro mt-2 block text-g500">{verse.ref} · KJV</span>
                    </span>
                    <span className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={btn}
                        onClick={() => {
                          const v = showVerse(answer, verse);
                          say(`${v.text} ${v.ref}.`);
                        }}
                      >
                        Another verse
                      </button>
                      <button type="button" className={btn} onClick={close}>
                        Thank you
                      </button>
                    </span>
                  </>
                )}

                {/* The conversation. Everything said so far stays: an answer the visitor interrupted is cut where they interrupted
                    it. What they are saying now appears at the end while the mascot listens. */}
                {step === "chat" && (
                  <>
                    {history.map((m, i) => {
                      if (m.role === "user") {
                        return (
                          <span
                            key={i}
                            className="mb-3 ml-auto block w-fit max-w-[88%] break-words rounded-2xl rounded-br-md bg-g100 px-3 py-1.5 text-[12.5px] leading-[1.5] text-g700"
                          >
                            {m.content}
                          </span>
                        );
                      }
                      const isLast = i === history.length - 1;
                      const full = withoutMarkers(m.content);
                      // the newest answer appears as far as the voice has got (all of it at once when the voice is off)
                      const text = isLast && !m.cut && voice && canSpeak ? full.slice(0, reveal.n) : full;
                      if (!text) {
                        return isLast && !m.cut && (busy || full) ? (
                          <span key={i} className="mb-3 block text-g400">
                            Thinking…
                          </span>
                        ) : null;
                      }
                      return (
                        <span key={i} className="mb-3 block whitespace-pre-wrap break-words">
                          {text}
                          {m.cut && <span className="text-g400"> …</span>}
                        </span>
                      );
                    })}

                    {/* the verses, with the exact King James text, each one appearing as it is read */}
                    {cards.map((c, i) => {
                      const start = counted;
                      counted += "error" in c ? 1 : c.verses.length;
                      if (start >= units) return null;
                      return "error" in c ? (
                        <span key={i} className="mb-3 block text-[12px] text-g500">
                          {verseTrouble(c)}
                        </span>
                      ) : (
                        <span key={i} className="mb-3 block rounded-xl border border-g200 bg-g50 p-3">
                          <span className="micro mb-1.5 block text-g500">
                            {c.reference} · KJV{c.truncated ? " · first 40 verses" : ""}
                          </span>
                          <span className="block font-serif text-[14px] italic leading-[1.6] text-g700">
                            {c.verses.map((v, j) =>
                              start + j < units ? (
                                <span key={`${v.chapter}:${v.verse}`}>
                                  {c.verses.length > 1 && (
                                    <sup className="mr-0.5 font-sans text-[9px] not-italic text-g400">{v.verse}</sup>
                                  )}
                                  {v.text}{" "}
                                </span>
                              ) : null,
                            )}
                          </span>
                        </span>
                      );
                    })}

                    {/* the visitor is talking (the phrase was heard, or they spoke over the mascot): their words appear as they are said */}
                    {hearing && liveWords && (
                      <span className="mb-3 ml-auto block w-fit max-w-[88%] break-words rounded-2xl rounded-br-md bg-g100 px-3 py-1.5 text-[12.5px] leading-[1.5] text-g700">
                        {liveWords}
                      </span>
                    )}
                    {hearing && (
                      <span className="block text-g400">
                        {followUp && !liveWords ? "Listening… just talk, or say “bye” to stop." : "Listening…"}
                      </span>
                    )}
                    {missed && !hearing && (
                      <span className="block text-g500">
                        I didn&apos;t hear anything. Say “{WAKE.phrase}” and I&apos;ll listen again.
                      </span>
                    )}
                  </>
                )}
              </span>

              {/* the visitor can write to the mascot once it has asked how they are */}
              {!minimized && (step === "verse" || step === "chat" || (step === "ask" && done)) && (
                <>
                <form
                  className="flex items-center gap-2 border-t border-g200 px-2.5 py-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send(input);
                  }}
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    maxLength={MAX_INPUT}
                    placeholder={listening ? "Listening… say something" : "Talk to me, or ask for a verse…"}
                    aria-label="Write to the mascot"
                    className="min-w-0 flex-1 rounded-lg border border-g200 bg-g50 px-2.5 py-2 text-[12px] outline-none transition-colors placeholder:text-g400 focus:border-g400 max-lg:py-2.5"
                  />
                  {dictation.supported && (
                    <button
                      type="button"
                      onClick={toggleMic}
                      aria-pressed={listening}
                      aria-label={listening ? "Stop listening" : "Speak instead of typing"}
                      title={listening ? "Stop listening" : "Speak instead of typing"}
                      className={`grid size-8 shrink-0 place-items-center rounded-lg border transition-colors max-lg:size-10 ${
                        listening ? "animate-pulse border-ink bg-ink text-bg" : "border-g200 text-g500 hover:border-ink hover:text-ink"
                      }`}
                    >
                      <Icon name="mic" className="size-3.5" />
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    aria-label="Send"
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-bg transition-opacity disabled:opacity-30 max-lg:size-10"
                  >
                    <Icon name="arrow" className="size-3.5" />
                  </button>
                </form>

                </>
              )}
              {!minimized && (dictation.problem ?? wake.problem ?? wakeProblem ?? (voiceBlocked ? BLOCKED : null)) && (
                <span role="alert" className="block px-3.5 pb-2.5 text-[11.5px] leading-[1.45] text-g500">
                  {dictation.problem ?? wake.problem ?? wakeProblem ?? BLOCKED}
                </span>
              )}
            </span>
          )}
        </span>
      )}

      {/* The mascot. It lives on the intro: it perches on the surname (where its chat box opens), sitting or standing as its mood
          says, and wanders around the portrait. It is drawn over the whole intro (a portal into it), so that it can walk over the
          picture. Click it to talk. */}
      {header &&
        mood &&
        roam.ready &&
        createPortal(
          <div ref={roam.ref} className="pointer-events-none absolute left-0 top-0 z-40" style={{ willChange: "transform" }}>
            <button
              type="button"
              onClick={() => {
                const s = moodRef.current;
                if (s) {
                  moodPet(s, Date.now()); // being clicked cheers it up
                  syncMood();
                  showEmote("heart");
                }
                if (step !== "hidden") return close();
                // In the middle of a conversation by voice, clicking the mascot just opens the chat box (with everything said so
                // far); it does not interrupt with a greeting.
                if (history.length || hearing || busy || heldVoice || isSpeaking()) {
                  setMinimized(false);
                  setStep("chat");
                  stick.current = true;
                } else greet();
              }}
              aria-label={step === "hidden" ? "Say hi to the mascot" : "Close the mascot's message"}
              aria-expanded={step !== "hidden"}
              data-pose={shownPose}
              data-mood={mood}
              className="mascot-pop pointer-events-auto relative block cursor-pointer rounded-md p-0.5 focus-visible:outline-offset-1"
            >
              <MascotSprite
                pose={shownPose}
                mood={mood}
                mouth={mouth}
                emote={emote}
                radiant={radiant}
                face={roam.face}
              />
              {/* the microphone is live: a small dot, so it is never listening without it showing */}
              {handsFree && wake.phase !== "off" && (
                <span
                  aria-hidden
                  title={`Listening for “${WAKE.phrase}”`}
                  className={`absolute right-0 top-0 size-2 rounded-full border border-bg ${
                    hearing ? "animate-pulse bg-[#D97757]" : wake.phase === "paused" ? "bg-g300" : "bg-ink"
                  }`}
                />
              )}
            </button>
          </div>,
          header,
        )}
    </div>
  );
}
