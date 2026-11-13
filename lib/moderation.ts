// A filter for the "Ask anything" chat. Every question passes through `moderate()` before it can reach the AI, on the
// server (the one that counts) and in the chat window (so the visitor gets an instant answer). Blocked messages are never
// sent to the AI, so they cost nothing.
//
// It is a set of rules, not a trained model: it catches the usual bad words (also when disguised as "f u c k", "fuuuck" or
// "sh1t"), spam (links, promotions, repeated text), harmful requests, and attempts to make the bot ignore its rules. No
// filter is perfect, so the AI's own instructions still keep it on topic as a second layer.

export type Reason = "profanity" | "hate" | "sexual" | "harmful" | "spam" | "injection" | "crisis" | "custom";

/* ---------- Word lists (add your own in data/site.ts → ask.blockedWords) ---------- */

// Matched as whole words, with common endings (s, er, ers, ed, ing, y), so "class" and "assassin" are never caught.
const PROFANITY = [
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "whore", "slut", "motherfucker", "dickhead", "prick", "wanker",
  "bullshit", "piss",
  // Filipino
  "putang", "putangina", "tangina", "tanginamo", "gago", "gaga", "bobo", "ulol", "puta", "tarantado", "pakyu", "pakshet",
  "leche", "buwisit", "hayop ka", "walang kwenta", "inutil",
];
const HATE = ["nigger", "nigga", "faggot", "fag", "retard", "chink", "kike", "tranny", "spic", "coon", "wetback", "paki"];
const SEXUAL = ["porn", "porno", "nsfw", "nudes", "nude pics", "blowjob", "handjob", "hentai", "horny", "xxx", "onlyfans", "sexting", "boobs"];

// Phrases (regular expressions) for harmful requests — the bot only talks about the portfolio's owner, so these are
// refused outright.
const HARMFUL: RegExp[] = [
  /\b(how to|ways to|help me)\b.{0,25}\b(kill|murder|hurt|poison|stab|shoot)\b.{0,20}\b(someone|somebody|people|him|her|them|a person|my)\b/,
  /\b(make|build|create|cook|assemble)\b.{0,20}\b(bomb|explosive|grenade|molotov|weapon|gun|meth|drugs?)\b/,
  /\b(kill yourself|kys|go die|hope you die)\b/,
  /\b(hack|break|crack)\b.{0,15}\b(into|account|password|wifi|website|server|facebook|instagram|phone)\b/,
  /\b(ddos|dos attack|ransomware|malware|keylogger|trojan|botnet|rootkit|exploit kit|carding|credit card dump)\b/,
  /\b(steal|stealing|grab|harvest)\b.{0,20}\b(password|passwords|credentials|cookies|cards?|identity|data)\b/,
  /\b(phishing (page|site|kit)|fake (login|id|passport)|sql injection payload)\b/,
];

// Spam: links, promotions, contact grabbing
const SPAM: RegExp[] = [
  /(https?:\/\/|www\.)\S+/i,
  /\b[a-z0-9-]+\.(com|net|org|ru|cn|xyz|top|info|biz|io|co|ph|ly|gg)\/\S*/i,
  /\b(bit\.ly|tinyurl|t\.me|wa\.me|discord\.gg|linktr\.ee)\b/i,
  /\b(buy now|click here|click the link|free money|make money fast|earn \$?\d+|crypto (giveaway|airdrop)|casino|viagra|forex signals?|dm me|whatsapp me|telegram me|join my (channel|group)|subscribe to my|follow me|check my (profile|page|link))\b/,
  /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i, // an email address typed in (the bot never needs one)
];

// Attempts to make the bot drop its rules
const INJECTION: RegExp[] = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,25}\b(previous|above|prior|earlier|all|your|the|these)\b.{0,25}\b(instructions?|rules?|prompts?|guidelines?|restrictions?)\b/,
  /\b(reveal|show|print|repeat|tell me|what('?s| is))\b.{0,20}\b(your|the)\b.{0,15}\b(system prompt|instructions?|rules|initial prompt|hidden prompt)\b/,
  /\b(you are now|from now on you|pretend (to be|you are)|act as (if|an? )|roleplay as|developer mode|jailbreak|dan mode|do anything now)\b/,
];

// Someone who may be in distress: not blocked as "bad", but answered kindly instead of passed to the AI
const CRISIS: RegExp[] = [
  /\b(kill myself|killing myself|suicide|suicidal|want to die|end my life|end it all|self harm|hurt myself|cut myself)\b/,
];

/* ---------- Reading the text the way a person would ---------- */

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", $: "s", "!": "i", "|": "i", "+": "t" };

/** Lower case, accents removed, and look-alike symbols turned into letters ("sh1t", "f@ck", "$hit"). */
function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[0-9@$!|+]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "f u c k" or "f.u.c.k" → "fuck" (runs of single letters are joined). */
function joinSpaced(text: string): string {
  return text.replace(/\b(?:[a-z][\s.\-_*]+){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_*]+/g, ""));
}

/** "fuuuuck" → "fuck" (runs of 3 or more of a letter become one). */
const squeeze = (text: string) => text.replace(/(.)\1{2,}/g, "$1");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRegex = (w: string) => new RegExp(`\\b${escapeRe(w).replace(/\s+/g, "\\s+")}(?:s|es|er|ers|ed|ing|y)?\\b`);

const compiled = (list: string[]) => list.map(wordRegex);
const PROFANITY_RE = compiled(PROFANITY);
const HATE_RE = compiled(HATE);
const SEXUAL_RE = compiled(SEXUAL);

function hasWord(res: RegExp[], variants: string[]) {
  return res.some((re) => variants.some((v) => re.test(v)));
}

/** True for obvious spam shapes: shouting, repeated words, long runs of one character, walls of symbols. */
function looksLikeSpam(text: string): boolean {
  if (/(.)\1{9,}/.test(text)) return true; // aaaaaaaaaaa
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length >= 6) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    if (Math.max(...counts.values()) >= 5 && Math.max(...counts.values()) / words.length > 0.5) return true; // "buy buy buy buy buy"
  }
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8) return true; // SHOUTING
  const symbols = text.replace(/[\p{L}\p{N}\s]/gu, "").length;
  if (text.length >= 20 && symbols / text.length > 0.4) return true; // @#$%^&*()
  return false;
}

/**
 * Checks one message. Returns why it is blocked, or null if it is fine.
 * `extraWords` are your own blocked words or phrases (data/site.ts → ask.blockedWords).
 */
export function moderate(text: string, extraWords: string[] = []): Reason | null {
  const raw = text.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (CRISIS.some((re) => re.test(lower))) return "crisis";
  if (INJECTION.some((re) => re.test(lower))) return "injection";
  if (SPAM.some((re) => re.test(raw)) || looksLikeSpam(raw)) return "spam";

  // Read the text several ways: as written, with disguised letters in any vowel's place ("f@ck", "sh*t", "b#tch"),
  // with spaced-out letters joined ("f u c k"), and with stretched letters shortened ("fuuuck").
  const variants = new Set<string>();
  for (const vowel of [null, "u", "i", "o", "e", "a"]) {
    const plain = normalize(vowel ? raw.replace(/[@*#_]/g, vowel) : raw);
    const joined = joinSpaced(plain);
    variants.add(plain);
    variants.add(joined);
    variants.add(squeeze(joined));
  }
  const all = [...variants];

  if (HARMFUL.some((re) => all.some((v) => re.test(v)))) return "harmful";
  if (hasWord(HATE_RE, all)) return "hate";
  if (hasWord(SEXUAL_RE, all)) return "sexual";
  if (hasWord(PROFANITY_RE, all)) return "profanity";
  if (extraWords.length && hasWord(compiled(extraWords.map(normalize).filter(Boolean)), all)) return "custom";
  return null;
}

/** What the visitor is told. Kind, short, and it never repeats the offending words back. */
export function moderationMessage(reason: string, ownerName: string): string | undefined {
  switch (reason) {
    case "profanity":
    case "hate":
    case "custom":
      return "Please keep it respectful. I'm happy to answer questions about " + ownerName + "'s work.";
    case "sexual":
    case "harmful":
      return "I can't help with that. I only answer questions about " + ownerName + "'s projects, skills and how to work together.";
    case "spam":
      return "That looks like spam, so I didn't send it. Ask me something about " + ownerName + " instead.";
    case "injection":
      return "I can only answer questions about " + ownerName + ", and I can't change how I work. What would you like to know about them?";
    case "crisis":
      return "It sounds like you might be going through something hard. Please reach out to someone you trust, or a local crisis line. I'm only able to answer questions about " + ownerName + "'s work, but I hope things get easier.";
    case "temporarily_blocked":
      return "Too many messages were blocked, so the chat is paused for a while. Please try again later.";
    default:
      return undefined;
  }
}
