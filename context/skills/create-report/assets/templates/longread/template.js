/* Longread engine: chrome and behaviour around the page's own markup.
   - sections (.sec) get "§ n" numerals, a sticky side contents with scroll-spy, and on
     narrow screens a running head with the current § and a progress line
   - evidence (.ev[data-ev] + a.cite, from core) becomes drawn glyphs with sidenotes in the
     right margin (tap-to-open on phones)
   - .deeper panels become "Go deeper" disclosures (two levels), findable in-page
   - figures with a .fig-label get "Figure n", a head row with level and series pills
   - .calculator builds its inputs from the model and keeps the verdict, bars and sticky
     answer live
   Topic-agnostic: everything comes from the markup and the Report API. */
(function () {
  "use strict";
  var R = window.Report;
  if (!R) return;
  var U = R.util, $ = U.$, $$ = U.$$, el = U.el, esc = U.esc;
  var doc = document, root = doc.documentElement;
  var reduced = R.reduceMotion;
  var marginMQ = window.matchMedia("(min-width: 1000px)");
  function marginMode() { return marginMQ.matches; }
  R.options.evNotes = false;          // the template draws its own notes

  var KIND = { fact: "s", estimate: "e", assumption: "a", interpretation: "i" };
  var NAME = { fact: "Sourced", estimate: "Estimate", assumption: "Assumption", interpretation: "Interpretation" };
  function glyph(k) { return '<svg class="gl" aria-hidden="true" focusable="false"><use href="#lr-g-' + k + '"/></svg>'; }

  var sections = [], calcTarget = null;
  // core.js may initialise before this deferred script runs (its setTimeout can fire between
  // deferred scripts); then both hooks run at once, after core, and the template catches up.
  var inHook = true, late = false;

  /* ================= setup: transform markup before core wires it ================= */
  R.hook("setup", function () {
    late = inHook;
    sprite();
    numberSections();
    figures();
    tables();
    disclosures();
    calculator();
    if (late) R.renumber();
  });
  inHook = false;

  /* ================= ready: core has numbered citations, drawn charts ================= */
  R.hook("ready", function () {
    evidence();
    legend();
    seriesToggles();
    sectionRefs();
    navigation();
    endmark();
    if (R.result) updateCalcViews();
    root.classList.add("lr-ready");
  });

  /* ---------- glyph sprite: ring (sourced), double tilde (estimate), flag (assumption), pen (interpretation) ---------- */
  function sprite() {
    if ($("#lr-g-s")) return;
    var d = el("div", { "aria-hidden": "true", style: "position:absolute;width:0;height:0;overflow:hidden" });
    d.innerHTML = '<svg width="0" height="0" focusable="false">' +
      '<symbol id="lr-g-s" viewBox="0 0 12 12"><circle cx="6" cy="6.4" r="3"/></symbol>' +
      '<symbol id="lr-g-e" viewBox="0 0 12 12"><path d="M1.8 4.7c1.4-1.3 2.8-1.3 4.2 0s2.8 1.3 4.2 0M1.8 8.3c1.4-1.3 2.8-1.3 4.2 0s2.8 1.3 4.2 0"/></symbol>' +
      '<symbol id="lr-g-a" viewBox="0 0 12 12"><path d="M3 11.2V1.4"/><path d="M3 1.9h6.6L8 4.5l1.6 2.6H3z" fill="currentColor"/></symbol>' +
      '<symbol id="lr-g-i" viewBox="0 0 12 12"><path d="M2 10.2l.7-2.7 5.9-5.9a1.2 1.2 0 0 1 1.7 0l.1.1a1.2 1.2 0 0 1 0 1.7L4.5 9.3z"/><path d="M7.6 2.6l1.8 1.8"/></symbol></svg>';
    doc.body.insertBefore(d, doc.body.firstChild);
  }

  /* ---------- sections: § numerals ---------- */
  function numberSections() {
    sections = $$(".sec");
    if (!sections.length) sections = $$("main > section").map(function (s) { s.classList.add("sec"); return s; });
    sections.forEach(function (s, i) {
      if (!s.id) s.id = "s-" + (i + 1);
      var h = $(":scope > h2", s) || $("h2", s);
      if (h && !$(".secnum", h)) {
        var num = el("span", { class: "secnum" }, "§ " + (i + 1));
        h.insertBefore(num, h.firstChild);
        h.insertBefore(doc.createTextNode(" "), num.nextSibling);
      }
      s._n = i + 1;
      s._title = s.getAttribute("data-title") || (h ? h.textContent.replace(/^§\s*\d+\s*/, "").trim() : "Section " + (i + 1));
    });
    var c = $("[data-calculator]");
    if (c) {
      if (!c.id) c.id = "calculator";
      var sec = c.closest(".sec");
      calcTarget = { id: c.id, label: sec ? "§" + sec._n : "the calculator" };
    }
  }

  /* ---------- figures: "Figure n" heads with a tools slot ---------- */
  function figures() {
    var n = 0;
    $$("figure").forEach(function (f) {
      var lab = $(":scope > .fig-label", f);
      if (!lab) return;
      n++;
      lab.insertBefore(el("span", { class: "fig-num" }, "Figure " + n + " · "), lab.firstChild);
      var head = el("div", { class: "fig-head" });
      f.insertBefore(head, lab);
      head.appendChild(lab);
      var tools = el("div", { class: "fig-tools" });
      head.appendChild(tools);
      if (f.hasAttribute("data-levels")) tools.appendChild($(":scope > .levels-control", f) || el("div", { class: "levels-control" }));
    });
    // range charts with "groups": colour rows by group before core draws them
    $$("figure.chart > script[type='application/json']").forEach(function (s) {
      var fig = s.parentNode, spec;
      try { spec = fig._chart ? fig._chart.spec : JSON.parse(s.textContent); } catch (e) { return; }
      if (spec.type !== "range" || !spec.groups || !spec.rows) return;
      var col = {};
      spec.groups.forEach(function (g, i) { col[g.key] = g.color || "var(--s" + ((i % 6) + 1) + ")"; });
      spec.rows.forEach(function (r) { if (!r.color && col[r.group]) r.color = col[r.group]; });
      if (fig._chart) fig._chart.update(spec); else s.textContent = JSON.stringify(spec);
    });
  }

  /* ---------- tables: wide comparisons reach into the margin and scroll on phones ---------- */
  function tables() {
    $$(".table-wrap").forEach(function (w) {
      var t = $("table", w);
      if (!t) return;
      var cols = t.rows[0] ? t.rows[0].cells.length : 0;
      if (cols >= 4 && !w.classList.contains("narrow")) w.classList.add("wide");
      if (!w.hasAttribute("tabindex")) {
        w.setAttribute("tabindex", "0");
        w.setAttribute("role", "region");
        var cap = $("caption", t);
        w.setAttribute("aria-label", cap ? cap.textContent.trim() : "Table (scrolls sideways on small screens)");
      }
    });
  }

  /* ---------- Go deeper: in-place disclosures, two levels ---------- */
  var FINDABLE = "onbeforematch" in doc.body;
  var EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
  function hidePanel(p) { if (FINDABLE) p.setAttribute("hidden", "until-found"); else p.hidden = true; }
  function setOpen(panel, open, animate) {
    open = !!open;
    var t = panel._toggle, swaps = $$('[data-collapse-with="' + panel.id + '"]');
    if (panel._anim) { panel._anim.cancel(); panel._anim = null; }
    if (t) {
      t.setAttribute("aria-expanded", String(open));
      $(".dt-label", t).textContent = open ? t._close : t._open;
    }
    var fromH = 0;
    swaps.forEach(function (x) { if (open && !x.hidden) fromH += x.offsetHeight; });
    function done() {
      panel._anim = null;
      panel.style.overflowY = "";
      if (!open) { hidePanel(panel); swaps.forEach(function (x) { x.hidden = false; }); }
    }
    if (open) {
      swaps.forEach(function (x) { x.hidden = true; });
      panel.hidden = false;
      panel.removeAttribute("hidden");
      $$("figure.chart", panel).forEach(function (f) { if (f._chart && f._chart.force) f._chart.force(); });
    }
    if (!animate || !panel.animate) { done(); return; }
    var frames, opts;
    if (reduced) {
      frames = open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }];
      opts = { duration: open ? 160 : 120, easing: "linear" };
    } else {
      var h = panel.offsetHeight;
      panel.style.overflowY = "clip";
      frames = open ? [{ height: fromH + "px", opacity: fromH ? 1 : 0 }, { height: h + "px", opacity: 1 }]
                    : [{ height: h + "px", opacity: 1 }, { height: "0px", opacity: 0 }];
      opts = { duration: open ? Math.min(460, 260 + h / 8) : 220, easing: open ? EASE : "cubic-bezier(0.4, 0, 1, 1)" };
    }
    panel._anim = panel.animate(frames, opts);
    panel._anim.onfinish = done;
  }
  function disclosures() {
    $$(".deeper").forEach(function (p, i) {
      if (p._toggle) return;
      if (!p.id) p.id = "deeper-" + (i + 1);
      var nested = !!(p.parentElement && p.parentElement.closest(".deeper"));
      if (nested) p.classList.add("l3");
      var label = (p.getAttribute("data-label") || "").trim();
      var btn = el("button", { type: "button", class: "deeper-toggle" + (nested ? " l3" : ""), "aria-expanded": "false", "aria-controls": p.id });
      btn._open = nested ? (label ? "Show " + label : "Show the detail") : (label ? "Go deeper: " + label : "Go deeper");
      btn._close = label ? "Hide " + label : "Hide the detail";
      btn.innerHTML = '<span class="dt-label"></span> <span class="dt-arrow" aria-hidden="true">↓</span>';
      $(".dt-label", btn).textContent = btn._open;
      p.parentNode.insertBefore(btn, p);
      p._toggle = btn;
      btn.addEventListener("click", function () { setOpen(p, p.hidden, true); });
      var back = el("button", { type: "button", class: "deeper-back" }, nested ? "↑ Back" : "↑ Back to summary");
      back.addEventListener("click", function () {
        setOpen(p, false, true);
        var sec = p.closest(".sec");
        var anchor = nested ? btn : ((sec && $(".lede", sec)) || btn);
        anchor.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
        btn.focus({ preventScroll: true });
      });
      p.appendChild(back);
      hidePanel(p);
    });
    doc.addEventListener("beforematch", function (e) {
      if (e.target.classList && e.target.classList.contains("deeper")) setOpen(e.target, true, false);
    });
    // a link (or find-in-page) into a closed panel opens it and its parents
    R.addRevealer(function (target) {
      var p = target.closest(".deeper"), opened = false;
      while (p) {
        if (p.hidden || p.hasAttribute("hidden")) { setOpen(p, true, false); opened = true; }
        p = p.parentElement && p.parentElement.closest(".deeper");
      }
      return opened;
    });
  }

  /* ---------- calculator: inputs from the model, live bars, verdict, sticky answer ---------- */
  function fieldFor(p) {
    var id = "lr-f-" + U.slugify(p.key);
    var row = el("div", { class: "field" + (p.ev ? " ev-" + p.ev : "") });
    var lab = el("label", { for: id });
    if (p.ev && KIND[p.ev] && p.ev !== "fact") lab.innerHTML = '<span class="ev-tag ev-' + KIND[p.ev] + '" title="' + NAME[p.ev] + '">' + glyph(KIND[p.ev]) + "</span>";
    lab.appendChild(doc.createTextNode(p.label || p.key));
    row.appendChild(lab);
    var val = el("span", { class: "val" });
    if (p.options) {
      var sel = el("select", { id: id, "data-param": p.key });
      val.appendChild(sel);
      row.appendChild(val);
    } else {
      if (p.format === "currency") val.appendChild(el("span", { class: "pre", "aria-hidden": "true" }, Report.fmt(0, "currency", { currency: p.currency }).replace(/[\d.,\s]/g, "")));
      var num = el("input", { type: "number", id: id + "-n", "data-param": p.key, inputmode: "decimal", "aria-label": (p.label || p.key) + (p.unit ? " (" + p.unit + ")" : "") });
      num.addEventListener("change", function () {     // an invalid typed value snaps back when the field is left
        if (num.hasAttribute("aria-invalid")) { num.value = R.params[p.key]; num.removeAttribute("aria-invalid"); num.setCustomValidity(""); }
      });
      val.appendChild(num);
      val.appendChild(el("span", { class: "unit", "aria-hidden": "true" }, p.unit || ""));
      row.appendChild(val);
      var rng = el("input", { type: "range", id: id, "data-param": p.key });
      row.appendChild(rng);
    }
    if (p.note || p.cite) {
      var hint = el("span", { class: "hint", id: id + "-h" });
      if (p.note) hint.appendChild(doc.createTextNode(p.note));
      if (p.cite) hint.appendChild(el("a", { class: "cite", href: "#" + p.cite }));
      row.appendChild(hint);
      (rng || sel).setAttribute("aria-describedby", id + "-h");
    }
    return row;
  }
  function calculator() {
    var spec = R.spec;
    $$(".calculator").forEach(function (calc) {
      var inputs = $(".calc-inputs", calc);
      if (inputs && spec) {
        var all = (spec.params || []);
        var list = function (attr, fallback) {
          var v = inputs.getAttribute(attr);
          return v ? v.split(/[\s,]+/).filter(Boolean) : fallback;
        };
        var keys = list("data-keys", all.filter(function (p) { return !p.hidden; }).map(function (p) { return p.key; }));
        var more = list("data-more", all.filter(function (p) { return !p.hidden && keys.indexOf(p.key) < 0; }).map(function (p) { return p.key; }));
        inputs.innerHTML = "";
        keys.forEach(function (k) { var p = R.param(k); if (p) inputs.appendChild(fieldFor(p)); else console.warn("longread: unknown param " + k); });
        if (more.length) {
          var det = el("details", { class: "calc-more" });
          det.appendChild(el("summary", null, inputs.getAttribute("data-more-label") || "More assumptions"));
          var box = el("div", { class: "fields" });
          more.forEach(function (k) { var p = R.param(k); if (p) box.appendChild(fieldFor(p)); });
          det.appendChild(box);
          inputs.appendChild(det);
        }
        var reset = el("button", { type: "button", class: "linkbtn calc-reset" }, "Reset to the report’s values");
        reset.addEventListener("click", function () { R.reset(); });
        inputs.appendChild(reset);
        var upd = function () {
          var n = R.changedCount();
          reset.disabled = n === 0;
          reset.textContent = n ? "Reset to the report’s values (" + n + " changed)" : "Showing the report’s values";
        };
        R.on("update", upd);
        upd();
      }
      // bars: li[data-bar] in ul.calc-bars get a track sized to their value
      $$(".calc-bars li[data-bar]", calc).forEach(function (li, i) {
        var s = li.getAttribute("data-s") || String((i % 6) + 1);
        li.style.setProperty("--c", /^\d$/.test(s) ? "var(--s" + s + ")" : s);
        var name = $(".name", li);
        if (name && !$(".sw", name)) name.insertBefore(el("span", { class: "sw", "aria-hidden": "true" }), name.firstChild);
        if (!$(".bar", li)) {
          var bar = el("span", { class: "bar", "aria-hidden": "true" });
          bar.appendChild(el("i"));
          if (name) name.parentNode.insertBefore(bar, name.nextSibling); else li.insertBefore(bar, li.firstChild);
        }
      });
      // a polite announcement once the reader stops moving a control
      var verdict = $(".calc-verdict", calc);
      if (verdict) {
        var live = el("p", { class: "sr-only", "aria-live": "polite" });
        calc.appendChild(live);
        var timer = 0;
        R.on("update", function (res, params, changed) {
          if (!changed || !changed.length) return;
          clearTimeout(timer);
          timer = setTimeout(function () { live.textContent = verdict.textContent.replace(/\s+/g, " ").trim(); }, 500);
        });
      }
      if (late) R.rebind(calc);
    });
    R.on("update", updateCalcViews);
  }
  function updateCalcViews() {
    $$(".calc-bars").forEach(function (ul) {
      var items = $$("li[data-bar]", ul);
      var vals = items.map(function (li) { var v = Number(R.value(li.getAttribute("data-bar"))); return isFinite(v) ? v : null; });
      var max = Math.max.apply(null, [0].concat(vals.filter(function (v) { return v != null; })));
      var best = ul.getAttribute("data-best"), pick = -1;
      items.forEach(function (li, i) {
        var v = vals[i], bar = $(".bar i", li);
        if (bar) bar.style.width = v == null || !max ? "0" : Math.max(1, v / max * 100).toFixed(1) + "%";
        if (v == null || li.classList.contains("muted") || li.hasAttribute("data-no-best")) return;
        if (pick < 0 || (best === "min" ? v < vals[pick] : best === "max" ? v > vals[pick] : false)) pick = i;
      });
      items.forEach(function (li, i) { li.classList.toggle("best", !!best && i === pick); });
    });
  }

  /* ---------- evidence: glyphs + sidenotes ---------- */
  function followingCites(n) {
    var out = [], s = n.nextSibling;
    while (s) {
      if (s.nodeType === 3 && !s.textContent.trim()) { s = s.nextSibling; continue; }
      if (s.nodeType === 1 && s.matches("a.cite")) { out.push(s); s = s.nextSibling; continue; }
      break;
    }
    return out;
  }
  var INLINE_ONLY = "figcaption, caption, table, .calculator, .boxes, .fig-head, h1, h2, h3, h4, .masthead, .toc";
  function evidence() {
    var noteN = 0;
    var DEFAULT = {
      estimate: "Our calculation from sourced inputs.",
      assumption: "A premise we chose.",
      interpretation: "Our judgement, not a sourced fact."
    };
    // core's own "?" note toggles (present if core started before this script): the margin replaces them
    $$(".ev-note-btn, .ev > .ev-note").forEach(function (x) { x.remove(); });
    // One note per source per screen: a source already noted in the same section (or panel)
    // less than a viewport above gets no second note.
    var lastNote = {}, scopeN = 0;
    function repeatSource(n, id) {
      var scope = n.closest(".deeper, .sec") || doc.body;
      if (!scope._lrScope) scope._lrScope = ++scopeN;
      var key = scope._lrScope + "|" + id, top = n.getBoundingClientRect().top + window.scrollY;
      if (key in lastNote && top - lastNote[key] < window.innerHeight) return true;
      lastNote[key] = top;
      return false;
    }
    var calcLink = calcTarget ? ' <a href="#' + esc(calcTarget.id) + '">Change it in ' + esc(calcTarget.label) + " →</a>" : "";
    $$(".ev[data-ev]").forEach(function (n) {
      if (n._lr || n.closest("[data-ev-legend], .sn")) return;
      n._lr = true;
      var kinds = R.evKinds(n);
      if (!kinds.length) return;
      var block = /^(DIV|P|LI|ASIDE|SECTION|BLOCKQUOTE|UL|OL)$/.test(n.tagName);
      var cites = $$("a.cite", n).concat(block ? [] : followingCites(n));
      var note = n.getAttribute("data-note");
      var usedNote = false, marks = [], lines = [], gen = 0;
      kinds.forEach(function (k) {
        if (k === "fact") {
          cites.forEach(function (a) {
            var id = (a.getAttribute("href") || "").slice(1);
            if (repeatSource(n, id)) return;   // the same source was just noted: the number still links
            var title = a.title || (doc.getElementById(id) || {}).textContent || "";
            lines.push('<span class="sn-line sn-s"><span class="g" aria-hidden="true">' + esc(a.textContent) + "</span>" + esc(title.trim()) +
              ' <a href="#' + esc(id) + '" class="sn-jump">↓&nbsp;Sources</a></span>');
          });
          return;
        }
        var own = note && !usedNote;
        var txt = own ? esc(note) : DEFAULT[k];
        if (own) usedNote = true; else gen++;
        if (k === "assumption") txt += calcLink;
        marks.push('<button type="button" class="mk mk-' + KIND[k] + '" aria-label="' + NAME[k] + ': show note">' + glyph(KIND[k]) + "</button>");
        lines.push('<span class="sn-line sn-' + KIND[k] + (own ? "" : " gen") + '"><span class="g" aria-hidden="true">' + glyph(KIND[k]) + "</span><b>" + NAME[k] + ".</b> " + txt + "</span>");
      });
      if (!lines.length) return;
      var id = "lr-sn-" + (++noteN);
      if (marks.length) {
        var grp = el("span", { class: "mk-group" });
        grp.innerHTML = marks.join("");
        var host = block ? (n.lastElementChild && /^(P|LI)$/.test(n.lastElementChild.tagName) ? n.lastElementChild : n) : n;
        host.appendChild(grp);
        $$("button.mk", grp).forEach(function (b) { b.setAttribute("aria-controls", id); b.setAttribute("aria-expanded", "false"); b._ev = n; });
      }
      var sn = el("span", { class: "sn", id: id, role: "note" });
      sn.innerHTML = lines.join("");
      var genOnly = gen === lines.length;
      if (genOnly || n.closest(INLINE_ONLY)) sn.classList.add("inline-only");
      if (genOnly) sn.classList.add("sn-gen");
      if (block) n.insertBefore(sn, n.firstChild);
      else {
        var after = cites.length && !n.contains(cites[cites.length - 1]) ? cites[cites.length - 1] : n;
        after.parentNode.insertBefore(sn, after.nextSibling);
      }
      cites.forEach(function (a) { a._sn = sn; a._ev = n; });
      n._sn = sn; sn._ev = n;
    });
    // claims in side-by-side columns: mirror their notes into the margin beside the block
    $$(".reconcile").forEach(function (rc) {
      var host = el("div", { class: "sn-host" });
      $$(".claim .sn", rc).forEach(function (sn) {
        if (sn.classList.contains("sn-gen")) return;
        var cl = sn.cloneNode(true);
        cl.removeAttribute("id");
        cl.classList.remove("inline-only", "open");
        cl._ev = sn._ev;
        sn._desk = cl;
        host.appendChild(cl);
      });
      if (host.children.length) rc.parentNode.insertBefore(host, rc);
    });

    function toggleNote(sn) {
      var open = !sn.classList.contains("open");
      sn.classList.toggle("open", open);
      $$('button.mk[aria-controls="' + sn.id + '"]').forEach(function (m) { m.setAttribute("aria-expanded", String(open)); });
    }
    function flash(sn) { sn.classList.remove("flash"); void sn.offsetWidth; sn.classList.add("flash"); }
    doc.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("button.mk, a.cite");
      if (!t) return;
      var ev = t._ev, sn = ev && ev._sn;
      if (!sn) return;
      var inline = !marginMode() || sn.classList.contains("inline-only");
      var desk = sn._desk && marginMode() ? sn._desk : null;
      if (t.tagName === "A") {
        if (inline && !desk) { e.preventDefault(); e.stopPropagation(); toggleNote(sn); }
        return;                                     // in the margin: the number jumps to the source
      }
      if (desk) flash(desk);
      else if (inline) toggleNote(sn);
      else flash(sn);
    }, true);
    // hover pairing: claim <-> note
    function pair(target, on) {
      var sn = target.closest(".sn");
      var ev = (sn && sn._ev) || (target.closest("button.mk, a.cite") || {})._ev;
      if (ev) ev.classList.toggle("hl", on);
    }
    doc.addEventListener("mouseover", function (e) { if (e.target.closest && e.target.closest(".mk, a.cite, .sn")) pair(e.target, true); });
    doc.addEventListener("mouseout", function (e) { if (e.target.closest && e.target.closest(".mk, a.cite, .sn")) pair(e.target, false); });
    doc.addEventListener("focusin", function (e) { if (e.target.closest && e.target.closest(".mk, a.cite")) pair(e.target, true); });
    doc.addEventListener("focusout", function (e) { if (e.target.closest && e.target.closest(".mk, a.cite")) pair(e.target, false); });
  }

  /* ---------- legend: drawn glyphs and what each kind means here ---------- */
  function legend() {
    var DESC = {
      fact: "number links to the source",
      estimate: "our calculation, shown",
      assumption: calcTarget ? "change it in the calculator" : "taken as given",
      interpretation: "our judgement"
    };
    $$("[data-ev-legend]").forEach(function (box) {
      var keys = $$(".ev-key", box);
      keys.forEach(function (k) {
        var kind = k.getAttribute("data-ev");
        var mark = $(".ev-key-mark", k);
        if (mark && KIND[kind]) mark.innerHTML = glyph(KIND[kind]);
        var name = $(".ev-key-name", k);
        if (name && !$(".ev-key-desc", k)) k.appendChild(el("span", { class: "ev-key-desc" }, " — " + DESC[kind]));
      });
      if (keys.length && !box.parentNode.querySelector(".legend-hint")) {
        box.parentNode.insertBefore(el("p", { class: "legend-hint" }, "On narrow screens, tap a glyph to open its note."), box.nextSibling);
      }
    });
  }

  /* ---------- series toggles on charts (line series, range groups) ---------- */
  function seriesToggles() {
    $$("figure.chart").forEach(function (fig) {
      var h = fig._chart;
      if (!h || h.spec.toggles === false) return;
      var orig = h.spec, items;
      if (orig.type === "line" && (orig.series || []).length > 1) {
        items = orig.series.map(function (s, i) {
          return { key: s.key, name: s.name || s.key, short: s.short, color: s.color || "var(--s" + ((i % 6) + 1) + ")", dash: !!(s.dash || s.ev === "estimate" || s.ev === "assumption") };
        });
      } else if (orig.type === "range" && (orig.groups || []).length > 1) {
        items = orig.groups.map(function (g, i) { return { key: g.key, name: g.name || g.key, short: g.short, color: g.color || "var(--s" + ((i % 6) + 1) + ")", dot: true }; });
      } else return;
      var hidden = h._lrHidden = {};
      var box = el("div", { class: "series-toggles", role: "group", "aria-label": "Show or hide series" });
      items.forEach(function (it) {
        var two = it.short && it.short !== it.name;
        var b = el("button", { type: "button", "aria-pressed": "true", "data-key": it.key });
        if (two) b.setAttribute("aria-label", it.name);
        b.innerHTML = '<span class="sw' + (it.dash ? " dash" : "") + (it.dot ? " dot" : "") + '" style="border-color:' + esc(it.color) + '"></span>' +
          (two ? '<span class="long">' + esc(it.name) + '</span><span class="short" aria-hidden="true">' + esc(it.short) + "</span>" : esc(it.name));
        b.addEventListener("click", function () {
          hidden[it.key] = !hidden[it.key];
          if (items.every(function (x) { return hidden[x.key]; })) hidden[it.key] = false;   // never empty
          b.setAttribute("aria-pressed", String(!hidden[it.key]));
          if (orig.type === "range") {
            h.update(Object.assign({}, orig, { rows: orig.rows.filter(function (r) { return !hidden[r.group]; }) }));
          } else {
            // a point placed "on" a hidden series hides with it
            if (orig.points) h.spec = Object.assign({}, orig, { points: orig.points.filter(function (p) { return !p.on || !hidden[p.on]; }) });
            h.toggle(it.key, !!hidden[it.key]);
          }
        });
        box.appendChild(b);
      });
      var tools = $(".fig-tools", fig);
      if (tools) tools.appendChild(box);
      else fig.insertBefore(box, h.el);
    });
  }

  /* ---------- "§n" before links to sections: <a class="sec-ref" href="#costs">the numbers</a> ---------- */
  function sectionRefs() {
    $$("a.sec-ref[href^='#']").forEach(function (a) {
      var t = doc.getElementById(a.getAttribute("href").slice(1));
      var sec = t && (t.classList.contains("sec") ? t : t.closest(".sec"));
      if (sec && sec._n && !$(".sec-ref-n", a)) a.insertBefore(el("span", { class: "sec-ref-n" }, "§" + sec._n + " "), a.firstChild);
    });
  }

  /* ---------- navigation: side contents, running head, progress, scroll-spy ---------- */
  function navigation() {
    if (!sections.length) return;
    var main = $("main") || doc.body;
    var toc = $("nav.toc");
    if (!toc) {
      toc = el("nav", { class: "toc", "aria-label": "Contents" });
      var layout = main.closest(".layout");
      if (!layout) {
        layout = el("div", { class: "layout" });
        main.parentNode.insertBefore(layout, main);
        layout.appendChild(main);
      }
      layout.insertBefore(toc, layout.firstChild);
    }
    if (!toc.id) toc.id = "toc";
    if (!main.classList.contains("article")) main.classList.add("article");
    toc.innerHTML = "";
    toc.appendChild(el("p", { class: "toc-kicker" }, "Contents"));
    var ol = el("ol", { class: "toc-list" });
    var links = sections.map(function (s) {
      var li = el("li"), a = el("a", { href: "#" + s.id });
      a.appendChild(el("span", null, String(s._n)));
      a.appendChild(doc.createTextNode(s._title));
      li.appendChild(a);
      ol.appendChild(li);
      return a;
    });
    toc.appendChild(ol);
    var side = el("div", { class: "toc-progress", "aria-hidden": "true" });
    var sideFill = el("div", { class: "progress-fill" });
    side.appendChild(sideFill);
    toc.appendChild(side);
    var used = R.evidenceUsed || {};
    var mini = el("div", { class: "legend-toc", "aria-hidden": "true" });
    Object.keys(KIND).forEach(function (k) {
      if (!used[k]) return;
      var s = el("span", { class: "ev-tag-plain" });
      s.innerHTML = '<span class="ev-tag ev-' + KIND[k] + '">' + glyph(KIND[k]) + "</span>" + NAME[k].toLowerCase();
      mini.appendChild(s);
    });
    if (mini.children.length) toc.appendChild(mini);

    // running head
    var bar = el("header", { class: "topbar", "aria-label": "Reading position" });
    bar.innerHTML = '<button class="topbar-btn" type="button" aria-expanded="false" aria-controls="' + toc.id + '">' +
      '<span class="sr-only">Contents, current section: </span><span class="topbar-num"></span><span class="topbar-name"></span>' +
      '<span class="topbar-caret" aria-hidden="true">▾</span></button><div class="progress" aria-hidden="true"><div class="progress-fill"></div></div>';
    var skip = $(".skip");
    doc.body.insertBefore(bar, skip ? skip.nextSibling : doc.body.firstChild);
    var btn = $(".topbar-btn", bar), num = $(".topbar-num", bar), name = $(".topbar-name", bar), topFill = $(".progress-fill", bar);
    function setTopbarH() { root.style.setProperty("--topbar-h", bar.offsetHeight + "px"); }
    setTopbarH();
    window.addEventListener("resize", setTopbarH);

    var current = -1;
    function setActive(i) {
      if (i === current) return;
      current = i;
      links.forEach(function (a, j) {
        a.classList.toggle("active", j === i);
        if (j === i) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      });
      num.textContent = "§" + sections[i]._n;
      name.textContent = sections[i]._title;
    }
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var hgt = root.scrollHeight - window.innerHeight;
        var p = hgt > 0 ? Math.min(1, window.scrollY / hgt) : 0;
        topFill.style.width = sideFill.style.width = (p * 100) + "%";
        var line = window.innerHeight * 0.3, cur = 0;
        sections.forEach(function (s, i) { if (s.getBoundingClientRect().top <= line) cur = i; });
        setActive(cur);
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();

    function closeToc() { toc.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function () {
      var open = !toc.classList.contains("open");
      toc.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      if (open) (links[current] || links[0]).focus();
    });
    links.forEach(function (a) { a.addEventListener("click", closeToc); });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && toc.classList.contains("open")) { closeToc(); btn.focus(); } });
    doc.addEventListener("click", function (e) { if (toc.classList.contains("open") && !toc.contains(e.target) && !btn.contains(e.target)) closeToc(); });
    $$('a[href="#top"]').forEach(function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); });
    });
  }

  /* ---------- the printed end mark after the last paragraph before the sources ---------- */
  function endmark() {
    if ($(".endmark")) return;
    var last = sections.filter(function (s) { return !$(".sources", s); }).pop();
    if (!last) return;
    var blocks = $$(":scope > p, :scope > ol > li, :scope > ul > li", last);
    var b = blocks[blocks.length - 1];
    if (b) b.appendChild(el("span", { class: "endmark", "aria-hidden": "true" }));
  }
})();
