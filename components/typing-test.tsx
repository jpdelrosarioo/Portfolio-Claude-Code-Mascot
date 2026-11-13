"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { play } from "@/lib/sounds";
import { Modal } from "./modal";

const TEXTS = [
  "Good software is quiet. It does one thing well, stays out of the way, and leaves people feeling a little more capable than before.",
  "I like turning rough ideas into working products. Start small, ship early, listen carefully, and keep improving the parts people actually use.",
  "A clean interface is not about removing features. It is about removing doubt, so the next step is always obvious to the person using it.",
  "Debugging is mostly reading. Slow down, ask what the code is really doing, and the bug usually shows itself long before the fix does.",
  "Every project teaches something new. Sometimes it is a tool, sometimes a habit, and sometimes it is simply how to ask a better question.",
];

const BEST_KEY = "typing-best";

const pickText = (not?: string) => {
  const pool = TEXTS.filter((t) => t !== not);
  return pool[Math.floor(Math.random() * pool.length)];
};

/** A short typing test (Alt+J): type the sentence, get your speed and accuracy. */
export function TypingTest() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(TEXTS[0]);
  const [typed, setTyped] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [keys, setKeys] = useState({ total: 0, wrong: 0 });
  const [now, setNow] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setTarget((t) => pickText(t));
    setTyped("");
    setStartedAt(null);
    setFinishedAt(null);
    setKeys({ total: 0, wrong: 0 });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Alt+J toggles; the sidebar and the Alt+K menu open it with an event
  useEffect(() => {
    const show = () => {
      reset();
      try {
        const saved = Number(localStorage.getItem(BEST_KEY));
        setBest(saved > 0 ? saved : null);
      } catch {}
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        if (open) close();
        else show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-typing", show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-typing", show);
    };
  }, [open, close, reset]);

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  // Live clock while typing
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [startedAt, finishedAt]);

  const correctCount = (text: string) => {
    let n = 0;
    for (let i = 0; i < text.length; i++) if (text[i] === target[i]) n++;
    return n;
  };
  const wpmAt = (text: string, ms: number) => (ms > 0 ? Math.round(correctCount(text) / 5 / (ms / 60000)) : 0);

  const onChange = (value: string) => {
    if (finishedAt) return;
    value = value.slice(0, target.length);

    // Count each newly typed character (also when several arrive at once)
    if (value.length > typed.length) {
      let wrong = 0;
      for (let i = typed.length; i < value.length; i++) if (value[i] !== target[i]) wrong++;
      setKeys((k) => ({ total: k.total + (value.length - typed.length), wrong: k.wrong + wrong }));
    }
    const start = startedAt ?? Date.now();
    if (!startedAt) {
      setStartedAt(start);
      setNow(start);
    }
    setTyped(value);

    if (value.length === target.length) {
      const end = Date.now();
      setFinishedAt(end);
      const score = wpmAt(value, end - start);
      if (best === null || score > best) {
        setBest(score);
        try {
          localStorage.setItem(BEST_KEY, String(score));
        } catch {}
      }
      play("success");
    }
  };

  const elapsed = startedAt ? (finishedAt ?? now) - startedAt : 0;
  const wpm = wpmAt(typed, elapsed);
  const accuracy = keys.total ? Math.round(((keys.total - keys.wrong) / keys.total) * 100) : 100;
  const done = finishedAt !== null;
  const progress = Math.round((typed.length / target.length) * 100);

  return (
    <Modal open={open} onClose={close} label="Typing test" size="md">
      <div className="flex items-center justify-between px-1 pb-3 pt-0.5">
        <span className="micro text-g500">Typing test</span>
        <span className="micro text-g500">
          {done ? "Done" : startedAt ? `${wpm} wpm · ${(elapsed / 1000).toFixed(1)}s` : "Start typing"}
        </span>
      </div>
      <div className="mx-1 h-px bg-g200">
        <div className="h-px bg-ink transition-[width] duration-200" style={{ width: `${progress}%` }} />
      </div>

      {done ? (
        <div className="px-1 py-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="font-pixel text-[2.4rem] leading-none">{wpm}</p>
              <p className="micro mt-2 text-g500">Words / min</p>
            </div>
            <div>
              <p className="font-pixel text-[2.4rem] leading-none">{accuracy}%</p>
              <p className="micro mt-2 text-g500">Accuracy</p>
            </div>
            <div>
              <p className="font-pixel text-[2.4rem] leading-none">{(elapsed / 1000).toFixed(1)}s</p>
              <p className="micro mt-2 text-g500">Time</p>
            </div>
          </div>
          {best !== null && <p className="micro mt-5 text-g500">Your best: {best} wpm</p>}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-ink px-4 py-2.5 font-mono text-[11px] font-medium uppercase leading-none tracking-[1px] text-bg transition-opacity duration-200 hover:opacity-85"
            >
              Try again
            </button>
            <button type="button" onClick={close} className="micro py-2.5 text-g500 transition-colors duration-200 hover:text-ink">
              Close
            </button>
          </div>
        </div>
      ) : (
        <div className="relative px-1 py-5" onClick={() => inputRef.current?.focus()}>
          <p aria-hidden className="select-none font-mono text-[15px] leading-[1.9]">
            {target.split("").map((ch, i) => {
              const typedCh = typed[i];
              return (
                <span
                  key={i}
                  className={cx(
                    typedCh === undefined && "text-g400",
                    typedCh !== undefined && typedCh === ch && "text-ink",
                    typedCh !== undefined && typedCh !== ch && "rounded-[3px] bg-ink text-bg",
                    i === typed.length && "underline decoration-2 underline-offset-4",
                  )}
                >
                  {ch}
                </span>
              );
            })}
          </p>
          {/* The real input sits invisibly on top, so phones get a keyboard too */}
          <input
            ref={inputRef}
            data-autofocus
            value={typed}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => e.preventDefault()}
            aria-label={`Type this text: ${target}`}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="absolute inset-0 h-full w-full cursor-text opacity-0"
          />
        </div>
      )}

      <p className="micro mt-1 flex justify-between border-t border-g200 px-1 pt-3 text-g400">
        <span>{best !== null ? `Best ${best} wpm` : "Type the text above"}</span>
        <span>Esc to close</span>
      </p>
    </Modal>
  );
}
