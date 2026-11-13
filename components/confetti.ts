// A small confetti burst, drawn on a canvas that covers the screen for a few seconds and then removes itself.
// No library: two "cannons" fire from the bottom corners, then a light shower falls from the top.

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  shape: 0 | 1 | 2; // 0 rectangle, 1 circle, 2 ribbon
  angle: number;
  spin: number;
  wobble: number;
  wobbleSpeed: number;
  born: number; // ms after the start (the shower is released over time)
};

const COLORS = ["#D97757", "#F5C542", "#4ADE80", "#38BDF8", "#A78BFA", "#F472B6", "#FAFAFA", "#262626"];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function confetti({ duration = 4200 }: { duration?: number } = {}) {
  if (typeof document === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.dataset.confetti = "";
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:95";
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  document.body.appendChild(canvas);
  ctx.scale(dpr, dpr);

  const pieces: Piece[] = [];
  const add = (x: number, y: number, angle: number, speed: number, born: number) =>
    pieces.push({
      x,
      y,
      vx: Math.cos(angle) * speed * rand(0.6, 1),
      vy: Math.sin(angle) * speed * rand(0.6, 1),
      size: rand(6, 11),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
      angle: rand(0, Math.PI * 2),
      spin: rand(-0.25, 0.25),
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(0.05, 0.14),
      born,
    });

  const power = Math.min(1, Math.max(0.6, Math.min(w, h) / 700)) * Math.max(14, h / 38); // smaller screens: gentler cannons
  // the two cannons, angled in towards the middle
  for (let i = 0; i < 70; i++) add(0, h, rand(-1.35, -0.8), power, 0);
  for (let i = 0; i < 70; i++) add(w, h, rand(-Math.PI + 0.8, -Math.PI + 1.35), power, 0);
  // a shower from the top, released over the first second and a half
  for (let i = 0; i < 70; i++) {
    add(rand(0, w), rand(-40, -10), Math.PI / 2, rand(1, 3), rand(250, 1600));
  }

  const start = performance.now();
  let last = start;
  let raf = 0;
  const frame = (now: number) => {
    const t = now - start;
    const dt = Math.min(2.5, (now - last) / 16.67); // 1 = one frame at 60 fps
    last = now;
    ctx.clearRect(0, 0, w, h);
    const fade = t > duration - 900 ? Math.max(0, (duration - t) / 900) : 1;
    for (const p of pieces) {
      if (t < p.born) continue;
      p.vy += 0.34 * dt; // gravity
      p.vx *= Math.pow(0.985, dt); // air drag
      p.vy *= Math.pow(0.992, dt);
      p.x += p.vx * dt + Math.sin(p.wobble) * 0.6 * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      p.wobble += p.wobbleSpeed * dt;
      if (p.y > h + 30) continue;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      const flip = Math.cos(p.wobble); // turning over as it falls
      if (p.shape === 1) {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size / 2, (p.size / 2) * Math.abs(flip), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 2) {
        ctx.fillRect(-p.size * 0.9, (-p.size * 0.18 * Math.abs(flip)) / 1, p.size * 1.8, Math.max(1, p.size * 0.36 * Math.abs(flip)));
      } else {
        ctx.fillRect(-p.size / 2, (-p.size / 2) * Math.abs(flip), p.size, Math.max(1, p.size * Math.abs(flip)));
      }
      ctx.restore();
    }
    if (t < duration) raf = requestAnimationFrame(frame);
    else canvas.remove();
  };
  raf = requestAnimationFrame(frame);

  // leaving the page or resizing a lot: just clean up
  const stop = () => {
    cancelAnimationFrame(raf);
    canvas.remove();
    removeEventListener("pagehide", stop);
  };
  addEventListener("pagehide", stop);
  window.setTimeout(stop, duration + 500);
}
