"use client";

import { useEffect, useRef } from "react";
import { createDust, DUST_PAD, type Dust, type DotField } from "./dust";
import { estimateFlow, interpolateView, type Flow } from "./frame-interp";

const CELL = 2.2; // dot pitch in CSS px — about 130 dots across the 288px portrait
const DOT_PITCH = 1.25; // "dots" mode: dot spacing in CSS px — about 230 × 230 ≈ 53,000 dots on a 288px portrait
const SHARPEN = 0.9; // unsharp-mask strength: crisper eyes, glasses and edges
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const clampTo = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const clamp255 = (n: number) => Math.min(255, Math.max(0, Math.round(n)));
const SATURATION = 1.4; // a little extra colour so small dots still read as colourful

/** Which part of the photo to show: centre (0–1, as a fraction of the photo) and zoom (1 = whole photo). */
export type Focus = { x: number; y: number; zoom: number };

/** A rectangle of an image, in image pixels. */
export type Crop = { x: number; y: number; w: number; h: number };

/** One picture of a video: an image file, optionally just one rectangle of it (a cell of a sprite sheet). */
export type Frame = { src: string; crop?: Crop };


/** Placeholder: a soft head-and-shoulders silhouette, as dot density 0..1 at (x, y) in 0..1. */
function silhouette(x: number, y: number) {
  const head = Math.hypot((x - 0.5) / 0.19, (y - 0.4) / 0.25);
  const shoulders = Math.hypot((x - 0.5) / 0.46, (y - 1.1) / 0.45);
  const neck = y > 0.55 && y < 0.74 ? clamp(1 - Math.abs(x - 0.5) / 0.075) * 0.55 : 0;
  let v = 0.06; // faint backdrop texture so the field never looks empty
  if (head < 1) v = Math.max(v, 0.9 - 0.6 * head * head);
  if (shoulders < 1) v = Math.max(v, 0.82 - 0.5 * shoulders * shoulders);
  return Math.max(v, neck);
}

/**
 * For photos with a plain light background: flood-fill from the top edge (and the upper sides) through very light,
 * colourless pixels. Returns 0 for background and 1 for the subject, or null when there is no such background.
 */
function lightBackgroundMask(lum: Float32Array, px: Uint8ClampedArray, cols: number, rows: number): Float32Array | null {
  const n = cols * rows;
  const isBg = (i: number) => {
    if (lum[i] < 0.78) return false;
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const mx = Math.max(r, g, b);
    return mx > 0 && (mx - Math.min(r, g, b)) / mx < 0.14; // light and colourless
  };

  const bg = new Uint8Array(n);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!bg[i] && isBg(i)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let c = 0; c < cols; c++) seed(c); // top row
  for (let r = 0; r < rows * 0.5; r++) {
    seed(r * cols); // upper left edge
    seed(r * cols + cols - 1); // upper right edge
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % cols;
    const y = (i / cols) | 0;
    if (x > 0) seed(i - 1);
    if (x < cols - 1) seed(i + 1);
    if (y > 0) seed(i - cols);
    if (y < rows - 1) seed(i + cols);
  }

  let count = 0;
  for (let i = 0; i < n; i++) count += bg[i];
  if (count < n * 0.03 || count > n * 0.85) return null; // not a plain-background photo

  const out = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) if (bg[i]) out[i] = 0;
  // eat the one-cell light fringe left along the outline
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (bg[i] || lum[i] < 0.65) continue;
      if (
        (x > 0 && bg[i - 1]) ||
        (x < cols - 1 && bg[i + 1]) ||
        (y > 0 && bg[i - cols]) ||
        (y < rows - 1 && bg[i + cols])
      ) {
        out[i] = 0;
      }
    }
  }
  return out;
}

/** Sharpen, then stretch the tones so the photo uses the full black-to-white range (like a levels adjustment). */
function prepareTones(lum: Float32Array, cols: number, rows: number, alpha: Float32Array | null) {
  // 1) unsharp mask with a 3×3 blur
  const blur = new Float32Array(lum.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = clampTo(x + dx, 0, cols - 1);
          const yy = clampTo(y + dy, 0, rows - 1);
          sum += lum[yy * cols + xx];
          n++;
        }
      }
      blur[y * cols + x] = sum / n;
    }
  }
  const sharp = new Float32Array(lum.length);
  for (let i = 0; i < lum.length; i++) sharp[i] = clamp(lum[i] + SHARPEN * (lum[i] - blur[i]));

  // 2) auto-levels between the 2nd and 98th percentile, then an S-curve for punch
  // (transparent pixels of a cut-out are ignored so they don't skew the tones)
  const opaque: number[] = [];
  for (let i = 0; i < sharp.length; i++) if (!alpha || alpha[i] > 0.5) opaque.push(sharp[i]);
  const sorted = Float32Array.from(opaque.length ? opaque : [0, 1]).sort();
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.98)];
  const span = Math.max(hi - lo, 0.1);
  const out = new Float32Array(lum.length);
  for (let i = 0; i < out.length; i++) {
    const l = clamp((sharp[i] - lo) / span);
    out[i] = l * l * (3 - 2 * l);
  }
  return out;
}

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement | null, colored: boolean, focus?: Focus) {
  const { width: w, height: h } = canvas.getBoundingClientRect();
  if (!w || !h) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const root = document.documentElement;
  const dark = root.dataset.theme === "dark";
  ctx.fillStyle = `rgb(${getComputedStyle(root).getPropertyValue("--ink").trim() || "10 10 10"})`;

  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);

  // Sample the photo down to one pixel per dot (cover-fit, then zoom toward the focus point)
  let lum: Float32Array | null = null;
  let tone: Float32Array | null = null;
  let rgba: Uint8ClampedArray | null = null;
  let alpha: Float32Array | null = null; // only set for photos with a transparent background (cut-outs)
  if (img) {
    const off = document.createElement("canvas");
    off.width = cols;
    off.height = rows;
    const o = off.getContext("2d", { willReadFrequently: true });
    if (o) {
      o.imageSmoothingEnabled = true;
      o.imageSmoothingQuality = "high";
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const tr = cols / rows;
      let sw = iw;
      let sh = ih;
      if (iw / ih > tr) sw = ih * tr;
      else sh = iw / tr;
      const zoom = Math.max(1, focus?.zoom ?? 1);
      sw /= zoom;
      sh /= zoom;
      const sx = clampTo((focus?.x ?? 0.5) * iw - sw / 2, 0, iw - sw);
      const sy = clampTo((focus?.y ?? 0.5) * ih - sh / 2, 0, ih - sh);
      o.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);

      const px = o.getImageData(0, 0, cols, rows).data;
      rgba = px;
      lum = new Float32Array(cols * rows);
      for (let i = 0; i < lum.length; i++) {
        lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
      }

      // Cut-out support: transparent pixels become "paper" (no dots) in both themes
      const a = new Float32Array(cols * rows);
      let hasTransparency = false;
      for (let i = 0; i < a.length; i++) {
        a[i] = px[i * 4 + 3] / 255;
        if (a[i] < 0.98) hasTransparency = true;
      }
      // No real transparency? A plain light background (white wall, or a "transparent" checkerboard that was
      // saved as a JPEG) is treated as empty too.
      if (!hasTransparency) {
        const m = lightBackgroundMask(lum, px, cols, rows);
        if (m) {
          a.set(m);
          hasTransparency = true;
        }
      }
      let opaqueSum = 0;
      let opaqueCount = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] > 0.5) {
          opaqueSum += lum[i];
          opaqueCount++;
        }
      }
      if (hasTransparency && opaqueCount > 0) {
        alpha = a;
        const mean = opaqueSum / opaqueCount;
        for (let i = 0; i < a.length; i++) if (a[i] <= 0.5) lum[i] = mean; // neutral, so edges don't get a halo
      }

      tone = prepareTones(lum, cols, rows, alpha);
    }
  }

  const solid = !colored; // one path, one fill — much cheaper for the monochrome version
  if (solid) ctx.beginPath();

  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) / rows;
    const fade = clamp((1 - y) / 0.22); // dissolve along the bottom edge
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) / cols;
      const i = r * cols + c;
      let v: number;
      if (tone) {
        v = dark ? tone[i] : 1 - tone[i]; // light theme: dark ink on paper · dark theme: light dots on black
      } else {
        v = silhouette(x, y);
      }
      if (alpha) v *= clamp((alpha[i] - 0.15) / 0.6);
      // dots can grow until neighbours merge into solid areas, like a real print screen
      const radius = CELL * 0.74 * Math.sqrt(v * fade);
      if (radius < 0.2) continue;
      const cx = c * CELL + CELL / 2;
      const cy = r * CELL + CELL / 2;

      if (solid) {
        ctx.moveTo(cx + radius, cy);
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      } else {
        if (rgba && lum && tone) {
          // Each dot takes the colour of its spot in the photo, brightened/darkened to match the tone
          // adjustment and with the saturation nudged up
          const p = i * 4;
          const grey = lum[i] * 255;
          const gain = Math.min(2.2, Math.max(0.5, (tone[i] + 0.05) / (lum[i] + 0.05)));
          const ch = (k: number) => clamp255((grey + (rgba![p + k] - grey) * SATURATION) * (dark ? gain : Math.min(gain, 1)));
          ctx.fillStyle = `rgb(${ch(0)} ${ch(1)} ${ch(2)})`;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (solid) ctx.fill();
}

/**
 * "Dots" mode: the photo rebuilt from a very dense field of tiny dots, each in the photo's own colour.
 * Nothing here depends on the theme, so the colours are identical in light and dark mode: a darkened copy of the
 * photo sits behind the dots (so the gaps never show the page) and the dots are the colours of the photo itself.
 */
const sourceWidth = (img: HTMLImageElement | HTMLCanvasElement) => (img instanceof HTMLImageElement ? img.naturalWidth : img.width);
const sourceHeight = (img: HTMLImageElement | HTMLCanvasElement) => (img instanceof HTMLImageElement ? img.naturalHeight : img.height);

/** The rectangle of a picture (of `region`, in image pixels) that a canvas with this width/height ratio shows:
 *  cover-fit, then zoomed toward the focus point. */
export function viewRect(region: Crop, ratio: number, focus?: Focus) {
  let sw = region.w;
  let sh = region.h;
  if (region.w / region.h > ratio) sw = region.h * ratio;
  else sh = region.w / ratio;
  const zoom = Math.max(1, focus?.zoom ?? 1);
  sw /= zoom;
  sh /= zoom;
  return {
    sx: region.x + clampTo((focus?.x ?? 0.5) * region.w - sw / 2, 0, region.w - sw),
    sy: region.y + clampTo((focus?.y ?? 0.5) * region.h - sh / 2, 0, region.h - sh),
    sw,
    sh,
  };
}

function drawDots(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | HTMLCanvasElement,
  focus?: Focus,
  gray = false,
  box?: { width: number; height: number }, // draw at this size instead of the canvas's on-screen size (for off-screen canvases)
  crop?: Crop, // use only this rectangle of the image (one frame of a contact sheet)
): DotField | null {
  const { width: w, height: h } = box ?? canvas.getBoundingClientRect();
  if (!w || !h) return null;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const cols = Math.ceil(w / DOT_PITCH);
  const rows = Math.ceil(h / DOT_PITCH);

  // The part of the photo to show: cover-fit, then zoom toward the focus point
  const { sx, sy, sw, sh } = viewRect(crop ?? { x: 0, y: 0, w: sourceWidth(img), h: sourceHeight(img) }, w / h, focus);

  // One sample per dot
  const off = document.createElement("canvas");
  off.width = cols;
  off.height = rows;
  const o = off.getContext("2d", { willReadFrequently: true });
  if (!o) return null;
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = "high";
  o.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
  const px = o.getImageData(0, 0, cols, rows).data;

  const lum = new Float32Array(cols * rows);
  const a = new Float32Array(cols * rows);
  let hasTransparency = false;
  for (let i = 0; i < lum.length; i++) {
    lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
    a[i] = px[i * 4 + 3] / 255;
    if (a[i] < 0.98) hasTransparency = true;
  }
  if (!hasTransparency) {
    // a plain light background (white wall, or a checkerboard saved as a JPEG) counts as empty
    const m = lightBackgroundMask(lum, px, cols, rows);
    if (m) {
      a.set(m);
      hasTransparency = true;
    }
  }
  const alpha = hasTransparency ? a : null;
  const tone = prepareTones(lum, cols, rows, alpha); // only used to vary dot size a little, never the colour

  // Backing: the photo itself, darkened, so the gaps between dots show the photo and not the page
  if (!alpha) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    if (gray) {
      // painting black with the "saturation" blend mode removes all colour but keeps the brightness
      ctx.globalCompositeOperation = "saturation";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, w, h);
  }

  // every dot is also recorded, so the "turn to dust" effect can move them
  const fx = new Float32Array(cols * rows);
  const fy = new Float32Array(cols * rows);
  const frgb = new Uint32Array(cols * rows);
  let count = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const cover = alpha ? clamp((alpha[i] - 0.15) / 0.6) : 1;
      if (cover < 0.05) continue;
      // brighter spots get slightly bigger dots, which gives the halftone texture
      const radius = DOT_PITCH * (0.5 + 0.17 * tone[i]) * cover;
      const p = i * 4;
      let packed: number;
      if (gray) {
        const g = clamp255(lum[i] * 255); // the photo's own brightness as a grey
        ctx.fillStyle = `rgb(${g} ${g} ${g})`;
        packed = g | (g << 8) | (g << 16);
      } else {
        ctx.fillStyle = `rgb(${px[p]} ${px[p + 1]} ${px[p + 2]})`; // the photo's own colour, untouched
        packed = px[p] | (px[p + 1] << 8) | (px[p + 2] << 16);
      }
      const cx = c * DOT_PITCH + DOT_PITCH / 2;
      const cy = r * DOT_PITCH + DOT_PITCH / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      fx[count] = cx;
      fy[count] = cy;
      frgb[count] = packed;
      count++;
    }
  }
  return { w, h, pitch: DOT_PITCH, n: count, hx: fx.subarray(0, count), hy: fy.subarray(0, count), rgb: frgb.subarray(0, count) };
}

/** One tile of the fast dot screen: 4 × 4 dots at the portrait's dot spacing (5 CSS px), drawn 4× larger so it stays
 *  crisp when scaled. White dots on mid-grey: multiplied over a picture, the dots keep its brightness and the gaps show it
 *  50% darker — the same look as drawDots (dots over a 50% darkened underlay). */
let screenTile: HTMLCanvasElement | null = null;
function dotScreenTile() {
  if (screenTile) return screenTile;
  const t = document.createElement("canvas");
  t.width = 20;
  t.height = 20;
  const x = t.getContext("2d")!;
  x.fillStyle = "rgb(128,128,128)";
  x.fillRect(0, 0, 20, 20);
  x.fillStyle = "#fff";
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      x.beginPath();
      x.arc(2.5 + 5 * i, 2.5 + 5 * j, 2.8, 0, Math.PI * 2);
      x.fill();
    }
  }
  screenTile = t;
  return t;
}

/**
 * A fast stand-in for drawDots, for pictures that are only seen for a moment in motion: the picture (greyscale if
 * `gray`) with a fine dot pattern multiplied over it. It costs a few milliseconds instead of ~150, which keeps the page
 * smooth while the portrait video is being prepared.
 */
function screenDots(picture: HTMLCanvasElement, box: { width: number; height: number }, gray: boolean) {
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement("canvas");
  c.width = Math.round(box.width * dpr);
  c.height = Math.round(box.height * dpr);
  const x = c.getContext("2d")!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(picture, 0, 0, c.width, c.height);
  if (gray) {
    x.globalCompositeOperation = "saturation"; // black painted with this blend mode removes colour, keeps brightness
    x.fillStyle = "#000";
    x.fillRect(0, 0, c.width, c.height);
  }
  const pattern = x.createPattern(dotScreenTile(), "repeat");
  if (pattern) {
    pattern.setTransform(new DOMMatrix().scale(dpr / 4));
    x.globalCompositeOperation = "multiply";
    x.fillStyle = pattern;
    x.fillRect(0, 0, c.width, c.height);
  }
  x.globalCompositeOperation = "source-over";
  return c;
}

/** A photo (or placeholder) rendered as a halftone that fades out at the bottom.
 *  Monochrome by default; with `colored`, every dot keeps the colour of the photo.
 *  `focus` crops/zooms toward the face.
 *  With `srcDark` (dots only) that photo is shown while dark mode is on, instead of `src`.
 *  With `frames` (dots only, more than two) the frames play like a real video when the theme changes. The in-between
 *  pictures are worked out from how the picture moves between the frames, and all of them are prepared in the background,
 *  so playing is only switching pictures at `fps` per second. Light mode rests on the first frame, dark mode on the last. */
export function HalftonePortrait({
  src,
  srcDark,
  frames,
  fps = 24,
  inBetween = 6,
  alt,
  className,
  colored = false,
  dots = false,
  gray = false,
  focus,
}: {
  src?: string;
  /** A different photo to use while dark mode is on. */
  srcDark?: string;
  /** The frames of a video, in order (for example cut from a sprite sheet). Replaces `src` / `srcDark` for the dot styles. */
  frames?: Frame[];
  /** Pictures per second when the theme changes (the in-between pictures included). */
  fps?: number;
  /** How many in-between pictures are made between two neighbouring frames. */
  inBetween?: number;
  alt: string;
  className?: string;
  colored?: boolean;
  /** Dense field of tiny dots in the photo's own colours, the same in light and dark mode. */
  dots?: boolean;
  /** With `dots`: black and white instead of colour (still identical in light and dark mode). */
  gray?: boolean;
  focus?: Focus;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fx = focus?.x;
  const fy = focus?.y;
  const fz = focus?.zoom;
  const framesKey = frames?.length ? JSON.stringify(frames) : "";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const f: Focus | undefined = fx === undefined || fy === undefined || fz === undefined ? undefined : { x: fx, y: fy, zoom: fz };
    const sheet: Frame[] | null = dots && framesKey && JSON.parse(framesKey).length > 2 ? JSON.parse(framesKey) : null;
    const list: Frame[] = sheet ?? (srcDark ? [{ src: src ?? srcDark }, { src: srcDark }] : src ? [{ src }] : []);
    const last = Math.max(0, list.length - 1);
    const urls = [...new Set(list.map((l) => l.src))];
    const loaded = new Map<string, HTMLImageElement>();
    let raf = 0;
    let anim = 0;
    let alive = true;
    let dust: Dust | null = null;

    const isDark = () => document.documentElement.dataset.theme === "dark";
    // light mode rests on the first frame, dark mode on the last
    const target = () => (list.length > 1 && isDark() ? last : 0);
    // the frame for the current theme (another one is used until it has loaded)
    const pick = () => {
      const want = target();
      const idx = loaded.has(list[want].src) ? want : list.findIndex((l) => loaded.has(l.src));
      if (idx < 0) return null;
      return { img: loaded.get(list[idx].src)!, crop: list[idx].crop };
    };

    /* ---- the video (sheet only): every picture is made in advance ---- */
    const VIEW = 480; // the square view of each frame used to work out the motion and draw the in-between pictures
    let gen = 0; // bumped on every rebuild, so a build that was overtaken stops
    let buildTimer = 0;
    let ready = false;
    let seq: HTMLCanvasElement[] = []; // every picture of the video, in order
    let keyPos: number[] = []; // where each real frame sits in `seq`
    let keys: ({ canvas: HTMLCanvasElement; field?: DotField } | undefined)[] = []; // `field`: the resting frames only
    let pos = 0; // where the video is now, as an index into `seq`
    let cum: number[] = []; // total amount of change up to each picture (for even-speed timing)
    // amount of change at a (fractional) position in the video, and back
    const changeAt = (p: number) => {
      const i = Math.min(cum.length - 2, Math.max(0, Math.floor(p)));
      return cum[i] + (p - i) * (cum[i + 1] - cum[i]);
    };
    const positionAt = (c: number) => {
      let i = 0;
      while (i < cum.length - 2 && cum[i + 1] < c) i++;
      const span = cum[i + 1] - cum[i];
      return i + (span > 0 ? Math.min(1, Math.max(0, (c - cum[i]) / span)) : 0);
    };

    const build = () => {
      if (!sheet || ready) return;
      const b = (() => {
        const r = canvas.getBoundingClientRect();
        return r.width && r.height ? { width: r.width, height: r.height } : null;
      })();
      if (!b || list.some((l) => !loaded.has(l.src))) return;
      const my = ++gen;

      // square views of every frame (what the motion is worked out from)
      const views: HTMLCanvasElement[] = list.map((l) => {
        const img = loaded.get(l.src)!;
        const v = document.createElement("canvas");
        v.width = VIEW;
        v.height = VIEW;
        const x = v.getContext("2d")!;
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = "high";
        const region = l.crop ?? { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
        const { sx, sy, sw, sh } = viewRect(region, 1, f);
        x.drawImage(img, sx, sy, sw, sh, 0, 0, VIEW, VIEW);
        return v;
      });
      const flows: Flow[] = [];
      const mids: HTMLCanvasElement[][] = list.map(() => []);
      keys = [];

      // one piece of work at a time, so the page never stutters
      const jobs: (() => void)[] = [];
      list.forEach((l, i) =>
        jobs.push(() => {
          // The two resting frames are drawn exactly, from the original photo (the video must land on the resting
          // picture, and the dust effect needs their dots). The frames in the middle are only seen in motion, so they
          // get the fast dot-screen drawing, the same as the in-between pictures, so nothing flickers between them.
          if (i === 0 || i === last) {
            const c = document.createElement("canvas");
            const field = drawDots(c, loaded.get(l.src)!, f, gray, b, l.crop);
            if (field) keys[i] = { canvas: c, field };
          } else {
            keys[i] = { canvas: screenDots(views[i], b, gray) };
          }
        }),
      );
      for (let k = 0; k < last; k++) {
        jobs.push(() => {
          flows[k] = estimateFlow(views[k], views[k + 1]);
        });
        for (let j = 1; j <= inBetween; j++) {
          jobs.push(() => {
            const tmp = document.createElement("canvas");
            interpolateView(views[k], views[k + 1], flows[k], j / (inBetween + 1), tmp);
            mids[k].push(screenDots(tmp, b, gray));
          });
        }
      }

      const run = () => {
        if (!alive || my !== gen) return;
        const job = jobs.shift();
        if (!job) {
          // everything is ready: lay the pictures out in video order
          if (keys.some((k) => !k)) return;
          seq = [];
          keyPos = [];
          for (let k = 0; k < last; k++) {
            keyPos[k] = seq.length;
            seq.push(keys[k]!.canvas);
            seq.push(...mids[k]);
          }
          keyPos[last] = seq.length;
          seq.push(keys[last]!.canvas);

          // How much the picture changes from each picture to the next (on small grey copies). The video is timed by
          // this, so the movement runs at an even speed: a big change gets more time, a small one less, and there are
          // no sudden jumps where one step changes much more than the others.
          const tiny = document.createElement("canvas");
          tiny.width = 48;
          tiny.height = 48;
          const tx = tiny.getContext("2d", { willReadFrequently: true })!;
          const prints = seq.map((c) => {
            tx.clearRect(0, 0, 48, 48);
            tx.drawImage(c, 0, 0, 48, 48);
            return tx.getImageData(0, 0, 48, 48).data.slice();
          });
          cum = [0];
          for (let i = 1; i < seq.length; i++) {
            let d = 0;
            for (let j = 0; j < prints[i].length; j += 4) d += Math.abs(prints[i][j] - prints[i - 1][j]);
            cum.push(cum[i - 1] + d / (48 * 48) + 0.5); // + a little, so a step that hardly changes still takes some time
          }
          ready = true;
          pos = keyPos[target()];
          return;
        }
        job();
        // Wait for the browser to be idle before the next picture, so scrolling and clicks always come first. (A build
        // that was overtaken by a newer one stops itself through `gen`.)
        if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 2000 });
        else buildTimer = window.setTimeout(run, 60); // browsers without idle callbacks (older Safari)
      };
      run();
    };
    const rebuildSoon = () => {
      window.clearTimeout(buildTimer);
      buildTimer = window.setTimeout(build, 300);
    };

    const render = () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(anim);
      raf = requestAnimationFrame(() => {
        const cur = pick();
        if (dots && cur) {
          dust?.destroy();
          dust = null;
          const field = drawDots(canvas, cur.img, f, gray, undefined, cur.crop);
          const overlay = overlayRef.current;
          if (field && overlay) dust = createDust(canvas, overlay, field);
          if (sheet && !ready) rebuildSoon();
        } else {
          draw(canvas, cur?.img ?? null, colored, f);
        }
      });
    };

    // Theme changed: play the video from where it is to the new resting picture, at `fps`.
    const transition = () => {
      const ctx = canvas.getContext("2d");
      const endIdx = target();
      const end = keyPos[endIdx];
      if (!sheet || !ctx || !ready || end === undefined || pos === end || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        render();
        return;
      }
      cancelAnimationFrame(raf);
      cancelAnimationFrame(anim);
      dust?.destroy(); // the dust effect picks up again once the video has played
      dust = null;
      // Measured in "amount of change", so the movement has an even speed (see `cum`). The whole video lasts as long
      // as all its pictures at `fps`; a part of it, proportionally less.
      const fromC = changeAt(pos);
      const endC = changeAt(end);
      const totalC = cum[cum.length - 1] || 1;
      const duration = ((seq.length - 1) * 1000 * Math.abs(endC - fromC)) / (fps * totalC);
      const t0 = performance.now();
      const show = (i: number) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.drawImage(seq[i], 0, 0, canvas.width, canvas.height);
      };
      // A real movement: speeds up gently over the first 20%, keeps an even speed, slows down over the last 20%
      // (no rush in the middle, unlike a plain ease-in-out).
      const RAMP = 0.2;
      const v = 1 / (1 - RAMP);
      const ease = (u: number) =>
        u < RAMP ? (0.5 * v * u * u) / RAMP : u < 1 - RAMP ? v * (u - RAMP / 2) : 1 - (0.5 * v * (1 - u) * (1 - u)) / RAMP;
      const step = (now: number) => {
        const p = Math.min(1, Math.max(0, (now - t0) / duration));
        if (p < 1) {
          // Position in the video (fractional). Each screen refresh shows the picture it sits on and fades in the next
          // one by the fraction. The neighbouring pictures are only a tiny step apart, so this removes the uneven
          // picture-rate-on-screen-rate rhythm without any visible ghosting.
          pos = positionAt(fromC + (endC - fromC) * ease(p));
          const i0 = Math.min(seq.length - 1, Math.max(0, Math.floor(pos)));
          const a = pos - i0;
          show(i0);
          if (a > 0.01 && i0 + 1 < seq.length) {
            ctx.globalAlpha = a;
            ctx.drawImage(seq[i0 + 1], 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1;
          }
          anim = requestAnimationFrame(step);
        } else {
          pos = end;
          show(end);
          // the last picture is on screen: bring back the dust effect on the real frame, without redrawing it
          const key = keys[endIdx];
          const overlay = overlayRef.current;
          if (key?.field && overlay) dust = createDust(canvas, overlay, key.field);
        }
      };
      anim = requestAnimationFrame(step);
    };

    for (const url of urls) {
      const i = new Image();
      i.onload = () => {
        if (!alive) return;
        loaded.set(url, i);
        render();
      };
      i.src = url;
    }
    render();

    const ro = new ResizeObserver(() => {
      // the size changed: everything prepared is out of date, so make it again
      ready = false;
      seq = [];
      keyPos = [];
      keys = [];
      gen++;
      window.clearTimeout(buildTimer);
      render();
    });
    ro.observe(canvas);
    const mo = new MutationObserver(() => (sheet ? transition() : render())); // when the theme flips
    if (!dots || list.length > 1) mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // Cursor on the portrait: it turns to dust. Cursor off: it comes back together.
    const onEnter = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      dust?.enter(e.clientX - r.left, e.clientY - r.top);
    };
    const onLeave = () => dust?.leave();
    if (dots) {
      canvas.addEventListener("pointerenter", onEnter);
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("pointercancel", onLeave);
    }

    return () => {
      alive = false;
      gen++;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(anim);
      window.clearTimeout(buildTimer);
      ro.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointerenter", onEnter);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointercancel", onLeave);
      dust?.destroy();
    };
  }, [src, srcDark, framesKey, fps, inBetween, colored, dots, gray, fx, fy, fz]);

  if (dots) {
    // The second canvas is bigger than the portrait and sits on top of it (ignoring the mouse), so the dust can drift
    // out past the edges.
    return (
      <div className="relative">
        <canvas ref={ref} role="img" aria-label={alt} className={className} />
        <canvas
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute z-10"
          style={{
            left: -DUST_PAD,
            top: -DUST_PAD,
            width: `calc(100% + ${DUST_PAD * 2}px)`,
            height: `calc(100% + ${DUST_PAD * 2}px)`,
          }}
        />
      </div>
    );
  }

  return <canvas ref={ref} role="img" aria-label={alt} className={className} />;
}
