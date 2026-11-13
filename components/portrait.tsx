import Image from "next/image";
import { preload } from "react-dom";
import { HalftonePortrait, type Focus, type Frame } from "./halftone-portrait";

export type PortraitStyle = "dots-bw" | "dots" | "halftone-color" | "halftone" | "color";

/**
 * The hero portrait.
 *  - "dots-bw":        the same dense dots in black and white, no border. With `srcDark`, that photo shows in dark mode.
 *  - "dots":           your photo rebuilt from tens of thousands of tiny dots in its own colours, in a rounded frame.
 *  - "halftone-color": the dotted halftone texture, with every dot keeping the colour of your photo.
 *  - "halftone":       the same texture in black and white.
 *  - "color":          your photo as-is, in a rounded frame that matches the cards.
 * With no `src` it always falls back to the halftone placeholder silhouette.
 */
export function Portrait({
  src,
  srcDark,
  frames,
  fps,
  alt,
  style = "halftone-color",
  focus,
}: {
  src?: string;
  /** A different photo shown while dark mode is on (dot styles only). */
  srcDark?: string;
  /** The frames of a video for the dot styles: light mode shows the first, dark mode the last. */
  frames?: Frame[];
  /** Frames per second for that video. */
  fps?: number;
  alt: string;
  style?: PortraitStyle;
  /** Which part of the photo to show: centre x/y (0–1) and zoom (1 = whole photo). Halftone styles only. */
  focus?: Focus;
}) {
  // start fetching the photo(s) right away, so the portrait is there when the page opens (not after the scripts)
  for (const url of new Set([...(frames?.map((f) => f.src) ?? []), ...(!frames?.length ? [src, srcDark] : [])])) {
    if (url && (style === "dots-bw" || style === "dots")) preload(encodeURI(url), { as: "image" });
  }

  if ((src || frames?.length) && style === "dots-bw") {
    return (
      <HalftonePortrait src={src} srcDark={srcDark} frames={frames} fps={fps} alt={alt} dots gray focus={focus} className="block aspect-square w-full rounded-2xl" />
    );
  }

  if ((src || frames?.length) && style === "dots") {
    return (
      <HalftonePortrait
        src={src}
        srcDark={srcDark}
        frames={frames}
        fps={fps}
        alt={alt}
        dots
        focus={focus}
        className="block aspect-square w-full rounded-2xl border border-g200 shadow-card"
      />
    );
  }

  if (!src || style === "halftone" || style === "halftone-color") {
    return (
      <HalftonePortrait
        src={src || undefined}
        alt={alt}
        colored={style === "halftone-color"}
        focus={focus}
        className="block aspect-square w-full"
      />
    );
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-g200 bg-g100 shadow-card">
      <Image src={src} alt={alt} fill priority sizes="288px" className="object-cover" />
    </div>
  );
}
