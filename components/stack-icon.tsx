import { aiLogoPaths } from "./ai-logo-paths";
import { Icon } from "./icons";
import { aiMarkPaths, stackPaths } from "./stack-icon-paths";

// What to call each technology so its logo is found: lower-case letters and digits only ("Next.js" → "nextjs").
const ALIASES: Record<string, string> = {
  typescript: "typescript",
  react: "react",
  nextjs: "nextdotjs",
  tailwind: "tailwindcss",
  tailwindcss: "tailwindcss",
  nodejs: "nodedotjs",
  node: "nodedotjs",
  python: "python",
  git: "git",
  github: "github",
  vscode: "visualstudiocode",
  visualstudiocode: "visualstudiocode",
  visualstudio: "visualstudiocode",
  pycharm: "pycharm",
};
// Technologies drawn with a plain symbol, because their official logo is a wordmark that is unreadable at icon size
const SYMBOLS: Record<string, "database"> = { mysql: "database", postgresql: "database", postgres: "database", mongodb: "database", sqlite: "database" };
const key = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The logo of a technology in the current text colour; a small "code" glyph if there is no logo for it. Decorative. */
export function StackIcon({ label, className = "size-4" }: { label: string; className?: string }) {
  const k = key(label);

  // Gemini's mark comes from the AI logos
  if (k === "gemini" || k === "geminiapi") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" className={`shrink-0 ${className}`}>
        {aiLogoPaths.gemini.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    );
  }

  // Claude, Claude Code, ChatGPT and Codex: ChatGPT uses the OpenAI mark
  const ai = aiMarkPaths[{ claude: "claude", claudecode: "claudecode", chatgpt: "openai", openai: "openai", codex: "codex", antigravity: "antigravity", anthropic: "anthropic" }[k] ?? ""];
  if (ai) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" className={`shrink-0 ${className}`}>
        {ai.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    );
  }

  if (SYMBOLS[k]) return <Icon name={SYMBOLS[k]} className={`shrink-0 ${className}`} />;

  const path = stackPaths[ALIASES[k] ?? ""];
  if (!path) return <Icon name="code" className={`shrink-0 ${className}`} />;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d={path} />
    </svg>
  );
}
