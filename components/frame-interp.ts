// Motion interpolation for the portrait video.
//
// Between two neighbouring frames, every part of the picture moves a little (the hand lifts, the glasses turn). We estimate
// that movement (block matching on a coarse grid, refined from coarse to fine), then build in-between pictures by sliding
// both frames part of the way along the movement and blending them. Where the two slid pictures disagree (something was
// covered or uncovered), the nearer real frame is used, so there is no smearing.

/** Size of the grid the motion is estimated on. */
const GRID = 128;

/** Motion per point of picture A, in GRID pixels: where each point of A went in B. */
export type Flow = { x: Float32Array; y: Float32Array };

const LEVELS = [
  { size: 32, block: 4, radius: 12 }, // big movements (e.g. the glasses swinging down past the face)
  { size: 64, block: 8, radius: 3 },
  { size: 128, block: 8, radius: 2 },
];
const LAMBDA = 0.004; // prefers vectors close to the coarser level's (steadier, less noise)

function gray(src: HTMLCanvasElement, size: number): Float32Array {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, size, size);
  const d = x.getImageData(0, 0, size, size).data;
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  return out;
}

function halve(a: Float32Array, s: number): Float32Array {
  const h = s >> 1;
  const out = new Float32Array(h * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      out[y * h + x] = (a[2 * y * s + 2 * x] + a[2 * y * s + 2 * x + 1] + a[(2 * y + 1) * s + 2 * x] + a[(2 * y + 1) * s + 2 * x + 1]) / 4;
    }
  }
  return out;
}

function blur(f: Float32Array, s: number, r: number): Float32Array {
  const tmp = new Float32Array(f.length);
  const out = new Float32Array(f.length);
  const n = 2 * r + 1;
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += f[y * s + Math.min(s - 1, Math.max(0, x + k))];
      tmp[y * s + x] = sum / n;
    }
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[Math.min(s - 1, Math.max(0, y + k)) * s + x];
      out[y * s + x] = sum / n;
    }
  return out;
}

function refine(a: Float32Array, b: Float32Array, s: number, bs: number, radius: number, init: Flow | null): Flow {
  const step = bs >> 1;
  const g = Math.floor((s - bs) / step) + 1;
  const bx = new Float32Array(g * g);
  const by = new Float32Array(g * g);
  const area = bs * bs;
  for (let gj = 0; gj < g; gj++) {
    for (let gi = 0; gi < g; gi++) {
      const x0 = gi * step;
      const y0 = gj * step;
      const centre = (y0 + (bs >> 1)) * s + x0 + (bs >> 1);
      const ix = init ? Math.round(init.x[centre]) : 0;
      const iy = init ? Math.round(init.y[centre]) : 0;
      // a flat patch has nothing to match: keep the coarser guess
      let mean = 0;
      for (let v = 0; v < bs; v++) for (let u = 0; u < bs; u++) mean += a[(y0 + v) * s + x0 + u];
      mean /= area;
      let variance = 0;
      for (let v = 0; v < bs; v++)
        for (let u = 0; u < bs; u++) {
          const d = a[(y0 + v) * s + x0 + u] - mean;
          variance += d * d;
        }
      if (variance / area < 0.0004) {
        bx[gj * g + gi] = ix;
        by[gj * g + gi] = iy;
        continue;
      }
      let best = Infinity;
      let bestX = ix;
      let bestY = iy;
      for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++) {
          const vx = ix + dx;
          const vy = iy + dy;
          let sad = 0;
          for (let v = 0; v < bs; v++) {
            const ya = y0 + v;
            const yb = Math.min(s - 1, Math.max(0, ya + vy));
            for (let u = 0; u < bs; u++) {
              const xa = x0 + u;
              const xb = Math.min(s - 1, Math.max(0, xa + vx));
              sad += Math.abs(a[ya * s + xa] - b[yb * s + xb]);
            }
          }
          const cost = sad / area + LAMBDA * (Math.abs(dx) + Math.abs(dy));
          if (cost < best) {
            best = cost;
            bestX = vx;
            bestY = vy;
          }
        }
      bx[gj * g + gi] = bestX;
      by[gj * g + gi] = bestY;
    }
  }
  // spread the block vectors over every pixel
  const fx = new Float32Array(s * s);
  const fy = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    const gy = Math.min(g - 1, Math.max(0, (y - bs / 2) / step));
    const j0 = Math.floor(gy);
    const j1 = Math.min(g - 1, j0 + 1);
    const wy = gy - j0;
    for (let x = 0; x < s; x++) {
      const gx = Math.min(g - 1, Math.max(0, (x - bs / 2) / step));
      const i0 = Math.floor(gx);
      const i1 = Math.min(g - 1, i0 + 1);
      const wx = gx - i0;
      const at = (f: Float32Array, j: number, i: number) => f[j * g + i];
      fx[y * s + x] =
        (1 - wy) * ((1 - wx) * at(bx, j0, i0) + wx * at(bx, j0, i1)) + wy * ((1 - wx) * at(bx, j1, i0) + wx * at(bx, j1, i1));
      fy[y * s + x] =
        (1 - wy) * ((1 - wx) * at(by, j0, i0) + wx * at(by, j0, i1)) + wy * ((1 - wx) * at(by, j1, i0) + wx * at(by, j1, i1));
    }
  }
  return { x: fx, y: fy };
}

function doubled(f: Flow, s: number): Flow {
  const n = s * 2;
  const x = new Float32Array(n * n);
  const y = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = (j >> 1) * s + (i >> 1);
      x[j * n + i] = f.x[k] * 2;
      y[j * n + i] = f.y[k] * 2;
    }
  return { x, y };
}

/** How the picture moves from view `a` to view `b` (two square canvases of the same scene). */
export function estimateFlow(a: HTMLCanvasElement, b: HTMLCanvasElement): Flow {
  const a128 = gray(a, GRID);
  const b128 = gray(b, GRID);
  const a64 = halve(a128, GRID);
  const b64 = halve(b128, GRID);
  const pyramid: Record<number, [Float32Array, Float32Array]> = {
    32: [halve(a64, 64), halve(b64, 64)],
    64: [a64, b64],
    128: [a128, b128],
  };
  let flow: Flow | null = null;
  let prev = 0;
  for (const level of LEVELS) {
    const [pa, pb] = pyramid[level.size];
    const init = flow && prev ? doubled(flow, prev) : null;
    flow = refine(pa, pb, level.size, level.block, level.radius, init);
    prev = level.size;
  }
  const fx = blur(flow!.x, GRID, 2);
  const fy = blur(flow!.y, GRID, 2);

  // Check the motion area by area: move picture A along it and see whether it lands on picture B. Where it does not
  // (the glasses swinging past the face, the eyes being uncovered, the hand coming in), the motion there is wrong, and
  // sliding the pictures along it would warp them ("melting"). There the motion is switched off, so that patch simply
  // changes from one frame to the other while the rest keeps moving.
  const last = GRID - 1;
  const residual = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const bx = Math.min(last, Math.max(0, Math.round(x + fx[i])));
      const by = Math.min(last, Math.max(0, Math.round(y + fy[i])));
      residual[i] = Math.abs(a128[i] - b128[by * GRID + bx]);
    }
  }
  const local = blur(residual, GRID, 3);
  for (let i = 0; i < fx.length; i++) {
    const trust = 1 - smooth(0.05, 0.12, local[i]);
    fx[i] *= trust;
    fy[i] *= trust;
  }
  return { x: blur(fx, GRID, 1), y: blur(fy, GRID, 1) };
}

/** The motion resampled to a picture `size` pixels square (in that picture's pixels). */
function dense(flow: Flow, size: number): Flow {
  const x = new Float32Array(size * size);
  const y = new Float32Array(size * size);
  const k = GRID / size;
  const last = GRID - 1;
  for (let py = 0; py < size; py++) {
    const v = Math.min(last, Math.max(0, (py + 0.5) * k - 0.5));
    const v0 = Math.floor(v);
    const v1 = Math.min(last, v0 + 1);
    const wy = v - v0;
    for (let px = 0; px < size; px++) {
      const u = Math.min(last, Math.max(0, (px + 0.5) * k - 0.5));
      const u0 = Math.floor(u);
      const u1 = Math.min(last, u0 + 1);
      const wx = u - u0;
      const at = (f: Float32Array) =>
        (1 - wy) * ((1 - wx) * f[v0 * GRID + u0] + wx * f[v0 * GRID + u1]) + wy * ((1 - wx) * f[v1 * GRID + u0] + wx * f[v1 * GRID + u1]);
      x[py * size + px] = at(flow.x) / k;
      y[py * size + px] = at(flow.y) / k;
    }
  }
  return { x, y };
}

function sample(d: Uint8ClampedArray, size: number, x: number, y: number, out: Float32Array) {
  const last = size - 1;
  const cx = Math.min(last, Math.max(0, x));
  const cy = Math.min(last, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(last, x0 + 1);
  const y1 = Math.min(last, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const i00 = (y0 * size + x0) * 4;
  const i10 = (y0 * size + x1) * 4;
  const i01 = (y1 * size + x0) * 4;
  const i11 = (y1 * size + x1) * 4;
  out[0] = d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
  out[1] = d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
  out[2] = d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
}

const smooth = (e0: number, e1: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
};

/**
 * The in-between picture a fraction `t` (0–1) of the way from view `a` to view `b`, written into `out` (a canvas of the
 * same size). Both views are slid along the motion and blended; where they disagree, the nearer real view wins.
 */
export function interpolateView(a: HTMLCanvasElement, b: HTMLCanvasElement, flow: Flow, t: number, out: HTMLCanvasElement) {
  const size = a.width;
  const da = a.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, size, size).data;
  const db = b.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, size, size).data;
  const f = dense(flow, size);
  const img = new ImageData(size, size);
  const pa = new Float32Array(3);
  const pb = new Float32Array(3);
  // Where the two slid pictures disagree, something appeared or disappeared (the hand coming in, the eyes behind the
  // glasses). There the picture changes from one frame to the other gradually over most of the step, leaning on the
  // nearer frame, instead of a half-and-half double image or a sudden switch.
  const nearer = smooth(0.15, 0.85, t); // spread over most of the step, so nothing switches in one jump
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      sample(da, size, x - t * f.x[i], y - t * f.y[i], pa);
      sample(db, size, x + (1 - t) * f.x[i], y + (1 - t) * f.y[i], pb);
      const disagree = (Math.abs(pa[0] - pb[0]) + Math.abs(pa[1] - pb[1]) + Math.abs(pa[2] - pb[2])) / 3;
      const trust = 1 - smooth(14, 55, disagree);
      const wb = trust * t + (1 - trust) * nearer;
      const o = i * 4;
      img.data[o] = pa[0] + (pb[0] - pa[0]) * wb;
      img.data[o + 1] = pa[1] + (pb[1] - pa[1]) * wb;
      img.data[o + 2] = pa[2] + (pb[2] - pa[2]) * wb;
      img.data[o + 3] = 255;
    }
  }
  out.width = size;
  out.height = size;
  out.getContext("2d")!.putImageData(img, 0, 0);
}
