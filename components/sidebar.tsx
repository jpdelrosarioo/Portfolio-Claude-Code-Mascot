"use client";

import { useEffect, useState } from "react";
import { ask, nav, navItems, site } from "@/data/site";
import { useActiveSection } from "@/lib/use-active-section";
import { Icon } from "./icons";
import { SoundToggle } from "./sound-toggle";
import { Status } from "./status";
import { ThemeCycle, ThemeSwitch } from "./theme-switch";

const ids = navItems.map((n) => n.id);

/* Spacing below is measured from bryllim.com's sidebar:
   32px top/bottom + 28px side padding · links 13px mono on a 19.5px line, 10px apart, 10px icon gap ·
   groups 16px either side of a 1px divider · name → first group 36px · shortcut rows 10px apart ·
   status band 16px below them · bottom block 24px below that · 16px between theme row and text · 6px before the email. */
const link =
  "group flex items-center gap-2.5 font-mono text-[13px] leading-[1.5] text-g500 transition-colors duration-200 hover:text-ink aria-[current=true]:text-ink collapsed:h-9 collapsed:justify-center collapsed:rounded-lg collapsed:hover:bg-g100 collapsed:aria-[current=true]:bg-g100";

const railBtn =
  "grid size-9 place-items-center rounded-lg text-g500 transition-colors duration-200 hover:bg-g100 hover:text-ink";

const fire = (name: string) => window.dispatchEvent(new Event(name));

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-g300 bg-g50 px-1.5 py-0.5 font-mono text-[10px] leading-[10px] text-g500">{children}</kbd>
  );
}

/** "Ask anything  Alt + K": label, then the keys right after it (not pushed to the far edge). */
function Shortcut({ label, keys, onClick }: { label: string; keys: [string, string]; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-fit items-center gap-2 text-[12px] leading-[18px] text-g500 transition-colors duration-200 hover:text-ink"
    >
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <Kbd>{keys[0]}</Kbd>
        <span aria-hidden className="text-[10px] leading-[15px]">+</span>
        <Kbd>{keys[1]}</Kbd>
      </span>
    </button>
  );
}

export function Sidebar() {
  const active = useActiveSection(ids);
  const current = (id: string) => (active === id ? ("true" as const) : undefined);

  // The real state lives on <html data-sidebar>, set before paint; mirror it here for aria + the icon label.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === "collapsed");
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    const root = document.documentElement;
    if (next) root.dataset.sidebar = "collapsed";
    else delete root.dataset.sidebar;
    try {
      localStorage.setItem("sidebar", next ? "collapsed" : "expanded");
    } catch {}
  };

  return (
    <aside
      id="sidebar"
      aria-label="Site"
      className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col overflow-x-hidden overflow-y-auto border-r border-g200 bg-bg px-7 py-8 transition-[width,padding] duration-300 ease-expo lg:flex collapsed:w-14 collapsed:px-2.5"
    >
      {/* Name (15px tall, like his). The collapse button floats at the right so it never adds height. */}
      <div className="relative h-[15px] shrink-0">
        <a href="#top" className="block truncate font-pixel text-[15px] leading-[15px] collapsed:hidden">
          {site.name}
        </a>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="sidebar"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`${railBtn} absolute right-[-10px] top-1/2 -translate-y-1/2 collapsed:left-1/2 collapsed:right-auto collapsed:-translate-x-1/2`}
        >
          <Icon name="panel" className="size-4" />
        </button>
      </div>

      {/* Link groups: 36px below the name, 16px / 1px line / 16px between groups */}
      <div className="mt-9 grid gap-4 collapsed:mt-8">
        <nav aria-label="Pages">
          <ul className="grid gap-2.5">
            {nav.pages.map((p) => (
              <li key={p.id}>
                <a href={`#${p.id}`} aria-current={current(p.id)} title={p.label} className={link}>
                  <Icon name={p.icon} className="size-3.5 collapsed:size-4" />
                  <span className="collapsed:sr-only">{p.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div aria-hidden className="h-px bg-g200" />

        <nav aria-label="Sections" className="collapsed:hidden">
          <ul className="grid gap-2.5">
            {nav.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} aria-current={current(s.id)} className={link}>
                  <span
                    aria-hidden
                    className="-mr-2.5 w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-200 group-aria-[current=true]:mr-0 group-aria-[current=true]:w-[1ch] group-aria-[current=true]:opacity-100"
                  >
                    →
                  </span>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Expanded footer: shortcuts → status band → bottom block, 24px under the groups at the least */}
      <div className="mt-auto pt-6 collapsed:hidden">
        <div className="grid justify-items-start gap-2.5">
          {ask.enabled && <Shortcut label="Ask anything" keys={["Alt", "K"]} onClick={() => fire("open-ask")} />}
          <Shortcut label="Typing test" keys={["Alt", "J"]} onClick={() => fire("open-typing")} />
        </div>

        {site.available && (
          <div className="mt-4 border-y border-g200 py-3.5">
            <Status>Open to work</Status>
          </div>
        )}

        <div className="mt-6">
          <div className="mb-4 flex items-center gap-2">
            <ThemeSwitch compact />
            <SoundToggle className="size-[30px]" />
          </div>
          <p className="text-[12px] leading-[19.5px] text-g500">{site.contactBlurb}</p>
          {/* The address stays on one line: it may use the spare padding on the right (-mr-5), and its text shrinks just
              enough to fit (monospace characters are 0.6em wide; 158px is the room beside the icon, leaving a small
              margin before the sidebar's edge). */}
          <a
            href={`mailto:${site.email}`}
            title={site.email}
            className="-mr-5 mt-1.5 flex items-center gap-2 whitespace-nowrap font-mono leading-[19.5px] transition-opacity duration-200 hover:opacity-70"
            style={{ fontSize: Math.max(8, Math.min(13, 158 / (site.email.length * 0.6))) }}
          >
            <Icon name="mail" className="size-3.5 shrink-0" />
            {site.email}
          </a>
        </div>
      </div>

      {/* Collapsed footer: icon buttons only */}
      <div className="mt-auto hidden flex-col items-center gap-1 pt-8 collapsed:flex">
        {ask.enabled && (
          <button type="button" onClick={() => fire("open-ask")} aria-label="Ask anything" title="Ask anything (Alt+K)" className={railBtn}>
            <Icon name="spark" className="size-4" />
          </button>
        )}
        <button type="button" onClick={() => fire("open-typing")} aria-label="Typing test" title="Typing test (Alt+J)" className={railBtn}>
          <Icon name="keyboard" className="size-4" />
        </button>
        <ThemeCycle />
        <SoundToggle className="size-9 rounded-lg border-0 bg-transparent hover:bg-g100" />
        <a href={`mailto:${site.email}`} aria-label={`Email ${site.email}`} title={site.email} className={railBtn}>
          <Icon name="mail" className="size-4" />
        </a>
        {site.available && (
          <span role="img" aria-label="Open to work" title="Open to work" className="mt-2 grid size-9 place-items-center">
            <span aria-hidden className="size-1.5 animate-pulse-dot rounded-full bg-ink" />
          </span>
        )}
      </div>
    </aside>
  );
}
