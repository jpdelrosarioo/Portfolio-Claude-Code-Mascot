// Where the mascot is and what it is doing. It only ever sits or stands on the TOP edges of three things on the intro: the top
// of the portrait, the top of the name, and the top of the intro text. Never in the middle of the picture and never down the
// sides. It starts at "home", on the end of the surname, where it always sits or stands as its mood says (lib/mood.ts). From
// there it strolls along those tops, crosses from one to another (walking when they are level, hopping or leaping when they are
// at different heights), waves, dances, dozes, and goes home when the visitor talks to it, so the chat box opens where it always
// has. Pure logic (no page in here), so it can be tested on its own.

import type { Command } from "./nlp";
import type { Mood, Posture } from "./mood";

export type Pt = { x: number; y: number };
/**
 * A top edge it can sit or stand on, in px from the top-left of the intro. `y` is where its body rests when it sits; standing,
 * its feet reach `drop` px lower (down to the tops of the letters, which are a little below the top of their box).
 */
export type Platform = { id: "portrait" | "name" | "intro"; left: number; right: number; y: number; drop: number };
export type Scene = { home: Pt; platforms: Platform[] };
export type Pose = "sit" | "stand" | "walk" | "sleep" | "hop" | "dance" | "wave" | "look";
/** Is the visitor talking to it? "voice": by voice with the chat box closed. "chat": the chat box is open. */
export type Engaged = "none" | "voice" | "chat";
export type Ctx = { mood: Mood; posture: Posture; engaged: Engaged; reduced: boolean };

/** The picture is 44 px wide; sitting, the surface is at the bottom of its body; standing, at the bottom of its feet. */
export const SPRITE = { w: 44, sitAnchor: 24.5, standAnchor: 37 };

type Act =
  | { k: "rest"; pose: "sit" | "stand" | "sleep"; until: number }
  | { k: "walk"; to: Pt; toId: Platform["id"]; speed: number; from: Pt; fromDrop: number }
  | { k: "hop"; from: Pt; to: Pt; toId: Platform["id"]; t0: number; dur: number; h: number; fromDrop: number }
  | { k: "flair"; pose: "dance" | "wave" | "look"; until: number };

type Choice = "stroll" | "cross" | "home" | "hop" | "flair" | "rest";
const WEIGHTS: Record<Mood, Partial<Record<Choice, number>>> = {
  excited: { stroll: 25, hop: 30, flair: 20, cross: 15, home: 5, rest: 5 },
  happy: { stroll: 35, cross: 20, flair: 10, home: 10, rest: 25 },
  curious: { stroll: 35, cross: 25, flair: 25, rest: 10, home: 5 },
  proud: { rest: 35, flair: 35, stroll: 20, home: 10 },
  calm: { rest: 50, stroll: 30, cross: 10, home: 10 },
  sad: { rest: 60, stroll: 15, home: 25 },
  worried: { rest: 45, stroll: 25, home: 20, cross: 10 },
  sleepy: { rest: 70, home: 30 },
};
/** px per second */
const SPEED: Record<Mood, number> = { excited: 70, happy: 46, curious: 40, proud: 38, calm: 28, sad: 22, worried: 30, sleepy: 20 };
/** How long it stays put (ms): [shortest, longest]. A sad or sleepy mascot stays a long time. */
const REST: Record<Mood, [number, number]> = {
  excited: [1500, 3500],
  happy: [3000, 7000],
  curious: [2500, 5000],
  proud: [4000, 8000],
  calm: [6000, 12000],
  sad: [9000, 20000],
  worried: [5000, 10000],
  sleepy: [15000, 30000],
};

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const MARGIN = 22; // half the picture: its centre stays this far in from the ends of a top edge, so it never hangs off the end

export class Roamer {
  pos: Pt;
  /** 1: looking right, -1: looking left. */
  face: 1 | -1 = 1;
  /** How high it is above the surface while it hops (px). */
  lift = 0;
  /** How much lower it stands than it sits, here (px): its feet reach down to the letters. */
  drop = 0;
  act: Act;
  private scene: Scene;
  private onId: Platform["id"] = "name"; // the top edge it is on (or was last on)
  private hold = 0; // it does not go anywhere until then (it was asked to stay)
  private next: { to: Pt; toId: Platform["id"]; speed: number } | null = null; // the rest of a trip that stops on the way
  private override: { kind: "sit" | "stand" | "walk" | "sleep" | "stay"; until: number } | null = null;

  constructor(private rng: () => number, scene: Scene, now: number, ctx: Ctx) {
    this.scene = scene;
    this.pos = { ...scene.home };
    this.drop = this.platform(this.onId)?.drop ?? 0;
    // On the intro it starts at home, sitting or standing as its mood says, and stays a while before it goes anywhere
    this.act = { k: "rest", pose: this.restPose(ctx), until: now + 5000 + rng() * 4000 };
  }

  /** What it is doing, as the picture needs to know. */
  get pose(): Pose {
    return this.act.k === "walk" ? "walk" : this.act.k === "hop" ? "hop" : this.act.pose;
  }
  get atHome() {
    return dist(this.pos, this.scene.home) < 4;
  }
  /** The top edge it is on, or null while it is in the air. */
  get on(): Platform["id"] | null {
    return this.act.k === "hop" ? null : this.onId;
  }

  /**
   * The page was measured again (it settles after loading, and the window can be resized; this happens every second). Where it
   * is and where it is going are kept, only nudged to the new measurements: a walk or a hop in progress carries on.
   */
  setScene(scene: Scene) {
    const wasHome = this.atHome;
    this.scene = scene;
    const here = this.platform(this.onId) ?? this.scene.platforms[0];
    if (!here) return;
    this.onId = here.id;
    const a = this.act;
    if (a.k === "walk" || a.k === "hop") {
      const there = this.platform(a.toId);
      if (!there) {
        // the place it was heading for is gone: it stops where it is
        this.act = { k: "rest", pose: "stand", until: 0 };
        this.next = null;
      } else {
        const to = { x: this.cx(there, a.to.x), y: there.y };
        this.act = { ...a, to } as Act;
      }
      return;
    }
    // resting: it stays on its top edge (and at home, it stays on its perch)
    if (wasHome) this.pos = { ...scene.home };
    else this.pos = { x: this.cx(here, this.pos.x), y: here.y };
    this.drop = here.drop;
  }

  /* ---------- what it is told to do ("sit down", "go for a walk"...) ---------- */
  command(c: Command, now: number, ctx: Ctx) {
    this.lift = 0;
    this.next = null;
    const flying = this.act.k === "hop"; // (it lands first; the order then holds)
    const until = (ms: number) => now + ms;
    switch (c) {
      case "sit":
        this.override = { kind: "sit", until: until(30000) };
        this.hold = this.override.until;
        if (!flying) this.act = { k: "rest", pose: "sit", until: this.hold };
        break;
      case "stand":
        this.override = { kind: "stand", until: until(30000) };
        this.hold = this.override.until;
        if (!flying) this.act = { k: "rest", pose: "stand", until: this.hold };
        break;
      case "walk":
        this.override = { kind: "walk", until: until(45000) };
        this.hold = 0;
        if (!flying) this.act = this.plan(now, ctx);
        break;
      case "come":
        this.override = { kind: "stay", until: until(25000) };
        this.hold = this.override.until;
        this.goTo(this.scene.home, "name", 95, now, ctx);
        break;
      case "stay":
        this.override = { kind: "stay", until: until(60000) };
        this.hold = this.override.until;
        if (!flying) this.act = { k: "rest", pose: this.restPose(ctx), until: this.hold };
        break;
      case "sleep":
        this.override = { kind: "sleep", until: until(30000) };
        this.hold = this.override.until;
        if (!flying) this.act = { k: "rest", pose: "sleep", until: this.hold };
        break;
      case "wake":
        this.override = null;
        this.hold = 0;
        if (!flying) this.act = { k: "rest", pose: "stand", until: until(1500) };
        break;
      case "dance":
        if (!flying) this.act = { k: "flair", pose: "dance", until: until(4500) };
        break;
      case "wave":
        if (!flying) this.act = { k: "flair", pose: "wave", until: until(2600) };
        break;
      case "jump":
        if (!flying) this.act = { k: "hop", from: { ...this.pos }, to: { ...this.pos }, toId: this.onId, t0: now, dur: 650, h: 24, fromDrop: this.drop };
        break;
    }
  }

  /* ---------- time passes ---------- */
  step(dt: number, now: number, ctx: Ctx) {
    if (this.override && now > this.override.until) {
      this.override = null;
      this.hold = 0;
    }
    if (ctx.engaged !== "none") this.engage(now, ctx);

    if (ctx.reduced) {
      // no wandering for someone who asked their computer for less motion: it stays home and only sits or stands
      this.pos = { ...this.scene.home };
      this.onId = "name";
      this.lift = 0;
      this.drop = this.platform("name")?.drop ?? 0;
      if (this.act.k !== "rest" || now >= this.act.until || this.act.pose !== this.restPose(ctx)) this.act = this.rest(now, ctx);
      return;
    }

    if (ctx.reduced || ctx.engaged === "voice") this.next = null;
    const a = this.act;
    switch (a.k) {
      case "rest": {
        const pose = this.restPose(ctx);
        if (a.pose !== pose) this.act = { ...a, pose }; // its mood changed: it sits down, or gets up
        const free = ctx.engaged === "none" || this.override?.kind === "walk"; // (a walk order is obeyed even while it is talked to)
        if (now >= a.until && free && now >= this.hold) this.act = this.plan(now, ctx);
        break;
      }
      case "walk": {
        const d = dist(this.pos, a.to);
        const len = a.speed * dt;
        if (d <= len) {
          this.pos = { ...a.to };
          this.onId = a.toId;
          this.drop = this.platform(a.toId)?.drop ?? this.drop;
          this.act = this.arrived(now, ctx);
        } else {
          this.pos = { x: this.pos.x + ((a.to.x - this.pos.x) / d) * len, y: this.pos.y + ((a.to.y - this.pos.y) / d) * len };
          if (Math.abs(a.to.x - this.pos.x) > 0.4) this.face = a.to.x > this.pos.x ? 1 : -1;
          // on the way from one edge to another its feet go from one height to the other
          const total = dist(a.from, a.to) || 1;
          const to = this.platform(a.toId)?.drop ?? a.fromDrop;
          this.drop = a.fromDrop + (to - a.fromDrop) * clamp(1 - d / total, 0, 1);
        }
        break;
      }
      case "hop": {
        const t = (now - a.t0) / a.dur;
        if (t >= 1) {
          this.pos = { ...a.to };
          this.onId = a.toId;
          this.lift = 0;
          this.drop = this.platform(a.toId)?.drop ?? this.drop;
          this.act = this.next ? this.arrived(now, ctx) : { k: "rest", pose: this.restPose(ctx) === "sleep" ? "sit" : this.restPose(ctx), until: now + 600 + this.rng() * 900 };
        } else {
          this.pos = { x: a.from.x + (a.to.x - a.from.x) * t, y: a.from.y + (a.to.y - a.from.y) * t };
          this.lift = a.h * 4 * t * (1 - t);
          const to = this.platform(a.toId)?.drop ?? a.fromDrop;
          this.drop = a.fromDrop + (to - a.fromDrop) * t;
          if (Math.abs(a.to.x - a.from.x) > 1) this.face = a.to.x > a.from.x ? 1 : -1;
        }
        break;
      }
      case "flair":
        if (now >= a.until) this.act = this.rest(now, ctx);
        break;
    }
  }

  /* ---------- the visitor is talking to it ---------- */
  private engage(now: number, ctx: Ctx) {
    // told to go for a walk while the chat box is open: it goes (until the order wears off, then it comes back)
    if (ctx.engaged === "chat" && this.override?.kind === "walk") return;
    this.lift = 0;
    if (ctx.engaged === "chat") {
      // the chat box opens where the mascot always sits: it goes home, and stays there
      if (!this.atHome) {
        if (!(this.act.k === "walk" && dist(this.act.to, this.scene.home) < 2) && this.act.k !== "hop") this.goTo(this.scene.home, "name", 95, now, ctx);
      } else if (this.act.k !== "rest") this.act = this.rest(now, ctx);
      if (this.act.k === "rest") this.act = { ...this.act, pose: this.restPose(ctx), until: Math.max(this.act.until, now + 4000) };
    } else {
      // by voice, with the chat box closed: it stops where it is and listens (a hop in the air finishes first)
      if (this.act.k !== "rest" && this.act.k !== "hop") this.act = this.rest(now, ctx);
      if (this.act.k === "rest") this.act = { ...this.act, pose: this.restPose(ctx), until: Math.max(this.act.until, now + 4000) };
    }
  }

  /* ---------- choosing what to do next ---------- */
  private posture(ctx: Ctx): Posture {
    const o = this.override;
    if (o?.kind === "sit" || o?.kind === "sleep") return "sit";
    if (o?.kind === "stand" || o?.kind === "walk") return "stand";
    return ctx.posture;
  }
  private restPose(ctx: Ctx): "sit" | "stand" | "sleep" {
    if (this.override?.kind === "sleep") return "sleep";
    const p = this.posture(ctx);
    return p === "stand" ? "stand" : ctx.mood === "sleepy" ? "sleep" : "sit";
  }
  private rest(now: number, ctx: Ctx): Act {
    const mood = this.override?.kind === "walk" ? "excited" : ctx.mood;
    const [lo, hi] = REST[mood];
    return { k: "rest", pose: this.restPose(ctx), until: Math.max(now + lo + this.rng() * (hi - lo), this.hold) };
  }

  private plan(now: number, ctx: Ctx): Act {
    const mood: Mood = this.override?.kind === "walk" ? "excited" : ctx.mood;
    const weights = WEIGHTS[mood];
    const total = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0);
    let roll = this.rng() * total;
    let choice: Choice = "rest";
    for (const [c, w] of Object.entries(weights) as [Choice, number][]) {
      roll -= w;
      if (roll <= 0) {
        choice = c;
        break;
      }
    }
    const speed = SPEED[mood] * (this.override?.kind === "walk" ? 1.3 : 1);
    const here = this.platform(this.onId);

    if (choice === "stroll" && here) {
      // a walk along the top edge it is on
      const x = this.cx(here, this.pos.x + (this.rng() * 2 - 1) * 170);
      if (Math.abs(x - this.pos.x) > 30) return this.walkTo({ x, y: here.y }, here.id, speed);
    } else if (choice === "cross") {
      const others = this.scene.platforms.filter((p) => p.id !== this.onId && p.right - p.left > 50);
      if (others.length) {
        const p = others[Math.floor(this.rng() * others.length)];
        return this.goToAct({ x: this.cx(p, p.left + this.rng() * (p.right - p.left)), y: p.y }, p.id, speed, now);
      }
    } else if (choice === "home") {
      if (!this.atHome) return this.goToAct(this.scene.home, "name", speed, now);
    } else if (choice === "hop" && here) {
      // a few hops along the edge
      const x = this.cx(here, this.pos.x + (this.rng() < 0.5 ? -1 : 1) * (35 + this.rng() * 45));
      if (Math.abs(x - this.pos.x) > 20)
        return { k: "hop", from: { ...this.pos }, to: { x, y: here.y }, toId: here.id, t0: now, dur: 480 + this.rng() * 250, h: 12 + this.rng() * 10, fromDrop: this.drop };
    } else if (choice === "flair") {
      const pose = mood === "curious" ? "look" : mood === "excited" && this.rng() < 0.5 ? "dance" : "wave";
      return { k: "flair", pose, until: now + (pose === "dance" ? 3500 : pose === "look" ? 2800 : 2300) };
    }
    return this.rest(now, ctx);
  }

  /* ---------- getting from one top edge to another ---------- */
  /** Two edges at about the same height, close together (the portrait and the name, side by side): it can just walk across. */
  private walkable(a: Platform, b: Platform) {
    const gap = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
    return Math.abs(a.y - b.y) <= 14 && gap <= 90;
  }
  private walkTo(to: Pt, toId: Platform["id"], speed: number): Act {
    return { k: "walk", to, toId, speed, from: { ...this.pos }, fromDrop: this.drop };
  }
  /** Two edges one above the other (they overlap along their length): it can hop from one to the other. */
  private stacked(a: Platform, b: Platform) {
    return Math.min(a.right, b.right) - Math.max(a.left, b.left) >= 40;
  }
  /** Can it get from one edge to the other in one go (a walk across, or a hop)? */
  private adjacent(a: Platform, b: Platform) {
    return a.id === b.id || this.walkable(a, b) || this.stacked(a, b);
  }
  /** The rest of a trip, after the first leg (or just a rest, when it has got there). */
  private arrived(now: number, ctx: Ctx): Act {
    const n = this.next;
    this.next = null;
    return n ? this.goToAct(n.to, n.toId, n.speed, now) : this.rest(now, ctx);
  }
  /**
   * Walks there if it can (same edge, or two level edges next to each other), otherwise hops or leaps: higher and longer the
   * further it is. If the other edge is not next to this one (the portrait and the intro text, with the name between them),
   * it goes by way of the one in between, so that it never crosses the picture.
   */
  private goToAct(to: Pt, toId: Platform["id"], speed: number, now: number): Act {
    const here = this.platform(this.onId);
    const there = this.platform(toId);
    if (here && there && !this.adjacent(here, there)) {
      const via = this.scene.platforms
        .filter((m) => m.id !== here.id && m.id !== there.id && this.adjacent(here, m) && this.adjacent(m, there))
        .sort((p, q) => Math.abs(p.y - here.y) + Math.abs(p.y - there.y) - (Math.abs(q.y - here.y) + Math.abs(q.y - there.y)))[0];
      if (via) {
        this.next = { to, toId, speed };
        return this.goToAct({ x: this.cx(via, to.x), y: via.y }, via.id, speed, now);
      }
    }
    if (!here || !there || here.id === there.id || this.walkable(here, there)) return this.walkTo(to, toId, speed);
    const d = dist(this.pos, to);
    return {
      k: "hop",
      from: { ...this.pos },
      to,
      toId,
      t0: now,
      dur: clamp(450 + d * 1.1, 450, 1500),
      h: 16 + Math.min(70, d * 0.2) + Math.max(0, this.pos.y - to.y), // (higher to jump up to it)
      fromDrop: this.drop,
    };
  }
  private goTo(to: Pt, toId: Platform["id"], speed: number, now: number, ctx: Ctx) {
    this.act = dist(this.pos, to) < 3 ? this.rest(now, ctx) : this.goToAct(to, toId, speed, now);
    if (this.act.k === "rest") this.act = { ...this.act, until: Math.max(this.act.until, this.hold) };
  }

  /* ---------- places ---------- */
  private platform(id: Platform["id"]) {
    return this.scene.platforms.find((p) => p.id === id) ?? null;
  }
  /** Keeps its centre on the top edge, away from the ends. */
  private cx(p: Platform, x: number) {
    const m = Math.min(MARGIN, (p.right - p.left) / 2);
    return clamp(x, p.left + m, p.right - m);
  }
}
