/* Cockpit template engine: a live dashboard set as a light datasheet.
   Reads the page's markup and the model through the Report API; generates only chrome:
   - Conditions band: a slider per model param, "typ" tick at the report default,
     "Reset to report (N changed)"; on phones a peek line + "Adjust" bottom sheet
   - side rail from .board-sec (bottom tab bar on phones), active section on scroll
   - tiles (.tile) with a Details button; a master/detail drawer with Summary / Evidence /
     Derivation tabs (the tile's .tab[data-tab] children), a modal bottom sheet on phones
   - lettered evidence dots (S/E/A/I) after every .ev[data-ev]
   - meters ([data-meter]), line-chart legends, "recomputed" trace on tiles
   Markup contract: references/templates/cockpit.md. Topic-agnostic: no content here. */
(function () {
  "use strict";
  var R = window.Report;
  if (!R) return;
  var U = R.util, $ = U.$, $$ = U.$$, el = U.el, esc = U.esc;
  var doc = document;
  var mq = window.matchMedia("(max-width: 899px)");
  var reduce = R.reduceMotion;
  var TABS = ["summary", "evidence", "derivation"];
  var TAB_NAMES = { summary: "Summary", evidence: "Evidence", derivation: "Derivation" };

  /* 16×16 stroke icons for the rail; data-icon may also be a raw SVG path ("M2 2h5…") */
  var ICONS = {
    grid: "M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z",
    chart: "M2 14V2M2 14h12M4 11l3-4 3 2 4-6",
    bars: "M2 14h12M4 14V8M8 14V3M12 14V6",
    boxes: "M5 2h6v3H5zM2 11h4v3H2zM10 11h4v3h-4zM8 5v3M4 11V8h8v3",
    table: "M2 3h12M2 8h12M2 13h12M6 1v14M10 1v14",
    split: "M2 4h5M9 12h5M4.5 2v4M11.5 10v4M8 1v14",
    flag: "M3 2v12M3 3h9l-2 3 2 3H3",
    doc: "M3 2h8l2 2v10H3zM5 6h6M5 9h6M5 12h4",
    list: "M5 4h9M5 8h9M5 12h9M2 4h.5M2 8h.5M2 12h.5",
    clock: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 5v3l2 2",
    alert: "M8 2l6.5 12h-13zM8 7v3M8 12v.5",
    gauge: "M2 12a6 6 0 0 1 12 0M8 12l3-4",
    map: "M2 4l4-2 4 2 4-2v10l-4 2-4-2-4 2zM6 2v10M10 4v10",
    layers: "M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3",
    users: "M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c.5-3 2.3-4.5 4.5-4.5s4 1.5 4.5 4.5M11 2.5a2.5 2.5 0 0 1 0 4.8M12.5 9.8c1 .6 1.7 2 2 4.2",
    check: "M2 8.5l4 4 8-9",
    info: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 7v4.5M8 4.8v.4"
  };
  function icon(name) {
    var d = ICONS[name] || (/^[Mm][\d\s.,-]/.test(name || "") ? name : ICONS.grid);
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + esc(d) + '"/></svg>';
  }
  function dotHTML(kind) {
    var d = R.EV[kind];
    return d ? '<span class="ev-dot" data-ev="' + kind + '" role="img" aria-label="' + esc(d.name) + '" title="' + esc(d.long) + '">' + d.letter + "</span>" : "";
  }
  function cls(node, c, on) { node.classList.toggle(c, !!on); }

  var tiles = [];          // {el, id, title, sec, tabs: {summary: node, …}, btn}
  var byId = {};
  var sections = [];       // {el, id, label, short, icon}
  var st = { open: null, tab: "summary" };
  var ui = {};             // drawer, scrim, body, …
  var condKeys = [];
  var mirrors = [];        // chart handles drawn inside the mobile sheet

  R.hook("setup", setup);
  R.hook("ready", ready);

  /* ================= setup: build chrome from markup (before core wiring) ================= */
  function setup() {
    doc.body.classList.add("cockpit");
    var main = $("main") || $(".board");
    if (!main) return;
    main.classList.add("board");
    if (!main.id) main.id = "main";
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    var shell = main.closest(".shell");
    if (!shell) {
      shell = el("div", { class: "shell" });
      main.parentNode.insertBefore(shell, main);
      shell.appendChild(main);
    }
    buildSections(main);
    buildRail(shell, main);
    buildTiles();
    buildDrawer();
    buildConditions();
    $$("table.compare").forEach(stackLabels);
  }

  function buildSections(main) {
    $$(".board-sec", main).forEach(function (sec, i) {
      var h2 = $(":scope > .sec-h h2, :scope > h2", sec);
      var label = sec.getAttribute("data-label") || (h2 ? h2.textContent.trim() : "Section " + (i + 1));
      if (!sec.id) sec.id = "sec-" + U.slugify(label);
      if (h2 && !h2.id) h2.id = sec.id + "-h";
      if (h2) sec.setAttribute("aria-labelledby", h2.id);
      sections.push({ el: sec, id: sec.id, label: label, short: sec.getAttribute("data-short") || label, icon: sec.getAttribute("data-icon") || "grid" });
    });
  }

  function buildRail(shell, main) {
    if (!sections.length) return;
    var nav = el("nav", { class: "rail", id: "cp-rail", "aria-label": "Board sections" });
    nav.innerHTML = sections.map(function (s) {
      return '<a href="#' + s.id + '" data-sec="' + s.id + '" title="' + esc(s.label) + '">' + icon(s.icon) +
        '<span class="lbl-long">' + esc(s.label) + '</span><span class="lbl-short">' + esc(s.short) + "</span></a>";
    }).join("") + '<p class="rail-hint">Select a tile to open its details. Esc closes.</p>' +
      '<div class="rail-legend" data-ev-legend="all" aria-hidden="true"></div>';
    shell.insertBefore(nav, main);
  }

  function buildTiles() {
    $$(".board-sec > .tile, .board > .tile").forEach(function (t, i) {
      var h = $(":scope > h3, :scope > header h3", t);
      var title = h ? h.textContent.trim() : "Tile " + (i + 1);
      if (!t.id) t.id = "t-" + U.slugify(title);
      if (byId[t.id]) t.id += "-" + i;
      if (h && !h.id) h.id = t.id + "-h";
      if (h) t.setAttribute("aria-labelledby", h.id);
      var tabs = {};
      $$(":scope > .tab[data-tab]", t).forEach(function (n) {
        var k = n.getAttribute("data-tab");
        if (TABS.indexOf(k) >= 0 && !tabs[k]) tabs[k] = n;
      });
      var openable = Object.keys(tabs).length > 0;
      var head = el("header", { class: "tile-h" });
      if (h) head.appendChild(h);
      var btn = null;
      if (openable) {
        btn = el("button", { type: "button", class: "tile-open", "aria-expanded": "false", "aria-controls": "cp-drawer", "aria-label": "Open details: " + title });
        btn.innerHTML = '<span class="txt">Details </span>›';
        head.appendChild(btn);
        t.setAttribute("data-openable", "");
      }
      var body = el("div", { class: "tile-b" });
      Array.prototype.slice.call(t.childNodes).forEach(function (c) {
        if (c.nodeType === 1 && c.classList.contains("tab")) return;
        body.appendChild(c);
      });
      t.insertBefore(body, t.firstChild);
      t.insertBefore(head, body);
      var sec = t.closest(".board-sec");
      var rec = { el: t, id: t.id, title: title, sec: sec ? sec.id : "", tabs: tabs, btn: btn, body: body, openable: openable };
      tiles.push(rec);
      byId[t.id] = rec;
    });
  }

  function buildDrawer() {
    var d = el("aside", { class: "drawer", id: "cp-drawer", role: "dialog", "aria-labelledby": "cp-drawer-title", hidden: "" });
    d.innerHTML =
      '<div class="drawer-h"><p class="crumb" id="cp-drawer-title"></p><div class="drawer-nav">' +
      '<button type="button" class="icon-btn" data-step="-1" aria-label="Previous tile">‹</button>' +
      '<button type="button" class="icon-btn" data-step="1" aria-label="Next tile">›</button>' +
      '<button type="button" class="icon-btn" data-close aria-label="Close details (Esc)">✕</button></div></div>' +
      '<div class="tabs" role="tablist" aria-label="Depth">' + TABS.map(function (k) {
        return '<button type="button" role="tab" id="cp-tab-' + k + '" data-tab="' + k + '" aria-controls="cp-drawer-body">' + TAB_NAMES[k] + "</button>";
      }).join("") + "</div>" +
      '<div class="drawer-b" id="cp-drawer-body" role="tabpanel" tabindex="0"></div>' +
      '<p class="drawer-legend" data-ev-legend="all"></p>';
    var scrim = el("div", { class: "scrim", id: "cp-scrim", hidden: "" });
    doc.body.appendChild(scrim);
    doc.body.appendChild(d);
    ui.drawer = d; ui.scrim = scrim; ui.body = $("#cp-drawer-body", d); ui.crumb = $("#cp-drawer-title", d);
  }

  /* ---------- Conditions band ---------- */
  function buildConditions() {
    var band = $(".conditions");
    if (!band) return;
    var spec = R.spec;
    if (!spec) { band.remove(); return; }
    var all = (spec.params || []).filter(function (p) { return !p.hidden; }).map(function (p) { return p.key; });
    condKeys = band.getAttribute("data-keys") ? band.getAttribute("data-keys").split(/[\s,]+/).filter(function (k) { return R.param(k); }) : all;
    if (!condKeys.length) { band.remove(); return; }
    var h2 = $("h2", band), sub = $(".cond-sub", band), peek = $(".cond-peek", band);
    var authorPeek = !!(peek && peek.textContent.trim());
    var titleTxt = h2 ? h2.textContent.trim() : "Conditions";
    if (!band.getAttribute("aria-label")) band.setAttribute("aria-label", titleTxt);
    var peekRow = el("div", { class: "cond-peek-row" });
    if (!peek) peek = el("p", { class: "cond-peek" });
    peek.classList.add("cond-peek");
    peek.setAttribute("aria-live", "polite");
    peekRow.appendChild(peek);
    peek.appendChild(el("span", { class: "peek-changed" }));
    var adjust = el("button", { type: "button", class: "btn cond-adjust", "aria-expanded": "false", "aria-controls": "cp-cond-panel", "aria-label": "Adjust " + titleTxt.toLowerCase() }, "Adjust");
    peekRow.appendChild(adjust);
    var panel = el("div", { class: "cond-panel", id: "cp-cond-panel" });
    var head = el("div", { class: "cond-head" });
    var title = el("h2", { class: "cond-title" }, titleTxt);
    if (sub) { var s = el("span", { class: "muted" }); s.innerHTML = sub.innerHTML; title.appendChild(s); }
    head.appendChild(title);
    var acts = el("div", { class: "cond-actions" });
    var reset = el("button", { type: "button", class: "btn ghost cond-reset" }, "Reset to report");
    var done = el("button", { type: "button", class: "btn cond-done" }, "Done");
    acts.appendChild(reset); acts.appendChild(done);
    head.appendChild(acts);
    panel.appendChild(head);
    var grid = el("div", { class: "sliders" });
    var n = condKeys.length;
    var firstLog = R.param(condKeys[0]).log;
    grid.style.setProperty("--cols", n <= 6 ? (firstLog && n > 1 ? "1.5fr repeat(" + (n - 1) + ", minmax(0, 1fr))" : "repeat(" + n + ", minmax(0, 1fr))") : "repeat(auto-fill, minmax(180px, 1fr))");
    var labels = (band.getAttribute("data-labels") || "").split("|");
    condKeys.forEach(function (k, i) { grid.appendChild(slider(R.param(k), R.param(k).short || (labels[i] || "").trim())); });
    panel.appendChild(grid);
    band.innerHTML = "";
    band.appendChild(peekRow);
    band.appendChild(panel);
    if (!authorPeek) {
      // no author peek: the first three conditions
      var gen = el("span", { class: "peek-gen" });
      gen.innerHTML = condKeys.slice(0, 3).map(function (k) { return '<b data-param-value="' + k + '"></b>'; }).join(" · ");
      peek.insertBefore(gen, peek.firstChild);
    }
    ui.band = band; ui.panel = panel; ui.adjust = adjust; ui.reset = reset; ui.done = done; ui.peek = peek;
  }
  function frac(p, v) {
    if (p.log) return (Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min));
    return (v - p.min) / ((p.max - p.min) || 1);
  }
  function slider(p, short) {
    var id = "cp-p-" + U.slugify(p.key);
    var D = R.defaults[p.key];
    var wrap = el("div", { class: "sl" + (p.log ? " log" : ""), "data-key": p.key });
    var top = el("div", { class: "sl-top" });
    var lab = el("label", { for: id, title: p.label || p.key }, short || p.label || p.key);
    if (p.ev) {
      R.evKinds({ getAttribute: function () { return p.ev; } }).forEach(function (k) { lab.insertAdjacentHTML("beforeend", " " + dotHTML(k)); });
    }
    top.appendChild(lab);
    var val = el("span", { class: "sl-val" });
    if (p.options) {
      top.appendChild(val);
      wrap.appendChild(top);
      var sel = el("select", { id: id, "data-param": p.key });
      wrap.appendChild(sel);
    } else {
      if (p.log) {
        val.appendChild(el("input", { type: "number", inputmode: "numeric", id: id + "-n", "data-param": p.key, "aria-label": (p.label || p.key) + " (exact)", "aria-describedby": id + "-msg" }));
        if (p.unit) val.insertAdjacentHTML("beforeend", ' <span class="muted">' + esc(p.unit) + "</span>");
      } else {
        val.appendChild(el("output", { for: id, "data-param-value": p.key }));
      }
      top.appendChild(val);
      wrap.appendChild(top);
      var track = el("div", { class: "sl-track" });
      track.appendChild(el("input", { type: "range", id: id, "data-param": p.key, "aria-describedby": id + "-d" }));
      if (typeof D === "number" && p.min != null && p.max != null) {
        var f = Math.max(0, Math.min(1, frac(p, D)));
        var typ = el("span", { class: "sl-typ", title: "Report default: " + R.paramFmt(p.key, D), "aria-hidden": "true" }, "typ");
        typ.style.setProperty("--f", f.toFixed(4));
        track.appendChild(typ);
      }
      wrap.appendChild(track);
    }
    wrap.appendChild(el("p", { class: "sl-msg", id: id + "-msg", role: "status", "aria-live": "polite" }));
    wrap.appendChild(el("span", { id: id + "-d", hidden: "" }, (p.note || "") + (p.log ? " Logarithmic slider; type an exact value in the box." : "")));
    return wrap;
  }

  /* compare tables: column labels on cells so they can stack on narrow boards */
  function stackLabels(t) {
    var heads = $$("thead th", t).map(function (th) { return th.textContent.trim(); });
    if (heads.length < 3) return;
    t.setAttribute("data-stack", "");
    $$("tbody tr", t).forEach(function (tr) {
      var i = 0;
      Array.prototype.slice.call(tr.children).forEach(function (c) {
        if (c.tagName === "TD" && heads[i] && !c.hasAttribute("data-label")) c.setAttribute("data-label", heads[i]);
        i += Number(c.getAttribute("colspan") || 1);
      });
    });
  }

  /* ================= ready: core has wired citations, evidence, model, charts ================= */
  function ready() {
    evidenceDots(doc);
    $$("figure.chart").forEach(function (f) { lineLegend(f); });
    meters();
    wireConditions();
    wireDrawer();
    wireNav();
    trace();
    R.addRevealer(revealInTab);
    positionDrawer();
    window.addEventListener("resize", positionDrawer);
    mq.addEventListener("change", function () { if (st.open) openTile(st.open, false); closeParams(true); syncModal(); });
  }

  /* ---------- evidence dots ---------- */
  function evidenceDots(scope) {
    $$(".ev[data-ev]", scope).forEach(function (n) {
      if (n._dots) return;
      n._dots = true;
      var kinds = R.evKinds(n);
      if (!kinds.length) return;
      var btn = $(":scope > .ev-note-btn", n), note = $(":scope > .ev-note", n);
      var noteKind = btn ? (kinds.indexOf("estimate") >= 0 ? "estimate" : kinds[0]) : null;
      var nodes = kinds.map(function (k) {
        if (k === noteKind) {
          btn.classList.add("ev-dot");
          btn.setAttribute("data-ev", k);
          btn.textContent = R.EV[k].letter;
          btn.title = R.EV[k].long + ". Click for how it was worked out.";
          return btn;
        }
        var s = el("span");
        s.innerHTML = dotHTML(k);
        return s.firstChild;
      });
      var host = n;
      if (/^(DIV|SECTION|ASIDE|BLOCKQUOTE)$/.test(n.tagName)) {
        var last = Array.prototype.slice.call(n.children).filter(function (c) { return /^(P|LI|SPAN)$/.test(c.tagName) && !c.classList.contains("ev-note"); }).pop();
        if (last) host = last;
      }
      nodes.forEach(function (d) {
        if (host === n && note) n.insertBefore(d, note);
        else host.appendChild(d);
      });
    });
  }

  /* ---------- line chart legends (line swatches, dashed where the series is) ---------- */
  function specOf(fig) {
    var s = $('script[type="application/json"]', fig);
    if (!s) return null;
    try { return JSON.parse(s.textContent); } catch (e) { return null; }
  }
  function lineLegend(fig, spec) {
    spec = spec || specOf(fig);
    if (!spec || spec.type !== "line" || spec.legend === false || $(":scope > .ch-legend", fig) || !window.ReportCharts) return;
    var html = window.ReportCharts.legend(spec.series || []);
    if (!html) return;
    var lg = el("div", { class: "ch-legend", "aria-hidden": "true" });
    lg.innerHTML = html;
    var box = $(":scope > .rc-chart", fig);
    fig.insertBefore(lg, box || fig.firstChild);
  }

  /* ---------- meters: <div class="meter" data-meter="path" data-max="5000 | path"> ---------- */
  function meters() {
    function upd(scope) {
      $$(".meter[data-meter]", scope || doc).forEach(function (m) {
        var bar = $(":scope > .meter-bar", m);
        if (!bar) { bar = el("div", { class: "meter-bar", role: "img" }); bar.appendChild(el("i")); m.appendChild(bar); }
        var v = Number(R.value(m.getAttribute("data-meter")));
        var mx = m.getAttribute("data-max");
        var max = isNaN(mx) ? Number(R.value(mx)) : Number(mx);
        var ok = isFinite(v) && isFinite(max) && max > 0;
        var i = bar.firstChild;
        i.style.width = ok ? Math.min(100, Math.max(0, v / max * 100)) + "%" : "100%";
        cls(i, "over", ok && v > max);
        var lab = $(".meter-top", m);
        bar.setAttribute("aria-label", (lab ? lab.textContent.replace(/\s+/g, " ").trim() : "") + (ok && v > max ? " (over)" : ""));
      });
    }
    upd();
    R.on("update", function () { upd(); });
  }

  /* ---------- trace: tiles whose figures changed on the last condition change ---------- */
  function trace() {
    var last = {};
    var timer = 0;
    tiles.forEach(function (t) { last[t.id] = t.body.textContent; });
    R.on("update", function (res, params, changed) {
      if (!changed || !changed.length) return;
      tiles.forEach(function (t) {
        var now = t.body.textContent;
        if (now !== last[t.id]) { t.el.classList.add("is-recomputed"); last[t.id] = now; }
      });
      clearTimeout(timer);
      timer = setTimeout(function () { $$(".tile.is-recomputed").forEach(function (n) { n.classList.remove("is-recomputed"); }); }, 900);
    });
  }

  /* ---------- Conditions: state, log keys, reset, mobile sheet ---------- */
  function quantum(p, v) { return Math.max(p.step || 0, Math.pow(10, Math.floor(Math.log10(Math.max(Math.abs(v), 1))) - 1)); }
  function wireConditions() {
    if (!ui.band) return;
    condKeys.forEach(function (k) {
      var p = R.param(k), row = $('.sl[data-key="' + k + '"]', ui.band);
      var range = $('input[type="range"]', row), num = $('input[type="number"]', row), msg = $(".sl-msg", row);
      if (num) num.addEventListener("change", function () {
        var raw = num.value.trim(), x = Number(raw);
        if (raw === "" || !isFinite(x)) { msg.textContent = "Enter a number from " + R.paramFmt(k, p.min) + " to " + R.paramFmt(k, p.max) + "; kept " + R.paramFmt(k, R.params[k]) + "."; num.value = R.params[k]; return; }
        var v = Math.max(p.min, Math.min(p.max, x));
        if (p.step && !p.log) v = Math.round(v / p.step) * p.step;
        R.set(k, v);
        num.removeAttribute("aria-invalid");
        num.setCustomValidity("");
        msg.textContent = v !== x ? "Kept within " + R.paramFmt(k, p.min) + "–" + R.paramFmt(k, p.max) + ": set to " + R.paramFmt(k, v) + "." : "";
        num.value = R.params[k];
      });
      if (num) num.addEventListener("input", function () { msg.textContent = ""; });
      // log sliders: one native step can round back to the same value, so keys move by real steps
      if (range && p.log) range.addEventListener("keydown", function (e) {
        var v = R.params[k], nv = null, key = e.key;
        if (key === "ArrowRight" || key === "ArrowUp") nv = (Math.floor(v / quantum(p, v)) + 1) * quantum(p, v);
        else if (key === "ArrowLeft" || key === "ArrowDown") { var q = quantum(p, v - 1); nv = (Math.ceil(v / q) - 1) * q; }
        else if (key === "PageUp") nv = v * 1.25;
        else if (key === "PageDown") nv = v / 1.25;
        else if (key === "Home") nv = p.min;
        else if (key === "End") nv = p.max;
        if (nv == null) return;
        e.preventDefault();
        if (key === "PageUp" || key === "PageDown") { var qq = quantum(p, nv); nv = Math.round(nv / qq) * qq; }
        R.set(k, Math.max(p.min, Math.min(p.max, nv)));
      });
    });
    ui.reset.addEventListener("click", function () { R.reset(condKeys); });
    ui.adjust.addEventListener("click", openParams);
    ui.done.addEventListener("click", function () { closeParams(); });
    R.on("update", syncConditions);
    syncConditions();
  }
  function syncConditions() {
    if (!ui.band) return;
    var D = R.defaults, n = 0;
    condKeys.forEach(function (k) {
      var v = R.params[k], changed = v !== D[k];
      if (changed) n++;
      var row = $('.sl[data-key="' + k + '"]', ui.band);
      cls(row, "is-changed", changed);
      var r = $('input[type="range"]', row);
      if (r) r.setAttribute("aria-valuetext", R.paramFmt(k, v) + (changed ? ", report default " + R.paramFmt(k, D[k]) : ""));
    });
    ui.reset.disabled = !n;
    ui.reset.innerHTML = "Reset to report" + (n ? ' <span class="n">(' + n + " changed)</span>" : "");
    var pc = $(".peek-changed", ui.peek);
    if (pc) pc.textContent = n ? " · " + n + " changed" : "";
  }
  function openParams() {
    doc.body.classList.add("params-open");
    ui.scrim.hidden = false;
    ui.adjust.setAttribute("aria-expanded", "true");
    syncModal();
    setTimeout(function () { var f = $("input, select", ui.panel); if (f) f.focus(); }, 30);
  }
  function closeParams(silent) {
    if (!doc.body.classList.contains("params-open")) return;
    doc.body.classList.remove("params-open");
    ui.adjust.setAttribute("aria-expanded", "false");
    if (!(st.open && mq.matches)) ui.scrim.hidden = true;
    syncModal();
    if (!silent) ui.adjust.focus();
  }

  /* ---------- drawer ---------- */
  var shown = null;   // {tile, key, node}
  function openable() { return tiles.filter(function (t) { return t.openable; }); }
  function firstTab(t) { return TABS.filter(function (k) { return t.tabs[k]; })[0]; }
  function wireDrawer() {
    var main = $(".board");
    if (!main) return;
    main.addEventListener("click", function (e) {
      var tileEl = e.target.closest(".tile[data-openable]");
      if (!tileEl) return;
      var openBtn = e.target.closest(".tile-open");
      if (!openBtn && e.target.closest("a, input, button, select, textarea, summary, label, details, [data-noopen], .levels-control")) return;
      var id = tileEl.id;
      if (st.open === id && openBtn) { closeDrawer(); return; }
      if (st.open === id && !mq.matches) return;
      openTile(id, !!openBtn || mq.matches);
    });
    $$(".tabs [role=tab]", ui.drawer).forEach(function (b) {
      b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
      b.addEventListener("keydown", function (e) {
        var list = $$(".tabs [role=tab]", ui.drawer).filter(function (x) { return !x.disabled; }), i = list.indexOf(b);
        var nx = e.key === "ArrowRight" ? list[(i + 1) % list.length] : e.key === "ArrowLeft" ? list[(i + list.length - 1) % list.length] :
          e.key === "Home" ? list[0] : e.key === "End" ? list[list.length - 1] : null;
        if (nx) { e.preventDefault(); setTab(nx.getAttribute("data-tab")); nx.focus(); }
      });
    });
    $("[data-close]", ui.drawer).addEventListener("click", function () { closeDrawer(); });
    $$("[data-step]", ui.drawer).forEach(function (b) {
      b.addEventListener("click", function () { step(Number(b.getAttribute("data-step"))); });
    });
    ui.scrim.addEventListener("click", function () { if (doc.body.classList.contains("params-open")) closeParams(); else closeDrawer(); });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Tab" && mq.matches) {   // keep focus inside the open sheet
        var box = doc.body.classList.contains("params-open") ? ui.panel : st.open ? ui.drawer : null;
        if (box) {
          var f = $$('button:not([disabled]), [href], input:not([disabled]), select, [tabindex]:not([tabindex="-1"])', box).filter(function (x) { return x.offsetParent !== null || x === doc.activeElement; });
          if (f.length) {
            var first = f[0], last = f[f.length - 1];
            if (e.shiftKey && (doc.activeElement === first || !box.contains(doc.activeElement))) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && (doc.activeElement === last || !box.contains(doc.activeElement))) { e.preventDefault(); first.focus(); }
          }
        }
      }
      if (e.key === "Escape") {
        if (doc.querySelector("dialog[open]")) return;
        if (doc.body.classList.contains("params-open")) closeParams();
        else if (st.open) closeDrawer();
      }
    });
    // citations: scroll to the source and flash it; on phones the sheet closes first
    doc.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a.cite");
      if (!a) return;
      var li = doc.getElementById((a.getAttribute("href") || "").slice(1));
      if (!li) return;
      e.preventDefault();
      if (mq.matches && st.open) closeDrawer(true);
      li.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      li.classList.add("flash");
      setTimeout(function () { li.classList.remove("flash"); }, 1800);
      history.replaceState(null, "", "#" + li.id);
    });
    R.on("update", function () {
      mirrors.forEach(function (h) { h.render(); });
    });
  }
  function setTab(k) {
    var t = byId[st.open];
    if (!t || !t.tabs[k]) return;
    st.tab = k;
    renderDrawer(false);
  }
  function step(d) {
    var list = openable(), i = list.map(function (t) { return t.id; }).indexOf(st.open) + d;
    if (i >= 0 && i < list.length) openTile(list[i].id, false);
    var a = doc.activeElement;
    if (!a || a === doc.body || a.disabled) {
      var alt = $('[data-step="' + (-d) + '"]', ui.drawer);
      (alt.disabled ? $("[data-close]", ui.drawer) : alt).focus();
    }
  }
  function openTile(id, focusDrawer, tab) {
    var t = byId[id];
    if (!t || !t.openable) return;
    if (st.open !== id) st.tab = tab && t.tabs[tab] ? tab : (t.tabs.summary ? "summary" : firstTab(t));
    else if (tab && t.tabs[tab]) st.tab = tab;
    if (st.open && st.open !== id) deactivate(byId[st.open]);
    st.open = id;
    t.el.classList.add("active");
    t.btn.setAttribute("aria-expanded", "true");
    var d = ui.drawer, wasHidden = d.hidden;
    d.hidden = false;
    doc.body.classList.add("drawer-open");
    if (mq.matches) {
      d.setAttribute("aria-modal", "true");
      ui.scrim.hidden = false;
      var y = t.el.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
    } else {
      d.removeAttribute("aria-modal");
      if (!doc.body.classList.contains("params-open")) ui.scrim.hidden = true;
      var bring = function () {
        var rr = t.el.getBoundingClientRect(), cb = ui.band ? ui.band.getBoundingClientRect().bottom : 0;
        if (rr.top < cb + 8 || rr.top > innerHeight * 0.6) window.scrollTo({ top: rr.top + window.scrollY - (ui.band ? ui.band.offsetHeight : 0) - 14, behavior: reduce ? "auto" : "smooth" });
      };
      if (wasHidden && !reduce) setTimeout(bring, 240); else bring();
    }
    positionDrawer();
    renderDrawer(false);
    syncModal();
    if (focusDrawer) setTimeout(function () { var b = $("#cp-tab-" + st.tab); if (b) b.focus({ preventScroll: true }); }, 30);
  }
  function deactivate(t) {
    if (!t) return;
    t.el.classList.remove("active");
    if (t.btn) t.btn.setAttribute("aria-expanded", "false");
  }
  function returnShown() {
    if (shown && shown.node) shown.tile.el.appendChild(shown.node);
    shown = null;
    mirrors = [];
  }
  function closeDrawer(noFocus) {
    var id = st.open;
    st.open = null;
    returnShown();
    ui.body.innerHTML = "";
    ui.drawer.hidden = true;
    ui.drawer.removeAttribute("aria-modal");
    if (!doc.body.classList.contains("params-open")) ui.scrim.hidden = true;
    doc.body.classList.remove("drawer-open");
    syncModal();
    var t = byId[id];
    deactivate(t);
    if (t && t.btn && !noFocus) t.btn.focus({ preventScroll: true });
  }
  function renderDrawer(keepScroll) {
    var t = byId[st.open];
    if (!t) return;
    var sec = sections.filter(function (s) { return s.id === t.sec; })[0];
    ui.crumb.innerHTML = (sec ? "<span>" + esc(sec.label) + '</span><span class="sep">›</span>' : "") + "<strong>" + esc(t.title) + "</strong>";
    $$(".tabs [role=tab]", ui.drawer).forEach(function (b) {
      var k = b.getAttribute("data-tab"), on = k === st.tab, has = !!t.tabs[k];
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      b.disabled = !has;
      b.title = has ? "" : "No separate " + TAB_NAMES[k].toLowerCase() + " for this tile";
    });
    var body = ui.body, top = body.scrollTop;
    body.setAttribute("aria-labelledby", "cp-tab-" + st.tab);
    returnShown();
    body.innerHTML = "";
    var node = t.tabs[st.tab];
    // on phones the sheet covers the tile: repeat its figures above the summary
    if (mq.matches && st.tab === "summary" && !$("figure, .meter", node)) {
      var figs = $$("figure.chart, figure.boxes, figure.photo, [data-mirror]", t.body).filter(function (f) {
        return f.getAttribute("data-mirror") !== "false" && !f.parentElement.closest("figure.chart, figure.boxes, figure.photo, [data-mirror]");
      });
      if (figs.length) {
        var mw = el("div", { class: "cp-mirror" });
        body.appendChild(mw);
        figs.forEach(function (f) { mirror(f, mw); });
      }
    }
    body.appendChild(node);
    shown = { tile: t, key: st.tab, node: node };
    if (!keepScroll && !reduce) { body.classList.remove("swap"); void body.offsetWidth; body.classList.add("swap"); }
    body.scrollTop = keepScroll ? top : 0;
    var list = openable(), i = list.indexOf(t);
    $('[data-step="-1"]', ui.drawer).disabled = i <= 0;
    $('[data-step="1"]', ui.drawer).disabled = i >= list.length - 1;
  }
  function mirror(f, into) {
    var spec = f.matches("figure.chart") ? specOf(f) : null;
    if (spec && window.ReportCharts) {
      var fig = el("figure", { class: "chart" });
      into.appendChild(fig);
      var box = el("div", { class: "rc-chart" });
      fig.appendChild(box);
      var h = window.ReportCharts.draw(box, spec);
      if (/"bind"/.test(JSON.stringify(spec))) mirrors.push(h);
      lineLegend(fig, spec);
      var cap = $(":scope > figcaption", f);
      if (cap) { var c = cap.cloneNode(true); stripIds(c); fig.appendChild(c); }
      return;
    }
    var clone = f.cloneNode(true);
    stripIds(clone);
    $$(".levels-control, .rc-zoom-btn, .ev-note", clone).forEach(function (n) { if (n.classList.contains("levels-control")) n.innerHTML = ""; else n.remove(); });
    into.appendChild(clone);
    if (clone.hasAttribute("data-levels")) R.levels();
  }
  function stripIds(n) {
    if (n.removeAttribute) n.removeAttribute("id");
    $$("[id]", n).forEach(function (x) { x.removeAttribute("id"); });
    $$("a.cite", n).forEach(function (a) { a.removeAttribute("id"); });
  }
  // A link to something inside a tile's tab (e.g. a source back-link) opens that tab.
  function revealInTab(target) {
    var tab = target.closest && target.closest(".tab[data-tab]");
    if (!tab || ui.drawer.contains(tab)) return false;
    var tileEl = tab.closest(".tile");
    if (!tileEl || !byId[tileEl.id]) return false;
    openTile(tileEl.id, false, tab.getAttribute("data-tab"));
    return true;
  }
  function positionDrawer() {
    if (mq.matches || !ui.band) { doc.documentElement.style.setProperty("--ctrl-top", "0px"); }
    else doc.documentElement.style.setProperty("--ctrl-top", Math.max(0, ui.band.getBoundingClientRect().bottom) + "px");
    var rail = $("#cp-rail");
    if (rail) rail.style.setProperty("--rail-top", (ui.band && !mq.matches ? ui.band.offsetHeight : 0) + "px");
  }
  /* On phones the sheet and the Conditions panel are modal: everything else is inert. */
  function syncModal() {
    var mob = mq.matches, panel = ui.panel, drawer = ui.drawer;
    var active = mob && panel && doc.body.classList.contains("params-open") ? panel : mob && st.open ? drawer : null;
    var peekRow = ui.band ? $(".cond-peek-row", ui.band) : null;
    [$(".skip"), $(".top"), peekRow, panel, $(".shell"), $("footer"), drawer].forEach(function (n) {
      if (!n) return;
      var off = !!active && n !== active && !(n === panel && !mob);
      if (off) n.setAttribute("inert", ""); else n.removeAttribute("inert");
    });
    if (!panel) return;
    if (active === panel) { panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-label", "Conditions"); }
    else { panel.removeAttribute("role"); panel.removeAttribute("aria-modal"); panel.removeAttribute("aria-label"); }
  }

  /* ---------- rail: active section ---------- */
  function wireNav() {
    var links = {};
    $$("#cp-rail a").forEach(function (a) { links[a.getAttribute("data-sec")] = a; });
    if (!sections.length) return;
    function setActive() {
      var probe = Math.max((mq.matches ? 70 : (ui.band ? ui.band.getBoundingClientRect().bottom : 0)) + 40, innerHeight * 0.33), cur = sections[0].id;
      sections.forEach(function (s) { if (s.el.getBoundingClientRect().top <= probe) cur = s.id; });
      if (innerHeight + scrollY >= doc.documentElement.scrollHeight - 4) cur = sections[sections.length - 1].id;
      Object.keys(links).forEach(function (k) { links[k].setAttribute("aria-current", k === cur ? "true" : "false"); });
    }
    var tick = false;
    window.addEventListener("scroll", function () {
      if (tick) return;
      tick = true;
      requestAnimationFrame(function () { tick = false; setActive(); positionDrawer(); });
    }, { passive: true });
    setActive();
  }

  window.Cockpit = { open: function (id, tab) { openTile(id, false, tab); }, close: function () { closeDrawer(true); } };
})();
