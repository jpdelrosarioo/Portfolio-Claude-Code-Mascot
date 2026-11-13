import { site } from "@/data/site";
import { Reveal } from "./reveal";

type Level = 0 | 1 | 2 | 3 | 4;
type Day = { date?: string; level: Level; count: number } | null;
type Data = { weeks: Day[][]; total: number; sample: boolean };

const COUNT_BY_LEVEL = [0, 2, 5, 9, 14];

// Layout of the drawing, in SVG units (it scales to the width of the page)
const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 30; // room for the weekday labels
const TOP = 18; // room for the month labels
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Your real contributions, read from your public GitHub profile when a username is set; otherwise a sample. They are
 *  re-read every hour, so new commits show up without touching the site. */
async function load(user: string): Promise<Data | null> {
  if (!user) return null;
  try {
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(user)}?y=last`, {
      next: { revalidate: 60 * 60 }, // once an hour
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      total?: Record<string, number>;
      contributions?: { date: string; count: number; level: Level }[];
    };
    const list = json.contributions;
    if (!list?.length) return null;

    // Group into Sunday-first weeks, padding the first week
    const weeks: Day[][] = [];
    let week: Day[] = Array((new Date(list[0].date + "T00:00:00Z").getUTCDay() + 7) % 7).fill(null);
    for (const d of list) {
      week.push({ date: d.date, level: d.level, count: d.count });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) weeks.push(week);

    const total = json.total?.lastYear ?? list.reduce((s, d) => s + d.count, 0);
    return { weeks, total, sample: false };
  } catch {
    return null;
  }
}

function sample(): Data {
  const weeks: Day[][] = [];
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const col: Day[] = [];
    for (let d = 0; d < 7; d++) {
      const noise = Math.abs(Math.sin(w * 12.9898 + d * 78.233) * 43758.5453) % 1;
      const weekend = d === 0 || d === 6 ? 0.18 : 0;
      const r = noise - weekend;
      const level = (r < 0.32 ? 0 : r < 0.58 ? 1 : r < 0.78 ? 2 : r < 0.92 ? 3 : 4) as Level;
      total += COUNT_BY_LEVEL[level];
      col.push({ level, count: COUNT_BY_LEVEL[level] });
    }
    weeks.push(col);
  }
  return { weeks, total, sample: true };
}

const prettyDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The contribution graph, drawn like GitHub's: green squares, months and weekdays, a "Less → More" key. */
export async function GithubGrid() {
  const data = (await load(site.githubUser)) ?? sample();
  const W = LEFT + data.weeks.length * STEP - GAP;
  const H = TOP + 7 * STEP - GAP;

  // a month label above the first week that begins a new month (never closer than 3 weeks to the previous one)
  const monthLabels: { x: number; text: string }[] = [];
  let lastMonth = -1;
  let lastWeek = -10;
  data.weeks.forEach((week, wi) => {
    const first = week.find((d) => d?.date);
    if (!first?.date) return;
    const month = new Date(first.date + "T00:00:00Z").getUTCMonth();
    if (month !== lastMonth && wi - lastWeek >= 3) {
      monthLabels.push({ x: LEFT + wi * STEP, text: MONTHS[month] });
      lastWeek = wi;
    }
    lastMonth = month;
  });

  return (
    <Reveal>
      {/* On a narrow screen the graph keeps its size and scrolls sideways, like GitHub's */}
      <div className="overflow-x-auto pb-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${data.total.toLocaleString()} GitHub contributions in the last year`}
          className="h-auto w-full min-w-[640px]"
        >
          {monthLabels.map((m) => (
            <text key={`${m.x}-${m.text}`} x={m.x} y={10} className="fill-g500" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>
              {m.text}
            </text>
          ))}
          {[1, 3, 5].map((row) => (
            <text
              key={row}
              x={0}
              y={TOP + row * STEP + CELL - 2}
              className="fill-g500"
              style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][row]}
            </text>
          ))}
          {data.weeks.map((week, wi) =>
            week.map((day, di) =>
              day ? (
                <rect
                  key={`${wi}-${di}`}
                  x={LEFT + wi * STEP}
                  y={TOP + di * STEP}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  ry={2}
                  style={{ fill: `var(--gh${day.level})` }}
                  className="stroke-ink/5"
                  strokeWidth={1}
                >
                  {day.date && (
                    <title>{`${day.count === 0 ? "No" : day.count} contribution${day.count === 1 ? "" : "s"} on ${prettyDate(day.date)}`}</title>
                  )}
                </rect>
              ) : null,
            ),
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="micro text-g500">
          {data.sample ? "Sample data · set githubUser in data/site.ts" : `${data.total.toLocaleString()} contributions in the last year`}
        </p>
        <div className="micro flex items-center gap-1.5 text-g500" aria-hidden>
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="size-[11px] rounded-[2px] border border-ink/5" style={{ background: `var(--gh${l})` }} />
          ))}
          More
        </div>
      </div>
    </Reveal>
  );
}
