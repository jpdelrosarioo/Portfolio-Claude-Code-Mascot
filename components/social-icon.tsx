import { socialPaths, type SocialName } from "./social-icon-paths";

/** Maps a link label to a known icon ("github", "linkedin", "instagram", "x" / "twitter"); otherwise null. */
export function socialNameFor(label: string): SocialName | null {
  const key = label.trim().toLowerCase();
  if (key === "twitter") return "x";
  return key in socialPaths ? (key as SocialName) : null;
}

/** A brand icon in the current text colour (decorative: the link carries the aria-label). */
export function SocialIcon({ name, className = "size-[18px]" }: { name: SocialName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={socialPaths[name]} />
    </svg>
  );
}
