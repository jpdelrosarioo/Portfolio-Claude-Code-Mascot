// Things the mascot can answer at once, without asking the AI: a hello, a thank-you, goodbye, "how are you?", "who are you?",
// a compliment, and orders for itself ("sit down", "go for a walk"). They are chosen by what the visitor meant (lib/nlp.ts)
// and coloured by how the mascot feels (lib/mood.ts), so the same hello is bright when it is happy and quiet when it is sad.
// Anything else (a real question, a worry, a verse) goes to the AI.

import { FEELING, type Mood } from "./mood";
import type { Analysis, Command } from "./nlp";

export type Quick = { text: string; command?: Command };

const pick = <T,>(list: T[], rng: () => number) => list[Math.floor(rng() * list.length)];

const COMMAND_REPLY: Record<Command, string[]> = {
  sit: ["Okay, sitting down.", "Sitting down. 🙂", "Taking a seat."],
  stand: ["Standing up!", "Up I get!", "There, I'm standing."],
  walk: ["Off I go! 🚶", "Let's explore!", "Time for a little walk."],
  come: ["Coming!", "On my way back.", "Right here with you."],
  stay: ["Okay, I'll stay right here.", "Staying put.", "I won't move."],
  sleep: ["Zzz... goodnight. 😴", "Okay... a little nap.", "Sleepy time..."],
  wake: ["I'm up! I'm up!", "Good morning! ...is it morning?", "Awake again!"],
  dance: ["Watch this! 💃", "Here I go!", "Dance time!"],
  jump: ["Boing!", "Up!", "Here's a jump!"],
  wave: ["Hi everyone! 👋", "Hello hello! 👋", "*waves*"],
};

const GREETING: Record<Mood, string[]> = {
  excited: ["Hi hi hi! You made my day!", "Hello! I'm so happy you're here!"],
  happy: ["Hi there! I'm so glad you're here. 🙂", "Hello, friend! How's your day going?"],
  curious: ["Hello! I was just wondering who would stop by.", "Hi! What would you like to talk about?"],
  proud: ["Hi! Thank you for being so kind. 😊", "Hello! You always make me smile."],
  calm: ["Hi. It's nice to see you.", "Hello. Come sit with me for a bit."],
  sleepy: ["Hi... *yawn* sorry, I was dozing.", "Oh, hello! I was almost asleep."],
  sad: ["Hi... I'm glad you came by.", "Hello. It's good to have some company."],
  worried: ["Hi! I'm okay, just a little worried. I'm glad you're here.", "Hello. Stay a while?"],
};
const FAREWELL = ["Take care! I'll be right here if you need me.", "Goodbye for now. God bless you! 🙂", "See you soon. Be kind to yourself today.", "Bye! Come back and tell me how it went."];
const THANKS = ["You're very welcome!", "Anytime. I'm always happy to help. 🙂", "That makes me smile.", "Of course! That's what I'm here for."];
const COMPLIMENT = ["Aww, thank you! That made my day. 🥰", "You're so kind. I'm blushing!", "Thank you! You're wonderful too."];
const INSULT = ["That hurt a little, but I forgive you. Want to talk about it?", "Oh... okay. I hope your day gets better."];
const WHO = [
  "I'm the little pixel mascot who lives on this page. I'm here to cheer you up. You can talk to me, or ask me for a verse.",
  "I'm a small pixel friend who lives here. I listen, I encourage, and I read Bible verses if you want one.",
];

const hourWord = (h: number) => (h < 5 ? "It's late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

/**
 * An instant answer to something simple, or null when the AI should answer. Only short messages that are really just that
 * (a hello, a thanks...) are answered here; a longer message that happens to contain "thanks" goes on to the AI.
 */
export function quickReply(a: Analysis, mood: Mood, hour: number, rng: () => number = Math.random): Quick | null {
  switch (a.intent) {
    case "command":
      return a.command ? { text: pick(COMMAND_REPLY[a.command], rng), command: a.command } : null;
    case "greeting": {
      const base = pick(GREETING[mood], rng);
      return { text: rng() < 0.4 && mood !== "sleepy" && mood !== "sad" ? `${hourWord(hour)}! ${base}` : base };
    }
    case "thanks":
      return a.words <= 6 && !a.question ? { text: pick(THANKS, rng) } : null;
    case "farewell":
      return a.words <= 6 && !a.question ? { text: pick(FAREWELL, rng) } : null;
    case "compliment":
      return a.words <= 8 ? { text: pick(COMPLIMENT, rng) } : null;
    case "insult":
      return a.words <= 6 ? { text: pick(INSULT, rng) } : null;
    case "how_are_you":
      return a.words <= 8 ? { text: `I'm feeling ${FEELING[mood]}. How about you?` } : null;
    case "who_are_you":
      return a.words <= 8 ? { text: pick(WHO, rng) } : null;
    default:
      return null;
  }
}
