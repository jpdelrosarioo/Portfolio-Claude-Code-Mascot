// The mascot's mood. It is two numbers: how good it feels (valence, -1 … 1) and how much energy it has (0 … 1). They start
// from the time of day (cheerful in the morning, sleepy at night, a little different on every visit), move when the visitor
// says something (what the visitor feels rubs off: kindness makes it glad, sadness makes it sad and quiet), and slowly
// settle back by themselves. Lack of company slowly tires it. The mood has a name, and the name decides how it stands.

import type { Analysis } from "./nlp";

export type Mood = "excited" | "happy" | "curious" | "proud" | "calm" | "sleepy" | "sad" | "worried";
export type Posture = "sit" | "stand";
/** A little picture that floats up from the mascot when something touches its feelings. */
export type Emote = "heart" | "sparkle" | "sweat" | "tear" | "zzz";

/** Excited, happy, curious and proud mascots stand; calm, sleepy, sad and worried ones sit. */
export const POSTURE: Record<Mood, Posture> = {
  excited: "stand",
  happy: "stand",
  curious: "stand",
  proud: "stand",
  calm: "sit",
  sleepy: "sit",
  sad: "sit",
  worried: "sit",
};

export type MoodState = {
  v: number; // how good it feels
  e: number; // how much energy it has
  baseV: number; // where both drift back to (the time of day)
  baseE: number;
  proudUntil: number; // proud for a little while after a compliment
  gladUntil: number; // happy for a while after the visitor speaks of God
  radiantUntil: number; // and shining (a bright glow round its head and body) for as long
  lastTouch: number; // the last time someone talked to it
  at: number; // the last time the mood was updated
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** What the mascot feels like at this hour before anyone talks to it. */
export function baseline(hour: number): { v: number; e: number } {
  if (hour >= 6 && hour < 11) return { v: 0.3, e: 0.62 }; // a bright morning
  if (hour >= 11 && hour < 17) return { v: 0.12, e: 0.6 }; // busy and curious
  if (hour >= 17 && hour < 21) return { v: 0.1, e: 0.42 }; // winding down
  return { v: 0.05, e: 0.16 }; // night: sleepy
}

export function createMood(now: number, rng: () => number = Math.random): MoodState {
  const b = baseline(new Date(now).getHours());
  // a little different on every visit, so it does not always greet you the same way
  const v = clamp(b.v + (rng() - 0.5) * 0.16, -1, 1);
  const e = clamp(b.e + (rng() - 0.5) * 0.16, 0, 1);
  return { v, e, baseV: v, baseE: e, proudUntil: 0, gladUntil: 0, radiantUntil: 0, lastTouch: now, at: now };
}

/** How long it shines after God is mentioned (each mention starts it again). */
export const RADIANT_MS = 24000;
export const GLAD_MS = 18000;

/** Is it shining right now? */
export function isRadiant(s: MoodState, now: number): boolean {
  return now < s.radiantUntil;
}

/** The name of the mood right now. */
export function labelOf(s: MoodState, now: number): Mood {
  if (now < s.gladUntil) return "happy"; // (God was mentioned: it is glad, whatever the hour)
  if (now < s.proudUntil) return "proud";
  if (s.e < 0.25) return s.v < -0.2 ? "sad" : "sleepy";
  if (s.e < 0.5) return s.v < -0.2 ? "sad" : "calm";
  if (s.e < 0.78) return s.v >= 0.2 ? "happy" : s.v <= -0.2 ? "worried" : "curious";
  return s.v >= 0.2 ? "excited" : s.v <= -0.2 ? "worried" : "curious";
}

/** Time passes: the mood drifts back to normal (half way in about a minute and a half), and being alone for long tires it. */
export function tick(s: MoodState, now: number) {
  const dt = Math.max(0, (now - s.at) / 1000);
  s.at = now;
  if (!dt) return;
  const idle = (now - s.lastTouch) / 1000;
  const tired = idle > 150 ? Math.min(0.35, ((idle - 150) / 600) * 0.35) : 0; // after a couple of minutes alone it gets sleepy
  const k = 1 - Math.pow(0.5, dt / 90);
  s.v += (s.baseV - s.v) * k;
  s.e += (clamp(s.baseE - tired, 0, 1) - s.e) * k;
}

/** The emote that goes with how it feels, if it feels strongly. */
export function emoteFor(label: Mood): Emote | null {
  return label === "excited" || label === "happy" ? "sparkle" : label === "proud" ? "heart" : label === "sad" ? "tear" : label === "worried" ? "sweat" : label === "sleepy" ? "zzz" : null;
}

/**
 * The visitor said something: what it makes the mascot feel. What they feel rubs off (a sad visitor makes a gentle, sad
 * mascot; a happy one makes it bounce), and some things touch it directly (thanks, a compliment, goodbye, an insult).
 * Returns an emote to show, if there is one.
 */
export function hear(s: MoodState, a: Analysis, now: number): Emote | null {
  tick(s, now);
  s.lastTouch = now;
  let dv = a.valence * 0.4;
  let de = (a.arousal - 0.5) * 0.3 + 0.04; // somebody is here: a little livelier
  let emote: Emote | null = null;
  const strong = Math.max(a.strength, Math.abs(a.valence));

  switch (a.emotion) {
    case "sadness":
    case "loneliness":
      dv -= 0.45 * strong; // (a sad visitor should move it clearly, however cheerful it was)
      de -= 0.2 * strong;
      emote = "tear";
      break;
    case "fear":
    case "stress":
      dv -= 0.32 * strong;
      de += 0.2 * strong;
      emote = "sweat";
      break;
    case "anger":
      dv -= 0.32 * strong;
      de += 0.12 * strong;
      emote = "sweat";
      break;
    case "tired":
      de -= 0.3 * strong;
      emote = "zzz";
      break;
    case "joy":
    case "excitement":
      dv += 0.3 * strong;
      de += 0.25 * strong;
      emote = "sparkle";
      break;
    case "gratitude":
    case "love":
      dv += 0.35 * strong;
      de += 0.12;
      s.proudUntil = now + 20000;
      emote = "heart";
      break;
  }
  switch (a.intent) {
    case "greeting":
      de += 0.2;
      dv += 0.15;
      emote ??= "sparkle";
      break;
    case "thanks":
    case "compliment":
      dv += 0.35;
      de += 0.15;
      s.proudUntil = now + 20000;
      emote = "heart";
      break;
    case "farewell":
      dv -= 0.1;
      de -= 0.2;
      break;
    case "insult":
      dv -= 0.5;
      de -= 0.1;
      emote = "tear";
      break;
    case "joke":
      dv += 0.25;
      de += 0.1;
      emote = "sparkle";
      break;
    case "encourage":
      de += 0.1; // somebody needs it: it wakes up and pays attention
      break;
  }
  // God is mentioned: it is glad and it shines. (If the visitor is hurting it still shines, for comfort, but it does not put
  // on a happy face over their sadness: its mood only lifts a little.)
  if (a.faith) {
    const hurting = a.valence < -0.3 || ["sadness", "loneliness", "fear", "stress", "anger"].includes(a.emotion);
    s.radiantUntil = now + RADIANT_MS;
    if (hurting) {
      dv += 0.12;
      de += 0.05;
    } else {
      s.gladUntil = now + GLAD_MS;
      dv += 0.35;
      de += 0.22;
      emote = "sparkle";
    }
  }
  s.v = clamp(s.v + dv, -1, 1);
  s.e = clamp(s.e + de, 0, 1);
  // an unhappy visitor keeps it from settling straight back: the mood lingers a little
  if (a.valence < -0.3) s.baseV = clamp(s.baseV - 0.04, -0.3, 1);
  return emote;
}

/**
 * What it says itself barely moves it (comforting someone does not cure its own sadness: it would otherwise cheer up the
 * moment it started to say something kind to a sad visitor).
 */
export function say(s: MoodState, a: Analysis, now: number) {
  tick(s, now);
  s.v = clamp(s.v + a.valence * 0.04, -1, 1);
  s.e = clamp(s.e + (a.arousal - 0.5) * 0.03, 0, 1);
}

/** A Bible reference was asked for ("John 3:16"): that is God's word, so it is glad and shines, as when God is mentioned. */
export function shine(s: MoodState, now: number) {
  tick(s, now);
  s.lastTouch = now;
  s.radiantUntil = now + RADIANT_MS;
  s.gladUntil = now + GLAD_MS;
  s.v = clamp(s.v + 0.3, -1, 1);
  s.e = clamp(s.e + 0.2, 0, 1);
}

/** Something nice (a click, a pat): it perks up. */
export function pet(s: MoodState, now: number) {
  tick(s, now);
  s.lastTouch = now;
  s.v = clamp(s.v + 0.15, -1, 1);
  s.e = clamp(s.e + 0.15, 0, 1);
}

/** How it would say it feels. */
export const FEELING: Record<Mood, string> = {
  excited: "so excited! I've been bouncing around all day",
  happy: "happy! It's a good day",
  curious: "curious, and wondering what you'll tell me next",
  proud: "proud and a little shy",
  calm: "calm and cozy",
  sleepy: "a bit sleepy, to be honest",
  sad: "a little sad today, but talking with you helps",
  worried: "a little worried, but I'm okay",
};
