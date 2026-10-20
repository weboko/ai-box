/* Paper template: a working paper with one global reading level.

   - Reading level (default Abstract → Brief → Full → Appendix) in a sticky running head.
     Any element in <main> with data-min="n" shows from level n, data-max="n" up to level n.
     Changing the level rewrites the page in place, keeps the passage being read where it
     was, and marks what appeared with a change bar in the margin.
   - Routing: every in-page link (contents, cross-references, citations, deep links,
     Back/Forward, reload) opens the level its target needs.
   - Numbering: sections (1, 2 … / Appendix A …), subsections (1.1), figures, tables, plates
     and equations are numbered in document order; <a class="xref" href="#id"></a> gets
     "Table 3", "Figure 2", "(5)", "§4.2" or "Appendix A".
   - Generated chrome: running head (current §), level control, Contents with the level
     column, notation (evidence legend), level hint, grouped citations [3, 8].
   - Events: Report.on("level-page", fn(level, name, previous)) and the DOM event
     "levelchange" on document ({detail: {level, name, previous}}).
   - API: Report.paper.level(), Report.paper.setLevel(n), Report.paper.names.
   Topic-agnostic: reads only the page's markup and the Report API. */
(function () {
  "use strict";

  var R = window.Report;
  if (!R) return;
  var doc = document;
  var U = R.util, $ = U.$, $$ = U.$$, el = U.el;
  var main = $("main.paper") || $("main");
  if (!main) return;
  if (!main.id) main.id = "main";

  function clamp(n) { return Math.max(0, Math.min(MAX, n | 0)); }
  function split(s) { return String(s).split("|").map(function (x) { return x.trim(); }); }
  var NAMES = split(main.getAttribute("data-level-names") || "Abstract|Brief|Full|Appendix");
  var MAX = NAMES.length - 1;
  var ABBR = main.hasAttribute("data-level-abbr") ? split(main.getAttribute("data-level-abbr")) : NAMES.map(function (n) {
    return { Abstract: "Abs", Appendix: "Appx" }[n] || (n.length <= 5 ? n : n.slice(0, 4));
  });
  var DEFAULT_LEVEL = clamp(+(main.getAttribute("data-level") || 0));
  var level = DEFAULT_LEVEL;
  var KEY = "paper:" + location.pathname;
  var store = {
    get: function () { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; } },
    set: function (v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  };
  var runhead = null, levelCtl = null, rhSec = null, statusEl = null, hintEl = null;
  function RH() { return runhead ? runhead.getBoundingClientRect().bottom : 0; }
  function visible(n) { return !!(n && (n.offsetParent || n.getClientRects().length)); }
  function plainText(n) {
    var c = n.cloneNode(true);
    $$(".sn, a.cite, .cite-g, .ev-note-btn, .ev-note, .backrefs", c).forEach(function (x) { x.remove(); });
    return c.textContent.replace(/\s+/g, " ").trim();
  }
  function needLevel(n) {
    var L = 0;
    for (; n && n.nodeType === 1; n = n.parentElement) if (n.hasAttribute("data-min")) L = Math.max(L, +n.getAttribute("data-min"));
    return Math.min(L, MAX);
  }

  /* ---------------- numbering: sections, floats, equations ---------------- */
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var sections = [];
  function ensureId(n, base) {
    if (n.id) return n.id;
    var id = U.slugify(base || plainText(n)), k = 2, cand = id;
    while (doc.getElementById(cand)) cand = id + "-" + k++;
    n.id = cand;
    return cand;
  }
  function isRefs(sec) { return sec.classList.contains("refs") || (!!$(".sources", sec) && !sec.hasAttribute("data-numbered")); }
  function numberSections() {
    var n = 0, a = 0;
    sections = $$(":scope > section.sec, :scope > section.appendix", main);
    sections.forEach(function (sec) {
      var h2 = $(":scope > h2", sec) || $("h2", sec);
      var label = "", ref;
      if (isRefs(sec) || sec.hasAttribute("data-unnumbered")) {
        ref = h2 ? plainText(h2) : "References";
      } else if (sec.classList.contains("appendix")) {
        label = LETTERS[a++] || "?";
        sec._appx = label;
        ref = "Appendix " + label;
      } else {
        label = String(++n);
        ref = "§" + label;
      }
      sec._sn = label;
      sec._ref = ref;
      if (h2) {
        if (label && !$(".sn", h2)) h2.insertBefore(el("span", { class: "sn" }, label), h2.firstChild);
        h2._ref = ref;
        h2._sn = label;
      }
      ensureId(sec, h2 ? plainText(h2) : "section");
      var k = 0;
      $$("h3", sec).filter(function (h) { return !h.closest("figure, .reconcile, .calc, aside, .boxes"); }).forEach(function (h3) {
        var l = label ? label + "." + (++k) : "";
        if (l && !$(".sn", h3)) h3.insertBefore(el("span", { class: "sn" }, l), h3.firstChild);
        h3._ref = l ? "§" + l : plainText(h3);
        h3._sn = l;
        ensureId(h3);
      });
    });
  }
  var WORD = { fig: "Figure", tab: "Table", plate: "Plate", eq: "Equation" };
  var floats = [];
  function kindOf(f) {
    if (f.classList.contains("eqn")) return "eq";
    if (f.classList.contains("tbl") || f.classList.contains("tblfig")) return "tab";
    if (f.classList.contains("photo")) return "plate";
    return "fig";
  }
  function numberFloats() {
    var counters = {};
    floats = $$("figure, .tblfig, .eqn", main).filter(function (f) {
      return !f.parentElement.closest("figure, .tblfig") && !f.classList.contains("nonum") && !f.hasAttribute("data-nonum") && !f.closest("nav.toc");
    });
    floats.forEach(function (f) {
      var kind = kindOf(f), sec = f.closest("section.sec, section.appendix"), ap = sec && sec._appx ? sec._appx : "";
      var ck = kind + ap;
      counters[ck] = (counters[ck] || 0) + 1;
      var num = counters[ck];
      var txt = ap ? (kind === "eq" ? ap + num : ap + "." + num) : String(num);
      f._kind = kind; f._prefix = ap; f._n = num; f._num = txt;
      if (kind === "eq") {
        f._ref = "(" + txt + ")";
        var no = $(":scope > .eqno", f);
        if (!no) { no = el("span", { class: "eqno" }); f.appendChild(no); }
        no.textContent = "(" + txt + ")";
      } else {
        f._ref = WORD[kind] + " " + txt;
        var cap = $(":scope > figcaption, :scope > .tcap", f);
        if (cap) {
          var fl = $(":scope > .fl", cap);
          if (!fl) { fl = el("span", { class: "fl" }); cap.insertBefore(fl, cap.firstChild); cap.insertBefore(doc.createTextNode(" "), fl.nextSibling); }
          fl.textContent = f._ref + ":";
        }
      }
      f.setAttribute("data-num", f._ref);
      ensureId(f, kind + "-" + txt.replace(/\./g, "-").toLowerCase());
    });
  }

  /* ---------------- cross-references ---------------- */
  var LABEL_RE = /^(§\s*[\dA-Z.]+|Appendix\s+[A-Z]|(Figure|Fig\.|Table|Plate)\s+[A-Z]?[\d.]+|\(\s*[A-Z]?\d+\s*\)|\?\?)$/;
  function refOf(t) {
    if (!t) return null;
    if (t._ref) return t._ref;
    var f = t.closest("figure, .tblfig, .eqn");
    if (f && f._ref) return f._ref;
    var h = t.closest("h2, h3");
    if (h && h._ref) return h._ref;
    return null;
  }
  var xrefs = [];
  function resolveXrefs() {
    xrefs = $$("a.xref[href^='#']");
    xrefs.forEach(function (a) {
      var id = decodeURIComponent(a.getAttribute("href").slice(1)), t = doc.getElementById(id);
      var txt = refOf(t), cur = a.textContent.trim();
      if (!t) console.warn("paper: cross-reference to missing #" + id);
      if (!cur || LABEL_RE.test(cur)) a.textContent = txt || "??";
      a._target = t;
      a._need = t ? needLevel(t) : 0;
    });
  }

  /* ---------------- generated chrome: running head, contents, notation ---------------- */
  function buildRunhead() {
    runhead = $("#runhead") || $(".runhead");
    if (!runhead) {
      runhead = el("header", { class: "runhead", id: "runhead" });
      runhead.innerHTML = '<div class="rh-inner"><p class="rh-where"><span class="rh-paper"></span></p></div>';
      $(".rh-paper", runhead).textContent = main.getAttribute("data-kicker") || "Working paper";
      main.parentNode.insertBefore(runhead, main);
    }
    var inner = $(".rh-inner", runhead) || runhead, where = $(".rh-where", runhead);
    if (where && !$(".rh-sec", where)) {
      rhSec = el("span", { class: "rh-sec", "aria-live": "off" });
      var paperLab = $(".rh-paper", where);
      where.insertBefore(rhSec, paperLab ? paperLab.nextSibling : where.firstChild);
    } else rhSec = $(".rh-sec", runhead);
    levelCtl = el("div", { class: "rh-level", role: "radiogroup", "aria-label": "Detail level" });
    levelCtl.appendChild(el("span", { class: "rh-lab", "aria-hidden": "true" }, "Detail"));
    NAMES.forEach(function (n, i) {
      var b = el("button", { type: "button", role: "radio", "aria-checked": "false", "data-l": i, "aria-label": n });
      b.appendChild(el("span", { class: "full" }, n));
      b.appendChild(el("span", { class: "abbr", "aria-hidden": "true" }, ABBR[i] || n));
      b.addEventListener("click", function () { if (i !== level) applyLevel(i); });
      levelCtl.appendChild(b);
    });
    levelCtl.appendChild(el("span", { class: "rh-ind", "aria-hidden": "true" }));
    levelCtl.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key, n = null;
      if (k === "ArrowRight" || k === "ArrowDown" || k === "+" || k === "=") n = Math.min(MAX, level + 1);
      else if (k === "ArrowLeft" || k === "ArrowUp" || k === "-") n = Math.max(0, level - 1);
      else if (k === "Home") n = 0;
      else if (k === "End") n = MAX;
      else if (/^[1-9]$/.test(k) && +k - 1 <= MAX) n = +k - 1;
      if (n === null) return;
      e.preventDefault();
      if (n !== level) applyLevel(n);
      $('[data-l="' + n + '"]', levelCtl).focus();
    });
    inner.appendChild(levelCtl);
    statusEl = el("p", { class: "sr-only", role: "status" });
    doc.body.appendChild(statusEl);
  }
  function placeInd() {
    if (!levelCtl) return;
    var on = $('[aria-checked="true"]', levelCtl);
    if (!on) return;
    levelCtl.style.setProperty("--x", on.offsetLeft + "px");
    levelCtl.style.setProperty("--w", on.offsetWidth + "px");
  }

  var tocItems = [];
  function buildToc() {
    var nav = $("nav.toc", main);
    if (!nav || nav.hasAttribute("data-static")) return;
    nav.innerHTML = "";
    if (!nav.id) nav.id = "toc";
    nav.setAttribute("aria-labelledby", nav.id + "-h");
    nav.appendChild(el("h2", { class: "toc-h", id: nav.id + "-h" }, nav.getAttribute("data-title") || "Contents"));
    nav.appendChild(el("p", { class: "toc-note" }, "Right column: the detail level at which each part first appears. Following a link to a part that isn’t shown yet switches to that level."));
    var ol = el("ol", { class: "toc-list" });
    function item(cls, target, sn, text) {
      var lv = needLevel(target);
      var li = el("li", { class: cls, "data-lv": lv });
      var a = el("a", { href: "#" + target.id });
      a.appendChild(el("span", { class: "sn" }, sn || ""));
      a.appendChild(el("span", { class: "tt" }, text));
      a.appendChild(el("span", { class: "ld", "aria-hidden": "true" }));
      a.appendChild(el("span", { class: "lv" }, NAMES[lv]));
      li.appendChild(a);
      tocItems.push(li);
      return li;
    }
    sections.forEach(function (sec) {
      if (sec.hasAttribute("data-notoc")) return;
      var h2 = $(":scope > h2", sec) || $("h2", sec);
      if (!h2) return;
      var li = item("toc-s", sec, sec._sn, plainText(h2));
      var subs = $$("h3", sec).filter(function (h) { return h._ref && !h.hasAttribute("data-notoc"); });
      if (subs.length) {
        var sub = el("ol");
        subs.forEach(function (h3) { sub.appendChild(item("toc-ss", h3, h3._sn, plainText(h3))); });
        li.appendChild(sub);
      }
      ol.appendChild(li);
    });
    nav.appendChild(ol);
  }

  // The evidence legend in this template's voice: one "Notation" paragraph, listing only
  // the kinds the page uses (data-ev-legend="all" lists all four). A hand-written legend stays.
  function buildNotation() {
    var used = {};
    $$(".ev[data-ev]").forEach(function (n) { R.evKinds(n).forEach(function (k) { used[k] = true; }); });
    $$("[data-ev-legend]").forEach(function (box) {
      var coreMade = box.children.length && $$(":scope > *", box).every(function (c) { return c.classList.contains("ev-key"); });
      if (coreMade) box.innerHTML = "";   // core got here first (late template load): use the paper voice
      else if (box.children.length || box.textContent.trim()) return;
      var all = box.getAttribute("data-ev-legend") === "all";
      var parts = [];
      if (all || used.fact || $("a.cite")) parts.push("Roman with a citation [n]: <b>sourced</b>.");
      if (all || used.estimate) parts.push('<span class="ev" data-ev="estimate">Italic</span>: an <b>estimate</b>, derived from sourced inputs.');
      if (all || used.assumption) parts.push('<span class="ev" data-ev="assumption">Small capitals</span>: an <b>assumption</b>, taken as given' + (R.spec ? " (the inputs of the model can be changed)" : "") + ".");
      if (all || used.interpretation) parts.push('<span class="ev" data-ev="interpretation">Bracketed sans-serif</span>: the author’s <b>interpretation</b>.');
      box.classList.add("ev-notation");
      box.innerHTML = "<b>Notation.</b> The typeface carries the evidence type. " + parts.join(" ") +
        (used.estimate || used.assumption || all ? " Italic and small capitals mean nothing else here." : "");
    });
    var anchor = $(".notation", main) || ($("[data-ev-legend]", main) || {}).parentElement || $(".tldr", main);
    if (!anchor) return;
    hintEl = el("p", { class: "levelhint" });
    hintEl.innerHTML = "<b>Reading level.</b> The detail control in the running header rewrites the text in place (keyboard: <kbd>Tab</kbd> to it, then <kbd>←</kbd> <kbd>→</kbd> or <kbd>1</kbd>–<kbd>" + (MAX + 1) + "</kbd>). <span class=\"lh-text\"></span>";
    anchor.appendChild(hintEl);
  }

  // "Brief adds 6 sections, Figures 2–3 and Plate 1": what the next level opens.
  function compress(items) {
    var byPre = {}, order = [];
    items.forEach(function (f) { if (!byPre[f._prefix]) { byPre[f._prefix] = []; order.push(f._prefix); } byPre[f._prefix].push(f); });
    return order.map(function (p) {
      var list = byPre[p], runs = [], s = list[0], prev = list[0];
      for (var i = 1; i <= list.length; i++) {
        var c = list[i];
        if (c && c._n === prev._n + 1) { prev = c; continue; }
        runs.push(s === prev ? s._num : s._num + "–" + prev._num);
        s = prev = c;
      }
      return runs;
    }).reduce(function (a, b) { return a.concat(b); }, []);
  }
  function hintText(L) {
    if (L >= MAX) return "Now showing everything (<b>" + NAMES[MAX] + "</b>).";
    var N = L + 1, nSec = 0, kinds = { fig: [], tab: [], plate: [], eq: [] };
    sections.forEach(function (sec) {
      $$("h2, h3", sec).forEach(function (h) { if (h._ref && needLevel(h) === N) nSec++; });
    });
    floats.forEach(function (f) { if (needLevel(f) === N && !f.hasAttribute("data-max")) kinds[f._kind].push(f); });
    var parts = [];
    if (nSec) parts.push(nSec + (nSec === 1 ? " section" : " sections"));
    ["fig", "tab", "plate", "eq"].forEach(function (k) {
      var l = kinds[k];
      if (!l.length) return;
      var runs = compress(l), many = l.length > 1;
      if (k === "eq") parts.push((many ? "Equations " : "Equation ") + runs.map(function (r) { return "(" + r.replace("–", ")–(") + ")"; }).join(", "));
      else parts.push(WORD[k] + (many ? "s " : " ") + runs.join(", "));
    });
    var adds = parts.length ? parts.slice(0, -1).join(", ") + (parts.length > 1 ? " and " : "") + parts[parts.length - 1] : "more detail";
    return "Now showing: <b>" + NAMES[L] + "</b>. <b>" + NAMES[N] + "</b> adds " + adds + ".";
  }

  /* ---------------- change bar: a rule in the margin beside each block that just appeared ---------------- */
  var BLOCK = "p, li, figure, .tblfig, .eqn, h2, h3, section, ol, ul, footer, td, figcaption, div";
  function markBlock(n) {
    if (getComputedStyle(n).display.indexOf("inline") === 0) n = (n.parentElement && n.parentElement.closest(BLOCK)) || n;
    return n;
  }
  function flash(n) {
    if (!n) return;
    if (n.classList.contains("cite-g")) {
      n.classList.remove("chg-i"); void n.offsetWidth; n.classList.add("chg-i");
      setTimeout(function () { n.classList.remove("chg-i"); }, 3000);
      return;
    }
    n = markBlock(n);
    var pl = main.getBoundingClientRect().left + parseFloat(getComputedStyle(main).paddingLeft);
    var gap = innerWidth < 760 ? 9 : 28;
    n.style.setProperty("--cb-x", Math.round(n.getBoundingClientRect().left - pl + gap) + "px");
    n.classList.remove("chg"); void n.offsetWidth; n.classList.add("chg");
    clearTimeout(n._chgT);
    n._chgT = setTimeout(function () { n.classList.remove("chg"); }, 3300);
  }

  /* ---------------- reading anchor: keep the passage being read in place ---------------- */
  var ANCH = "h1, h2, h3, p, li, figure, .tblfig, .eqn";
  function pickAnchor() {
    if (scrollY < 4) return { top: true };
    var line = RH() + 8, best = null, cand = $$(ANCH, main);
    for (var i = 0; i < cand.length; i++) {
      var n = cand[i];
      if (!visible(n)) continue;
      var r = n.getBoundingClientRect();
      if (r.bottom <= line) continue;
      if (r.top <= line) { best = { el: n, top: r.top }; continue; }
      if (!best) best = { el: n, top: r.top };
      break;
    }
    return best;
  }
  // The anchor disappeared: the visible block that took its place (a Brief ↔ Full rewrite),
  // else the nearest visible heading before it in its section, else its Contents entry.
  function substitute(n) {
    for (var sib = n.nextElementSibling; sib; sib = sib.nextElementSibling) if (visible(sib)) return { el: sib, keep: true };
    var sec = n.closest("section, nav, header");
    if (sec && visible(sec)) {
      var hs = $$("h2, h3", sec).filter(function (h) { return visible(h) && (h.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING); });
      return { el: hs.length ? hs[hs.length - 1] : sec };
    }
    var entry = sec && sec.id ? $('nav.toc a[href="#' + sec.id + '"]') : null;
    return { el: entry ? entry.parentElement : ($(".tldr", main) || main) };
  }
  function landOn(n, off) { window.scrollTo(0, Math.max(0, n.getBoundingClientRect().top + scrollY - RH() - (off == null ? 12 : off))); }

  /* ---------------- applying a level ---------------- */
  var tagged = [];
  function isShown(n) {
    if (n.hasAttribute("data-min") && level < +n.getAttribute("data-min") && !n.hasAttribute("data-force")) return false;
    if (n.hasAttribute("data-max") && level > +n.getAttribute("data-max")) return false;
    return true;
  }
  function applyLevel(L, opts) {
    opts = opts || {};
    L = clamp(L);
    var quiet = opts.silent || opts.init;
    var anchor = quiet ? null : pickAnchor();
    var wasHidden = tagged.map(function (n) { return n.hidden; });
    var from = level;
    level = L;
    doc.body.setAttribute("data-reading-level", L);
    tagged.forEach(function (n) { n.hidden = !isShown(n); });
    // LaTeX rhythm: no indent on the first visible paragraph after a heading, figure or equation
    $$(".sec > p, .appendix > p", main).forEach(function (p) {
      var prev = p.previousElementSibling;
      while (prev && prev.hidden) prev = prev.previousElementSibling;
      p.classList.toggle("ni", !prev || prev.tagName !== "P");
    });
    // count and mark the outermost blocks that appeared or disappeared
    var added = 0, removed = 0, marked = [];
    tagged.forEach(function (n, i) {
      if (wasHidden[i] === n.hidden) return;
      var p = n.parentElement && n.parentElement.closest("[data-min],[data-max]");
      if (p && wasHidden[tagged.indexOf(p)] !== p.hidden) return;
      if (n.hidden) { removed++; return; }
      added++;
      if (quiet) return;
      var b = markBlock(n);
      if (marked.indexOf(b) < 0 && !marked.some(function (m) { return m.contains(b); })) { marked.push(b); flash(b); }
    });
    if (levelCtl) {
      $$("[data-l]", levelCtl).forEach(function (b) {
        var on = +b.getAttribute("data-l") === L;
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
      });
      placeInd();
    }
    if (hintEl) $(".lh-text", hintEl).innerHTML = hintText(L);
    tocItems.forEach(function (li) { li.classList.toggle("off", +li.getAttribute("data-lv") > L); });
    xrefs.forEach(function (a) {
      if (a._need > L) { a.setAttribute("data-opens", NAMES[a._need]); a.title = "Opens the " + NAMES[a._need] + " level"; }
      else if (a.hasAttribute("data-opens")) { a.removeAttribute("data-opens"); a.removeAttribute("title"); }
    });
    syncFollowers(!quiet && L > from);
    if (anchor) {
      if (anchor.top === true) window.scrollTo(0, 0);
      else if (visible(anchor.el)) window.scrollBy(0, anchor.el.getBoundingClientRect().top - anchor.top);
      else {
        var sub = substitute(anchor.el);
        if (sub.keep) window.scrollBy(0, sub.el.getBoundingClientRect().top - anchor.top);
        else landOn(sub.el);
      }
    }
    if (statusEl && !opts.init && (L !== from || opts.announce)) {
      statusEl.textContent = "Detail level " + NAMES[L] + ": " +
        (added ? added + " passage" + (added > 1 ? "s" : "") + " added" : "") + (added && removed ? ", " : "") +
        (removed ? removed + " shortened or removed" : "") + (added || removed ? "." : "no change.");
    }
    if (!opts.init) store.set({ level: L, y: Math.round(scrollY), href: location.href });
    updateRunhead();
    if (L !== from || opts.init) {
      R.emit("level-page", L, NAMES[L], from);
      doc.dispatchEvent(new CustomEvent("levelchange", { detail: { level: L, name: NAMES[L], previous: from } }));
    }
  }
  // Layered figures with data-follow="page" take the page level (capped at their last level)
  // instead of showing their own buttons.
  var coreReady = false;
  function syncFollowers(flashThem) {
    if (!coreReady) return;
    $$('[data-levels][data-follow="page"]', main).forEach(function (f) {
      if (!f._levels) return;
      var want = Math.min(level, f._levels.names.length - 1);
      if (f._levels.get() === want) return;
      var grew = want > f._levels.get();
      f._levels.go(want);
      if (flashThem && grew && visible(f)) flash(f);
    });
  }

  /* ---------------- running head: the current § ---------------- */
  function updateRunhead() {
    if (!rhSec) return;
    var heads = [$(".tldr", main)].concat($$("h2, h3", main).filter(function (h) { return h._ref && !h.closest("nav.toc"); })).filter(visible);
    var lim = RH() + 24, cur = null;
    heads.forEach(function (h) { if (h.getBoundingClientRect().top <= lim) cur = h; });
    var txt;
    if (!cur || cur.classList.contains("tldr")) {
      var absH = $(".tldr > h2", main);
      var absName = absH ? plainText(absH) : "Summary";
      txt = scrollY < 120 ? "Title & " + absName.toLowerCase() : absName;
    } else {
      var sn = cur._sn;
      var name = plainText(cur);
      var sec = cur.closest("section");
      txt = sn ? (sec && sec._appx && cur.tagName === "H2" ? "Appendix " + sn + " " : "§" + sn + " ") + name : name;
    }
    if (rhSec.textContent !== txt) rhSec.textContent = txt;
  }

  /* ---------------- routing: contents, cross-references, citations, deep links, Back/Forward ---------------- */
  // Raise the level just enough for the target (sources show without raising it), land the
  // target under the running head, focus it. Before a jump, the current history entry saves
  // {y, level} so Back undoes the jump, including any level it raised.
  function ensureVisible(t, announce) {
    if (!t || !main.contains(t)) return false;
    if (t.closest(".sources")) {
      var forced = false;
      for (var n = t; n && n !== main; n = n.parentElement) {
        if (n.hasAttribute("data-min") && !n.hasAttribute("data-force") && level < +n.getAttribute("data-min")) { n.setAttribute("data-force", ""); forced = true; }
      }
      if (forced) applyLevel(level, { silent: true });
      return true;
    }
    var need = needLevel(t);
    if (need > level) applyLevel(need, { silent: true, announce: announce });
    return true;
  }
  function focusEl(n) {
    if (!n.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(n.tagName)) n.setAttribute("tabindex", "-1");
    n.focus({ preventScroll: true });
  }
  function saveState() { try { history.replaceState({ y: Math.round(scrollY), level: level }, "", location.href); } catch (e) {} }
  function pushHash(id) { saveState(); try { history.pushState({ level: level, id: id }, "", "#" + id); } catch (e) {} }
  function reveal(id, opts) {
    opts = opts || {};
    var t = doc.getElementById(id);
    if (!t || !main.contains(t)) return false;
    if (t.closest(".sources")) { gotoRef(id, null, opts); return true; }
    if (opts.push !== false) pushHash(id);
    ensureVisible(t, true);
    landOn(t);
    if (opts.flash !== false) flash(t.matches(".sec, section") ? ($("h2", t) || t) : t);
    if (opts.focus) focusEl(t);
    updateRunhead();
    return true;
  }
  function gotoRef(id, cite, opts) {
    opts = opts || {};
    var li = doc.getElementById(id);
    if (!li) return;
    ensureVisible(li);
    if (opts.push !== false) pushHash(id);
    $$(".sources .backrefs a.on").forEach(function (b) { b.classList.remove("on"); });
    if (cite && cite.id) {
      var back = $('.backrefs a[href="#' + cite.id + '"]', li);
      if (back) { back.classList.add("on"); back.textContent = "↩"; back.setAttribute("aria-label", "Back to the citation"); }
    }
    landOn(li, 16);
    flash(li);
    if (opts.focus) focusEl(li);
    updateRunhead();
  }
  function backTo(id) {
    var t = doc.getElementById(id);
    if (!t) return;
    pushHash(id);
    ensureVisible(t);
    t.scrollIntoView({ block: "center" });
    flash(t.closest(".cite-g") || t);
    t.focus({ preventScroll: true });
    updateRunhead();
  }
  function wireRouting() {
    // Capture on window: runs before core's own link handler, so the level is still the
    // reader's when the current history entry is saved.
    window.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains("skip")) return;
      var id;
      try { id = decodeURIComponent(a.getAttribute("href").slice(1)); } catch (err) { return; }
      if (!id) return;
      if (a.matches("a.cite")) {
        if (!doc.getElementById(id)) return;
        e.preventDefault();
        gotoRef(id, a, { focus: true });
        return;
      }
      if (a.closest(".sources .backrefs")) { e.preventDefault(); backTo(id); return; }
      if (reveal(id, { focus: true })) e.preventDefault();
    }, true);
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    var popHandled = false;
    window.addEventListener("popstate", function (e) {
      popHandled = true; setTimeout(function () { popHandled = false; }, 60);
      var st = e.state;
      if (st && st.y != null) {
        if (st.level !== level) applyLevel(st.level, { silent: true, announce: true });
        window.scrollTo(0, st.y);
        updateRunhead();
      } else if (location.hash.length > 1) {
        reveal(decodeURIComponent(location.hash.slice(1)), { push: false });
      }
    });
    window.addEventListener("hashchange", function () {
      if (popHandled || location.hash.length < 2) return;
      reveal(decodeURIComponent(location.hash.slice(1)), { push: false });
    });
    window.addEventListener("pagehide", function () { store.set({ level: level, y: Math.round(scrollY), href: location.href }); });
    // Report.reveal(el) from custom code opens the level too.
    R.addRevealer(function (t) { if (!popHandled) ensureVisible(t); });
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; updateRunhead(); });
    }, { passive: true });
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(placeInd, 120); });
  }

  /* ---------------- citations: [3, 8, 12] groups, sorted ---------------- */
  function groupCites() {
    $$("a.cite").forEach(function (a) {
      if (a.parentElement.classList.contains("cite-g")) return;
      var run = [a], seps = [], n = a.nextSibling, pending = [];
      while (n) {
        if (n.nodeType === 3 && /^[\s,; ]*$/.test(n.nodeValue)) { pending.push(n); n = n.nextSibling; continue; }
        if (n.nodeType === 1 && n.matches("a.cite") && !n.parentElement.classList.contains("cite-g")) {
          seps = seps.concat(pending); pending = []; run.push(n); n = n.nextSibling; continue;
        }
        break;
      }
      var g = el("span", { class: "cite-g" });
      var prev = a.previousSibling;
      a.parentNode.insertBefore(g, a);
      if (prev && (prev.nodeType === 1 || (prev.nodeType === 3 && !/[\s\u00a0(]$/.test(prev.nodeValue)))) g.parentNode.insertBefore(doc.createTextNode("\u00a0"), g);
      seps.forEach(function (s) { s.remove(); });
      run.sort(function (x, y) { return (+x.getAttribute("data-n") || 1e9) - (+y.getAttribute("data-n") || 1e9); });
      run.forEach(function (c, i) { if (i) g.appendChild(doc.createTextNode(", ")); g.appendChild(c); });
    });
  }

  /* ---------------- comparison tables: column labels for the stacked phone layout ---------------- */
  function labelCells() {
    $$("table.compare", main).forEach(function (t) {
      var heads = $$("thead th", t).map(function (th) { return th.textContent.trim(); });
      $$("tbody tr", t).forEach(function (tr) {
        $$(":scope > td, :scope > th", tr).forEach(function (c, i) { if (c.tagName === "TD" && heads[i] && !c.hasAttribute("data-label")) c.setAttribute("data-label", heads[i]); });
      });
    });
  }

  /* ---------------- model tables (.calc): field errors, reset, a spoken summary ---------------- */
  function wireCalc() {
    if (!R.spec) return;
    $$("[data-reset]").forEach(function (b) {
      b.addEventListener("click", function () { R.reset(); $$("[data-param]").forEach(function (i) { clearErr(i); }); });
      var upd = function () { b.disabled = R.changedCount() === 0; };
      R.on("update", upd); upd();
    });
    function errFor(inp) {
      var id = (inp.id || "in-" + inp.getAttribute("data-param")) + "-err";
      var e = doc.getElementById(id);
      if (!e) {
        e = el("span", { class: "fld-err", id: id });
        inp.insertAdjacentElement("afterend", e);
        inp.setAttribute("aria-describedby", ((inp.getAttribute("aria-describedby") || "") + " " + id).trim());
      }
      return e;
    }
    function clearErr(inp) { var e = doc.getElementById((inp.id || "in-" + inp.getAttribute("data-param")) + "-err"); if (e) e.textContent = ""; inp.removeAttribute("aria-invalid"); }
    R.on("input-error", function (key, msg, inp) {
      if (!inp || !inp.closest(".calc")) return;
      var e = errFor(inp), p = R.param(key) || {};
      if (!msg) { e.textContent = ""; return; }
      var range = p.min != null && p.max != null ? "Enter " + R.fmt(p.min, p.format === "currency" ? "number" : p.format) + "–" + R.fmt(p.max, p.format === "currency" ? "number" : p.format) : "Invalid: " + msg;
      e.textContent = range + "; using " + R.paramFmt(key, R.params[key]);
    });
    $$(".calc").forEach(function (calc) {
      var outs = $$(".calc-out tbody tr", calc);
      if (!outs.length) return;
      var live = el("p", { class: "sr-only", "aria-live": "polite" });
      calc.appendChild(live);
      var t;
      R.on("update", function (res, params, changed) {
        if (!changed || !changed.length) return;
        clearTimeout(t);
        t = setTimeout(function () {
          live.textContent = outs.filter(visible).map(function (tr) {
            return $$("th, td", tr).map(function (c) { return c.textContent.replace(/\s+/g, " ").trim(); }).join(" ");
          }).join("; ") + ".";
        }, 700);
      });
    });
  }

  /* ---------------- core line-chart legend: swatches drawn with each line's dash ---------------- */
  var AUTO_DASH = ["", "7 4", "2 3", "10 3 2 3", "4 4", "1 2"];   // matches the .rc-line rules in template.css
  function legendDashes(box) {
    var fig = box.closest("figure.chart"), items = $$(".rc-legend-item", box);
    if (!fig || !items.length) return;
    var src = $('script[type="application/json"]', fig), spec;
    try { spec = JSON.parse(src.textContent); } catch (e) { return; }
    var series = spec.series || [];
    items.forEach(function (it) {
      var name = it.textContent.trim(), i = -1;
      series.forEach(function (s, k) { if (i < 0 && (s.name || s.key) === name) i = k; });
      if (i < 0) return;
      var s = series[i], sw = $("i", it);
      var dash = s.dash || (s.ev === "estimate" ? "7 5" : s.ev === "assumption" ? "2 4" : AUTO_DASH[i % 6]);
      sw.style.opacity = "1";
      sw.style.height = Math.max(1.5, Math.min(3.2, s.width || 2.25)) + "px";
      if (!dash || dash === "none") { sw.style.webkitMaskImage = sw.style.maskImage = "none"; return; }
      var nums = dash.split(/[\s,]+/).map(Number), pos = 0, stops = [];
      if (nums.length % 2) nums = nums.concat(nums);
      nums.forEach(function (n, k) { stops.push((k % 2 ? "transparent " : "#000 ") + pos + "px " + (pos + n) + "px"); pos += n; });
      var g = "repeating-linear-gradient(90deg," + stops.join(",") + ")";
      sw.style.webkitMaskImage = sw.style.maskImage = g;
    });
  }

  /* ---------------- chart frames: a LaTeX-style box around line-chart plots ---------------- */
  function frameCharts() {
    doc.addEventListener("chart:drawn", function (e) {
      var svg = e.target.querySelector && e.target.querySelector("svg.rc-svg");
      var hit = svg && svg.querySelector(".rc-hit");
      if (hit) legendDashes(e.target);
      if (!hit || svg.querySelector(".pp-frame")) return;
      var r = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
      ["x", "y", "width", "height"].forEach(function (k) { r.setAttribute(k, hit.getAttribute(k)); });
      r.setAttribute("class", "pp-frame");
      svg.insertBefore(r, hit);
    });
  }

  /* ---------------- init ---------------- */
  var settled = null;
  R.hook("setup", function () {
    numberSections();
    numberFloats();
    buildRunhead();
    resolveXrefs();
    buildToc();
    buildNotation();
    labelCells();
    frameCharts();
    tagged = $$("[data-min],[data-max]", main);
    var saved = store.get(), hash = "", target = null;
    try { hash = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
    target = hash && doc.getElementById(hash);
    var start;
    if (saved && saved.href === location.href && saved.y != null) {
      start = saved.level;                         // reload: same level, same place
      settled = function () { window.scrollTo(0, saved.y); };
    } else if (target && main.contains(target)) {
      var base = saved ? saved.level : DEFAULT_LEVEL; // deep link: the level the target needs
      start = Math.max(base, target.closest(".sources") ? base : needLevel(target));
      settled = function () { reveal(hash, { push: false, flash: false }); };
    } else {
      start = saved ? saved.level : DEFAULT_LEVEL;
    }
    applyLevel(start == null ? DEFAULT_LEVEL : start, { init: true });
    wireRouting();
  });
  R.hook("ready", function () {
    coreReady = true;
    groupCites();
    syncFollowers(false);
    wireCalc();
    if (settled) {
      settled();
      setTimeout(settled, 30);
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { settled(); updateRunhead(); });
    }
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(placeInd);
    placeInd();
    saveState();
    updateRunhead();
  });

  R.paper = {
    names: NAMES,
    level: function () { return level; },
    setLevel: function (n) { applyLevel(n); },
    needLevel: needLevel
  };
})();
