"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTouchDevice, MIC_FATAL, MIC_PROBLEMS, recognitionClass, recognitionLang } from "./recognition";
import { startLevelMeter } from "./mic-level";
import { createWakeListener, type WakeListener, type WakePhase } from "./wake-word";

type Handlers = {
  pauseMs: number;
  onWake?: () => void;
  onHeard?: (text: string) => void;
  onCommand?: (text: string) => void;
  onGiveUp?: () => void;
  /** The conversation went quiet: nobody spoke after the mascot's answer. */
  onIdle?: () => void;
  /** Is the mascot talking (or did it stop a moment ago)? */
  speaking?: () => boolean;
  /** Is the mascot working on an answer (waiting for it, or typing it out) without talking? Speaking then stops it too. */
  busy?: () => boolean;
  /** What the mascot has been saying (so its voice, heard through the microphone, is not taken for the visitor's). */
  echoText?: () => string;
  /** The visitor spoke over the mascot: hold its voice right away. What they say next is their message, and the mascot answers it. */
  onPause?: () => void;
  /** It was only a noise (nobody said anything): the voice goes on from where it was. */
  onResume?: () => void;
  /** They talked over the mascot but nothing could be made out: the old answer is dropped and the mascot listens. */
  onDropped?: () => void;
  /** Listening stopped for good (microphone blocked or missing): switch the setting back off. */
  onStopped?: (message: string) => void;
};

/**
 * Listens for the wake phrase while `enabled`. The handlers can change on every render (they always see the latest
 * state); only `enabled` and `phrase` restart the listener.
 */
export function useWakeWord({
  enabled,
  phrase,
  followUpMs,
  interrupt,
  ...handlers
}: { enabled: boolean; phrase: string; followUpMs: number; interrupt: boolean } & Handlers) {
  const [phase, setPhase] = useState<WakePhase>("off");
  const [problem, setProblem] = useState<string | null>(null);
  // `?micdebug` on the address shows what the recogniser is doing, line by line (to find out why a phone does not work)
  const [log, setLog] = useState<string[]>([]);
  const [sound, setSound] = useState<{ text: string; at: number } | null>(null); // the latest words the microphone caught
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const listener = useRef<WakeListener | null>(null);

  useEffect(() => {
    const Rec = recognitionClass();
    if (!enabled || !Rec) return;
    // Talking over the mascot needs to measure the microphone's loudness (see lib/mic-level.ts); where that is not possible, only the phrase interrupts
    // (not on a phone: there the browser gives the microphone to the recogniser or to the meter, not both, and the meter would
    // leave the recogniser deaf. On a phone the phrase interrupts, as the rest of the voice conversation works the same.)
    const meter = interrupt && !isTouchDevice() ? startLevelMeter() : undefined;
    const debugOn = /[?&]micdebug\b/.test(window.location.search);
    const l = createWakeListener({
      mergeResults: isTouchDevice(),
      onSound: (text) => setSound({ text, at: Date.now() }),
      debug: debugOn
        ? (line) => {
            const t = new Date();
            const stamp = `${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
            setLog((a) => [...a.slice(-11), `${stamp} ${line}`]);
          }
        : undefined,
      meter,
      Rec,
      phrase,
      lang: recognitionLang(),
      pauseMs: () => latest.current.pauseMs,
      followUpMs,
      onIdle: () => latest.current.onIdle?.(),
      speaking: () => latest.current.speaking?.() ?? false,
      echoText: () => latest.current.echoText?.() ?? "",
      busy: () => latest.current.busy?.() ?? false,
      // (always: without a loudness meter, as on a phone, the words it hears can still tell that someone is talking over it)
      onPause: interrupt ? () => latest.current.onPause?.() : undefined,
      onResume: () => latest.current.onResume?.(),
      onDropped: () => latest.current.onDropped?.(),
      onPhase: setPhase,
      onWake: () => latest.current.onWake?.(),
      onHeard: (t) => latest.current.onHeard?.(t),
      onCommand: (t) => latest.current.onCommand?.(t),
      onGiveUp: () => latest.current.onGiveUp?.(),
      onProblem: setProblem,
      onStopped: (m) => latest.current.onStopped?.(m),
      problems: MIC_PROBLEMS,
      fatal: MIC_FATAL,
    });
    listener.current = l;
    l.start();
    return () => {
      l.stop();
      meter?.stop();
      listener.current = null;
    };
  }, [enabled, phrase, followUpMs, interrupt]);

  const hold = useCallback((on: boolean) => listener.current?.hold(on), []);
  const cancel = useCallback(() => listener.current?.cancel(), []);
  const end = useCallback(() => listener.current?.end(), []);
  const resume = useCallback(() => listener.current?.resume() ?? false, []);

  return { phase: enabled ? phase : "off", problem: enabled ? problem : null, log, sound, hold, cancel, end, resume };
}
