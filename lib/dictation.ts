"use client";

// Speech-to-text: the visitor talks instead of typing. Uses the browser's built-in speech recognition (Web Speech API).
// Chrome, Edge and Safari have it; Firefox does not, so the microphone button is simply hidden there. In Chrome and Edge
// the browser sends the audio to its own speech service to be turned into text; nothing goes through this site's server.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MIC_PROBLEMS, recognitionClass, recognitionLang, type Recognition } from "./recognition";

const noSubscribe = () => () => {};

/**
 * Dictation into a text field. `start()` begins listening; the words appear through `onText` as they are spoken (the
 * latest guess first, then the final text). `stop()` ends it; the visitor reads, edits and sends the text themselves.
 */
export function useDictation(onText: (spoken: string) => void) {
  const supported = useSyncExternalStore(noSubscribe, () => recognitionClass() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  useEffect(() => {
    cb.current = onText;
  });

  const stop = useCallback(() => rec.current?.stop(), []);

  const start = useCallback(() => {
    const Rec = recognitionClass();
    if (!Rec || rec.current) return;
    setProblem(null);
    const r = new Rec();
    r.lang = recognitionLang();
    r.continuous = true; // keeps listening through short pauses, until the visitor taps the microphone again
    r.interimResults = true; // shows the words while they are still being spoken
    r.onstart = () => setListening(true);
    r.onresult = (e) => {
      let spoken = "";
      for (let i = 0; i < e.results.length; i++) spoken += e.results[i][0].transcript;
      cb.current(spoken);
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setProblem(MIC_PROBLEMS[e.error] ?? "Something went wrong with the microphone. Try again?");
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      rec.current = null;
      setListening(false);
    }
  }, []);

  // leaving the page switches the microphone off
  useEffect(() => () => rec.current?.abort(), []);

  return { supported, listening, problem, start, stop, clearProblem: () => setProblem(null) };
}
