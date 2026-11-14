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

/** What to tell the visitor when the microphone fails (undefined: nothing worth saying, e.g. they just stayed quiet). */
export const MIC_PROBLEMS: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it in your browser's address bar to talk to me.",
  "service-not-allowed": "The microphone is blocked. Allow it in your browser's address bar to talk to me.",
  "audio-capture": "I can't find a microphone on this device.",
  network: "I couldn't hear you: the speech service isn't reachable right now.",
};

/** Errors after which trying again is pointless (until the visitor changes something). */
export const MIC_FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);
