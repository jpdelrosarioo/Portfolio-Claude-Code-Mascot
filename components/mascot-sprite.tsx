import type { Emote, Mood } from "@/lib/mood";
import type { Pose } from "@/lib/roam";

const BODY = "#D97757"; // Claude coral
const INK = "#141414";
const LEGS = [4, 6, 9, 11];

/** A pixel picture drawn from rows of text ("#" is a filled pixel). */
function Pixels({ rows, color, className, size }: { rows: string[]; color: string; className?: string; size: number }) {
  const w = Math.max(...rows.map((r) => r.length));
  return (
    <svg viewBox={`0 0 ${w} ${rows.length}`} shapeRendering="crispEdges" aria-hidden className={className} style={{ width: w * size, height: rows.length * size }}>
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} /> : null)))}
    </svg>
  );
}

const EMOTES: Record<Emote, { rows: string[]; color: string }> = {
  heart: { rows: [".#.#.", "#####", "#####", ".###.", "..#.."], color: "#E5484D" },
  sparkle: { rows: ["..#..", "..#..", "#####", "..#..", "..#.."], color: "#F5B83D" },
  sweat: { rows: ["..#..", ".###.", ".###.", ".###.", "..#.."], color: "#6AA9FF" },
  tear: { rows: ["#", "#", "#"], color: "#6AA9FF" },
  zzz: { rows: ["###", "..#", ".#.", "###"], color: "#8A8A8A" },
};

const GLINT_ROWS = ["..#..", "..#..", "#####", "..#..", "..#.."];
// where the twinkles are around it (px from the top left of its box), how big, and when each one starts
const GLINTS = [
  { x: -9, y: -6, s: 2, d: 0 },
  { x: 38, y: -4, s: 2, d: 0.55 },
  { x: -12, y: 22, s: 1.5, d: 1.1 },
  { x: 42, y: 20, s: 1.5, d: 1.6 },
  { x: 16, y: -12, s: 1.5, d: 0.3 },
];

/** A little picture that floats up from the mascot's head. */
function EmoteFloat({ kind, loop }: { kind: Emote; loop?: boolean }) {
  const e = EMOTES[kind];
  return (
    <span aria-hidden className="pointer-events-none absolute -top-2 right-0 block" style={{ animation: "none" }}>
      <Pixels rows={e.rows} color={e.color} size={kind === "tear" ? 2 : 3} className={loop ? "mascot-emote-loop" : "mascot-emote"} />
    </span>
  );
}

/**
 * The mascot: a small pixel creature (inspired by the Claude Code mascot). `pose` says what it is doing (sitting with its legs
 * dangling, standing, walking, hopping, dozing, waving, dancing, looking around); `mood` gives it a face (^ ^ when happy, big
 * eyes when excited, drooping brows when sad or worried, shut eyes when asleep); `mouth` (0 shut, 1 small, 2 wide) follows
 * the words it says; `emote` is a heart, a sparkle or a drop that floats up for a moment. `face` -1 makes it look left.
 */
export function MascotSprite({
  pose,
  mood,
  mouth,
  emote,
  radiant = false,
  face = 1,
}: {
  pose: Pose;
  mood: Mood;
  mouth: 0 | 1 | 2;
  emote: Emote | null;
  /** Shining: a bright golden glow on its head and body, with rays and twinkles (when God is mentioned). */
  radiant?: boolean;
  face?: 1 | -1;
}) {
  const asleep = pose === "sleep";
  const drowsy = mood === "sleepy" && !asleep;
  const happyEyes = !asleep && (mood === "happy" || mood === "proud");
  const bigEyes = !asleep && mood === "excited";
  const brows = !asleep && (mood === "sad" || mood === "worried");
  const sits = pose === "sit" || asleep;
  const hops = pose === "hop";
  const walks = pose === "walk";

  const smile = !asleep && mouth === 0 && (mood === "happy" || mood === "excited" || mood === "proud");
  const frown = !asleep && mouth === 0 && (mood === "sad" || mood === "worried");

  const bodyClass = walks ? "mascot-walk-bob" : pose === "dance" ? "mascot-dance-body" : asleep ? "mascot-bob mascot-slow" : hops ? undefined : "mascot-bob";

  return (
    <span className="relative block" style={{ width: 40, height: 35 }} data-shine={radiant ? "on" : "off"}>
      {/* the radiance: a soft golden light, turning rays and little twinkles behind it (always there, faded in and out) */}
      <span aria-hidden className="mascot-rays" />
      <span aria-hidden className="mascot-aura" />
      {GLINTS.map((g, i) => (
        <span key={i} aria-hidden className="mascot-glint" style={{ left: g.x, top: g.y, animationDelay: `${g.d}s` }}>
          <Pixels rows={GLINT_ROWS} color="#FFE27A" size={g.s} />
        </span>
      ))}
      <span className="block" style={{ transform: face === -1 ? "scaleX(-1)" : undefined }}>
        <svg viewBox="0 0 16 14" shapeRendering="crispEdges" aria-hidden className="mascot-figure block h-[35px] w-10 overflow-visible">
          {/* legs: dangling and swinging when it sits, straight when it stands, stepping when it walks, tucked up when it hops */}
          {LEGS.map((x, i) =>
            sits ? (
              <rect key={x} className={asleep ? undefined : `mascot-leg${i % 2 ? " mascot-leg-alt" : ""}`} x={x} y="9" width="1" height="4" fill={BODY} />
            ) : hops ? (
              <rect key={x} x={x} y="9" width="1" height="2" fill={BODY} />
            ) : (
              <g key={x} className={walks ? (i % 2 ? "mascot-step-b" : "mascot-step-a") : undefined}>
                <rect x={x} y="9" width="1" height="4" fill={BODY} />
                <rect x={x} y="13" width="2" height="1" fill={BODY} />
              </g>
            ),
          )}
          <g className={bodyClass}>
            <rect x="3" y="2" width="10" height="7" fill={BODY} />
            {/* arms: down, raised when it hops, waving, dancing */}
            <rect className={pose === "dance" ? "mascot-dance-arm" : undefined} x="1" y={hops ? 3 : 5} width="2" height="2" fill={BODY} />
            <rect className={pose === "wave" ? "mascot-wave" : pose === "dance" ? "mascot-dance-arm mascot-dance-alt" : undefined} x="13" y={hops ? 3 : 5} width="2" height="2" fill={BODY} />

            {/* eyes */}
            {asleep ? (
              <>
                <rect x="4" y="5" width="3" height="1" fill={INK} />
                <rect x="9" y="5" width="3" height="1" fill={INK} />
              </>
            ) : happyEyes ? (
              <>
                <rect x="4" y="5" width="1" height="1" fill={INK} />
                <rect x="5" y="4" width="1" height="1" fill={INK} />
                <rect x="6" y="5" width="1" height="1" fill={INK} />
                <rect x="9" y="5" width="1" height="1" fill={INK} />
                <rect x="10" y="4" width="1" height="1" fill={INK} />
                <rect x="11" y="5" width="1" height="1" fill={INK} />
              </>
            ) : bigEyes ? (
              <>
                <rect x="5" y="3" width="1" height="3" fill={INK} />
                <rect x="10" y="3" width="1" height="3" fill={INK} />
                <rect x="5" y="3" width="1" height="1" fill="#fff" />
                <rect x="10" y="3" width="1" height="1" fill="#fff" />
              </>
            ) : drowsy ? (
              <>
                <rect x="5" y="5" width="1" height="1" fill={INK} />
                <rect x="10" y="5" width="1" height="1" fill={INK} />
              </>
            ) : (
              <>
                <rect className="mascot-eye" x="5" y={brows ? 5 : 4} width="1" height="2" fill={INK} />
                <rect className="mascot-eye" x="10" y={brows ? 5 : 4} width="1" height="2" fill={INK} />
              </>
            )}
            {brows && (
              <>
                <rect x="4" y="4" width="1" height="1" fill={INK} />
                <rect x="5" y="3" width="1" height="1" fill={INK} />
                <rect x="11" y="4" width="1" height="1" fill={INK} />
                <rect x="10" y="3" width="1" height="1" fill={INK} />
              </>
            )}

            {/* mouth: the words it says (mouth 1, 2), otherwise how it feels */}
            {!asleep && mouth === 1 && <rect x="7" y="7" width="2" height="1" fill={INK} />}
            {!asleep && mouth === 2 && <rect x="7" y="7" width="2" height="2" fill={INK} />}
            {smile && (
              <>
                <rect x="6" y="7" width="1" height="1" fill={INK} />
                <rect x="7" y="8" width="2" height="1" fill={INK} />
                <rect x="9" y="7" width="1" height="1" fill={INK} />
              </>
            )}
            {frown && (
              <>
                <rect x="6" y="8" width="1" height="1" fill={INK} />
                <rect x="7" y="7" width="2" height="1" fill={INK} />
                <rect x="9" y="8" width="1" height="1" fill={INK} />
              </>
            )}
          </g>
        </svg>
      </span>
      {asleep ? <EmoteFloat kind="zzz" loop /> : emote ? <EmoteFloat key={emote} kind={emote} /> : null}
    </span>
  );
}
