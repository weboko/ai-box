/* Roadmap template: the report as a schedule. Reads one .roadmap element and builds
   - a sticky time ruler: named eras, today line, ticks, a playhead rail with detents,
     drag / arrow / PgUp-PgDn scrubbing, a live read-out and section navigation;
   - swimlanes with one label gutter: item lanes (milestones and bars), chart lanes (core
     line charts bound to the model's per-step rows) and strip lanes (category per step);
   - hover/focus card previews and pinned cards side by side;
   - below 900px, a vertical spine of steps that the ruler follows.
   Content stays in the markup (see references/templates/roadmap.md). Topic-agnostic. */
(function () {
  "use strict";
  var R = window.Report;
  if (!R) return;
  var U = R.util, $ = U.$, $$ = U.$$, el = U.el, esc = U.esc;
  var doc = document;
  var mqNarrow = window.matchMedia("(max-width: 899px)");

  /* ---------- evidence shapes: ● fact ▲ estimate ■ assumption ◆ interpretation ---------- */
  var SHAPES = {
    fact: '<circle cx="6" cy="6" r="4.5"/>',
    estimate: '<path d="M6 1 L11.2 10.2 H0.8 Z"/>',
    assumption: '<rect x="2.1" y="2.1" width="7.8" height="7.8"/>',
    interpretation: '<path d="M6 0.7 L11.3 6 L6 11.3 L0.7 6 Z"/>'
  };
  function glyph(kind, cls) {
    return '<svg class="rm-g rm-g-' + kind + (cls ? " " + cls : "") + '" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' + (SHAPES[kind] || SHAPES.interpretation) + "</svg>";
  }
  var ICON = {
    left: '<path d="M10 3.5 L5.5 8 L10 12.5"/>',
    right: '<path d="M3 8 H12.5 M8.5 4 L12.5 8 L8.5 12"/>',
    down: '<path d="M8 3 V12.5 M4 8.5 L8 12.5 L12 8.5"/>',
    close: '<path d="M4 4 L12 12 M12 4 L4 12"/>'
  };
  function icon(n) { return '<svg class="rm-ic" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' + ICON[n] + "</svg>"; }
  function kindOf(node) { var k = R.evKinds(node); return k[0] || null; }
  function kindName(k) { return k && R.EV[k] ? R.EV[k].name : ""; }

  /* ---------- time ---------- */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var REL = { month: "M", quarter: "Q", week: "W", year: "Y", day: "D" };
  function parseDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s);
    if (m) return { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 };
    var d = new Date(s);
    return isNaN(d) ? null : { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }
  var cfg;
  function readConfig(node) {
    function a(k, d) { var v = node.getAttribute("data-" + k); return v == null || v === "" ? d : v; }
    var unit = a("unit", "month");
    if (!REL[unit]) unit = "month";
    var from = +a("from", 0), to = +a("to", 12);
    if (!(to > from)) to = from + 12;
    var start = Math.max(from, Math.min(to, +a("start", Math.max(from, 0))));
    var tick = +a("tick", 0) || Math.max(1, Math.round((to - from) / 10));
    return {
      unit: unit, from: from, to: to, start: start, tick: tick,
      step: +a("step", 1) || 1, page: +a("page", tick) || tick,
      today: parseDate(a("today", "")), todayText: a("today-label", ""), todayNote: a("today-note", ""),
      rel: a("rel", REL[unit]), unitLabel: a("unit-label", unit),
      rows: a("rows", ""), x: a("x", "t"),
      scrubLabel: a("scrub-label", "Simulated " + unit), scrubHint: a("scrub-hint", "drag, or ← → keys"),
      pastLabel: a("past-label", "past"), cursor0: +a("cursor", start)
    };
  }
  function clampT(t) { return Math.max(cfg.from, Math.min(cfg.to, t)); }
  function pct(t) { return (clampT(t) - cfg.from) / (cfg.to - cfg.from) * 100; }
  function num(t) { return Math.abs(t - Math.round(t)) < 1e-6 ? String(Math.round(t)) : (Math.round(t * 10) / 10).toFixed(1); }
  // Fractional time maps onto the calendar: whole months from today (same day of month,
  // clamped), then the fraction as days (×30.44). Month 4.8 from 20 Oct 2026 ≈ 14 Mar 2027.
  function addMonths(T, months) {
    var whole = Math.floor(months + 1e-9), frac = months - whole;
    var dim = new Date(T.y, T.m + whole + 1, 0).getDate();
    var d = new Date(T.y, T.m + whole, Math.min(T.d, dim));
    return frac > 1e-6 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + Math.round(frac * 30.44)) : d;
  }
  function dateAt(t) {
    var T = cfg.today;
    if (!T) return null;
    switch (cfg.unit) {
      case "month": return addMonths(T, t);
      case "quarter": return addMonths(T, 3 * t);
      case "year": return addMonths(T, 12 * t);
      case "week": return new Date(T.y, T.m, T.d + Math.round(7 * t));
      default: return new Date(T.y, T.m, T.d + Math.round(t));
    }
  }
  function fmtDate(d, form) {
    var Y = d.getFullYear(), yy = String(Y).slice(2), mo = d.getMonth();
    switch (cfg.unit) {
      case "month": return MON[mo] + " " + (form === "short" ? yy : Y);
      case "quarter": return "Q" + (Math.floor(mo / 3) + 1) + " " + (form === "short" ? yy : Y);
      case "year": return String(Y);
      default: return d.getDate() + " " + MON[mo] + (form === "short" ? "" : " " + Y);
    }
  }
  function relLabel(t) { return cfg.rel + num(t); }
  function label(t, form) { var d = dateAt(t); return d ? fmtDate(d, form) : relLabel(t); }
  function timeText(t, form) {
    if (form === "rel") return relLabel(t);
    if (form === "label" || form === "long") return label(t, "long");
    if (form === "short") return label(t, "short");
    return cfg.today ? relLabel(t) + " · " + label(t, "long") : relLabel(t);
  }
  function dateToT(s) {
    var p = parseDate(s), T = cfg.today;
    if (!p || !T) return null;
    var days = (Date.UTC(p.y, p.m, p.d) - Date.UTC(T.y, T.m, T.d)) / 864e5;
    var months = (p.y - T.y) * 12 + (p.m - T.m) + (p.d - T.d) / 30.44;
    switch (cfg.unit) {
      case "month": return months;
      case "quarter": return months / 3;
      case "year": return months / 12;
      case "week": return days / 7;
      default: return days;
    }
  }
  function dayText(s) { var p = parseDate(s); return p ? p.d + " " + MON[p.m] + " " + p.y : s; }
  function todayLong() {
    if (cfg.todayText) return cfg.todayText;
    var T = cfg.today;
    return T ? T.d + " " + MON[T.m] + " " + T.y : "";
  }

  /* ---------- reading the markup ---------- */
  var root, lanesBox, overlay, ruler, track, roRow, navBox, tray, trayGrid, spine, pop, srStatus, stepTpl;
  var eras = [], erasSorted = [], lanes = [], items = [], byId = {}, cats = {};
  var state = { t: 0, pinned: [], open: {}, mode: null, popFor: null };
  var trayCards = {};

  function posOf(node, name) {
    var b = node.getAttribute("data-" + name + "-bind");
    if (b != null) {
      var v = R.value(b);
      return typeof v === "number" && isFinite(v) ? v : null;
    }
    if (node.hasAttribute("data-" + (name === "at" ? "date" : "date-" + name))) return dateToT(node.getAttribute("data-" + (name === "at" ? "date" : "date-" + name)));
    var s = node.getAttribute("data-" + name);
    return s == null || s === "" ? null : +s;
  }
  function hasPos(node, name) {
    return node.hasAttribute("data-" + name) || node.hasAttribute("data-" + name + "-bind") || node.hasAttribute("data-" + (name === "at" ? "date" : "date-" + name));
  }

  function setup() {
    root = $(".roadmap");
    if (!root) return;
    cfg = readConfig(root);
    doc.documentElement.classList.add("rm-js");
    if (!root.id) root.id = "timeline";

    // eras
    var eraList = $(":scope > .eras", root);
    if (eraList) {
      eraList.classList.add("rm-src");
      eras = $$(":scope > li", eraList).map(function (li) { return { node: li }; });
    }
    // lanes
    lanesBox = el("div", { class: "rm-lanes" });
    var laneSecs = $$(":scope > [data-lane]", root);
    if (laneSecs.length) laneSecs[0].parentNode.insertBefore(lanesBox, laneSecs[0]);
    else root.appendChild(lanesBox);
    laneSecs.forEach(function (sec, li) {
      var id = sec.getAttribute("data-lane") || "lane-" + li;
      var head = el("div", { class: "lane-l" });
      $$(":scope > h3, :scope > .lane-sub", sec).forEach(function (n) { head.appendChild(n); });
      var trk = el("div", { class: "lane-t" });
      var fig = $(":scope > figure.chart", sec), list = $(":scope > ol.items, :scope > ul.items", sec);
      var lane = { id: id, sec: sec, track: trk, kind: fig ? "chart" : sec.hasAttribute("data-strip") ? "strip" : "items" };
      if (fig) {
        var sc = $('script[type="application/json"]', fig);
        try {
          var spec = JSON.parse(sc.textContent);
          spec.x = spec.x || {};
          if (spec.x.key == null) spec.x.key = cfg.x;
          if (spec.x.min == null) spec.x.min = cfg.start;
          if (spec.x.max == null) spec.x.max = cfg.to;
          if (spec.bind == null && !spec.data && cfg.rows) spec.bind = cfg.rows;
          sc.textContent = JSON.stringify(spec);
        } catch (e) { console.error("roadmap: bad chart JSON in lane " + id, e); }
        lane.fig = fig;
        trk.appendChild(fig);
      } else if (lane.kind === "strip") {
        lane.key = sec.getAttribute("data-strip");
        lane.cats = (sec.getAttribute("data-cats") || "").split("|").filter(Boolean).map(function (s, i) {
          var kv = s.split("="), key = kv[0].trim();
          if (cats[key] == null) cats[key] = { i: i, label: (kv[1] || key).trim() };
          return { key: key, label: (kv[1] || key).trim(), i: i };
        });
        lane.valueKey = sec.getAttribute("data-strip-value");
        lane.svg = el("div", { class: "rm-strip" });
        trk.appendChild(lane.svg);
      } else if (list) {
        list.classList.add("rm-src");
        $$(":scope > li", list).forEach(function (node, k) {
          var body = el("div", { class: "rm-body" });
          while (node.firstChild) body.appendChild(node.firstChild);
          node.appendChild(body);
          if (!node.id) node.id = "rm-" + id + "-" + k;
          var h = $("h4, h3", body);
          var it = { id: node.id, node: node, body: body, lane: id, title: h ? h.textContent.trim() : node.id };
          node.setAttribute("data-rm-id", node.id);
          items.push(it);
          byId[it.id] = it;
        });
      }
      lane.minH = +(sec.getAttribute("data-min-height") || 0) || null;
      sec.classList.add("rm-lane", "rm-lane-" + lane.kind);
      sec.appendChild(head);
      sec.appendChild(trk);
      sec.appendChild(el("div", { class: "lane-r", "aria-hidden": "true" }));
      lanesBox.appendChild(sec);
      lanes.push(lane);
    });
    overlay = el("div", { class: "rm-ov", "aria-hidden": "true" });
    lanesBox.appendChild(overlay);

    // ruler (sticky; inserted before the roadmap so it stays up through the sections after it)
    ruler = el("div", { class: "rm-ruler", role: "region", "aria-label": "Time ruler and scrubber" });
    var rin = el("div", { class: "rm-ruler-in" });
    roRow = el("div", { class: "rm-ro-row" });
    var ro = el("div", { class: "rm-ro" });
    ro.innerHTML = '<b class="rm-ro-era" data-cursor-era></b><span class="rm-ro-pass" hidden></span><span class="rm-chip" data-cursor-time></span>';
    var readout = $(":scope > .rm-readout", root);
    if (readout) ro.appendChild(readout);
    navBox = el("nav", { class: "rm-nav", "aria-label": "Page sections" });
    roRow.appendChild(ro);
    roRow.appendChild(navBox);
    rin.appendChild(roRow);
    var grid = el("div", { class: "rm-grid" });
    grid.innerHTML = '<div class="rm-gl"><span>' + esc(cfg.scrubLabel) + "<small>" + esc(cfg.scrubHint) + "</small></span></div>";
    track = el("div", { class: "rm-track" });
    grid.appendChild(track);
    grid.appendChild(el("div", { class: "rm-gr" }));
    rin.appendChild(grid);
    ruler.appendChild(rin);
    root.parentNode.insertBefore(ruler, root);

    // spine (narrow), tray (pinned cards), popover, live status
    spine = el("ol", { class: "rm-vt", "aria-label": "Timeline, step by step" });
    lanesBox.parentNode.insertBefore(spine, lanesBox.nextSibling);
    tray = el("section", { class: "rm-tray", id: "rm-tray", "aria-label": "Pinned cards", hidden: "" });
    tray.innerHTML = '<div class="rm-tray-h"><h3>Pinned cards</h3><p class="rm-hint">They stay open side by side for comparison.</p>' +
      '<button type="button" class="rm-btn ghost" data-rm-unpin-all>Unpin all</button></div><div class="rm-tray-grid"></div>';
    trayGrid = $(".rm-tray-grid", tray);
    spine.parentNode.insertBefore(tray, spine.nextSibling);
    pop = el("div", { class: "rm-pop", role: "dialog", hidden: "" });
    doc.body.appendChild(pop);
    srStatus = el("div", { class: "sr-only", "aria-live": "polite" });
    doc.body.appendChild(srStatus);
    stepTpl = $(":scope > template.rm-step", root);

    // detents and items read their geometry in layout(); [data-controls] get standard controls in ready
  }

  /* ---------- geometry from markup + model ---------- */
  function resolve() {
    // Eras never overlap: visible eras (start known and before data-to) are sorted by start
    // (ties: markup order, the later one wins); each ends at its own data-until or at the next
    // visible era's start, whichever comes first (no or null data-until: the next visible start,
    // else data-to). An era whose end is not after its start is hidden.
    eras.forEach(function (e) {
      var n = e.node;
      e.at = posOf(n, "at");
      e.own = hasPos(n, "until") ? posOf(n, "until") : null;
      e.kind = (n.className || "").split(/\s+/)[0] || "phase";
      e.name = visibleText(n);
      e.short = n.getAttribute("data-short") || e.name;
      e.detent = n.hasAttribute("data-detent");
      e.hidden = true;
      e.until = cfg.to;
    });
    erasSorted = eras.filter(function (e) { return e.at != null && e.at < cfg.to && !(e.own != null && e.own <= e.at + 1e-9); })
      .sort(function (a, b) { return a.at - b.at || eras.indexOf(a) - eras.indexOf(b); });
    erasSorted.forEach(function (e, i) {
      var next = i + 1 < erasSorted.length ? erasSorted[i + 1].at : cfg.to;
      e.until = e.own == null ? next : Math.min(e.own, next);
      e.hidden = !(e.until > e.at + 1e-9);
    });
    erasSorted = erasSorted.filter(function (e) { return !e.hidden; });
    items.forEach(function (it) {
      var n = it.node;
      it.at = posOf(n, "at");
      it.until = hasPos(n, "until") ? posOf(n, "until") : null;
      it.soft = hasPos(n, "soft") ? posOf(n, "soft") : null;
      it.kind = kindOf(n) || "interpretation";
      it.style = n.getAttribute("data-style") || "plan";
      it.offLabel = n.getAttribute("data-off-label");
      it.off = it.at == null || it.at > cfg.to;
      it.label = it.off && it.offLabel ? it.offLabel : (n.getAttribute("data-label") || it.title);
      it.muted = n.hasAttribute("data-muted") || (it.off && !!it.offLabel);
      it.shown = !it.off || !!it.offLabel;
      it.x = it.off ? cfg.to : it.at;
      it.edge = !it.off && it.at < cfg.from;
      it.bar = !it.off && it.until != null && it.until > it.at;
      it.cont = it.bar && (it.soft || it.until) > cfg.to;
      it.detent = n.hasAttribute("data-detent") && !it.off && it.at >= cfg.start && it.at <= cfg.to;
      it.when = whenOf(it);
    });
  }
  function whenOf(it) {
    var n = it.node;
    if (n.hasAttribute("data-when")) return n.getAttribute("data-when");
    if (it.off) return n.getAttribute("data-off-when") || "beyond " + cfg.unitLabel + " " + num(cfg.to);
    if (n.hasAttribute("data-date")) return dayText(n.getAttribute("data-date"));
    if (it.bar) return cfg.unitLabel + " " + num(it.at) + " → " + (it.until > cfg.to ? num(cfg.to) + "+" : num(it.until)) + (cfg.today ? " · from " + label(it.at, "long") : "");
    return cfg.unitLabel + " " + num(it.at) + (cfg.today ? " · " + label(it.at, "long") : "");
  }
  function visibleText(node) {
    var c = node.cloneNode(true);
    $$("[hidden], .ev-note, .ev-note-btn, .rm-mk2", c).forEach(function (x) { x.remove(); });
    return c.textContent.replace(/\s+/g, " ").trim();
  }
  function eraAt(t) {
    var cur = null;
    eras.forEach(function (e) { if (!e.hidden && e.at <= t + 1e-9 && (t < e.until - 1e-9 || (e.until >= cfg.to && t <= cfg.to))) cur = e; });
    return cur;
  }
  function detents() {
    var d = [];
    items.forEach(function (it) { if (it.detent) d.push({ at: it.at, kind: it.kind, label: it.label + " · " + it.when, pass: it.node.getAttribute("data-detent") || "past " + lcFirst(it.label) }); });
    eras.forEach(function (e) { if (e.detent && !e.hidden && e.at >= cfg.start) d.push({ at: e.at, kind: kindOf(e.node) || "interpretation", label: e.name, pass: e.node.getAttribute("data-detent") || "past " + lcFirst(e.name) }); });
    return d.sort(function (a, b) { return a.at - b.at; });
  }
  function lcFirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  /* ---------- rows (model output per time step) ---------- */
  function rows() { var r = cfg.rows ? R.value(cfg.rows) : null; return Array.isArray(r) ? r : []; }
  function rowAt(t) {
    var best = null, bd = Infinity;
    rows().forEach(function (r) { var d = Math.abs(+r[cfg.x] - t); if (d < bd) { bd = d; best = r; } });
    return best || {};
  }
  function bindRow(scope, row, t, self) {
    function each(sel, fn) {
      var list = $$(sel, scope);
      if (self && scope.matches && scope.matches(sel)) list.unshift(scope);
      list.forEach(function (n) { if (scope === doc && n.closest(".rm-vt, template")) return; fn(n); });
    }
    each("[data-cursor-out]", function (n) {
      var s = R.fmtFor(n, U.get(row, n.getAttribute("data-cursor-out")));
      if (n.textContent !== s) n.textContent = s;
    });
    each("[data-cursor-time]", function (n) { n.textContent = timeText(t, n.getAttribute("data-cursor-time")); });
    each("[data-cursor-era]", function (n) { var e = eraAt(t); n.textContent = e ? e.name : ""; });
    each("[data-cursor-if]", function (n) {
      var ex = n.getAttribute("data-cursor-if"), neg = ex.charAt(0) === "!", v = U.get(row, neg ? ex.slice(1) : ex);
      n.hidden = neg ? !!v : !v;
    });
    each("[data-cursor-cat]", function (n) {
      var c = cats[U.get(row, n.getAttribute("data-cursor-cat"))];
      n.style.background = c ? "var(--s" + ((c.i % 6) + 1) + ")" : "";
    });
  }

  /* ---------- ruler ---------- */
  function renderRuler() {
    var W = track.clientWidth || 800, narrow = state.mode === "v", span = cfg.to - cfg.from;
    var h = '<div class="rm-eras">';
    eras.forEach(function (e) {
      if (e.hidden) return;
      var l = pct(e.at), w = pct(e.until) - l, px = w / 100 * W;
      var nm = narrow ? "" : px > e.name.length * 6.6 + 12 ? e.name : px > e.short.length * 6.6 + 8 ? e.short : "";
      h += '<div class="rm-era era-' + esc(e.kind) + '" style="left:' + l + "%;width:" + w + '%" title="' + esc(e.name) + '"><span>' + esc(nm) + "</span></div>";
    });
    h += '</div><div class="rm-ticks">';
    var hasToday = cfg.from < 0 && cfg.to > 0, todayPx = pct(0) / 100 * W;
    var tk = cfg.tick, k = Math.max(1, Math.ceil(64 / (tk / span * W)));
    var t0 = Math.ceil(cfg.from / tk - 1e-9) * tk;
    for (var t = t0; t <= cfg.to + 1e-9; t += tk) {
      if (hasToday && Math.abs(t) < 1e-9) continue;
      var x = pct(t), px2 = x / 100 * W, i = Math.round(t / tk);
      var near = hasToday && ((px2 < todayPx && todayPx - px2 < 84) || (px2 > todayPx && px2 - todayPx < 26));
      if (i % k !== 0 || near) { h += '<span class="rm-tk minor" style="left:' + x + '%"></span>'; continue; }
      var edge = x > 96 ? " end" : x < 4 ? " start" : "";
      h += '<span class="rm-tk' + edge + '" style="left:' + x + '%"><b>' + esc(label(t, "short")) + "</b>" +
        (t > 0 && !narrow && cfg.today ? "<i>" + esc(relLabel(t)) + "</i>" : "") + "</span>";
    }
    h += "</div>";
    if (cfg.from <= 0 && cfg.to >= 0) h += '<div class="rm-today-tick" style="left:' + pct(0) + '%"><span>today' + (cfg.today ? "<br>" + esc(label(0, "short")) : "") + "</span></div>";
    var s0 = pct(cfg.start), s1 = pct(cfg.to);
    h += '<div class="rm-scrub" style="left:' + s0 + "%;width:" + (s1 - s0) + '%"><span class="rm-fill"></span>';
    detents().forEach(function (d) {
      h += '<span class="rm-det" data-at="' + d.at + '" style="left:' + ((d.at - cfg.start) / (cfg.to - cfg.start) * 100) + '%" title="' + esc(d.label) + '">' + glyph(d.kind) + "</span>";
    });
    h += '<input type="range" class="rm-range" min="' + cfg.start + '" max="' + cfg.to + '" step="' + cfg.step + '" value="' + state.t + '" aria-label="' + esc(cfg.scrubLabel + (cfg.today ? " (" + cfg.rel + "0 = " + label(0, "long") + ")" : "")) + '"></div>';
    track.innerHTML = h;
    var inp = $(".rm-range", track);
    inp.addEventListener("input", function () { seek(+inp.value); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); seek(state.t + (e.key === "PageUp" ? cfg.page : -cfg.page)); }
    });
    doc.documentElement.style.scrollPaddingTop = (ruler.offsetHeight + 16) + "px";
  }

  /* ---------- scrubbing: one owner pointer; touch waits for horizontal intent ---------- */
  var drag = null;
  function railT(x) {
    var r = $(".rm-scrub", track).getBoundingClientRect();
    return cfg.start + (x - r.left) / (r.width || 1) * (cfg.to - cfg.start);
  }
  function endDrag(restore) {
    if (!drag) return;
    var d = drag;
    drag = null;
    doc.body.classList.remove("rm-scrubbing");
    try { if (d.el.hasPointerCapture && d.el.hasPointerCapture(d.id)) d.el.releasePointerCapture(d.id); } catch (e) { /* ignore */ }
    if (restore) seek(d.t0);
  }
  function wireScrub() {
    ruler.addEventListener("pointerdown", function (e) {
      var t = e.target.closest(".rm-track");
      if (!t || drag || !e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      drag = { id: e.pointerId, el: t, x0: e.clientX, y0: e.clientY, t0: state.t, live: e.pointerType !== "touch" };
      try { t.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      var inp = $(".rm-range", track);
      if (inp) inp.focus({ preventScroll: true });
      if (drag.live) { e.preventDefault(); doc.body.classList.add("rm-scrubbing"); seek(railT(e.clientX)); }
    });
    ruler.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.live) {
        var dx = Math.abs(e.clientX - drag.x0), dy = Math.abs(e.clientY - drag.y0);
        if (dx < 6 || dx < dy) return;
        drag.live = true;
        doc.body.classList.add("rm-scrubbing");
      }
      seek(railT(e.clientX));
    });
    ruler.addEventListener("pointerup", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.live && Math.abs(e.clientX - drag.x0) < 10 && Math.abs(e.clientY - drag.y0) < 10) seek(railT(e.clientX));
      endDrag(false);
    });
    ruler.addEventListener("touchmove", function (e) { if (drag && drag.live && e.cancelable) e.preventDefault(); }, { passive: false });
    ruler.addEventListener("pointercancel", function (e) { if (drag && e.pointerId === drag.id) endDrag(false); });
    ruler.addEventListener("lostpointercapture", function (e) { if (drag && e.pointerId === drag.id) endDrag(false); });
    window.addEventListener("pointerup", function (e) { if (drag && e.pointerId === drag.id) endDrag(false); });
    window.addEventListener("blur", function () { endDrag(false); });
    doc.addEventListener("visibilitychange", function () { if (doc.hidden) endDrag(false); });
    doc.addEventListener("keydown", function (e) { if (drag && e.key === "Escape") { e.preventDefault(); endDrag(true); } }, true);
  }

  /* ---------- the cursor ---------- */
  function snap(t) {
    t = Math.round((t - cfg.start) / cfg.step) * cfg.step + cfg.start;
    return Math.max(cfg.start, Math.min(cfg.to, +t.toFixed(6)));
  }
  function seek(t, opts) {
    t = snap(t);
    if (t === state.t) return;
    state.t = t;
    applyCursor();
    announce();
    if (!(opts && opts.fromScroll) && state.mode === "v" && spineInView()) {
      var row = $('.rm-step[data-t="' + t + '"]', spine);
      if (row) scrollToRow(row);
    }
  }
  function applyCursor() {
    var t = state.t, row = rowAt(t);
    var inp = $(".rm-range", track);
    if (inp) {
      if (+inp.value !== t) inp.value = t;
      inp.setAttribute("aria-valuetext", timeText(t));
    }
    var f = $(".rm-fill", track);
    if (f) f.style.transform = "scaleX(" + ((t - cfg.start) / (cfg.to - cfg.start)) + ")";
    var passed = null;
    $$(".rm-det", track).forEach(function (d) { var on = t >= +d.getAttribute("data-at") - 1e-9; d.classList.toggle("passed", on); });
    detents().forEach(function (d) { if (t >= d.at - 1e-9) passed = d; });
    var pass = $(".rm-ro-pass", roRow);
    pass.hidden = !passed;
    if (passed) pass.textContent = passed.pass;
    var c = $(".rm-cursor", overlay);
    if (c) { c.style.transform = "translateX(" + pct(t) + "%)"; c.firstChild.setAttribute("data-l", relLabel(t)); }
    bindRow(doc, row, t);
    lanes.forEach(function (ln) {
      if (ln.kind !== "chart") return;
      var h = ln.fig && ln.fig._chart;
      if (h) { h.cursor(t); paintMarks(h, ln); }
    });
    $$("figure.chart[data-cursor]").forEach(function (fig) {
      var h = fig._chart, k = fig.getAttribute("data-cursor");
      if (h) h.cursor(k ? U.get(row, k) : t);
    });
    var cur = $(".rm-step.cur", spine);
    if (cur) cur.classList.remove("cur");
    var now = $('.rm-step[data-t="' + t + '"]', spine);
    if (now) now.classList.add("cur");
    markNav();
    R.emit("cursor", t, row);
  }
  var annT = 0;
  function announce() {
    clearTimeout(annT);
    annT = setTimeout(function () {
      var ro = $(".rm-readout", roRow);
      srStatus.textContent = timeText(state.t) + ". " + (ro ? visibleText(ro) : "");
    }, 600);
  }

  /* ---------- lanes (desktop) ---------- */
  function trackW() { var t = $(".rm-lane-items .lane-t, .rm-lane .lane-t", lanesBox); return t ? t.clientWidth : 800; }
  function renderLanes() {
    var W = trackW();
    lanes.forEach(function (ln) {
      if (ln.kind === "strip") drawStrip(ln, W);
      if (ln.kind !== "items") return;
      var its = items.filter(function (it) { return it.lane === ln.id && it.shown; }).sort(function (a, b) { return a.x - b.x; });
      ln.track.innerHTML = its.map(itemButton).join("");
      // stack into rows using measured label widths
      var ends = [], rh = 30, top0 = ln === lanes[0] ? 22 : 6;   // clear the "today" label in the first lane
      its.forEach(function (it) {
        var b = $('[data-rm-item="' + it.id + '"]', ln.track);
        if (!b) return;
        var x = pct(it.x) / 100 * W, lab = it.bar ? ($(".bl", b) || b).offsetWidth : b.offsetWidth;
        var xe = it.bar ? pct(it.soft || it.until) / 100 * W : x;
        var flip = x + lab > W + 78;
        var x1 = flip ? x - lab : x, x2 = flip ? Math.max(xe, x + 14) : Math.max(xe, x + lab);
        if (flip) b.classList.add("flip");
        var r = 0;
        while (ends[r] != null && ends[r] > x1 - 6) r++;
        ends[r] = x2;
        b.style.top = (top0 + r * rh) + "px";
      });
      ln.track.style.height = Math.max(ln.minH || 72, Math.max(1, ends.length) * rh + top0 + 4) + "px";
    });
    var h = "";
    if (cfg.from < 0) h += '<div class="rm-past" style="width:' + pct(0) + '%"><span>' + esc(cfg.pastLabel) + "</span></div>";
    if (cfg.from <= 0 && cfg.to >= 0) h += '<div class="rm-today" style="left:' + pct(0) + '%"><span>today' + (todayLong() ? " · " + esc(todayLong()) : "") + "</span></div>";
    h += '<div class="rm-cursor"><div class="rm-cursor-line"></div></div>';
    overlay.innerHTML = h;
  }
  function itemButton(it) {
    var pin = state.pinned.indexOf(it.id) >= 0;
    var aria = ' aria-label="' + esc(it.label + ", " + it.when + (kindName(it.kind) ? " (" + kindName(it.kind) + ")" : "")) + '" aria-pressed="' + pin + '"';
    var cls = (pin ? " pinned" : "") + (it.muted ? " muted" : "");
    if (it.bar) {
      var l = pct(it.at), w = Math.max(0.6, pct(it.until) - l), ws = it.soft && it.soft > it.until ? pct(it.soft) - pct(it.until) : 0;
      return '<button type="button" class="rm-bar bar-' + esc(it.style) + cls + (it.cont ? " cont" : "") + '" data-rm-item="' + it.id + '" style="left:' + l + "%;width:" + w + '%"' + aria + ">" +
        (ws > 0 ? '<span class="soft" style="width:' + (ws / w * 100) + '%"></span>' : "") + '<span class="bl">' + glyph(it.kind) + esc(it.label) + "</span>" +
        (it.cont ? '<span class="cont-ic">' + icon("right") + "</span>" : "") + "</button>";
    }
    return '<button type="button" class="rm-ms' + cls + '" data-rm-item="' + it.id + '" style="left:' + pct(it.x) + '%"' + aria + ">" +
      glyph(it.kind) + '<span class="ms-l">' + (it.edge ? icon("left") : "") + esc(it.label) + "</span></button>";
  }
  function drawStrip(ln, W) {
    var box = ln.svg, rs = rows(), narrow = state.mode === "v";
    var w = narrow ? box.clientWidth : W, h = 30;
    if (!w || !rs.length) { box.innerHTML = ""; return; }
    var x0 = narrow ? cfg.start : cfg.from, X = function (t) { return (Math.max(x0, Math.min(cfg.to, t)) - x0) / (cfg.to - x0) * w; };
    var g = "", runStart = null, runKey = null;
    var list = rs.filter(function (r) { return +r[cfg.x] >= cfg.start && +r[cfg.x] < cfg.to; });
    list.forEach(function (r, i) {
      var t = +r[cfg.x], key = r[ln.key], c = cats[key], x = X(t), xw = X(t + cfg.step) - x;
      var val = ln.valueKey ? " " + R.fmtFor(ln.sec, U.get(r, ln.valueKey)) : "";
      g += '<rect x="' + (x + 0.5).toFixed(1) + '" y="3" width="' + Math.max(0.5, xw - 1).toFixed(1) + '" height="' + (h - 6) + '" rx="2" class="rm-cell" style="fill:var(--s' + ((c ? c.i : 5) % 6 + 1) + ')"><title>' +
        esc(label(t, "long") + ": " + (c ? c.label : key) + val) + "</title></rect>";
      if (runKey !== key) { runStart = t; runKey = key; }
      var next = list[i + 1];
      if (!next || next[ln.key] !== key) {
        var rw = X(t + cfg.step) - X(runStart);
        if (rw > (c ? c.label.length * 6.6 + 12 : 60)) g += '<text x="' + (X(runStart) + 6) + '" y="' + (h / 2 + 4) + '" class="rm-cell-t">' + esc(c ? c.label : key) + "</text>";
      }
    });
    box.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(visibleText($(".lane-l", ln.sec))) + '">' + g + "</svg>";
  }

  /* ---------- lane charts: align the plot with the ruler, cursor marks, decade ticks ---------- */
  function laneOf(fig) { for (var i = 0; i < lanes.length; i++) if (lanes[i].fig === fig) return lanes[i]; return null; }
  function onChartDrawn(e) {
    var fig = e.target.closest && e.target.closest("figure.chart");
    var ln = fig && laneOf(fig), h = fig && fig._chart;
    if (!ln || !h || !h.drawn) return;
    alignChart(h, ln);
    paintMarks(h, ln);
  }
  function alignChart(h, ln) {
    var box = h.el;
    if (state.mode !== "h") {
      if (box.style.width) { box.style.width = ""; box.style.marginLeft = ""; }
      return;
    }
    var W = ln.track.clientWidth, sx = h.spec.x || {};
    if (!W || !h.drawn.x) return;
    var w = box.clientWidth, L = h.drawn.x(sx.min), Rr = w - h.drawn.x(sx.max);
    var a = pct(sx.min) / 100 * W, b = pct(sx.max) / 100 * W;
    var ml = a - L, width = b - a + L + Rr;
    if (Math.abs((parseFloat(box.style.marginLeft) || 0) - ml) > 0.5) box.style.marginLeft = ml + "px";
    if (Math.abs(w - width) > 0.5) box.style.width = width + "px";
  }
  function paintMarks(h, ln) {
    var svg = $("svg.rc-svg", h.el);
    if (!svg || !h.drawn || !h.drawn.y) return;
    var g = $(".rm-cm", svg);
    if (!g) { g = doc.createElementNS("http://www.w3.org/2000/svg", "g"); g.setAttribute("class", "rm-cm"); svg.appendChild(g); }
    var row = rowAt(state.t), xk = (h.spec.x || {}).key || cfg.x, out = "";
    if (row[xk] == null) { g.innerHTML = ""; return; }
    var x = h.drawn.x(+row[xk]);
    (h.spec.series || []).forEach(function (s, i) {
      var v = row[s.key];
      if (typeof v !== "number" || !isFinite(v) || s.cursor === false) return;
      var y = h.drawn.y(v), c = s.color || "var(--s" + ((i % 6) + 1) + ")";
      out += '<path class="rm-cm-mk" d="M' + x + " " + (y - 5.5) + " L" + (x + 6) + " " + (y + 4.5) + " L" + (x - 6) + " " + (y + 4.5) + 'Z" style="fill:' + c + '"/>';
      if (h.spec.cursorLabel === s.key) out += '<text class="rm-cm-t" x="' + (x + 8) + '" y="' + (y - 6) + '">' + esc(R.fmt(v, (h.spec.y || {}).format, h.spec.y || {}) + ((h.spec.y || {}).suffix || "")) + "</text>";
    });
    g.innerHTML = out;
  }


  /* ---------- vertical spine (narrow) ---------- */
  function renderSpine() {
    homeAll(spine);
    var sorted = items.filter(function (it) { return it.shown; }).sort(function (a, b) { return a.x - b.x; });
    var out = [], lastEra = null;
    function eraLi(e) { return '<li class="rm-vt-era era-' + esc(e.kind) + '"><span>' + esc(e.name) + "</span></li>"; }
    erasSorted.forEach(function (e) { if (e.until <= cfg.start + 1e-9) { out.push(eraLi(e)); lastEra = e; } });
    sorted.filter(function (it) { return it.x < cfg.start; }).forEach(function (it) { out.push(vtItem(it)); });
    if (cfg.from <= 0 && cfg.to >= 0) out.push('<li class="rm-vt-today"><span>Today' + (todayLong() ? " · " + esc(todayLong()) : "") + "</span>" + (cfg.todayNote ? "<small>" + esc(cfg.todayNote) + "</small>" : "") + "</li>");
    var tpl = stepTpl ? stepTpl.innerHTML : "";
    for (var t = cfg.start; t <= cfg.to + 1e-9; t = +(t + cfg.step).toFixed(6)) {
      var e = eraAt(t);
      if (e && e !== lastEra) { out.push(eraLi(e)); lastEra = e; }
      out.push('<li class="rm-step' + (t === state.t ? " cur" : "") + '" data-t="' + t + '"><span class="vm-m">' + esc(relLabel(t)) + '</span><span class="vm-d">' + (cfg.today ? esc(label(t, "short")) : "") + '</span><span class="vm-c">' + tpl + "</span></li>");
      var tt = t;
      sorted.filter(function (it) { return it.x >= cfg.start && (Math.floor(it.x / cfg.step + 1e-9) * cfg.step === tt || (tt + cfg.step > cfg.to && it.x > tt)); }).forEach(function (it) { out.push(vtItem(it)); });
    }
    spine.innerHTML = out.join("");
    $$(".rm-step", spine).forEach(function (li) {
      var t2 = +li.getAttribute("data-t");
      bindRow(li, rowAt(t2), t2);
      $$("[data-cursor-out],[data-cursor-time],[data-cursor-era],[data-cursor-if],[data-cursor-cat]", li).forEach(function (n) {
        ["out", "time", "era", "if", "cat"].forEach(function (k) { n.removeAttribute("data-cursor-" + k); });
      });
    });
    sorted.forEach(function (it) {
      if (!isOpen(it)) return;
      var card = $('[data-rm-vcard="' + it.id + '"]', spine);
      if (card) card.insertBefore(it.body, card.firstChild);
    });
  }
  function isOpen(it) { return !!state.open[it.id] || state.pinned.indexOf(it.id) >= 0; }
  function vtItem(it) {
    var open = isOpen(it), pin = state.pinned.indexOf(it.id) >= 0;
    return '<li class="rm-vt-item' + (it.x < cfg.start ? " past" : "") + (open ? " open" : "") + (it.muted ? " muted" : "") + '">' +
      '<button type="button" class="rm-vt-btn" data-rm-vt="' + it.id + '" aria-expanded="' + open + '">' + glyph(it.kind) +
      '<span class="vt-t">' + esc(it.label) + '</span><span class="vt-w">' + esc(it.when) + "</span></button>" +
      '<div class="rm-vcard" data-rm-vcard="' + it.id + '"' + (open ? "" : " hidden") + '><div class="rm-act"><button type="button" class="rm-btn" data-rm-pin="' + it.id + '" aria-pressed="' + pin + '">' + (pin ? "Unpin" : "Pin to keep open") + "</button></div></div></li>";
  }
  function spineInView() {
    var ru = ruler.getBoundingClientRect(), vt = spine.getBoundingClientRect();
    return ru.top <= 0.5 && vt.top < innerHeight && vt.bottom > ru.bottom;
  }
  var syncLock = 0;
  function scrollToRow(row) {
    var top = row.getBoundingClientRect().top + scrollY - ruler.offsetHeight - 8;
    syncLock = Date.now();
    window.scrollTo({ top: top, behavior: "auto" });
  }

  /* ---------- cards: preview, pin, tray ---------- */
  function home(it) { if (it.body.parentNode !== it.node) it.node.appendChild(it.body); }
  function homeAll(scope) { items.forEach(function (it) { if (scope.contains(it.body)) home(it); }); }
  function stripIds(node) {
    $$("[id]", node).forEach(function (n) { n.removeAttribute("id"); });
    $$(".ev-note-btn, .ev-note, details.more, .more", node).forEach(function (n) { n.remove(); });
  }
  var popTimer = 0;
  function showPop(btn) {
    var id = btn.getAttribute("data-rm-item"), it = byId[id];
    if (!it) return;
    clearTimeout(popTimer);
    state.popFor = id;
    $$('[aria-describedby="rm-pop"]', lanesBox).forEach(function (x) { x.removeAttribute("aria-describedby"); });
    pop.id = "rm-pop";
    btn.setAttribute("aria-describedby", "rm-pop");
    var c = it.body.cloneNode(true);
    stripIds(c);
    var hasMore = !!$("details.more, .more", it.body), pin = state.pinned.indexOf(id) >= 0;
    pop.innerHTML = '<div class="rm-pop-meta">' + glyph(it.kind) + "<span>" + esc(it.when) + "</span></div>";
    pop.appendChild(c);
    var act = el("div", { class: "rm-act" });
    act.innerHTML = '<button type="button" class="rm-btn" data-rm-pin="' + id + '" aria-pressed="' + pin + '">' + (pin ? "Unpin" : "Pin to keep open") + "</button>" +
      (hasMore && !pin ? '<span class="rm-hint">Pin it to see the detail and derivation.</span>' : "");
    pop.appendChild(act);
    pop.setAttribute("aria-label", it.label);
    var was = pop.hidden;
    pop.hidden = false;
    if (was) { pop.classList.remove("in"); requestAnimationFrame(function () { pop.classList.add("in"); }); }
    var r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), innerWidth - pw - 8);
    var top = r.bottom + 8;
    if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 8);
    pop.style.left = (left + scrollX) + "px";
    pop.style.top = (top + scrollY) + "px";
  }
  function hidePop(delay) {
    clearTimeout(popTimer);
    popTimer = setTimeout(function () {
      pop.classList.remove("in");
      state.popFor = null;
      $$('[aria-describedby="rm-pop"]', lanesBox).forEach(function (x) { x.removeAttribute("aria-describedby"); });
      popTimer = setTimeout(function () { pop.hidden = true; }, delay ? 90 : 0);
    }, delay || 0);
  }
  function togglePin(id, scroll) {
    var it = byId[id];
    if (!it) return;
    var i = state.pinned.indexOf(id);
    if (i >= 0) state.pinned.splice(i, 1); else state.pinned.push(id);
    if (state.mode === "h") {
      $$('[data-rm-item="' + id + '"]', lanesBox).forEach(function (b) { b.classList.toggle("pinned", i < 0); b.setAttribute("aria-pressed", String(i < 0)); });
      renderTray();
      if (i < 0 && trayCards[id]) arrive(trayCards[id], scroll);
    } else {
      if (i >= 0) state.open[id] = false; else state.open[id] = true;
      renderSpine();
      var nb = $('[data-rm-vt="' + id + '"]', spine);
      if (nb) nb.focus({ preventScroll: true });
    }
    pinJump();
  }
  function arrive(card, scroll) {
    if (!R.reduceMotion) { card.classList.remove("arrive"); void card.offsetWidth; card.classList.add("arrive"); }
    if (scroll) card.scrollIntoView({ block: "nearest", behavior: R.reduceMotion ? "auto" : "smooth" });
  }
  function renderTray() {
    var want = state.mode === "h" ? state.pinned : [];
    Object.keys(trayCards).forEach(function (id) {
      if (want.indexOf(id) < 0) { home(byId[id]); trayCards[id].remove(); delete trayCards[id]; }
    });
    want.forEach(function (id) {
      var it = byId[id], card = trayCards[id];
      if (!card) {
        card = el("article", { class: "rm-pcard", "data-rm-card": id });
        card.innerHTML = '<div class="rm-pc-top"><span class="rm-pc-when"></span><button type="button" class="rm-x" data-rm-pin="' + id + '" aria-label="Unpin ' + esc(it.title) + '">' + icon("close") + "</button></div>" +
          '<p class="rm-hint rm-pc-off" hidden>Not on the timeline at these settings.</p><div class="rm-act"><button type="button" class="rm-btn" data-rm-pin="' + id + '" aria-pressed="true">Unpin</button></div>';
        card.insertBefore(it.body, $(".rm-act", card));
        trayGrid.appendChild(card);
        trayCards[id] = card;
      }
      $(".rm-pc-when", card).textContent = it.when;
      $(".rm-pc-off", card).hidden = it.shown && !it.off;
      card.classList.toggle("wide", it.node.hasAttribute("data-wide") || !!$("figure, table, .reconcile", it.body));
    });
    tray.hidden = !want.length;
    pinJump();
  }
  function pinJump() {
    var pj = $(".rm-pin-jump", navBox);
    if (!pj) return;
    pj.hidden = !(state.pinned.length && state.mode === "h");
    pj.innerHTML = "Pinned (" + state.pinned.length + ") " + icon("down");
  }
  function openItem(it, target) {
    if (state.mode === "h") {
      if (state.pinned.indexOf(it.id) < 0) togglePin(it.id, false);
    } else if (!isOpen(it)) {
      state.open[it.id] = true;
      renderSpine();
    }
    if (!target || target === it.node) {
      setTimeout(function () {
        var c = state.mode === "h" ? trayCards[it.id] : $('[data-rm-vt="' + it.id + '"]', spine);
        if (c) { c.scrollIntoView({ block: "start", behavior: "auto" }); if (state.mode === "h") arrive(c, false); }
      }, 0);
    }
  }
  function revealer(target) {
    if (!root) return false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (target === it.node || it.body.contains(target)) {
        if (target !== it.node && !it.node.contains(it.body)) return false;  // already open somewhere visible
        openItem(it, target);
        return true;
      }
    }
    return false;
  }

  /* ---------- navigation ---------- */
  var navSecs = [];
  function buildNav() {
    var list = [];
    var tl = $("section.tldr");
    if (tl) list.push({ el: tl, label: tl.getAttribute("data-nav") || "TL;DR" });
    list.push({ el: root, label: root.getAttribute("data-nav") || (($(":scope > h2", root) || {}).textContent || "Timeline").trim() });
    $$("section.block").forEach(function (s) {
      if (!s.id) s.id = U.slugify(($("h2", s) || {}).textContent || "section");
      list.push({ el: s, label: s.getAttribute("data-nav") || (($("h2", s) || {}).textContent || s.id).trim() });
    });
    navSecs = list;
    navBox.innerHTML = list.map(function (n) { return '<a href="#' + n.el.id + '" data-rm-nav="' + n.el.id + '">' + esc(n.label) + "</a>"; }).join("") +
      '<a href="#rm-tray" class="rm-pin-jump" hidden></a>';
  }
  function markNav() {
    if (!navSecs.length) return;
    var cur = null, probe = ruler.getBoundingClientRect().bottom + 30;
    navSecs.forEach(function (n) { if (n.el.getBoundingClientRect().top <= probe) cur = n.el.id; });
    if (innerHeight + scrollY >= doc.documentElement.scrollHeight - 4) cur = navSecs[navSecs.length - 1].el.id;
    $$("a[data-rm-nav]", navBox).forEach(function (a) {
      var on = a.getAttribute("data-rm-nav") === cur;
      if (on) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
      if (on && a.getAttribute("data-on") !== "1") navBox.scrollLeft = Math.max(0, a.offsetLeft - navBox.clientWidth / 2 + a.offsetWidth / 2);
      a.setAttribute("data-on", on ? "1" : "0");
    });
  }
  function onScroll() {
    markNav();
    if (state.mode !== "v" || Date.now() - syncLock < 150 || !spineInView()) return;
    var probe = ruler.getBoundingClientRect().bottom + 12, cur = null;
    $$(".rm-step", spine).forEach(function (r) { if (r.getBoundingClientRect().top <= probe) cur = +r.getAttribute("data-t"); });
    if (cur != null && cur !== state.t) seek(cur, { fromScroll: true });
  }

  /* ---------- lifecycle ---------- */
  function setMode() {
    var m = mqNarrow.matches ? "v" : "h";
    if (m === state.mode) return false;
    state.mode = m;
    doc.documentElement.classList.toggle("rm-v", m === "v");
    doc.documentElement.classList.toggle("rm-h", m === "h");
    homeAll(doc.body);
    Object.keys(trayCards).forEach(function (id) { trayCards[id].remove(); delete trayCards[id]; });
    spine.innerHTML = "";
    lanes.forEach(function (ln) { if (ln.kind === "items") ln.track.innerHTML = ""; });
    hidePop(0);
    return true;
  }
  function layout() {
    resolve();
    renderRuler();
    if (state.mode === "h") renderLanes(); else { renderSpine(); lanes.forEach(function (ln) { if (ln.kind === "strip") drawStrip(ln); }); }
    renderTray();
    applyCursor();
  }
  function wire() {
    var lastPtr = "mouse";
    lanesBox.addEventListener("pointerdown", function (e) { lastPtr = e.pointerType; }, true);
    lanesBox.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;
      var b = e.target.closest("[data-rm-item]");
      if (b && b.getAttribute("data-rm-item") !== state.popFor) showPop(b); else if (b) clearTimeout(popTimer);
    });
    lanesBox.addEventListener("pointerout", function (e) {
      if (e.pointerType === "touch") return;
      var b = e.target.closest("[data-rm-item]");
      if (b && !b.contains(e.relatedTarget)) hidePop(260);
    });
    lanesBox.addEventListener("focusin", function (e) { var b = e.target.closest("[data-rm-item]"); if (b && lastPtr !== "touch") showPop(b); });
    lanesBox.addEventListener("focusout", function (e) { if (!pop.contains(e.relatedTarget) && lastPtr !== "touch") hidePop(150); });
    lanesBox.addEventListener("click", function (e) {
      var b = e.target.closest("[data-rm-item]");
      if (b) {
        var id = b.getAttribute("data-rm-item");
        if (lastPtr === "touch" && state.popFor !== id && state.pinned.indexOf(id) < 0) { showPop(b); lastPtr = "mouse"; return; }
        togglePin(id, true);
        hidePop(0);
        lastPtr = "mouse";
        return;
      }
      var tr = e.target.closest(".rm-lane-chart .lane-t, .rm-lane-strip .lane-t");
      if (tr && state.mode === "h") {
        var r = tr.getBoundingClientRect(), t = cfg.from + (e.clientX - r.left) / r.width * (cfg.to - cfg.from);
        if (t >= cfg.start - cfg.step / 2 && t <= cfg.to + cfg.step / 2) seek(t);
      }
    });
    doc.addEventListener("pointerdown", function (e) { if (!pop.hidden && !e.target.closest(".rm-pop, [data-rm-item]")) hidePop(0); });
    pop.addEventListener("pointerenter", function () { clearTimeout(popTimer); });
    pop.addEventListener("pointerleave", function () { hidePop(200); });
    doc.addEventListener("click", function (e) {
      var p = e.target.closest("[data-rm-pin]");
      if (p) { togglePin(p.getAttribute("data-rm-pin"), true); if (p.closest(".rm-pop")) hidePop(0); return; }
      var vb = e.target.closest("[data-rm-vt]");
      if (vb) {
        var id = vb.getAttribute("data-rm-vt");
        if (state.pinned.indexOf(id) >= 0) return;
        var was = !!state.open[id];
        Object.keys(state.open).forEach(function (k) { state.open[k] = false; });
        state.open[id] = !was;
        renderSpine();
        var nb = $('[data-rm-vt="' + id + '"]', spine);
        if (nb) {
          nb.focus({ preventScroll: true });
          if (!was && nb.getBoundingClientRect().top < ruler.getBoundingClientRect().bottom) scrollToRow(nb);
        }
        return;
      }
      if (e.target.closest("[data-rm-unpin-all]")) {
        state.pinned = [];
        renderTray();
        $$("[data-rm-item].pinned", lanesBox).forEach(function (b) { b.classList.remove("pinned"); b.setAttribute("aria-pressed", "false"); });
      }
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !pop.hidden) {
        var f = state.popFor;
        hidePop(0);
        var b = f && $('[data-rm-item="' + f + '"]', lanesBox);
        if (b) b.focus();
      }
    });
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; onScroll(); });
    }, { passive: true });
    var rz = 0, lastW = innerWidth;
    window.addEventListener("resize", function () {
      endDrag(false);
      hidePop(0);
      clearTimeout(rz);
      rz = setTimeout(function () {
        var changed = setMode();
        if (changed || innerWidth !== lastW) { lastW = innerWidth; layout(); lanes.forEach(function (ln) { if (ln.fig && ln.fig._chart) ln.fig._chart.render(); }); }
      }, 120);
    });
    doc.addEventListener("chart:drawn", onChartDrawn);
  }
  function evidenceMarks() {
    $$(".ev[data-ev]").forEach(function (n) {
      var k = R.evKinds(n);
      if (k.length < 2 || $(":scope > .rm-mk2", n)) return;
      n.insertBefore(el("span", { class: "rm-mk2", "data-ev2": k[1], "aria-hidden": "true" }), n.firstChild);
    });
  }

  R.hook("setup", setup);
  R.hook("ready", function () {
    evidenceMarks();
    $$("[data-controls]").forEach(function (box) {
      var keys = (box.getAttribute("data-controls") || "").split(/[\s,]+/).filter(Boolean);
      R.controls(box, keys.length ? { keys: keys } : {});
    });
    if (!root) return;
    state.t = snap(cfg.cursor0);
    setMode();
    buildNav();
    wire();
    wireScrub();
    layout();
    R.on("update", function () { hidePop(0); layout(); });
    R.addRevealer(revealer);
    R.observeResize(lanesBox, function () { if (state.mode === "h") { renderRuler(); renderLanes(); applyCursor(); } });
  });

  window.Roadmap = {
    seek: function (t) { seek(t); },
    get t() { return state.t; },
    row: function (t) { return rowAt(t == null ? state.t : t); },
    pin: function (id) { if (state.pinned.indexOf(id) < 0) togglePin(id, false); },
    unpin: function (id) { if (state.pinned.indexOf(id) >= 0) togglePin(id, false); },
    get pinned() { return state.pinned.slice(); },
    label: function (t, form) { return timeText(t, form); },
    toT: function (date) { return dateToT(date); }
  };
})();
