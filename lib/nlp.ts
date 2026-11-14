// A small natural-language layer for the mascot. It runs in the browser (no library, nothing is sent anywhere) and works
// out, from what the visitor wrote or said:
//   - how they feel: sentiment (positive or negative, calm or worked up) and the main emotion, with negation ("not happy"),
//     intensity ("so sad", "a bit tired"), "but" (what comes after it counts more), shouting and emoji;
//   - what they want: greeting, goodbye, thanks, a compliment, "how are you", "who are you", a request for encouragement, or a
//     command for the mascot itself ("sit down", "go for a walk");
// so the mascot can feel something about it (lib/mood.ts), answer the simple things at once, and tell the AI how the
// visitor seems to be, so that it answers with the right tone.

export type Emotion = "joy" | "excitement" | "gratitude" | "love" | "sadness" | "loneliness" | "anger" | "fear" | "stress" | "tired" | "neutral";
export type Intent =
  | "greeting"
  | "farewell"
  | "thanks"
  | "compliment"
  | "insult"
  | "how_are_you"
  | "who_are_you"
  | "command"
  | "encourage"
  | "joke"
  | "prayer"
  | "question"
  | "none";
export type Command = "sit" | "stand" | "walk" | "come" | "stay" | "sleep" | "wake" | "dance" | "jump" | "wave";

export type Analysis = {
  /** -1 (very negative) … 1 (very positive). */
  valence: number;
  /** 0 (calm, low) … 1 (worked up, high energy). */
  arousal: number;
  emotion: Emotion;
  /** How strongly the emotion shows (0 … 1). */
  strength: number;
  intent: Intent;
  command?: Command;
  question: boolean;
  /** The visitor spoke of God (God, Jesus, the Lord, the Bible, a prayer, a verse...): the mascot is glad and shines. */
  faith: boolean;
  /** How many words it was (short messages are easier to answer without the AI). */
  words: number;
};

/* ---------- the words ---------- */

// word:score, from -4 (awful) to 4 (wonderful)
const VALENCE = Object.fromEntries(
  (
    "love:3 loved:3 loving:3 adore:3 great:3 good:2 nice:2 happy:3 glad:2 awesome:4 amazing:4 wonderful:4 excellent:3 fantastic:4 " +
    "beautiful:3 blessed:3 grateful:3 thankful:3 thanks:2 thank:2 proud:3 excited:3 fun:2 cool:2 best:3 better:2 perfect:3 brilliant:3 " +
    "joy:3 joyful:3 smile:2 smiling:2 laugh:2 enjoy:2 enjoyed:2 hope:2 hopeful:2 peace:2 peaceful:2 calm:1 relaxed:2 safe:2 strong:2 " +
    "win:2 won:2 success:3 successful:3 congrats:3 congratulations:3 yay:3 hooray:3 wow:2 lovely:3 sweet:2 kind:2 gentle:1 cute:2 " +
    "funny:2 lol:2 haha:2 hehe:2 fine:1 okay:1 ok:1 well:1 healed:3 healing:2 relief:2 relieved:2 comfortable:2 motivated:2 " +
    "inspired:3 confident:2 free:2 alive:2 thrilled:4 delighted:3 cheerful:3 glorious:3 faithful:2 faith:1 praise:2 amen:1 " +
    "sad:-3 unhappy:-3 depressed:-4 depression:-3 cry:-2 crying:-3 cried:-3 tears:-2 lonely:-3 alone:-2 hurt:-2 hurts:-2 pain:-3 " +
    "painful:-3 sick:-2 ill:-2 tired:-2 exhausted:-3 drained:-3 anxious:-3 anxiety:-3 worried:-2 worry:-2 afraid:-3 scared:-3 " +
    "fear:-3 nervous:-2 stress:-2 stressed:-3 overwhelmed:-3 angry:-3 mad:-2 hate:-3 hated:-3 annoyed:-2 frustrated:-3 upset:-2 " +
    "awful:-3 terrible:-3 horrible:-3 bad:-2 worse:-3 worst:-4 hopeless:-4 lost:-2 empty:-3 broken:-3 failed:-3 failure:-3 fail:-2 " +
    "sorry:-1 miss:-2 missed:-2 grief:-3 grieving:-3 died:-3 death:-3 bored:-2 ugh:-2 sucks:-3 disappointed:-3 ashamed:-3 " +
    "guilty:-2 regret:-2 struggling:-2 struggle:-2 hard:-1 difficult:-1 rough:-2 heavy:-1 burden:-2 confused:-1 stuck:-2 " +
    "useless:-3 worthless:-4 stupid:-3 dumb:-3 ugly:-3 annoying:-2 trash:-3 insomnia:-2 panic:-3 terrified:-4 furious:-4 " +
    "pissed:-3 irritated:-2 heartbroken:-4 isolated:-3 nobody:-1 burnout:-3 pressure:-1 fed:-1 down:-2 low:-1 numb:-2"
  )
    .split(" ")
    .map((p) => p.split(":"))
    .map(([w, n]) => [w, Number(n)]),
) as Record<string, number>;

// how worked up a word is: + high energy, - low energy
const AROUSAL = Object.fromEntries(
  (
    "excited:2 thrilled:3 amazing:2 awesome:2 wow:2 yay:2 hooray:2 angry:2 furious:3 mad:2 scared:2 terrified:3 panic:3 anxious:2 " +
    "nervous:2 stressed:2 overwhelmed:2 frustrated:2 hype:2 pumped:2 stoked:2 love:1 laugh:1 haha:1 lol:1 " +
    "tired:-2 exhausted:-3 sleepy:-3 drained:-2 calm:-2 peaceful:-2 relaxed:-2 sad:-1 bored:-2 slow:-1 lonely:-1 numb:-2 " +
    "depressed:-2 hopeless:-2 sigh:-1 rest:-1 nap:-2"
  )
    .split(" ")
    .map((p) => p.split(":"))
    .map(([w, n]) => [w, Number(n)]),
) as Record<string, number>;

const EMOTIONS: Record<Exclude<Emotion, "neutral">, string> = {
  joy: "happy glad joy joyful delighted cheerful great awesome yay smile smiling fun enjoy enjoyed wonderful",
  excitement: "excited thrilled pumped stoked hype amazing wow cant-wait",
  gratitude: "thank thanks thankful grateful appreciate appreciated blessed",
  love: "love loved adore heart lovely sweetheart",
  sadness: "sad unhappy depressed cry crying cried tears down heartbroken grief grieving miss missed hurt hurts hopeless empty",
  loneliness: "lonely alone isolated nobody",
  anger: "angry mad furious hate hated annoyed pissed irritated frustrated",
  fear: "afraid scared anxious anxiety nervous worried worry panic fear terrified",
  stress: "stressed stress overwhelmed pressure burnout deadline",
  tired: "tired sleepy exhausted drained insomnia sleep",
};
const EMOTION_OF: Record<string, Exclude<Emotion, "neutral">> = {};
for (const [e, list] of Object.entries(EMOTIONS)) for (const w of list.split(" ")) EMOTION_OF[w] = e as Exclude<Emotion, "neutral">;

const EMOJI: Record<string, number> = {
  "😊": 2, "😀": 2, "😃": 2, "😄": 3, "😁": 3, "🙂": 1, "😍": 3, "🥰": 3, "❤": 3, "💕": 3, "💖": 3, "🙏": 1, "✨": 2, "🎉": 3, "👍": 2,
  "😂": 2, "🤣": 2, "😎": 2, "🥳": 3, "😢": -3, "😭": -3, "😞": -2, "😔": -2, "☹": -2, "🙁": -2, "😟": -2, "😰": -3, "😨": -3,
  "😡": -3, "😠": -3, "💔": -4, "😩": -3, "😫": -3, "🥺": -2, "😪": -2, "😴": -1,
};

const NEGATORS = new Set(["not", "no", "never", "without", "hardly", "barely", "cannot", "neither", "nothing"]);
const BOOST: Record<string, number> = { very: 0.3, really: 0.3, so: 0.3, extremely: 0.45, super: 0.35, totally: 0.3, absolutely: 0.4, incredibly: 0.4, quite: 0.15, too: 0.2, truly: 0.3, deeply: 0.35 };
const DIMINISH: Record<string, number> = { bit: -0.3, slightly: -0.3, kinda: -0.25, somewhat: -0.25, little: -0.25, mildly: -0.3 };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Words, numbers, emoji and the marks that matter (! ? .), with curly apostrophes made straight. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z0-9]+(?:'[a-z]+)?|[!?.]+|\p{Extended_Pictographic}/gu) ?? []).map((t) =>
    t.replace(/️/g, ""),
  );
}

/* ---------- what they want ---------- */

const POLITE = "(?:(?:please|pls|hey|ok|okay|then|now)\\s+)*(?:(?:can|could|would|will)\\s+you\\s+|you\\s+can\\s+|go\\s+ahead\\s+and\\s+|let'?s\\s+)?(?:please\\s+)?";
const TAIL = "(?:\\s+(?:please|pls|now|there|for\\s+me|again|a\\s+bit|little|here))*[.!?\\s]*$";
const cmd = (body: string) => new RegExp(`^${POLITE}(?:${body})${TAIL}`);
const COMMANDS: [Command, RegExp][] = [
  ["sit", cmd("sit(?:\\s+down)?|take\\s+a\\s+seat|have\\s+a\\s+seat")],
  ["stand", cmd("stand(?:\\s+up)?|get\\s+up|rise")],
  ["walk", cmd("walk(?:\\s+around)?|go\\s+for\\s+a\\s+walk|go\\s+explore|explore(?:\\s+around)?|wander(?:\\s+around)?|roam(?:\\s+around)?|move\\s+around|go\\s+play|go\\s+around|run\\s+around")],
  ["come", cmd("come(?:\\s+(?:here|back|home|over|to\\s+me))?|go\\s+(?:back|home)|return")],
  ["stay", cmd("stay(?:\\s+(?:there|here|put|still))?|stay\\s+where\\s+you\\s+are|stop\\s+moving|don'?t\\s+move|hold\\s+still")],
  ["sleep", cmd("sleep|go\\s+to\\s+sleep|take\\s+a\\s+nap|nap|rest|get\\s+some\\s+sleep|go\\s+to\\s+bed")],
  ["wake", cmd("wake(?:\\s+up)?")],
  ["dance", cmd("dance|do\\s+a\\s+dance|show\\s+me\\s+a\\s+dance")],
  ["jump", cmd("jump|hop|do\\s+a\\s+jump|jump\\s+up")],
  ["wave", cmd("wave|say\\s+hi\\s+to\\s+everyone|wave\\s+hello")],
];

const INTENTS: [Intent, RegExp][] = [
  ["farewell", /\b(?:bye|goodbye|good\s?bye|see\s+(?:you|ya)|gotta\s+go|have\s+to\s+go|good\s?night|talk\s+(?:to\s+you\s+)?later|take\s+care|ttyl|catch\s+you\s+later)\b/],
  ["thanks", /\b(?:thank(?:s|\s+you)?|thx|ty|appreciate\s+(?:it|you|that))\b/],
  ["greeting", /^(?:(?:hi|hello|hey|hiya|yo|heya|howdy|greetings|sup|good\s+(?:morning|afternoon|evening))\b[\s,.!]*(?:there|mascot|friend|buddy)?[\s,.!?]*)$/],
  ["how_are_you", /\b(?:how\s+are\s+you|how'?s\s+it\s+going|how\s+do\s+you\s+feel|how\s+are\s+you\s+feeling|are\s+you\s+(?:ok|okay|alright)|how\s+have\s+you\s+been|how\s+is\s+your\s+day|you\s+(?:ok|okay)\??)\b/],
  ["who_are_you", /\b(?:who\s+are\s+you|what\s+are\s+you|what'?s\s+your\s+name|what\s+is\s+your\s+name|are\s+you\s+(?:a\s+)?(?:bot|robot|ai|real|alive))\b/],
  ["compliment", /\b(?:you'?re|you\s+are|ur)\s+(?:so\s+|really\s+|very\s+)?(?:cute|sweet|awesome|amazing|great|kind|funny|the\s+best|adorable|lovely|helpful|wonderful|cool)\b|\bi\s+(?:really\s+)?(?:like|love)\s+you\b|\bgood\s+(?:job|boy|mascot)\b|\bwell\s+done\b/],
  ["insult", /\b(?:you'?re|you\s+are|ur)\s+(?:so\s+|really\s+)?(?:stupid|dumb|useless|ugly|annoying|trash|bad|worthless)\b|\bshut\s+up\b|\bi\s+hate\s+you\b/],
  ["encourage", /\b(?:encourage|motivate|cheer\s+me\s+up|need\s+(?:a\s+)?(?:hug|encouragement|hope|motivation|someone)|inspire\s+me|i'?m\s+(?:feeling\s+)?(?:down|low|sad)|give\s+me\s+hope)\b/],
  ["joke", /\b(?:joke|make\s+me\s+laugh|something\s+funny)\b/],
  ["prayer", /\b(?:pray|prayer|pray\s+for\s+me)\b/],
];

// Words about God. (Whole words only: "godzilla" and "cross-country" do not count.)
const FAITH =
  /\b(?:god|gods|god'?s|godly|jesus|christ|christian|lord|lord'?s|savio?u?r|messiah|almighty|creator|heavenly\s+father|father\s+god|holy\s+(?:spirit|ghost|bible)|trinity|jehovah|yahweh|bible|biblical|scripture|scriptures|gospel|psalms?|proverbs|kjv|verse|verses|heaven|amen|hallelujah|alleluia|praise|praying|pray|prayer|prayers|prayed|worship|blessing|blessed|faith|church|divine|hymn|hymns|lord\s+jesus|in\s+jesus'?\s+name)\b/;

/** Does it speak of God? ("God", "Jesus", "the Lord", "the Bible", "pray for me", "a verse about hope"...) */
export function mentionsGod(text: string): boolean {
  return FAITH.test(text.toLowerCase().replace(/[‘’]/g, "'"));
}

/** Does the whole message amount to a command for the mascot ("sit down", "can you please walk around?")? */
export function commandIn(text: string): Command | undefined {
  const t = text.toLowerCase().replace(/[‘’]/g, "'").trim();
  if (t.split(/\s+/).length > 9) return undefined;
  for (const [c, re] of COMMANDS) if (re.test(t)) return c;
  return undefined;
}

/* ---------- putting it together ---------- */

export function analyze(text: string): Analysis {
  const raw = text.replace(/[‘’]/g, "'");
  const t = tokenize(raw);
  const wordsOnly = t.filter((x) => /[a-z0-9]/.test(x));
  const caps = (raw.match(/\b[A-Z]{3,}\b/g) ?? []).length;
  const bangs = Math.min(3, (raw.match(/!/g) ?? []).length);

  let sum = 0;
  let arousal = 0;
  const emotion: Partial<Record<Exclude<Emotion, "neutral">, number>> = {};
  let butAt = -1;

  for (let i = 0; i < t.length; i++) {
    const w = t[i];
    if (w === "but" || w === "however") butAt = i;
    let score = VALENCE[w] ?? EMOJI[w] ?? 0;
    if (/^(?:ha){2,}h?$|^(?:he){2,}$|^lmao$/.test(w)) score = 2; // laughing
    const energy = AROUSAL[w] ?? 0;
    const kind = EMOTION_OF[w];
    if (!score && !energy && !kind) continue;

    // "very" / "a bit" just before it
    let scale = 1;
    for (let k = Math.max(0, i - 2); k < i; k++) scale += (BOOST[t[k]] ?? 0) + (DIMINISH[t[k]] ?? 0);
    // "not", "never", "don't"... within the three words before it (not past a full stop)
    let negated = false;
    for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
      if (/^[!?.]+$/.test(t[k])) break;
      if (NEGATORS.has(t[k]) || /n't$/.test(t[k])) negated = true;
    }
    if (caps && w === w.toLowerCase() && raw.includes(w.toUpperCase())) scale += 0.25; // SHOUTED
    if (negated) {
      score *= -0.74;
      scale *= 0.9;
    }
    sum += score * scale;
    arousal += energy * (negated ? -0.5 : 1);
    if (kind) {
      // "not happy" is a sad thing to say; "not sad" is not an emotion at all
      const asKind = negated ? (kind === "joy" || kind === "excitement" || kind === "love" ? "sadness" : undefined) : kind;
      if (asKind) emotion[asKind] = (emotion[asKind] ?? 0) + (Math.abs(score) || 1) * scale;
    }
    if (butAt >= 0 && i > butAt) sum += score * scale * 0.5; // what comes after "but" counts more
  }
  // what came before "but" counts less
  if (butAt > 0) for (let i = 0; i < butAt; i++) sum -= (VALENCE[t[i]] ?? EMOJI[t[i]] ?? 0) * 0.3;

  sum += Math.sign(sum) * bangs * 0.292 * 2; // "!!" make it stronger
  const valence = clamp(sum / Math.sqrt(sum * sum + 15), -1, 1);
  const energy = clamp(0.5 + arousal * 0.12 + bangs * 0.07 + caps * 0.08 + (valence < -0.4 ? 0.05 : 0), 0, 1);

  let best: Emotion = "neutral";
  let top = 0;
  for (const [e, n] of Object.entries(emotion)) if (n > top) [best, top] = [e as Emotion, n];
  if (best === "neutral" && Math.abs(valence) > 0.35) best = valence > 0 ? "joy" : "sadness";

  const lower = raw.toLowerCase();
  const command = commandIn(raw);
  let intent: Intent = "none";
  if (command) intent = "command";
  else {
    for (const [name, re] of INTENTS) {
      if (re.test(lower.trim())) {
        intent = name;
        break;
      }
    }
    // "thanks" inside a longer message is a thank-you; a farewell must not hide a real question
    if (intent === "none" && /\?\s*$/.test(raw.trim())) intent = "question";
  }

  return {
    valence,
    arousal: energy,
    emotion: best,
    strength: clamp(top / 3, 0, 1) || Math.abs(valence) * 0.6,
    intent,
    command,
    faith: mentionsGod(raw),
    question: /\?\s*$/.test(raw.trim()) || /^(?:who|what|why|how|when|where|can|could|do|does|is|are|will|would)\b/.test(lower.trim()),
    words: wordsOnly.length,
  };
}
