// Looks up Bible verses (King James Version, public domain) for the mascot, from the free bible-api.com service.
// The exact text always comes from there, never from the AI, so verses are never misquoted.
// GET /api/verse?ref=John 3:16   ·   ?ref=Psalm 23   ·   ?ref=Romans 8:28-39

export const dynamic = "force-dynamic";

const MAX_VERSES = 40; // a whole long chapter is cut here (the visitor can ask for the next part)
const HOURLY_LIMIT = 60; // lookups per visitor per hour

const hits = new Map<string, number[]>();
function overLimit(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (recent.length >= HOURLY_LIMIT) return true;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": status === 200 ? "public, max-age=86400" : "no-store" },
  });

// "John 3:16", "1 Corinthians 13:4-7", "Song of Solomon 2", "Psalm 23"
const REFERENCE = /^[1-3]?\s*[A-Za-z][A-Za-z .]{1,30}\s+\d{1,3}(?::\d{1,3}(?:\s*[-–]\s*\d{1,3})?)?$/;

export async function GET(req: Request) {
  const ref = (new URL(req.url).searchParams.get("ref") ?? "").trim().replace(/\s+/g, " ");
  if (!ref || ref.length > 60 || !REFERENCE.test(ref)) return reply(400, { error: "bad_reference" });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (overLimit(ip)) return reply(429, { error: "rate_limited" });

  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref.replace(/–/g, "-"))}?translation=kjv`, {
      next: { revalidate: 60 * 60 * 24 * 30 }, // scripture doesn't change: keep answers for a month
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 404) return reply(404, { error: "not_found" });
    if (!res.ok) return reply(502, { error: "upstream" });
    const json = (await res.json()) as {
      reference?: string;
      verses?: { chapter: number; verse: number; text: string }[];
    };
    const all = json.verses ?? [];
    if (!all.length) return reply(404, { error: "not_found" });
    const verses = all.slice(0, MAX_VERSES).map((v) => ({
      chapter: v.chapter,
      verse: v.verse,
      text: v.text.replace(/\s+/g, " ").trim(),
    }));
    return reply(200, { reference: json.reference ?? ref, translation: "KJV", verses, truncated: all.length > MAX_VERSES });
  } catch {
    return reply(502, { error: "upstream" });
  }
}
