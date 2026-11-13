import { cx } from "@/lib/cx";
import { aiLogoPaths, type AiLogoName } from "./ai-logo-paths";

export type { AiLogoName };

// Each tile is turned a few degrees the other way from its neighbour, so the overlapped tiles read like a fanned
// stack of cards. These angles are the ones measured on bryllim.com (-12°, 9°, -7°, 12°).
const TILT = [-12, 9, -7, 12];

/**
 * A cluster of overlapping logo tiles, optionally followed by a label, e.g.
 *   [✦][◎][✱][⬡] generative AI
 * The logos are decorative (aria-hidden); without a label the surrounding sentence carries the meaning.
 */
export function AiLogos({ logos, label }: { logos: AiLogoName[]; label?: string }) {
  return (
    <span className="mx-0.5 inline-flex items-center whitespace-nowrap align-middle">
      <span aria-hidden className={cx("inline-flex items-center", label && "mr-2.5")}>
        {logos.map((name, i) => (
          <span
            key={name}
            style={{ transform: `rotate(${TILT[i % TILT.length]}deg)`, zIndex: i }}
            className="relative -ml-1.5 grid size-[27px] place-items-center rounded-[7.5px] bg-g100 shadow-[0_2px_5px_rgb(0_0_0/0.16)] first:ml-0"
          >
            <svg viewBox="0 0 24 24" fillRule="evenodd" className="size-[17px] fill-ink">
              {aiLogoPaths[name].map((d, j) => (
                <path key={j} d={d} />
              ))}
            </svg>
          </span>
        ))}
      </span>
      {label && <span className="font-medium">{label}</span>}
    </span>
  );
}
