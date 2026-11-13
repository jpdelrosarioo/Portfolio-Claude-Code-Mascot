import type { Frame } from "@/components/halftone-portrait";
import { site } from "@/data/site";

/** The frames of the portrait video, cut out of the sprite sheet (left to right, top to bottom). */
export function portraitFrames(): Frame[] | undefined {
  const s = site.portraitFrames;
  if (!s?.src) return undefined;
  const out: Frame[] = [];
  for (let i = 0; i < s.frames; i++) {
    const col = i % s.columns;
    const row = Math.floor(i / s.columns);
    const x = s.left + col * s.stepX;
    const y = s.top + row * s.stepY;
    out.push({
      src: s.src,
      crop: {
        x: x + s.width * s.inset.left,
        y: y + s.height * s.inset.top,
        w: s.width * (1 - s.inset.left - s.inset.right),
        h: s.height * (1 - s.inset.top - s.inset.bottom),
      },
    });
  }
  return out;
}

/** Frames per second for the portrait video. */
export function portraitFps() {
  return site.portraitFrames?.fps ?? 12;
}

/** Which part of the picture to show: the video's own setting when it is used, otherwise `portraitFocus`. */
export function portraitFocus() {
  return site.portraitFrames?.src ? site.portraitFrames.focus : site.portraitFocus;
}
