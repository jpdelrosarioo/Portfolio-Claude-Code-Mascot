// The browser's speech recognition (Web Speech API), shared by the microphone button and the "Hey Claude Code" listener.
// The built-in TypeScript types do not include it yet, so just what is used here is described.

export type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
export type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export type RecognitionClass = new () => Recognition;

/** The browser's recogniser, or null where there is none (Firefox). */
export function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The language to recognise. The wake phrase, the mascot’s voice and the AI’s answers are English, so it listens for English
 * even when the browser is set to another language (which would mishear English words); an English browser keeps its own
 * variety (en-GB, en-PH...).
 */
export function recognitionLang(): string {
  const l = typeof navigator !== "undefined" ? navigator.language : "";
  return /^en(?:-|_|$)/i.test(l) ? l : "en-US";
}

/**
 * Is this a phone or a tablet (touch first)? There, the browser's speech recognition and a second use of the microphone do not
 * work at the same time (the loudness meter would take the microphone away from the recogniser), and the microphone may only
 * be started by a tap, not when the page opens.
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return coarse || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

/** Why the microphone was refused, in words that say what to do (a page that is not https can never use the microphone; phones have their own switches). */
export function blockedMessage(): string {
  if (typeof window !== "undefined" && !window.isSecureContext)
    return "The microphone only works on a secure (https) page. This page is not one, so the browser won't give me the microphone.";
  if (typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent))
    return "The microphone is blocked. Allow it for this site in Safari (the aA button), and make sure Siri & Dictation is on in Settings.";
  if (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent))
    return "The microphone is blocked. In Chrome tap the ⋮ menu, then ⓘ (or the lock icon) → Permissions → Microphone → Allow, and check that Chrome may use the microphone in Android Settings → Apps → Chrome → Permissions. Then reload the page.";
  if (isTouchDevice()) return "The microphone is blocked. Tap the lock icon by the address, allow the microphone for this site, then tap me again.";
  return "The microphone is blocked. Allow it in your browser's address bar to talk to me.";
}
const blocked = blockedMessage;

/** What to tell the visitor when the microphone fails (undefined: nothing worth saying, e.g. they just stayed quiet). */
export const MIC_PROBLEMS: Record<string, string> = {
  get "not-allowed"() {
    return blocked();
  },
  get "service-not-allowed"() {
    return blocked();
  },
  "audio-capture": "I can't find a microphone on this device, or another app is using it.",
  network: "I couldn't hear you: the speech service isn't reachable right now.",
};

/** Errors after which trying again is pointless (until the visitor changes something). */
export const MIC_FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);
