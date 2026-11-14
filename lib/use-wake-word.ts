"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MIC_FATAL, MIC_PROBLEMS, recognitionClass, recognitionLang } from "./recognition";
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
  /** What the mascot has been saying (so its voice, heard through the microphone, is not taken for the visitor's). */
  echoText?: () => string;
  /** The visitor spoke over the mascot: hold its voice right away. What they say next is their message, and the mascot answers it. */
  onPause?: () => void;
  /** It was only a noise (nobody said anything): the voice goes on from where it was. */
  onResume?: () => void;
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
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const listener = useRef<WakeListener | null>(null);

  useEffect(() => {
    const Rec = recognitionClass();
    if (!enabled || !Rec) return;
    // Talking over the mascot needs to measure the microphone's loudness (see lib/mic-level.ts); where that is not possible, only the phrase interrupts
    const meter = interrupt ? startLevelMeter() : undefined;
    const l = createWakeListener({
      meter,
      Rec,
      phrase,
      lang: recognitionLang(),
      pauseMs: () => latest.current.pauseMs,
      followUpMs,
      onIdle: () => latest.current.onIdle?.(),
      speaking: () => latest.current.speaking?.() ?? false,
      echoText: () => latest.current.echoText?.() ?? "",
      onPause: meter ? () => latest.current.onPause?.() : undefined,
      onResume: () => latest.current.onResume?.(),
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

  return { phase: enabled ? phase : "off", problem: enabled ? problem : null, hold, cancel, end, resume };
}
