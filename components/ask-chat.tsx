"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ask, site } from "@/data/site";
import { cx } from "@/lib/cx";
import { moderate, moderationMessage } from "@/lib/moderation";
import { isSpeaking, isVoiceOn, sentenceBoundary, setVoiceOn, speak, speechSupported, stopSpeaking, subscribeSpeaking } from "@/lib/speech";
import { Icon } from "./icons";

type Msg = { role: "user" | "assistant"; content: string; greeting?: boolean };

const ERRORS: Record<string, string> = {
  not_configured: `The AI isn't switched on yet. You can email ${site.name} instead: ${site.email}`,
  rate_limited: "That's a lot of questions! Please try again a little later.",
  forbidden: "Sorry, this request wasn't allowed.",
};

/** The assistant's opening line, worded for the visitor's time of day. It is written here, so it costs nothing and is instant. */
function greeting(): string {
  const h = new Date().getHours();
  const hello = h < 5 ? "Hi there" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${hello}! I'm the AI assistant for ${site.name}. Ask me about projects, skills, or how to work together — you can type, or tap a question below.`;
}

const noSubscribe = () => () => {};

/** The "Ask anything" conversation: greets the visitor, streams answers from /api/ask and can read them aloud. */
export function AskChat({ initialQuestion, onBack }: { initialQuestion: string; onBack: () => void }) {
  const [messages, setMessages] = useState<Msg[]>(() => [{ role: "assistant", content: greeting(), greeting: true }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState(true);
  const [playing, setPlaying] = useState<number | null>(null); // which message is being read aloud
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const voiceRef = useRef(true);

  const canSpeak = useSyncExternalStore(noSubscribe, speechSupported, () => false);
  const speaking = useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      // The same filter the server uses, so a blocked message gets an instant, polite answer and is never sent
      const why = moderate(question, ask.blockedWords);
      if (why) {
        stopSpeaking();
        setError(moderationMessage(why, site.name) ?? "Sorry, I can't answer that.");
        setInput("");
        return;
      }

      stopSpeaking();
      setError(null);
      // the greeting is only for show — the model is sent just the real conversation
      const history = [...messages.filter((m) => !m.greeting), { role: "user" as const, content: question }].map(({ role, content }) => ({ role, content }));
      setMessages([...messages, { role: "user", content: question }, { role: "assistant", content: "" }]);
      setPlaying(messages.length + 1);
      setInput("");
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          const code = data?.error ?? "";
          throw new Error(ERRORS[code] ?? moderationMessage(code, site.name) ?? "Something went wrong. Please try again.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";
        let spoken = 0; // how much of the answer has already been handed to the voice
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setMessages((m) => {
            const copy = m.slice();
            copy[copy.length - 1] = { role: "assistant", content: answer };
            return copy;
          });
          // speak each sentence as soon as it is complete, so the voice starts while the rest is still arriving
          if (voiceRef.current) {
            const cut = sentenceBoundary(answer, spoken);
            if (cut > spoken) {
              speak(answer.slice(spoken, cut));
              spoken = cut;
            }
          }
        }
        if (voiceRef.current && spoken < answer.length) speak(answer.slice(spoken));
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message || "Something went wrong. Please try again.");
          setMessages((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m)); // drop the empty answer
        }
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [messages, busy],
  );

  // A question typed in the Alt+K menu is sent straight away
  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      void send(initialQuestion);
    }
  }, [initialQuestion, send]);

  // On open: remember the visitor's voice choice, and say hello out loud (opening the chat was a click or key press,
  // which is what browsers require before they allow speech). With a question already waiting, skip straight to the answer.
  useEffect(() => {
    inputRef.current?.focus();
    const on = isVoiceOn();
    voiceRef.current = on;
    setVoice(on);
    if (on && !initialQuestion) {
      speak(greeting());
      setPlaying(0);
    }
    return () => {
      abortRef.current?.abort();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);

  // Keep the newest text in view
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  const toggleVoice = () => {
    const on = !voice;
    setVoice(on);
    voiceRef.current = on;
    setVoiceOn(on); // turning it off also stops anything being said
  };

  const listen = (i: number, text: string) => {
    if (speaking && playing === i) {
      stopSpeaking();
      return;
    }
    stopSpeaking();
    speak(text);
    setPlaying(i);
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-g200 px-1 pb-3 pt-0.5">
        <button
          type="button"
          onClick={onBack}
          className="micro py-1 text-g500 transition-colors duration-200 hover:text-ink"
        >
          ← Back
        </button>
        <div className="flex items-center gap-1">
          <span className="micro inline-flex items-center gap-1.5 text-g500">
            <Icon name="spark" className="size-3" />
            Ask anything
          </span>
          {canSpeak && (
            <button
              type="button"
              onClick={toggleVoice}
              aria-pressed={voice}
              aria-label="Read answers aloud"
              title={voice ? "Voice on — click to mute" : "Voice off — click to turn on"}
              className={cx(
                "ml-1 grid size-7 place-items-center rounded-md transition-colors duration-200 hover:bg-g100 hover:text-ink",
                voice ? "text-ink" : "text-g400",
              )}
            >
              <Icon name={voice ? "volume" : "volumeOff"} className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} role="log" aria-live="polite" aria-busy={busy} className="max-h-[48vh] min-h-24 overflow-y-auto px-1 py-4">
        <div className="grid gap-3">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13px] leading-snug text-bg">
                {m.content}
              </p>
            ) : (
              <div key={i} className="max-w-[92%]">
                <p className="whitespace-pre-wrap text-[13px] leading-[1.65]">
                  {m.content || (busy && i === messages.length - 1 ? <span className="text-g400">Thinking…</span> : null)}
                </p>
                {canSpeak && m.content && !(busy && i === messages.length - 1) && (
                  <button
                    type="button"
                    onClick={() => listen(i, m.content)}
                    aria-label={speaking && playing === i ? "Stop reading aloud" : "Read this aloud"}
                    className="micro mt-1 inline-flex items-center gap-1 text-g400 transition-colors duration-200 hover:text-ink"
                  >
                    <Icon name="volume" className={cx("size-3", speaking && playing === i && "animate-pulse")} />
                    {speaking && playing === i ? "Stop" : "Listen"}
                  </button>
                )}
              </div>
            ),
          )}
          {error && <p className="rounded-xl border border-g200 bg-g50 px-3.5 py-2.5 text-[13px] leading-snug text-g600">{error}</p>}
        </div>

        {messages.length === 1 && !busy && !error && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {ask.suggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-g300 px-3 py-1.5 text-[12px] text-g600 transition-colors duration-200 hover:border-ink hover:text-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="flex items-center gap-2 border-t border-g200 pt-3"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="Ask a question…"
          aria-label="Your question"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-g200 bg-g50 px-3 py-2 font-mono text-[13px] outline-none transition-colors duration-200 placeholder:text-g400 focus:border-g400"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className={cx(
            "grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-bg transition-opacity duration-200",
            busy || !input.trim() ? "opacity-30" : "hover:opacity-85",
          )}
        >
          <Icon name="arrow" className="size-4" />
        </button>
      </form>

      <p className="micro mt-3 flex justify-between px-1 text-g400">
        <span>AI answers can be wrong</span>
        <span>Esc to close</span>
      </p>
    </div>
  );
}
