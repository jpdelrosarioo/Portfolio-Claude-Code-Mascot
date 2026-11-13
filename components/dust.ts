// "Turn to dust" hover effect for the dotted portrait.
//
// While the cursor is on the portrait, every dot is blown away from the spot where the cursor came in (a wave of
// dust travelling across the picture). When the cursor leaves, the dust is pulled back and the portrait rebuilds.
//
// How it stays seamless: a bigger overlay canvas sits on top of the portrait. Its pixel buffer starts as an exact copy of
// the real portrait (rounded corners included); as each dot lets go, its little tile is erased from the copy and the dot
// is drawn flying around instead. So nothing changes the moment the cursor lands — only the dots that have left move.
// ~50,000 dots are handled every frame, so everything is written straight into one pixel buffer.

/** The dots of the portrait: where each one sits (CSS px, centre of its cell) and its colour (r | g << 8 | b << 16). */
export type DotField = {
  w: number;
  h: number;
  pitch: number;
  n: number;
  hx: Float32Array;
  hy: Float32Array;
  rgb: Uint32Array;
};

/** How far (CSS px) dust may drift beyond the edge of the portrait. The overlay canvas is this much bigger on every side. */
export const DUST_PAD = 72;

const WAVE = 300; // px/s — how fast the dust front sweeps across the portrait
const WIND_X = 55; // px/s — a gentle drift to the right, like ash in a breeze
const LIFT = 28; // px/s² — and a little upward
const RETURN = 5.5; // how quickly dust is pulled home (higher = faster)

export type Dust = {
  /** Cursor came onto the portrait at (x, y), in CSS px from its top-left corner. */
  enter(x: number, y: number): void;
  /** Cursor left: the dust returns and the portrait is rebuilt. */
  leave(): void;
  destroy(): void;
};

// state per dot: 0 at home · 1 dust (hovering) · 2 flying back home · 3 dust, waiting to fly back
export function createDust(base: HTMLCanvasElement, overlay: HTMLCanvasElement, field: DotField): Dust | null {
  const bctx = base.getContext("2d");
  const bw = base.width; // the portrait, in device pixels
  const bh = base.height;
  if (!bctx || !bw || !bh) return null;

  const k = bw / field.w; // device pixels per CSS pixel
  const padPx = Math.round(DUST_PAD * k);
  const W = bw + padPx * 2;
  const H = bh + padPx * 2;
  overlay.width = W;
  overlay.height = H;
  // size the overlay exactly, so a device pixel of the overlay lines up with one of the portrait
  const css = field.w / bw;
  overlay.style.left = `${-padPx * css}px`;
  overlay.style.top = `${-padPx * css}px`;
  overlay.style.width = `${W * css}px`;
  overlay.style.height = `${H * css}px`;

  const ctx = overlay.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(W, H);
  const buf = new Uint32Array(img.data.buffer);

  // The real portrait, as it is now. `masked` is the same picture with the rounded corners cut away (the portrait's CSS
  // clips them, a plain pixel copy would not).
  const orig = bctx.getImageData(0, 0, bw, bh);
  const masked = new Uint32Array(new Uint32Array(orig.data.buffer));
  const radius = Math.min(parseFloat(getComputedStyle(base).borderTopLeftRadius) || 0, field.w / 2, field.h / 2);
  const rd = radius * k;
  if (rd > 0.5) {
    const size = Math.ceil(rd);
    for (let cy = 0; cy < size; cy++) {
      for (let cx = 0; cx < size; cx++) {
        const cover = Math.min(1, Math.max(0, rd - Math.hypot(cx + 0.5 - rd, cy + 0.5 - rd) + 0.5));
        if (cover >= 1) continue;
        for (const [px, py] of [
          [cx, cy],
          [bw - 1 - cx, cy],
          [cx, bh - 1 - cy],
          [bw - 1 - cx, bh - 1 - cy],
        ]) {
          const i = py * bw + px;
          masked[i] = (((((masked[i] >>> 24) * cover) | 0) << 24) | (masked[i] & 0xffffff)) >>> 0;
        }
      }
    }
  }

  // Leave out only the dots that are wholly outside the rounded shape (the cut-away corners have nothing to throw).
  // The last column and row of dots have their centres a hair beyond the picture's edge, so the centre is clamped into
  // the picture first, and a margin of one dot is allowed so the soft edge of the corner is released too.
  const keep: number[] = [];
  const reach = radius + field.pitch;
  for (let i = 0; i < field.n; i++) {
    const px = Math.min(field.w, Math.max(0, field.hx[i]));
    const py = Math.min(field.h, Math.max(0, field.hy[i]));
    const dx = Math.max(radius - px, px - (field.w - radius), 0);
    const dy = Math.max(radius - py, py - (field.h - radius), 0);
    if (dx * dx + dy * dy <= reach * reach) keep.push(i);
  }
  const n = keep.length;
  const hx = new Float32Array(n);
  const hy = new Float32Array(n);
  const rgb = new Uint32Array(n);
  for (let j = 0; j < n; j++) {
    hx[j] = field.hx[keep[j]];
    hy[j] = field.hy[keep[j]];
    rgb[j] = field.rgb[keep[j]];
  }

  // each dot's own little tile of the picture, in device pixels
  const tx = new Int32Array(n);
  const ty = new Int32Array(n);
  const tw = new Uint8Array(n);
  const th = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x0 = Math.max(0, Math.round((hx[i] - field.pitch / 2) * k));
    const x1 = Math.min(bw, Math.round((hx[i] + field.pitch / 2) * k));
    const y0 = Math.max(0, Math.round((hy[i] - field.pitch / 2) * k));
    const y1 = Math.min(bh, Math.round((hy[i] + field.pitch / 2) * k));
    tx[i] = x0;
    ty[i] = y0;
    tw[i] = Math.max(0, x1 - x0);
    th[i] = Math.max(0, y1 - y0);
  }

  const x = Float32Array.from(hx);
  const y = Float32Array.from(hy);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const delay = new Float32Array(n);
  const age = new Float32Array(n);
  const life = new Float32Array(n);
  const alpha = new Float32Array(n).fill(1);
  const state = new Uint8Array(n);

  const dustSize = Math.max(1, Math.round(k * 0.85));
  let hover = false;
  let running = false;
  let raf = 0;
  let last = 0;
  let mark = 0; // time of the last enter / leave
  let ox = 0;
  let oy = 0;
  let baseHidden = false;
  let waiting = n; // dots that are still part of the picture (not yet reached by the wave); counted again every frame

  const hideBase = () => {
    if (baseHidden) return;
    baseHidden = true;
    bctx.save();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, bw, bh);
    bctx.restore();
  };
  const showBase = () => {
    if (!baseHidden) return;
    baseHidden = false;
    bctx.save();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.putImageData(orig, 0, 0);
    bctx.restore();
  };

  /** Empties a dot's tile in the overlay (the dot has left it). */
  const erase = (i: number) => {
    for (let yy = ty[i], ye = ty[i] + th[i]; yy < ye; yy++) {
      const row = (yy + padPx) * W + padPx;
      for (let xx = tx[i], xe = tx[i] + tw[i]; xx < xe; xx++) buf[row + xx] = 0;
    }
  };
  const dot = (px: number, py: number, color: number) => {
    const x0 = Math.max(0, px);
    const x1 = Math.min(W, px + dustSize);
    const y0 = Math.max(0, py);
    const y1 = Math.min(H, py + dustSize);
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * W;
      for (let xx = x0; xx < x1; xx++) buf[row + xx] = color;
    }
  };

  // a dot lets go: it is thrown away from where the cursor came in, with some randomness and the breeze
  const release = (i: number) => {
    let dx = hx[i] - ox;
    let dy = hy[i] - oy;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const speed = 25 + Math.random() * 95;
    vx[i] = dx * speed + (Math.random() - 0.3) * 70 + WIND_X;
    vy[i] = dy * speed + (Math.random() - 0.7) * 70 - 20;
    life[i] = 1.3 + Math.random() * 1.7;
    age[i] = (1 - alpha[i]) * life[i]; // a dot that was already half-way back keeps its brightness
    state[i] = 1;
  };

  const frame = (now: number) => {
    const dt = Math.min(0.033, Math.max(0.001, (now - last) / 1000));
    last = now;
    const t = (now - mark) / 1000;
    const drag = Math.exp(-1.4 * dt);
    const pull = 1 - Math.exp(-RETURN * dt);
    const kick = 260 * dt;

    // start from an exact copy of the portrait — unless every dot has already been released while the cursor is on it,
    // in which case no scrap of the original may remain
    buf.fill(0);
    if (!(hover && waiting === 0)) {
      for (let row = 0; row < bh; row++) {
        buf.set(masked.subarray(row * bw, (row + 1) * bw), (row + padPx) * W + padPx);
      }
    }
    let busy = 0;
    let stillHome = 0;

    for (let i = 0; i < n; i++) {
      let s = state[i];

      if (s === 0) {
        if (!hover) continue;
        busy++;
        if (t < delay[i]) {
          stillHome++; // not reached by the wave yet: it stays part of the picture
          continue;
        }
        release(i);
        s = 1;
      } else if (s === 2 && hover && t >= delay[i]) {
        release(i);
        s = 1;
      } else if (s === 3 && !hover && t >= delay[i]) {
        state[i] = 2;
        s = 2;
      }

      if (s === 1 || s === 3) {
        erase(i);
        if (alpha[i] <= 0 && s === 1) continue; // gone, and nothing more to do until the cursor leaves
        busy++;
        vx[i] = (vx[i] + (Math.random() - 0.5) * kick + WIND_X * dt) * drag;
        vy[i] = (vy[i] + (Math.random() - 0.5) * kick - LIFT * dt) * drag;
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
        age[i] += dt;
        const a = 1 - age[i] / life[i];
        alpha[i] = a > 0 ? a : 0;
        if (a > 0.02) dot(Math.round(x[i] * k) + padPx, Math.round(y[i] * k) + padPx, (((a * 255) << 24) | rgb[i]) >>> 0);
        continue;
      }

      // flying back home
      const dx = hx[i] - x[i];
      const dy = hy[i] - y[i];
      x[i] += dx * pull;
      y[i] += dy * pull;
      alpha[i] = Math.min(1, alpha[i] + dt * 2.5);
      if (dx * dx + dy * dy < 0.25) {
        x[i] = hx[i];
        y[i] = hy[i];
        alpha[i] = 1;
        state[i] = 0; // home again: its tile of the real picture stays in the copy
        continue;
      }
      busy++;
      erase(i);
      dot(Math.round(x[i] * k) + padPx, Math.round(y[i] * k) + padPx, (((alpha[i] * 255) << 24) | rgb[i]) >>> 0);
    }

    waiting = hover ? stillHome : n;
    ctx.putImageData(img, 0, 0);
    hideBase(); // the overlay now shows the portrait
    return busy;
  };

  const tick = (now: number) => {
    const busy = frame(now);
    if (busy > 0) {
      raf = requestAnimationFrame(tick);
      return;
    }
    running = false;
    if (!hover) {
      // everything is home again: show the real, crisp portrait
      showBase();
      ctx.clearRect(0, 0, W, H);
    }
  };

  const start = () => {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };

  return {
    enter(px, py) {
      if (hover) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      hover = true;
      waiting = n; // dots that are home are part of the picture again
      ox = px;
      oy = py;
      mark = performance.now();
      for (let i = 0; i < n; i++) {
        if (state[i] === 3) state[i] = 1; // dust that had not started back yet just carries on
        else delay[i] = Math.hypot(hx[i] - ox, hy[i] - oy) / WAVE + Math.random() * 0.18;
      }
      start();
    },
    leave() {
      if (!hover) return;
      hover = false;
      mark = performance.now();
      for (let i = 0; i < n; i++) {
        if (state[i] === 1) {
          state[i] = 3;
          delay[i] = Math.random() * 0.45;
        }
      }
      start();
    },
    destroy() {
      cancelAnimationFrame(raf);
      running = false;
      showBase();
      ctx.clearRect(0, 0, W, H);
    },
  };
}
