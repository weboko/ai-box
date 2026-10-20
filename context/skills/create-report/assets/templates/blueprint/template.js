/* Blueprint template: the report as one zoomable engineering drawing.
   Reads the page's markup only (topic-agnostic):
     main.sheet[data-columns]                         the drawing
     section.region[data-title][data-size][data-col][data-span][data-gloss][data-l0][data-list]
     h2 (region heading), .lod1 / .lod2 / .lod12 layers (direct children of a region)
     .card[data-crumb], [data-crumb], [data-stop]     breadcrumb nodes and tour sub-stops
     .region.cloud[data-mark]                          dispute = revision cloud
     [data-controls], [data-list-template], .list-only, .canvas-only
     header.bp-title                                   title block (h1, dek, [data-ev-legend], dl.fields, meta)
   Builds: auto layout (regions packed into balanced columns, sized from their content), camera
   (pan / zoom / pinch / wheel / keys), semantic zoom L0 → L1 → L2 by thresholds, minimap, breadcrumb,
   guided tour, citation jumps with a back chip, "Read as list", line key + drawing scale, revision
   clouds, and a legibility guard (console, and on screen with ?dev). */
(function () {
  "use strict";
  var R = window.Report;
  if (!R) return;
  var doc = document, root = doc.documentElement, body = doc.body;
  var U = R.util, $ = U.$, $$ = U.$$, mk = U.el;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var DEV = /(^|[?&#])dev\b/.test(location.search.slice(1) + "&" + location.hash.slice(1)) || body.hasAttribute("data-dev");
  var sheet = $("main.sheet");
  if (!sheet) { console.warn("blueprint: no <main class=\"sheet\"> on the page"); return; }

  var SIZES = { s: 900, m: 1100, l: 1500, xl: 2340 };   // xl = two m side by side
  var GAP = 140;                       // world units between regions and columns
  var T1 = 0.3, T2 = 0.66, SMAX = 4;   // zoom thresholds (read from CSS --t1 / --t2 when set)
  var MIN_PX = 11;                     // legibility floor, screen px at the layer's threshold
  var s = 1, tx = 0, ty = 0, appliedS = 1, lod = -1, WW = 0, WH = 0;
  var regions = [], crumbNodes = [], stops = [], tourIdx = 0, anim = null, booted = false;
  var mode = "canvas", levelFigs = [], guardIssues = [];
  var vp, hudTop, hudBot, tblock, crumbsEl, srEl, mmSvg, mmView = null, mmRects = {}, listBtn, listHead;

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function isMobile() { return innerWidth <= 760; }
  function cssNum(node, name, fb) { var v = parseFloat(getComputedStyle(node).getPropertyValue(name)); return isFinite(v) ? v : fb; }
  function txt(node) { return (node ? node.textContent : "").replace(/\s+/g, " ").trim(); }
  function sizeOf(reg) { var k = reg.getAttribute("data-size") || "m"; return SIZES[k] ? k : "m"; }
  // on a phone the drawing is one column of regions narrow enough to read at L1 without panning
  var PHONE_W = 1150, phoneLayout = false;
  function widthOf(reg) { return phoneLayout ? PHONE_W : SIZES[sizeOf(reg)]; }
  var IC = {
    list: "M4 7h16M4 12h16M4 17h16", prev: "M15 5l-7 7 7 7", next: "M9 5l7 7-7 7", minus: "M5 12h14",
    plus: "M12 5v14M5 12h14", home: "M4 11l8-7 8 7M6.5 9.5V20h11V9.5M10 20v-5h4v5",
    back: "M9 15L4 10l5-5M4 10h10a5 5 0 0 1 0 10h-3", chev: "M6 9l6 6 6-6"
  };
  function icon(k) { return '<svg class="bp-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + IC[k] + '"/></svg>'; }
  function lodsOf(node) {
    var l = node.closest(".lod1, .lod2, .lod12");
    if (!l) return [1, 2];
    return l.classList.contains("lod1") ? [1] : l.classList.contains("lod2") ? [2] : [1, 2];
  }

  /* =====================================================================
     SETUP: DOM transforms before core wires citations, evidence and charts
     ===================================================================== */
  function setupRegions() {
    var all = $$(".region", sheet);
    all.forEach(function (reg) { if (reg.parentElement !== sheet) console.warn("blueprint: .region must be a direct child of main.sheet", reg); });
    Array.prototype.slice.call(sheet.children).forEach(function (c) {
      if (!c.classList.contains("region") && !/^(SCRIPT|TEMPLATE|STYLE)$/.test(c.tagName)) console.warn("blueprint: content outside a .region is not placed on the drawing", c);
    });
    all.filter(function (r) { return r.parentElement === sheet; }).forEach(function (reg, i) {
      var n = i + 1, h2 = $(":scope > h2", reg);
      var title = reg.getAttribute("data-title") || (h2 ? txt(h2).replace(/\s*△.*$/, "") : "Region " + n);
      if (!reg.id) reg.id = "r-" + U.slugify(title);
      if (!h2) console.warn("blueprint: region " + n + " (" + title + ") has no <h2>");
      if (reg.getAttribute("data-size") && !SIZES[reg.getAttribute("data-size")]) console.warn("blueprint: unknown data-size=\"" + reg.getAttribute("data-size") + "\" (s|m|l|xl)", reg);
      reg.tabIndex = 0;
      if (h2) { if (!h2.id) h2.id = reg.id + "-h"; reg.setAttribute("aria-labelledby", h2.id); }
      reg.style.setProperty("--rw", SIZES[sizeOf(reg)] + "px");
      // list-only content from a <template>
      var tid = reg.getAttribute("data-list-template");
      if (tid) {
        var tpl = doc.getElementById(tid);
        if (tpl && tpl.content) { var lo = mk("div", { class: "list-only" }); lo.appendChild(tpl.content.cloneNode(true)); reg.appendChild(lo); }
        else console.warn("blueprint: data-list-template=\"" + tid + "\" has no <template id>");
      }
      // layers: every direct child is L1, L2 or both (default)
      Array.prototype.slice.call(reg.children).forEach(function (c) {
        if (c === h2 || /^(SCRIPT|TEMPLATE|STYLE)$/.test(c.tagName) || c.classList.contains("list-only") || c.classList.contains("lod0")) return;
        if (!/(^|\s)lod(1|2|12)(\s|$)/.test(c.className)) c.classList.add("lod12");
      });
      // a chart shown at both levels is drawn twice: a simple L1 copy and the full L2 one
      $$(":scope > figure.chart.lod12", reg).forEach(splitChart);
      stackLayers(reg);
      buildL0(reg, n, title);
      if (reg.getAttribute("data-list") === "open" || !$(".lod1", reg)) reg.classList.add("open");
      regions.push({ el: reg, n: n, title: title, r: null });
    });
  }
  function splitChart(fig) {
    var c = fig.cloneNode(true);
    $$("[id]", c).forEach(function (e) { e.removeAttribute("id"); });
    if (fig.id) c.id = fig.id + "-l1";
    c.classList.remove("lod12"); c.classList.add("lod1", "bp-split");
    fig.classList.remove("lod12"); fig.classList.add("lod2", "bp-split");
    var sc = $('script[type="application/json"]', c);
    if (sc) { try { var spec = JSON.parse(sc.textContent); spec.table = false; sc.textContent = JSON.stringify(spec); } catch (e) { /* core reports bad JSON */ } }
    fig.parentNode.insertBefore(c, fig);
  }
  // consecutive .lod1 / .lod2 children share one cell: L1 and L2 swap in place, so zooming never moves anything
  function stackLayers(reg) {
    var run = [];
    function flush() {
      var has1 = run.some(function (k) { return k.classList.contains("lod1"); }), has2 = run.some(function (k) { return k.classList.contains("lod2"); });
      if (has1 && has2) {
        var st = mk("div", { class: "bp-stack" }), s1 = mk("div", { class: "bp-s1" }), s2 = mk("div", { class: "bp-s2" });
        reg.insertBefore(st, run[0]);
        st.appendChild(s1); st.appendChild(s2);
        run.forEach(function (k) { (k.classList.contains("lod1") ? s1 : s2).appendChild(k); });
        if (run.some(function (k) { return k.classList.contains("lod2") && !k.classList.contains("bp-split"); })) {
          var b = mk("button", { type: "button", class: "bp-more", "aria-expanded": "false" }, "Full detail");
          b.addEventListener("click", function () { setOpen(reg, !reg.classList.contains("open")); });
          st.insertBefore(b, s2);
        }
      }
      run = [];
    }
    var kids = Array.prototype.slice.call(reg.children);
    kids.forEach(function (k, i) {
      var split = k.classList.contains("bp-split");
      // a split chart pair gets its own cell, so the chart stays put above the summary / detail swap
      if (split && (!run.length || !run[run.length - 1].classList.contains("bp-split"))) flush();
      if (k.classList.contains("lod1") || k.classList.contains("lod2")) run.push(k); else flush();
      if (split && !(kids[i + 1] && kids[i + 1].classList.contains("bp-split"))) flush();
    });
    flush();
  }
  function setOpen(reg, open) {
    reg.classList.toggle("open", open);
    var b = $(".bp-more", reg);
    if (b) { b.setAttribute("aria-expanded", String(open)); b.textContent = open ? "Hide detail" : "Full detail"; }
  }
  function buildL0(reg, n, title) {
    var l0 = mk("div", { class: "bp-l0" + (reg.getAttribute("data-l0") === "top" ? " top" : ""), "aria-hidden": "true" });
    var box = mk("div", { class: "bp-l0-box" });
    box.appendChild(mk("span", { class: "bp-l0-n" }, reg.classList.contains("cloud") ? "△" + (reg.getAttribute("data-mark") || pad2(n)) : pad2(n)));
    box.appendChild(mk("span", { class: "bp-l0-t" }, title));
    if (reg.getAttribute("data-gloss")) box.appendChild(mk("span", { class: "bp-l0-g" }, reg.getAttribute("data-gloss")));
    var own = $(":scope > .lod0", reg);
    if (own) box.appendChild(own);
    l0.appendChild(box);
    reg.appendChild(l0);
    var h2 = $(":scope > h2", reg);
    if (h2 && reg.classList.contains("cloud") && reg.getAttribute("data-mark")) h2.setAttribute("data-mark", reg.getAttribute("data-mark"));
  }

  function setupControls() {
    $$("[data-controls]").forEach(function (box) {
      if (!R.spec) { console.warn("blueprint: data-controls needs a model (assets/model.js)"); return; }
      var keys = (box.getAttribute("data-controls") || "").split(/[\s,]+/).filter(Boolean);
      R.controls(box, keys.length ? { keys: keys } : {});
    });
  }

  function setupTitle() {
    tblock = $("header.bp-title");
    if (!tblock) {
      tblock = mk("header", { class: "bp-title" });
      tblock.appendChild(mk("h1", null, doc.title));
      body.insertBefore(tblock, body.firstChild);
    }
    tblock.setAttribute("aria-label", "Title block");
    var h1 = $("h1", tblock) || tblock.appendChild(mk("h1", null, doc.title));
    var row = mk("div", { class: "tb-title" });
    tblock.insertBefore(row, tblock.firstChild);
    row.appendChild(h1);
    var btn = mk("button", { type: "button", class: "tb-btn", "aria-expanded": "false", "aria-controls": "bp-tb-body", "aria-label": "Title block details", title: "Show or hide title block details" });
    btn.innerHTML = icon("chev");
    row.appendChild(btn);
    var key = mk("div", { class: "tb-legend" });
    key.appendChild(mk("span", { class: "tb-k" }, "Line key"));
    var legend = $("[data-ev-legend]", tblock);
    if (legend) key.appendChild(legend);
    tblock.insertBefore(key, row.nextSibling);
    var tbBody = mk("div", { class: "tb-body", id: "bp-tb-body" });
    Array.prototype.slice.call(tblock.children).forEach(function (c) { if (c !== row && c !== key) tbBody.appendChild(c); });
    tblock.appendChild(tbBody);
    var fields = $("dl.fields", tbBody);
    if (!fields) { fields = mk("dl", { class: "fields" }); tbBody.insertBefore(fields, tbBody.firstChild); }
    var f = mk("div", { class: "tb-scale" });
    f.appendChild(mk("dt", null, "Scale"));
    f.appendChild(mk("dd", { id: "bp-scale" }, "1 : 1"));
    fields.appendChild(f);
    function setTB(open) { tblock.classList.toggle("min", !open); btn.setAttribute("aria-expanded", String(open)); invalidateArea(); }
    btn.addEventListener("click", function () { setTB(tblock.classList.contains("min")); });
    setTB(false);
  }

  function buildHud() {
    var skip = mk("a", { class: "bp-skip", href: "#list" }, "Read the report as a list");
    srEl = mk("p", { class: "sr-only", "aria-live": "polite" });
    hudTop = mk("nav", { class: "bp-hud-top", "aria-label": "Drawing navigation" });
    hudTop.innerHTML = '<button type="button" class="bp-btn bp-listbtn" aria-pressed="false" title="Read as list (L)">' + icon("list") + '<span class="lbl">Read as list</span></button>' +
      '<ol class="bp-crumbs" aria-label="You are here"></ol>' +
      '<div class="bp-lodbar" role="group" aria-label="Detail level">' +
      '<button type="button" data-lodgo="0" aria-pressed="false" aria-label="L0, overview: region names" title="Overview: region names (0)">L0</button>' +
      '<button type="button" data-lodgo="1" aria-pressed="false" aria-label="L1, summaries" title="Summaries">L1</button>' +
      '<button type="button" data-lodgo="2" aria-pressed="false" aria-label="L2, full detail" title="Full detail">L2</button></div>';
    hudBot = mk("div", { class: "bp-hud-bot", role: "toolbar", "aria-label": "Tour and zoom" });
    hudBot.innerHTML = '<div class="bp-tour"><button type="button" class="bp-btn" data-act="prev" aria-label="Previous stop in the guided tour">' + icon("prev") + '</button>' +
      '<button type="button" class="bp-tour-label" data-act="again" title="Tour stop: click to frame it again"><span class="tl-top"><span class="tl-k">Tour</span> <span class="tl-pos">1/1</span></span> <span class="tl-n"></span></button>' +
      '<button type="button" class="bp-btn" data-act="next" aria-label="Next stop in the guided tour">' + icon("next") + '</button></div>' +
      '<div class="bp-zoom"><button type="button" class="bp-btn" data-act="out" aria-label="Zoom out">' + icon("minus") + '</button>' +
      '<span class="bp-zread" aria-live="off">100%</span>' +
      '<button type="button" class="bp-btn" data-act="in" aria-label="Zoom in">' + icon("plus") + '</button>' +
      '<button type="button" class="bp-btn" data-act="home" aria-label="Back to the first region" title="Back to the start (H)">' + icon("home") + '</button></div>' +
      '<div class="bp-backchip" hidden><button type="button" class="bp-btn" data-act="back">' + icon("back") + '<span class="bp-back-name">Back</span></button></div>';
    var mm = mk("aside", { class: "bp-minimap", "aria-label": "Minimap: click or drag to move the view" });
    mm.innerHTML = '<svg role="img" aria-label="Minimap of the drawing with your viewport"></svg>';
    mmSvg = $("svg", mm);
    vp = mk("div", { class: "bp-vp", role: "region", "aria-roledescription": "zoomable drawing", "aria-label": "Report drawing", "aria-describedby": "bp-vp-help", "data-overflow-ok": "" });
    sheet.parentNode.insertBefore(vp, sheet);
    vp.appendChild(mk("p", { id: "bp-vp-help", class: "sr-only" }, "Tab moves through the regions in reading order. Plus and minus zoom, arrow keys pan (Shift for a bigger step), N and P step through the tour, 0 shows the whole sheet, H returns to the start, L opens the list version."));
    vp.appendChild(sheet);
    body.insertBefore(srEl, body.firstChild);
    body.insertBefore(skip, body.firstChild);
    tblock.parentNode.insertBefore(hudTop, tblock.nextSibling);
    hudTop.parentNode.insertBefore(hudBot, hudTop.nextSibling);
    hudBot.parentNode.insertBefore(mm, hudBot.nextSibling);
    var frame = mk("div", { class: "bp-frame", "aria-hidden": "true" });
    frame.appendChild(mk("div", { class: "bp-zones" }));
    sheet.insertBefore(frame, sheet.firstChild);
    crumbsEl = $(".bp-crumbs", hudTop);
    listBtn = $(".bp-listbtn", hudTop);
  }

  R.hook("setup", function () {
    body.classList.add("bp-canvas");
    T1 = cssNum(sheet, "--t1", T1); T2 = cssNum(sheet, "--t2", T2);
    setupRegions();
    setupControls();
    setupTitle();
    buildHud();
    wireInput();
  });

  /* =====================================================================
     READY: content is in place (citations, charts, model); lay out, boot
     ===================================================================== */
  R.hook("ready", function () {
    setupSources();
    levelFigs = $$("[data-levels]", sheet).filter(function (f) { return f.getAttribute("data-lod-sync") !== "off" && f.closest(".region"); });
    levelFigs.forEach(function (f) { f.classList.add("bp-synced"); });
    R.addRevealer(function (t) {
      if (mode !== "list") return false;
      var reg = t.closest(".region");
      if (reg && !reg.classList.contains("open") && t.closest(".lod2")) { setOpen(reg, true); return true; }
      return false;
    });
    var fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
    Promise.race([fonts, new Promise(function (r) { setTimeout(r, 2000); })]).then(boot);
  });

  // Sources region: "used in" per source, and a parts list at L1 when the region has no summary
  function setupSources() {
    var list = $("ol.sources", sheet);
    if (!list) return;
    var home = list.closest(".region"), used = {};
    $$("a.cite", sheet).forEach(function (a) {
      var reg = a.closest(".region");
      if (!reg || reg === home) return;
      var rg = regionOf(reg), id = (a.getAttribute("href") || "").slice(1);
      if (rg) (used[id] = used[id] || {})[rg.n] = rg.title;
    });
    $$(":scope > li[id]", list).forEach(function (li) {
      var u = used[li.id];
      if (!u || $(".bp-used", li)) return;
      li.appendChild(mk("span", { class: "bp-used" }, "used in: " + Object.keys(u).sort(function (a, b) { return a - b; }).map(function (k) { return pad2(+k) + " " + u[k]; }).join(" · ")));
    });
    if (!home || $(".lod1", home)) return;
    var blk = list.closest(".lod2, .lod12");
    if (!blk || !blk.classList.contains("lod2")) return;
    var parts = mk("ol", { class: "lod1 bp-parts", "aria-hidden": "true" });
    $$(":scope > li[id]", list).forEach(function (li) {
      var item = mk("li");
      item.appendChild(mk("b", null, pad2(+li.getAttribute("data-n") || 0)));
      item.appendChild(mk("span", null, txt($("a, cite", li) || li)));
      parts.appendChild(item);
    });
    var s2 = blk.parentElement;
    if (s2.classList.contains("bp-s2")) { var st = s2.parentElement, s1 = $(":scope > .bp-s1", st); s1.appendChild(parts); }
    else {
      var stack = mk("div", { class: "bp-stack" }), n1 = mk("div", { class: "bp-s1" }), n2 = mk("div", { class: "bp-s2" });
      blk.parentNode.insertBefore(stack, blk);
      stack.appendChild(n1); stack.appendChild(n2); n1.appendChild(parts); n2.appendChild(blk);
    }
    home.classList.add("open");
  }
  function regionOf(el) { for (var i = 0; i < regions.length; i++) if (regions[i].el === el) return regions[i]; return null; }

  /* =====================================================================
     AUTO LAYOUT: regions → bands of balanced columns (reading order kept)
     ===================================================================== */
  function forceCharts() {
    var hs = window.ReportCharts && window.ReportCharts.handles;
    if (hs) Object.keys(hs).forEach(function (k) { if (hs[k].force) hs[k].force(); });
  }
  // a layered figure keeps the height of its tallest level, so changing level never moves the drawing
  function syncFigureHeights() {
    levelFigs.forEach(function (f) {
      var lv = f._levels;
      if (!lv) return;
      f.style.minHeight = "";
      var cur = lv.get(), mx = 0;
      for (var i = 0; i < lv.names.length; i++) { lv.go(i, false, true); mx = Math.max(mx, f.offsetHeight); }
      lv.go(cur, false, true);
      f.style.minHeight = mx + "px";
    });
  }
  // Split regions (heights h, widths w, in order) into k contiguous columns with the smallest
  // tallest column. A column is as wide as its widest region; narrower regions share a row when
  // they fit side by side (e.g. two m next to an xl). pins[i] = forced column index or null.
  function partition(h, w, k, pins) {
    var n = h.length, i, j, c;
    function cost(a, b) {
      var W = 0, x, total = 0, rowW = 0, rowH = 0;
      for (x = a; x < b; x++) W = Math.max(W, w[x]);
      for (x = a; x < b; x++) {
        if (rowW && rowW + GAP + w[x] > W + 0.5) { total += rowH + GAP; rowW = 0; rowH = 0; }
        rowW += (rowW ? GAP : 0) + w[x]; rowH = Math.max(rowH, h[x]);
      }
      return total + rowH;
    }
    function ok(a, b, col) { for (var x = a; x < b; x++) if (pins[x] != null && pins[x] !== col) return false; return true; }
    var best = [], from = [];
    for (c = 0; c <= k; c++) { best.push([]); from.push([]); for (i = 0; i <= n; i++) { best[c].push(Infinity); from[c].push(-1); } }
    best[0][0] = 0;
    for (c = 1; c <= k; c++) for (i = 1; i <= n; i++) for (j = c - 1; j < i; j++) {
      if (best[c - 1][j] === Infinity || !ok(j, i, c - 1)) continue;
      var v = Math.max(best[c - 1][j], cost(j, i));
      if (v < best[c][i] - 0.5) { best[c][i] = v; from[c][i] = j; }
    }
    if (best[k][n] === Infinity) {
      console.warn("blueprint: data-col pins can't keep the reading order; ignoring them");
      return partition(h, w, k, pins.map(function () { return null; }));
    }
    var out = [], end = n;
    for (c = k; c >= 1; c--) { var st = from[c][end], g = []; for (i = st; i < end; i++) g.push(i); out.unshift(g); end = st; }
    return out;
  }
  function layout() {
    var regs = regions.map(function (x) { return x.el; });
    regs.forEach(function (r) { sheet.appendChild(r); r.style.removeProperty("--rw-span"); });
    $$(":scope > .bp-band", sheet).forEach(function (b) { b.remove(); });
    phoneLayout = isMobile();
    regs.forEach(function (r) { r.style.setProperty("--rw", widthOf(r) + "px"); });
    forceCharts(); syncFigureHeights();
    var hs = regs.map(function (r) { return r.offsetHeight; });
    var K = phoneLayout ? 2 : Math.max(1, parseInt(sheet.getAttribute("data-columns"), 10) || 3);
    var groups = [], cur = [];
    regs.forEach(function (r, i) {
      if (r.hasAttribute("data-span")) { if (cur.length) groups.push(cur); groups.push(i); cur = []; }
      else cur.push(i);
    });
    if (cur.length) groups.push(cur);
    var maxW = 0, nodes = [];
    groups.forEach(function (g) {
      if (typeof g === "number") { nodes.push(regs[g]); return; }
      var k = Math.min(K, g.length);
      var pins = g.map(function (i) { var c = parseInt(regs[i].getAttribute("data-col"), 10); return c >= 1 && c <= k ? c - 1 : null; });
      var cols = partition(g.map(function (i) { return hs[i]; }), g.map(function (i) { return widthOf(regs[i]); }), k, pins);
      var band = mk("div", { class: "bp-band" }), bw = 0;
      cols.forEach(function (idxs) {
        var col = mk("div", { class: "bp-col" });
        var cw = Math.max.apply(null, idxs.map(function (j) { return widthOf(regs[g[j]]); }));
        col.style.setProperty("--cw", cw + "px");
        idxs.forEach(function (j) { col.appendChild(regs[g[j]]); });
        band.appendChild(col);
        bw += cw;
      });
      bw += GAP * (cols.length - 1);
      maxW = Math.max(maxW, bw);
      nodes.push(band);
    });
    nodes.forEach(function (nd) { sheet.appendChild(nd); });
    maxW = maxW || SIZES.xl;
    regs.forEach(function (r) { if (r.hasAttribute("data-span")) r.style.setProperty("--rw", maxW + "px"); });
    forceCharts(); syncFigureHeights();
    fitL0();
  }
  // L0 titles shrink until they fit their region
  function fitL0() {
    regions.forEach(function (R0) {
      var t = $(".bp-l0-t", R0.el), box = $(".bp-l0-box", R0.el);
      if (!t) return;
      var k = 1, maxW = R0.el.clientWidth - 60, maxH = R0.el.clientHeight - 40;
      box.style.setProperty("--k", k);
      while (k > 0.3 && (t.scrollWidth > t.clientWidth + 1 || box.offsetWidth > maxW + 1 || box.offsetHeight > maxH)) { k *= 0.92; box.style.setProperty("--k", k.toFixed(3)); }
    });
  }

  /* =====================================================================
     CAMERA
     ===================================================================== */
  function wrect(el) {
    var w = sheet.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: (r.left - w.left) / appliedS, y: (r.top - w.top) / appliedS, w: r.width / appliedS, h: r.height / appliedS };
  }
  var areaCache = null;
  function area() { return areaCache || (areaCache = computeArea()); }
  function invalidateArea() { areaCache = null; }
  function computeArea() {
    var top = hudTop.getBoundingClientRect().bottom;
    if (isMobile()) return { x: 0, y: top, w: innerWidth, h: Math.max(100, hudBot.getBoundingClientRect().top - top) };
    var tb = tblock.getBoundingClientRect(), bot = Math.min(innerHeight - 70, tb.top - 8);
    return { x: 0, y: top, w: innerWidth - 174, h: Math.max(100, bot - top) };
  }
  function measure() {
    WW = sheet.offsetWidth; WH = sheet.offsetHeight;
    // tour stops and crumbs inside layered figures are L2 targets: measure them at the last level
    var restore = levelFigs.filter(function (f) { return f._levels && f._levels.get() !== f._levels.names.length - 1; });
    restore.forEach(function (f) { f._levels.go(f._levels.names.length - 1, false, true); });
    regions.forEach(function (R0) { R0.r = wrect(R0.el); });
    crumbNodes = $$("[data-crumb], .card", sheet).filter(function (e) { return e.closest(".region") && !e.classList.contains("region"); }).map(function (e) {
      var d = 0, p = e;
      while (p && p !== sheet) { if (p.matches && p.matches("[data-crumb], .card")) d++; p = p.parentElement; }
      return { el: e, r: wrect(e), lods: lodsOf(e), depth: d, region: e.closest(".region"), label: crumbLabel(e) };
    }).filter(function (c) { return c.r.w > 0 && c.label; });
    buildStops();
    if (restore.length) syncLevels(true);
    buildMinimap();
  }
  function crumbLabel(e) {
    var t = e.getAttribute("data-crumb") || txt($("h3, h4, strong", e));
    return t.length > 42 ? t.slice(0, 40) + "…" : t;
  }
  function clampS(v) { return Math.max(fitAllScale() * 0.6, Math.min(SMAX, v)); }
  function fitAllScale() { var a = area(); return Math.min((a.w - 24) / WW, (a.h - 24) / WH); }
  function viewForRect(r, how) {
    var a = area(), pad = isMobile() ? 12 : 28;
    var sf = Math.min((a.w - 2 * pad) / r.w, (a.h - 2 * pad) / r.h), sc;
    if (how === "detail" || how === "stop") sc = Math.max(T2 * 1.04, Math.min(sf, 1.2));
    else if (how === "card") sc = Math.min(Math.max(Math.min((a.w - 2 * pad) / r.w, isMobile() ? 1.25 : 0.95), T2 * 1.04), SMAX);
    else if (how === "l1") sc = Math.max(T1 * 1.04, Math.min(T2 * 0.95, sf));
    else if (how === "fit") sc = sf;
    else if (how === "summary") sc = Math.max(T1 * 1.02, Math.min(sf, T2 * 0.97));
    else { sc = Math.min(sf, 1.2); if (sc < T1) sc = T1 * 1.02; }
    var nx, ny;
    if (r.w * sc <= a.w) nx = a.x + (a.w - r.w * sc) / 2 - r.x * sc; else nx = a.x + pad - r.x * sc;
    if (r.h * sc <= a.h - 2 * pad) ny = a.y + (a.h - r.h * sc) / 2 - r.y * sc; else ny = a.y + pad - r.y * sc;
    return { s: sc, x: nx, y: ny };
  }
  function regionFitsDetail(r) { var a = area(); return Math.min((a.w - 40) / r.w, (a.h - 40) / r.h) >= T2; }
  function buildStops() {
    stops = [];
    regions.forEach(function (R0) {
      // a region with a summary is framed at L1 first; its detail follows as the next stop(s)
      var hasSummary = !!$(".lod1", R0.el);
      stops.push({ el: R0.el, r: R0.r, region: R0, how: hasSummary ? "summary" : "region", name: R0.title });
      if (regionFitsDetail(R0.r)) {
        if (hasSummary) stops.push({ el: R0.el, r: R0.r, region: R0, how: "detail", name: R0.title + " › Detail", label: "Detail" });
        return;
      }
      $$(".card, [data-stop], .lod2", R0.el).forEach(function (c) {
        if (c.closest(".lod1") || c.parentElement.closest(".card")) return;
        if (c.classList.contains("lod2")) { if (!c.classList.contains("bp-split") && !$(".card, [data-stop]", c)) tileStops(R0, c); return; }
        var r = wrect(c);
        if (!r.w) return;
        stops.push({ el: c, r: r, region: R0, how: c.classList.contains("card") ? "card" : "stop", name: R0.title + " › " + crumbLabel(c) });
      });
    });
  }
  // an L2 block without cards that is bigger than the screen at L2 is toured in screen-sized parts
  // (column by column, top to bottom)
  function tileStops(R0, blk) {
    var r = wrect(blk), a = area(), sc = T2 * 1.06;
    if (!r.w || !r.h) return;
    var nx = Math.max(1, Math.ceil(r.w / ((a.w - 56) / sc))), ny = Math.max(1, Math.ceil(r.h / ((a.h - 56) / sc))), n = nx * ny, k = 0;
    var w = r.w / nx, h = r.h / ny;
    for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
      k++;
      var label = n > 1 ? "Part " + k + "/" + n : (blk.getAttribute("data-crumb") || "Detail");
      stops.push({ el: blk, r: { x: r.x + i * w, y: r.y + j * h, w: w, h: h }, region: R0, how: "card", name: R0.title + " › " + label, label: label });
    }
  }

  var raf = 0, curLw = 0;
  function bound() {
    if (!WW || anim) return;
    var a = area(), cx = (a.x + a.w / 2 - tx) / s, cy = (a.y + a.h / 2 - ty) / s;
    var ncx = Math.max(-WW * 0.1, Math.min(WW * 1.1, cx)), ncy = Math.max(-WH * 0.1, Math.min(WH * 1.1, cy));
    if (ncx !== cx) tx = a.x + a.w / 2 - ncx * s;
    if (ncy !== cy) ty = a.y + a.h / 2 - ncy * s;
  }
  function apply() {
    if (mode !== "canvas") return;
    bound();
    sheet.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
    appliedS = s;
    var nl = s < T1 ? 0 : s < T2 ? 1 : 2;
    if (nl !== lod) setLod(nl);
    // drawn lines stay ~1.5 screen px; quantised so zooming restyles a few times, not every frame
    var lw = Math.min(14, Math.max(1, 1.5 / s));
    if (!curLw || Math.abs(lw / curLw - 1) > 0.06) { curLw = lw; sheet.style.setProperty("--lw", lw.toFixed(2) + "px"); }
    var g = 40 * s; while (g < 14) g *= 5;
    vp.style.setProperty("--g", g + "px"); vp.style.setProperty("--G", g * 5 + "px");
    vp.style.setProperty("--gx", tx + "px"); vp.style.setProperty("--gy", ty + "px");
    if (!raf) raf = requestAnimationFrame(function () { raf = 0; updateHud(); });
  }
  var lodBtns = [];
  function setLod(nl) {
    lod = nl;
    sheet.setAttribute("data-lod", lod);
    body.setAttribute("data-lod", lod);
    lodBtns.forEach(function (b) { var on = +b.getAttribute("data-lodgo") === lod; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
    syncLevels();
    if (WW) announce("Detail level " + lod + ": " + ["overview, region names", "summaries", "full detail"][lod]);
  }
  function syncLevels(quiet) {
    levelFigs.forEach(function (f) {
      var lv = f._levels;
      if (!lv) return;
      var want = Math.min(Math.max(lod, 0), lv.names.length - 1);
      if (lv.get() !== want) lv.go(want, false, quiet);
    });
  }
  function setView(v) { s = clampS(v.s); tx = v.x; ty = v.y; apply(); }
  function zoomAt(f, cx, cy) {
    var ns = clampS(s * f), wx = (cx - tx) / s, wy = (cy - ty) / s;
    s = ns; tx = cx - wx * s; ty = cy - wy * s; apply();
  }
  function cancelAnim() { if (anim) { cancelAnimationFrame(anim); anim = null; sheet.classList.remove("anim"); } }
  function fly(v, done) {
    cancelAnim();
    v.s = clampS(v.s);
    if (reduce.matches) {
      // no camera travel: jump, and acknowledge the jump with a short dip of the drawing
      setView(v);
      if (sheet.animate) sheet.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 140, easing: "ease-out" });
      if (done) done();
      return;
    }
    var s0 = s, x0 = tx, y0 = ty, t0 = performance.now();
    var a = area(), cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    var w0x = (cx - x0) / s0, w0y = (cy - y0) / s0, w1x = (cx - v.x) / v.s, w1y = (cy - v.y) / v.s;
    var ls0 = Math.log(s0), ls1 = Math.log(v.s);
    var dist = Math.hypot(w1x - w0x, w1y - w0y) * Math.min(s0, v.s);
    var dip = Math.min(1.2, dist / (a.w * 2));
    var D = Math.max(280, Math.min(700, 260 + 150 * Math.abs(ls1 - ls0) + 260 * dist / a.w));
    sheet.classList.add("anim");
    function step(now) {
      var k = Math.min(1, (now - t0) / D), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      s = Math.exp(ls0 + (ls1 - ls0) * e - dip * Math.sin(Math.PI * e));
      var wx = w0x + (w1x - w0x) * e, wy = w0y + (w1y - w0y) * e;
      tx = cx - wx * s; ty = cy - wy * s;
      if (k >= 1) { s = v.s; tx = v.x; ty = v.y; }
      apply();
      if (k < 1) anim = requestAnimationFrame(step);
      else { anim = null; sheet.classList.remove("anim"); if (done) done(); }
    }
    anim = requestAnimationFrame(step);
  }
  function fitAll(instant) {
    var a = area(), sc = fitAllScale(), v;
    // a phone sheet is tall and narrow: the overview fits its width and starts at the top
    if (isMobile() && (a.w - 24) / WW > sc * 1.5) { sc = (a.w - 24) / WW; v = { s: sc, x: a.x + 12, y: a.y + 12 }; }
    else v = { s: sc, x: a.x + (a.w - WW * sc) / 2, y: a.y + (a.h - WH * sc) / 2 };
    if (instant) setView(v); else fly(v);
  }
  function goStop(i, instant) {
    if (!stops.length) return;
    tourIdx = Math.max(0, Math.min(stops.length - 1, i));
    var st = stops[tourIdx], v = viewForRect(st.r, st.how);
    if (instant) setView(v); else fly(v);
    updateTour();
  }
  function home(instant) { goStop(0, instant); }
  function goRegion(el) { for (var i = 0; i < stops.length; i++) if (stops[i].el === el) return goStop(i); }
  function goCrumb(node) {
    var reg = node.closest(".region");
    if (node === reg) return goRegion(reg);
    for (var i = 0; i < stops.length; i++) if (stops[i].el === node) return goStop(i);
    fly(viewForRect(wrect(node), lodsOf(node)[0] === 1 && lodsOf(node).length === 1 ? "l1" : "card"));
  }

  /* ---------- HUD: breadcrumb, minimap, tour, scale ---------- */
  var lastCrumbKey = "";
  function centerWorld() { var a = area(); return { x: (a.x + a.w / 2 - tx) / s, y: (a.y + a.h / 2 - ty) / s }; }
  function inR(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
  function currentRegion(p) {
    var best = null, bd = Infinity;
    regions.forEach(function (R0) {
      var r = R0.r, dx = Math.max(r.x - p.x, 0, p.x - r.x - r.w), dy = Math.max(r.y - p.y, 0, p.y - r.y - r.h), d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = R0; }
    });
    return { R: best, inside: bd === 0, d: bd };
  }
  function updateHud() {
    if (mode !== "canvas" || !WW) return;
    var p = centerWorld(), cr = currentRegion(p);
    var trail = [{ label: "Report", act: function () { fitAll(); } }], key = "r";
    var a = area(), viewW = a.w / s;
    if (cr.R && (cr.inside || cr.d < viewW * 0.15) && s > fitAllScale() * 1.6) {
      var R0 = cr.R;
      trail.push({ label: pad2(R0.n) + " " + R0.title, act: function () { goRegion(R0.el); } });
      key += R0.n;
      crumbNodes.filter(function (n) { return n.region === R0.el && n.lods.indexOf(lod) >= 0 && inR(p, n.r); })
        .sort(function (x, y) { return x.depth - y.depth; })
        .forEach(function (n) { trail.push({ label: n.label, act: function () { goCrumb(n.el); } }); key += "|" + n.label; });
      mmActive(R0.el.id);
      if (lod >= 1 && cr.inside && R0.el.classList.contains("cloud") && !R0.el.hasAttribute("data-inked") && !reduce.matches && !anim) {
        R0.el.setAttribute("data-inked", ""); inkCloud(R0.el, s);
      }
    } else mmActive(null);
    if (key !== lastCrumbKey) { lastCrumbKey = key; renderCrumbs(trail); }
    $(".bp-zread", hudBot).textContent = Math.round(s * 100) + "%";
    var sc1 = s >= 1 ? s : 1 / s, scTxt = sc1 >= 10 ? String(Math.round(sc1)) : sc1.toFixed(1).replace(/\.0$/, "");
    var scEl = doc.getElementById("bp-scale");
    if (scEl) scEl.textContent = s >= 1 ? scTxt + " : 1" : "1 : " + scTxt;
    if (mmView) {
      var vt = hudTop.getBoundingClientRect().bottom;
      mmView.setAttribute("x", -tx / s); mmView.setAttribute("y", (vt - ty) / s);
      mmView.setAttribute("width", innerWidth / s); mmView.setAttribute("height", (innerHeight - vt) / s);
    }
  }
  function renderCrumbs(trail) {
    crumbsEl.innerHTML = "";
    trail.forEach(function (t, i) {
      var li = mk("li"), b = mk("button", { type: "button" }, t.label);
      if (t.act) b.addEventListener("click", t.act);
      if (i === trail.length - 1) b.setAttribute("aria-current", "location");
      li.appendChild(b); crumbsEl.appendChild(li);
    });
    // too long for the bar: keep the first and last crumbs, fold the middle into "…"
    var lis = crumbsEl.children;
    function crowded() {
      if (crumbsEl.scrollWidth > crumbsEl.clientWidth + 1) return true;
      return $$("li:not([hidden]) button", crumbsEl).some(function (b) { return b.scrollWidth > b.clientWidth + 1; });
    }
    if (lis.length > 2 && crowded()) {
      var ell = mk("li", { class: "ell", "aria-hidden": "true" }, "…");
      crumbsEl.insertBefore(ell, lis[1]);
      for (var ci = 2; ci < lis.length - 1 && crowded(); ci++) lis[ci].hidden = true;
    }
  }
  var NS = "http://www.w3.org/2000/svg";
  function svgEl(tag, attrs, parent, text) {
    var e = doc.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function buildMinimap() {
    mmSvg.innerHTML = ""; mmRects = {};
    mmSvg.setAttribute("viewBox", "0 0 " + WW + " " + WH);
    svgEl("rect", { width: WW, height: WH, class: "mm-bg" }, mmSvg);
    regions.forEach(function (R0) {
      mmRects[R0.el.id] = svgEl("rect", { x: R0.r.x, y: R0.r.y, width: R0.r.w, height: R0.r.h, class: "mm-r" }, mmSvg);
      svgEl("text", { x: R0.r.x + R0.r.w / 2, y: R0.r.y + R0.r.h / 2, class: "mm-t", "font-size": Math.round(WW / 28) }, mmSvg, pad2(R0.n));
    });
    mmView = svgEl("rect", { class: "mm-v" }, mmSvg);
    mmOn = null;
  }
  var mmOn = null;
  function mmActive(id) {
    if (id === mmOn) return;
    if (mmOn && mmRects[mmOn]) mmRects[mmOn].classList.remove("on");
    mmOn = id;
    if (id && mmRects[id]) mmRects[id].classList.add("on");
  }
  function updateTour() {
    var st = stops[tourIdx];
    if (!st) return;
    $(".tl-pos", hudBot).textContent = (tourIdx + 1) + "/" + stops.length;
    $(".tl-n", hudBot).textContent = st.how === "card" || st.how === "stop" ? (st.label || crumbLabel(st.el)) : st.how === "detail" ? st.region.title + " · detail" : st.region.title;
    announce("Tour stop " + (tourIdx + 1) + " of " + stops.length + ": " + st.name);
  }
  var srT = 0;
  function announce(msg) { clearTimeout(srT); srT = setTimeout(function () { if (srEl.textContent !== msg) srEl.textContent = msg; }, 450); }
  function syncTourToView() {
    var p = centerWorld(), cr = currentRegion(p);
    if (!cr.R) return;
    var idx = -1;
    for (var i = 0; i < stops.length; i++) {
      if (stops[i].region !== cr.R) continue;
      if (idx < 0) idx = i;
      if (lod === 2 && (stops[i].how === "detail" || ((stops[i].how === "card" || stops[i].how === "stop") && inR(p, stops[i].r)))) { idx = i; break; }
    }
    if (idx >= 0) { tourIdx = idx; updateTour(); }
  }

  /* =====================================================================
     INPUT: pointer (mouse / touch / pen), wheel, Safari gestures, keys
     One finger pans, two pinch-zoom around their midpoint. Hardened against pointercancel, lost
     capture, window blur / tab hidden, a mouse released outside the window, extra fingers, and stale
     pointers (a new primary pointer always starts a clean gesture).
     ===================================================================== */
  var pts = new Map(), drag = null, pinch = null, moved = false, suppressClick = false, gs = null, mmReset = function () {};
  var INTERACTIVE = "input,select,textarea,button,a,summary,label,[contenteditable],.rc-tip";
  function resetPointers() {
    pts.forEach(function (_, id) { try { if (vp.hasPointerCapture(id)) vp.releasePointerCapture(id); } catch (e) { /* gone */ } });
    var had = pts.size > 0;
    pts.clear(); drag = null; pinch = null; vp.classList.remove("dragging");
    if (had) syncTourToView();
  }
  function wireInput() {
    function startPinch() {
      var a = Array.from(pts.values()), mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
      pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s: s, wx: (mx - tx) / s, wy: (my - ty) / s };
      drag = null; moved = true;
    }
    function startDrag(p) { drag = { x: p.x, y: p.y, tx: tx, ty: ty, sx: p.x, sy: p.y }; }
    vp.addEventListener("pointerdown", function (e) {
      if (mode !== "canvas" || e.button > 0 || e.target.closest(INTERACTIVE)) return;
      if (e.isPrimary && pts.size) resetPointers();
      if (pts.size >= 2) return;
      cancelAnim();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { vp.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      if (pts.size === 1) { startDrag({ x: e.clientX, y: e.clientY }); moved = false; } else startPinch();
    });
    vp.addEventListener("pointermove", function (e) {
      if (!pts.has(e.pointerId)) return;
      if (e.pointerType === "mouse" && e.buttons === 0) return endPtr(e);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size >= 2) {
        var a = Array.from(pts.values()), mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2, d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
        s = clampS(pinch.s * d / Math.max(10, pinch.d)); tx = mx - pinch.wx * s; ty = my - pinch.wy * s; apply();
      } else if (drag) {
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!moved && Math.hypot(dx, dy) > 6) { moved = true; vp.classList.add("dragging"); }
        if (moved) { tx = drag.tx + (e.clientX - drag.x); ty = drag.ty + (e.clientY - drag.y); apply(); }
      }
    });
    function endPtr(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      try { if (vp.hasPointerCapture(e.pointerId)) vp.releasePointerCapture(e.pointerId); } catch (err) { /* ok */ }
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) startDrag(Array.from(pts.values())[0]);
      if (pts.size === 0) {
        vp.classList.remove("dragging");
        if (!moved && e.type === "pointerup") tapAt(e.clientX, e.clientY);
        else { suppressClick = true; setTimeout(function () { suppressClick = false; }, 50); syncTourToView(); }
        drag = null;
      }
    }
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (t) { vp.addEventListener(t, endPtr); });
    vp.addEventListener("click", function (e) { if (suppressClick) { e.preventDefault(); e.stopPropagation(); } }, true);
    window.addEventListener("blur", function () { resetPointers(); mmReset(); });
    doc.addEventListener("visibilitychange", function () { if (doc.hidden) { resetPointers(); mmReset(); } });

    vp.addEventListener("wheel", function (e) {
      if (mode !== "canvas") return;
      e.preventDefault(); cancelAnim();
      if (gs) return;
      var isPinch = e.ctrlKey;
      var mouseWheel = e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY));
      if (isPinch || mouseWheel) {
        var dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        zoomAt(Math.exp(-dy * (isPinch ? 0.01 : 0.0018)), e.clientX, e.clientY);
      } else { tx -= e.deltaX; ty -= e.deltaY; apply(); }
      clearTimeout(vp._wt); vp._wt = setTimeout(syncTourToView, 160);
    }, { passive: false });
    vp.addEventListener("scroll", function () { if (mode === "canvas") { vp.scrollTop = 0; vp.scrollLeft = 0; } });
    doc.addEventListener("gesturestart", function (e) { if (mode !== "canvas" || !vp.contains(e.target)) return; e.preventDefault(); if (pts.size) return; cancelAnim(); gs = { s: s }; }, { passive: false });
    doc.addEventListener("gesturechange", function (e) { if (mode !== "canvas" || !vp.contains(e.target)) return; e.preventDefault(); if (!gs || pts.size) return; zoomAt(gs.s * e.scale / s, e.clientX, e.clientY); }, { passive: false });
    doc.addEventListener("gestureend", function () { if (gs) { gs = null; syncTourToView(); } });

    doc.addEventListener("keydown", function (e) {
      if (mode === "list") { if (e.key === "Escape") setList(false); return; }
      if (!booted || e.target.closest("input,select,textarea,.levels-control,dialog") || e.metaKey || e.ctrlKey || e.altKey) return;
      var a = area(), c = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, k = e.key, step = e.shiftKey ? Math.round(a.h * 0.6) : 90, handled = true;
      if (k.indexOf("Arrow") === 0) cancelAnim();
      if (k === "+" || k === "=") zoomAt(1.35, c.x, c.y);
      else if (k === "-" || k === "_") zoomAt(1 / 1.35, c.x, c.y);
      else if (k === "ArrowLeft") { tx += step; apply(); }
      else if (k === "ArrowRight") { tx -= step; apply(); }
      else if (k === "ArrowUp") { ty += step; apply(); }
      else if (k === "ArrowDown") { ty -= step; apply(); }
      else if (k === "0") fitAll();
      else if (k === "Home" || k === "h" || k === "H") home();
      else if (k === "n" || k === "N" || k === "PageDown") goStop(tourIdx + 1);
      else if (k === "p" || k === "P" || k === "PageUp") goStop(tourIdx - 1);
      else if (k === "l" || k === "L") setList(true);
      else if (k === "Enter" && e.target.classList && e.target.classList.contains("region")) goRegion(e.target);
      else handled = false;
      if (handled) {
        e.preventDefault();
        if (k.indexOf("Arrow") === 0) { clearTimeout(vp._kt); vp._kt = setTimeout(syncTourToView, 200); }
      }
    });
    // keyboard focus moving into the drawing brings the focused thing into view (DOM order = reading order)
    sheet.addEventListener("focusin", function (e) {
      if (mode !== "canvas") return;
      vp.scrollTop = 0; vp.scrollLeft = 0;
      var t = e.target;
      if (t.classList.contains("region")) { if (!pts.size) goRegion(t); return; }
      var r = t.getBoundingClientRect(), a = area();
      if (r.top < a.y || r.bottom > a.y + a.h || r.left < 0 || r.right > a.w) {
        var box = t.closest(".card") || t.closest(".lod1, .lod2, .lod12") || t.closest(".region");
        fly(viewForRect(wrect(box), box.classList.contains("lod1") ? "l1" : box.classList.contains("region") ? "region" : "card"));
      }
    });

    // tap on the drawing: fly one level deeper toward what was tapped
    function tapAt(cx, cy) {
      var p = { x: (cx - tx) / s, y: (cy - ty) / s }, cr = currentRegion(p);
      if (!cr.R || !cr.inside) return;
      var cand = stops.filter(function (st) { return st.region === cr.R && inR(p, st.r); });
      for (var i = 0; i < cand.length; i++) {
        var v = viewForRect(cand[i].r, cand[i].how);
        if (v.s > s * 1.15) { tourIdx = stops.indexOf(cand[i]); updateTour(); return fly(v); }
      }
      if (lod < 2) {
        var a = area(), ns = clampS(Math.max(s * 1.8, T2 * 1.05));
        fly({ s: ns, x: a.x + a.w / 2 - p.x * ns, y: a.y + a.h / 2 - p.y * ns }, syncTourToView);
      }
    }

    // minimap
    (function () {
      var mm = mmSvg.parentNode, down = null;
      function moveTo(e) {
        var b = mmSvg.getBoundingClientRect(), wx = (e.clientX - b.left) / b.width * WW, wy = (e.clientY - b.top) / b.height * WH;
        var a = area(); cancelAnim(); tx = a.x + a.w / 2 - wx * s; ty = a.y + a.h / 2 - wy * s; apply();
      }
      function end(e) {
        if (down === null || (e && e.pointerId !== undefined && e.pointerId !== down)) return;
        try { if (mm.hasPointerCapture(down)) mm.releasePointerCapture(down); } catch (err) { /* ok */ }
        down = null; syncTourToView();
      }
      mmReset = function () { end(); };
      mm.addEventListener("pointerdown", function (e) {
        if (!e.isPrimary || e.button > 0) return;
        down = e.pointerId; try { mm.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        moveTo(e); e.preventDefault();
      });
      mm.addEventListener("pointermove", function (e) {
        if (e.pointerId !== down) return;
        if (e.pointerType === "mouse" && e.buttons === 0) return end(e);
        moveTo(e);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (t) { mm.addEventListener(t, end); });
    })();

    // buttons
    hudBot.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var act = b.getAttribute("data-act"), a = area();
      if (act === "prev") goStop(tourIdx - 1);
      else if (act === "next") goStop(tourIdx + 1);
      else if (act === "again") goStop(tourIdx);
      else if (act === "in") { cancelAnim(); zoomAt(1.4, a.x + a.w / 2, a.y + a.h / 2); syncTourToView(); }
      else if (act === "out") { cancelAnim(); zoomAt(1 / 1.4, a.x + a.w / 2, a.y + a.h / 2); syncTourToView(); }
      else if (act === "home") home();
      else if (act === "back") goBack();
    });
    lodBtns = $$(".bp-lodbar button", hudTop);
    lodBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        var L = +b.getAttribute("data-lodgo");
        if (L === 0) return fitAll();
        var a = area(), c = centerWorld();
        var ns = L === 1 ? Math.max(T1 * 1.15, Math.min(T2 * 0.9, (T1 + T2) / 2)) : Math.max(T2 * 1.12, Math.min(1, s));
        fly({ s: ns, x: a.x + a.w / 2 - c.x * ns, y: a.y + a.h / 2 - c.y * ns }, syncTourToView);
      });
    });
    listBtn.addEventListener("click", function () { setList(mode !== "list"); });
    $(".bp-skip").addEventListener("click", function (e) { e.preventDefault(); setList(true); });

    // links inside the drawing (citations, back-links, cross-references) fly to their target
    doc.addEventListener("click", function (e) {
      if (mode !== "canvas") return;
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || !sheet.contains(a)) return;
      var id;
      try { id = decodeURIComponent(a.getAttribute("href").slice(1)); } catch (err) { return; }
      var t = id && doc.getElementById(id);
      if (!t || !sheet.contains(t)) return;
      e.preventDefault();
      jumpTo(t);
    });
    window.addEventListener("resize", function () {
      clearTimeout(vp._rt);
      vp._rt = setTimeout(function () {
        if (!booted) return;
        invalidateArea();
        if (mode !== "canvas") return;
        if (isMobile() !== phoneLayout) { s = 1; tx = ty = 0; appliedS = 1; sheet.style.transform = ""; layout(); measure(); zones(); home(true); return; }
        var c = centerWorld(); measure();
        var a = area(); tx = a.x + a.w / 2 - c.x * s; ty = a.y + a.h / 2 - c.y * s; apply(); updateTour();
      }, 120);
    });
  }

  /* ---------- jumps with a way back ---------- */
  var backView = null;
  function jumpTo(t) {
    var from = currentRegion(centerWorld()).R;
    backView = { s: s, x: tx, y: ty, name: from ? from.title : "back" };
    var layer = t.closest(".lod1, .lod2, .lod12");
    var box = t.closest(".card") || t;
    var how = layer && layer.classList.contains("lod1") ? "l1" : "card";
    if (how === "l1") box = layer;
    fly(viewForRect(wrect(box), how), function () {
      t.classList.remove("bp-flash"); void t.offsetWidth; t.classList.add("bp-flash");
      syncTourToView();
    });
    $(".bp-back-name", hudBot).textContent = "Back to " + backView.name;
    $(".bp-backchip", hudBot).hidden = false;
  }
  function goBack() {
    if (backView) fly(backView, syncTourToView);
    $(".bp-backchip", hudBot).hidden = true;
    backView = null;
  }

  /* =====================================================================
     LIST VIEW: the same live page restyled as a document in reading order
     ===================================================================== */
  var savedView = null, spy = null;
  function buildListHead() {
    listHead = mk("div", { class: "bp-list-head", tabindex: "-1" });
    listHead.appendChild(mk("p", { class: "bp-list-intro" }, "The drawing as a list: same content, in reading order. Each section opens with its summary; “Full detail” holds the zoomed-in text."));
    var toc = mk("ol", { class: "bp-toc" });
    regions.forEach(function (R0) {
      var li = mk("li"), a = mk("a", { href: "#" + R0.el.id }, pad2(R0.n) + " " + R0.title);
      li.appendChild(a); toc.appendChild(li);
    });
    listHead.appendChild(toc);
    sheet.insertBefore(listHead, sheet.firstChild.nextSibling);
  }
  function listCrumb(t) {
    renderCrumbs([{ label: "List", act: function () { window.scrollTo(0, 0); } }, { label: t || "Top" }]);
    lastCrumbKey = "";
  }
  function setList(on) {
    if (on === (mode === "list") || !booted) return;
    if (on) {
      savedView = { s: s, x: tx, y: ty };
      cancelAnim(); resetPointers();
      mode = "list";
      body.classList.remove("bp-canvas"); body.classList.add("bp-list");
      sheet.style.transform = "";
      levelFigs.forEach(function (f) { if (f._levels) f._levels.go(f._levels.names.length - 1, false, true); });
      if (!listHead) buildListHead();
      listCrumb("Top");
      window.scrollTo(0, 0);
      if ("IntersectionObserver" in window) {
        spy = new IntersectionObserver(function (ents) {
          ents.forEach(function (en) { if (en.isIntersecting) { var r0 = regionOf(en.target); if (r0) listCrumb(pad2(r0.n) + " " + r0.title); } });
        }, { rootMargin: "-60px 0px -70% 0px" });
        regions.forEach(function (R0) { spy.observe(R0.el); });
      }
      listHead.focus({ preventScroll: true });
    } else {
      mode = "canvas";
      if (spy) { spy.disconnect(); spy = null; }
      body.classList.remove("bp-list"); body.classList.add("bp-canvas");
      window.scrollTo(0, 0);
      forceCharts(); syncFigureHeights();
      lastCrumbKey = ""; lod = -1; invalidateArea(); measure();
      setView(savedView || { s: s, x: tx, y: ty });
      updateTour();
    }
    vp.setAttribute("aria-roledescription", on ? "report" : "zoomable drawing");
    listBtn.setAttribute("aria-pressed", String(on));
    $(".lbl", listBtn).textContent = on ? "Back to canvas" : "Read as list";
    listBtn.title = on ? "Back to the canvas (Esc)" : "Read as list (L)";
  }

  /* =====================================================================
     REVISION CLOUDS (.region.cloud)
     ===================================================================== */
  function cloudPath(w, h, r) {
    function edge(x0, y0, x1, y1) {
      var len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / (r * 1.7))), out = "";
      for (var i = 1; i <= n; i++) out += "A" + r + "," + r + " 0 0 1 " + (x0 + (x1 - x0) * i / n).toFixed(1) + "," + (y0 + (y1 - y0) * i / n).toFixed(1);
      return out;
    }
    return "M0,0" + edge(0, 0, w, 0) + edge(w, 0, w, h) + edge(w, h, 0, h) + edge(0, h, 0, 0) + "Z";
  }
  function drawCloud(reg) {
    var old = $(":scope > .bp-cloud", reg);
    if (old) old.remove();
    var w = reg.offsetWidth, h = reg.offsetHeight;
    if (!w || !h) return;
    var svg = svgEl("svg", { class: "bp-cloud", viewBox: "0 0 " + w + " " + h, width: w, height: h, "aria-hidden": "true" });
    svgEl("path", { d: cloudPath(w, h, 46) }, svg);
    reg.insertBefore(svg, reg.firstChild);
  }
  function inkCloud(reg, scale) {
    var base = $(":scope > .bp-cloud path", reg);
    if (!base || !base.animate) return;
    var p = base.cloneNode();
    p.setAttribute("class", "ink"); p.setAttribute("pathLength", "1");
    p.style.strokeWidth = (3.2 / Math.max(scale, 0.05)).toFixed(2); p.style.strokeDasharray = "1 1";
    base.parentNode.appendChild(p);
    var an = p.animate([{ strokeDashoffset: 1, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.75 }, { strokeDashoffset: 0, opacity: 0 }], { duration: 1300, easing: "cubic-bezier(.45,0,.25,1)" });
    an.onfinish = an.oncancel = function () { p.remove(); };
  }

  /* ---------- sheet zones (drawing border references) ---------- */
  function zones() {
    var z = $(".bp-zones", sheet);
    z.innerHTML = "";
    var cols = Math.max(4, Math.round(WW / 700)), rows = Math.max(4, Math.round(WH / 700));
    for (var i = 0; i < cols; i++) { var t = mk("span", null, String(i + 1)); t.style.left = (60 + (WW - 120) * (i + 0.5) / cols - 10) + "px"; t.style.top = "64px"; z.appendChild(t); }
    for (var j = 0; j < rows && j < 26; j++) { var u = mk("span", null, String.fromCharCode(65 + j)); u.style.left = "72px"; u.style.top = (60 + (WH - 120) * (j + 0.5) / rows - 14) + "px"; z.appendChild(u); }
  }

  /* =====================================================================
     LEGIBILITY GUARD: warns when text can't be read at its layer's threshold, or an L2 card can't be
     framed at L2. Console always; on screen with ?dev (or <body data-dev>).
     ===================================================================== */
  function guard() {
    guardIssues = [];
    $$(".bp-guard-hit").forEach(function (e) { e.classList.remove("bp-guard-hit"); });
    var a = { w: 1266, h: 760 };
    regions.forEach(function (R0) {
      var seen = 0;
      $$("*", R0.el).forEach(function (e) {
        if (seen > 2 || /^(SCRIPT|STYLE|TEMPLATE)$/.test(e.tagName) || e.closest("svg, .bp-l0, a.cite, button, .ev-note, .sr-only, [aria-hidden='true'], .list-only")) return;
        var hasText = Array.prototype.some.call(e.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
        if (!hasText) return;
        var layer = e.closest(".lod1, .lod2, .lod12");
        if (!layer) return;
        var th = layer.classList.contains("lod2") ? T2 : T1;
        // inside a figure whose levels follow the zoom, data-from="2" content only shows at L2
        var lvl = e.closest("[data-from]");
        if (lvl && lvl.closest(".bp-synced") && +lvl.getAttribute("data-from") >= 2) th = T2;
        var z = (e.getClientRects().length && e.currentCSSZoom) || zoomChain(e);
        var px = parseFloat(getComputedStyle(e).fontSize) * z * th;
        if (px < MIN_PX - 0.05) {
          seen++;
          issue(R0, e, "text is " + px.toFixed(1) + " px on screen at " + (th === T2 ? "L2" : "L1") + " (needs ≥ " + MIN_PX + "): “" + txt(e).slice(0, 50) + "”");
        }
      });
      // L2 cards must be framable at the L2 threshold without panning
      $$(".lod2 .card", R0.el).forEach(function (c) {
        var r = wrect(c);
        if (r.h * T2 > a.h * 1.6 || r.w * T2 > a.w * 1.2) issue(R0, c, "card “" + crumbLabel(c) + "” is too big to read at L2 without panning; split it");
      });
    });
    if (!guardIssues.length) { if (DEV) devPanel(); return; }
    console.warn("blueprint: " + guardIssues.length + " legibility issue(s)" + (DEV ? "" : " (open with ?dev to see them on the drawing)"));
    guardIssues.forEach(function (g) { console.warn("blueprint: " + pad2(g.region.n) + " " + g.region.title + ": " + g.msg, g.el); });
    if (DEV) devPanel();
  }
  function zoomChain(e) { var z = 1; for (var p = e; p && p !== sheet; p = p.parentElement) z *= parseFloat(getComputedStyle(p).zoom) || 1; return z; }
  function issue(R0, e, msg) { guardIssues.push({ region: R0, el: e, msg: msg }); if (DEV) e.classList.add("bp-guard-hit"); }
  function devPanel() {
    var p = $(".bp-dev") || body.appendChild(mk("aside", { class: "bp-dev", "aria-label": "Blueprint dev mode" }));
    p.innerHTML = "";
    p.appendChild(mk("h2", null, "Dev · " + regions.length + " regions · world " + Math.round(WW) + "×" + Math.round(WH) + " · " + (guardIssues.length ? guardIssues.length + " issue(s)" : "no legibility issues")));
    var ul = mk("ul");
    guardIssues.forEach(function (g) {
      var li = mk("li"), b = mk("button", { type: "button" }, pad2(g.region.n) + " " + g.region.title);
      b.addEventListener("click", function () { if (mode === "canvas") fly(viewForRect(wrect(g.el), "card")); });
      li.appendChild(b); li.appendChild(doc.createTextNode(" " + g.msg)); ul.appendChild(li);
    });
    p.appendChild(ul);
  }

  /* =====================================================================
     BOOT
     ===================================================================== */
  function boot() {
    invalidateArea();
    layout();
    s = 1; tx = 0; ty = 0; appliedS = 1; sheet.style.transform = "";
    measure(); zones();
    $$(".region.cloud", sheet).forEach(function (reg) {
      drawCloud(reg);
      if ("ResizeObserver" in window) {
        var lw = 0, lh = 0;
        new ResizeObserver(function () { var w = reg.offsetWidth, h = reg.offsetHeight; if (w && (w !== lw || h !== lh)) { lw = w; lh = h; drawCloud(reg); } }).observe(reg);
      }
    });
    booted = true;
    body.classList.add("bp-booted");
    root.classList.remove("bp-failed");
    home(true);
    if (location.hash === "#list") setList(true);
    // content that changes size later (notes, "Show data", model text) re-measures the drawing
    if ("ResizeObserver" in window) {
      var t = 0;
      new ResizeObserver(function () {
        clearTimeout(t);
        t = setTimeout(function () { if (mode === "canvas" && !anim && !pts.size) { measure(); zones(); updateHud(); } }, 150);
      }).observe(sheet);
    }
    setTimeout(guard, 300);
  }

  R.blueprint = {
    goStop: goStop, fitAll: fitAll, setList: setList, guard: guard,
    state: function () { return { s: s, tx: tx, ty: ty, lod: lod, tour: tourIdx, stops: stops.length, mode: mode, world: [WW, WH], issues: guardIssues.length }; },
    stops: function () { return stops.map(function (x) { return x.name; }); }
  };
})();
