// Recognising Bible references in what a visitor types, and fetching the exact King James text through /api/verse.

export type VerseLookup =
  | { reference: string; verses: { chapter: number; verse: number; text: string }[]; truncated: boolean }
  | { reference: string; error: string };

// The 66 books, plus the usual short forms, lower-case without dots
// (Short forms that are everyday English words, like "am", "is", "ex" or "re", are left out so sentences don't match.)
const BOOKS = [
  "genesis gen gn", "exodus exod exo", "leviticus lev lv", "numbers num nm", "deuteronomy deut dt",
  "joshua josh jos", "judges judg jdg", "ruth rth", "samuel sam", "kings kgs", "chronicles chron chr",
  "ezra ezr", "nehemiah neh", "esther esth est", "job jb", "psalms psalm ps psa pss", "proverbs prov prv",
  "ecclesiastes eccl ecc qoh", "song songs solomon sos", "isaiah isa", "jeremiah jer", "lamentations lam",
  "ezekiel ezek eze ezk", "daniel dan dn", "hosea hos", "joel jl", "amos", "obadiah obad", "jonah jnh",
  "micah mic", "nahum nah", "habakkuk hab", "zephaniah zeph zep", "haggai hag", "zechariah zech zec",
  "malachi mal", "matthew matt mt", "mark mk mrk", "luke lk luk", "john jn jhn", "acts", "romans rom rm",
  "corinthians cor", "galatians gal", "ephesians eph", "philippians phil php", "colossians col",
  "thessalonians thess", "timothy tim", "titus tit", "philemon philem phm", "hebrews heb", "james jas",
  "peter pet pt", "jude", "revelation rev",
].flatMap((line) => line.split(" "));
const BOOK_SET = new Set(BOOKS);
// only these books come in numbered parts (1 Samuel, 2 Kings, 3 John…)
const NUMBERED = new Set(["samuel", "sam", "kings", "kgs", "chronicles", "chron", "chr", "corinthians", "cor", "thessalonians", "thess", "timothy", "tim", "peter", "pet", "pt", "john", "jn", "jhn"]);

const firstWord = (name: string) => name.toLowerCase().replace(/\./g, "").trim().split(/\s+/)[0];
// "song of solomon", "song of songs": the first word decides
const isBook = (name: string) => BOOK_SET.has(firstWord(name));

// [1-3 or I-III] book [of book] chapter [:verse [-verse]]
const REF = /\b((?:[123]|i{1,3})\s+)?([a-z]{2,}\.?(?:\s+of\s+[a-z]+)?)\s+(\d{1,3})(?:\s*:\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?\b/gi;

/**
 * A Bible reference the visitor typed ("John 3:16", "psalm 23", "1 cor 13:4-7"), or null.
 * A chapter on its own ("job 5") only counts in a short message or next to a word like "verse" or "read", so everyday
 * sentences don't trigger it.
 */
export function findReference(text: string): string | null {
  const shortMessage = text.trim().split(/\s+/).length <= 5;
  const asksForScripture = /\b(verse|verses|chapter|scripture|read|show|bible|psalm|passage)\b/i.test(text);
  for (const m of text.matchAll(REF)) {
    const [, num, book, chapter, verse, end] = m;
    if (!isBook(book)) continue;
    if (num && !NUMBERED.has(firstWord(book))) continue; // "I am 25" is not "1 Amos 25"
    if (!verse && !(shortMessage || asksForScripture)) continue;
    const n = num ? { i: "1", ii: "2", iii: "3" }[num.trim().toLowerCase()] ?? num.trim() : "";
    return `${n ? n + " " : ""}${book.replace(/\.$/, "")} ${chapter}${verse ? ":" + verse : ""}${end ? "-" + end : ""}`;
  }
  return null;
}

/** References the AI wrote as [[Psalm 23:1-4]] (it never writes verse text itself). */
export function markedReferences(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]]{2,60})\]\]/g)].map((m) => m[1].trim()).slice(0, 3);
}

/** The AI's words as people should read/hear them: [[John 3:16]] becomes John 3:16; a half-written marker is hidden. */
export function withoutMarkers(text: string): string {
  return text.replace(/\[\[([^\]]*)\]\]/g, "$1").replace(/\[\[[^\]]*$/, "").replace(/\[$/, "");
}

export async function lookUp(reference: string, signal?: AbortSignal): Promise<VerseLookup> {
  try {
    const res = await fetch(`/api/verse?ref=${encodeURIComponent(reference)}`, { signal });
    const data = await res.json();
    if (!res.ok) return { reference, error: data?.error ?? "upstream" };
    return data;
  } catch (e) {
    return { reference, error: (e as Error).name === "AbortError" ? "aborted" : "upstream" };
  }
}
