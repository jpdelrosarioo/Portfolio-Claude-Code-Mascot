/* bryl-minimal portfolio — behaviour. No dependencies. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------- Footer year ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  /* ---------- Pixel font fallback (Geist Pixel -> Geist Mono uppercase) ---------- */
  if (document.fonts && document.fonts.load) {
    document.fonts.load('1em "Geist Pixel"').then(function (faces) {
      if (!faces.length) root.classList.add("no-pixel");
    }).catch(function () { root.classList.add("no-pixel"); });
  }

  /* ---------- Theme: light / dark / system ---------- */
  var LABELS = { light: "light", dark: "dark", system: "system" };
  var ORDER = ["system", "light", "dark"];

  function getChoice() {
    var c = "system";
    try { c = localStorage.getItem("theme") || "system"; } catch (e) {}
    return LABELS[c] ? c : "system";
  }

  function resolved(choice) {
    return choice === "system" ? (darkQuery.matches ? "dark" : "light") : choice;
  }

  function paint(choice) {
    root.dataset.theme = resolved(choice);
    root.dataset.themeChoice = choice;
    $$("[data-set-theme]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.setTheme === choice));
    });
    $$("[data-cycle-theme] [data-label]").forEach(function (l) { l.textContent = LABELS[choice]; });
  }

  function setTheme(choice, origin) {
    try { localStorage.setItem("theme", choice); } catch (e) {}
    var changing = resolved(choice) !== root.dataset.theme;

    if (!changing || reduceMotion.matches) { paint(choice); return; }

    // Circular reveal from the click point where view transitions exist
    if (document.startViewTransition && origin) {
      var x = origin.x, y = origin.y;
      var r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      root.classList.add("vt");
      var vt = document.startViewTransition(function () { paint(choice); });
      vt.ready.then(function () {
        root.animate(
          { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + r + "px at " + x + "px " + y + "px)"] },
          { duration: 540, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
        );
      }).catch(function () {});
      vt.finished.finally(function () { root.classList.remove("vt"); });
      return;
    }

    // Fallback: 500ms colour crossfade
    root.classList.add("theme-fading");
    paint(choice);
    setTimeout(function () { root.classList.remove("theme-fading"); }, 520);
  }

  function originOf(el, ev) {
    if (ev && (ev.clientX || ev.clientY)) return { x: ev.clientX, y: ev.clientY };
    var b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }

  $$("[data-set-theme]").forEach(function (btn) {
    btn.addEventListener("click", function (e) { setTheme(btn.dataset.setTheme, originOf(btn, e)); });
  });
  $$("[data-cycle-theme]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      var next = ORDER[(ORDER.indexOf(getChoice()) + 1) % ORDER.length];
      setTheme(next, originOf(btn, e));
    });
  });

  var onSystemChange = function () { if (getChoice() === "system") paint("system"); };
  if (darkQuery.addEventListener) darkQuery.addEventListener("change", onSystemChange);
  else if (darkQuery.addListener) darkQuery.addListener(onSystemChange);

  paint(getChoice());

  /* ---------- Mobile menu ---------- */
  var menu = $("#menu");
  var openBtn = $("[data-menu-open]");
  var closeBtn = $("[data-menu-close]");
  var lastFocus = null;

  function openMenu() {
    lastFocus = document.activeElement;
    menu.hidden = false;
    document.body.style.overflow = "hidden";
    openBtn.setAttribute("aria-expanded", "true");
    requestAnimationFrame(function () {
      menu.classList.add("open");
      closeBtn.focus();
    });
  }

  function closeMenu() {
    if (menu.hidden) return;
    menu.classList.remove("open");
    document.body.style.overflow = "";
    openBtn.setAttribute("aria-expanded", "false");
    setTimeout(function () { menu.hidden = true; }, reduceMotion.matches ? 0 : 200);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  if (menu && openBtn && closeBtn) {
    openBtn.addEventListener("click", openMenu);
    closeBtn.addEventListener("click", closeMenu);
    $$("a", menu).forEach(function (a) { a.addEventListener("click", closeMenu); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
      // keep focus inside the open menu
      if (e.key === "Tab" && !menu.hidden) {
        var f = $$("a, button", menu);
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    // Close if the viewport grows into the desktop layout
    window.matchMedia("(min-width: 1024px)").addEventListener("change", function (e) { if (e.matches) closeMenu(); });
  }

  /* ---------- Entrance: fade up 12px / 700ms, staggered 70ms, capped ~330ms ---------- */
  var reveals = $$(".reveal");
  if (!("IntersectionObserver" in window) || reduceMotion.matches) {
    reveals.forEach(function (el) { el.classList.add("in"); el.style.opacity = 1; el.style.transform = "none"; });
  } else {
    var io = new IntersectionObserver(function (entries) {
      var batch = entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      batch.forEach(function (entry, i) {
        entry.target.style.setProperty("--d", Math.min(50 + i * 70, 330) + "ms");
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Active section in the sidebar ---------- */
  var navLinks = $$("a[data-nav]");
  var targets = navLinks.map(function (a) { return $(a.getAttribute("href")); }).filter(Boolean);

  function setActive(id) {
    navLinks.forEach(function (a) {
      if (a.getAttribute("href") === "#" + id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }

  if ("IntersectionObserver" in window && targets.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-35% 0px -60% 0px" });
    targets.forEach(function (t) { spy.observe(t); });
    // End of page: the last section may never cross the observer band
    window.addEventListener("scroll", function () {
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) setActive(targets[targets.length - 1].id);
    }, { passive: true });
  }
  setActive("top");

  /* ---------- Copy email ---------- */
  $$("[data-copy]").forEach(function (btn) {
    var label = $("[data-copy-label]", btn);
    var status = $("[data-copy-status]");
    var original = label.textContent;
    var timer;

    function done(ok) {
      label.textContent = ok ? "Copied" : "Press Ctrl+C";
      if (status) status.textContent = ok ? "Email address copied to clipboard" : "";
      clearTimeout(timer);
      timer = setTimeout(function () { label.textContent = original; if (status) status.textContent = ""; }, 1800);
    }

    function fallback(text) {
      var ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      done(ok);
    }

    btn.addEventListener("click", function () {
      var text = btn.dataset.copy;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(text); });
      } else { fallback(text); }
    });
  });
})();
