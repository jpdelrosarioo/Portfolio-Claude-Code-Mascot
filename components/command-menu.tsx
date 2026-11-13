"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask, navItems, site } from "@/data/site";
import { AskChat } from "./ask-chat";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { useTheme } from "./theme-provider";

type Command = { id: string; label: string; hint: string; run: () => void };

/**
 * Alt+K (or Ctrl/⌘+K): one box for everything.
 * Type a question and press Enter to ask the AI, or pick a section / action / theme from the list.
 * The sidebar's "Ask anything" opens the chat directly (event "open-ask").
 */
export function CommandMenu() {
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"palette" | "chat">("palette");
  const [seed, setSeed] = useState("");
  const [chatKey, setChatKey] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const openPalette = useCallback(() => {
    setMode("palette");
    setQuery("");
    setSelected(0);
    setOpen(true);
  }, []);

  const startChat = useCallback((question: string) => {
    setSeed(question);
    setChatKey((k) => k + 1); // fresh conversation
    setMode("chat");
    setOpen(true);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const go = (id: string) => () => {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (id === "top") window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      else document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
      history.replaceState(null, "", location.pathname + location.search); // keep the address clean (no #section)
    };
    return [
      ...navItems.map((n) => ({ id: `go-${n.id}`, label: n.label, hint: "Go to", run: go(n.id) })),
      { id: "email", label: `Email ${site.email}`, hint: "Action", run: () => (location.href = `mailto:${site.email}`) },
      { id: "typing", label: "Typing test", hint: "Game", run: () => window.dispatchEvent(new Event("open-typing")) },
      { id: "t-light", label: "Light", hint: "Theme", run: () => setTheme("light") },
      { id: "t-dark", label: "Dark", hint: "Theme", run: () => setTheme("dark") },
      { id: "t-system", label: "System", hint: "Theme", run: () => setTheme("system") },
    ];
  }, [setTheme]);

  const results = useMemo(() => {
    const q = query.trim();
    const list = q ? commands.filter((c) => `${c.hint} ${c.label}`.toLowerCase().includes(q.toLowerCase())) : commands;
    if (!ask.enabled) return list;
    // The "Ask" row is always first, so typing a question and pressing Enter asks the AI
    const askRow: Command = { id: "ask", label: q ? `Ask: ${q}` : "Ask anything…", hint: "AI", run: () => startChat(q) };
    return [askRow, ...list];
  }, [commands, query, startChat]);

  // Shortcuts and events
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.altKey || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (open) close();
        else openPalette();
      }
    };
    const onAsk = () => (ask.enabled ? startChat("") : openPalette());
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command", openPalette);
    window.addEventListener("open-ask", onAsk);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command", openPalette);
      window.removeEventListener("open-ask", onAsk);
    };
  }, [open, close, openPalette, startChat]);

  // Focus the field whenever the palette is showing
  useEffect(() => {
    if (open && mode === "palette") {
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open, mode]);

  const run = (c?: Command) => {
    if (!c) return;
    if (c.id === "ask") {
      c.run();
      return;
    }
    close();
    window.setTimeout(c.run, 60);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (results.length ? (s + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (results.length ? (s - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[selected]);
    }
  };

  return (
    <Modal open={open} onClose={close} label={mode === "chat" ? "Ask anything" : "Ask anything or jump to"} size={mode === "chat" ? "md" : "sm"}>
      {mode === "chat" ? (
        <AskChat key={chatKey} initialQuestion={seed} onBack={openPalette} />
      ) : (
        <div onKeyDown={onKeyDown}>
          <div className="flex items-center gap-2.5 border-b border-g200 px-2 pb-3 pt-1">
            <Icon name={ask.enabled ? "spark" : "search"} className="size-4 text-g500" />
            <input
              ref={inputRef}
              data-autofocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              placeholder={ask.enabled ? "Ask anything or jump to…" : "Jump to…"}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={results[selected] ? `cmd-${results[selected].id}` : undefined}
              aria-label="Ask a question or search"
              className="w-full bg-transparent font-mono text-[13px] outline-none placeholder:text-g400"
            />
          </div>

          <ul id="command-list" role="listbox" className="mt-2 max-h-72 overflow-y-auto">
            {results.length === 0 && <li className="px-2 py-6 text-center text-[13px] text-g500">Nothing found</li>}
            {results.map((c, i) => (
              <li
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => setSelected(i)}
                onClick={() => run(c)}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-[13px] aria-selected:bg-g100"
              >
                <span className="truncate">{c.label}</span>
                <span className="micro shrink-0 text-g400">{c.hint}</span>
              </li>
            ))}
          </ul>

          <p className="micro mt-2 flex justify-between border-t border-g200 px-2 pt-3 text-g400">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </p>
        </div>
      )}
    </Modal>
  );
}
