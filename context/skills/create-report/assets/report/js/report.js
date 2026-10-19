/* create-report runtime: navigation, citations, evidence legend, layered explorers,
   step-throughs, interactive explorers, charts (Chart.js) and diagrams (Mermaid).
   Libraries in assets/vendor/ load only when the page uses them. */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var charts = {};
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function el(tag, attrs, text) {
    var e = doc.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function cssVar(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section"; }
  function visible(e) { return e.getClientRects().length > 0; }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = el("script", { src: src });
      s.onload = resolve;
      s.onerror = function () { reject(new Error("could not load " + src)); };
      doc.head.appendChild(s);
    });
  }

  /* ---------- Number formatting (explorers, chart axes and tooltips) ---------- */
  function fmt(value, format, opts) {
    opts = opts || {};
    if (value == null || (typeof value === "number" && !isFinite(value))) return "–";
    if (format === "date" && (value instanceof Date || typeof value === "string")) {
      var d = new Date(value);
      if (!isNaN(d)) return d.toLocaleDateString(opts.locale || undefined, { month: "short", day: "numeric" });
    }
    if (typeof value !== "number") return String(value);
    var lang = opts.locale || undefined;
    var digits = opts.digits != null ? Number(opts.digits) : null;
    switch (format) {
      case "currency":
        return new Intl.NumberFormat(lang, {
          style: "currency", currency: opts.currency || "USD",
          notation: Math.abs(value) >= 1e6 ? "compact" : "standard",
          maximumFractionDigits: digits != null ? digits : (Math.abs(value) >= 100 ? 0 : 2)
        }).format(value);
      case "percent":
        return new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: digits != null ? digits : 1 }).format(value);
      case "int":
        return new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(value);
      case "compact":
        return new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: digits != null ? digits : 1 }).format(value);
      case "raw":
        return String(value);
      case "date": // a timestamp in ms; Date objects and ISO strings are handled below
        return new Date(value).toLocaleDateString(lang, { month: "short", day: "numeric" });
      default:
        return new Intl.NumberFormat(lang, { maximumFractionDigits: digits != null ? digits : 2 }).format(value);
    }
  }
  function fmtFor(node, value) {
    var out = fmt(value, node.getAttribute("data-format"), {
      currency: node.getAttribute("data-currency"), digits: node.getAttribute("data-digits")
    });
    return (node.getAttribute("data-prefix") || "") + out + (node.getAttribute("data-suffix") || "");
  }

  /* ---------- Reading progress ---------- */
  function initProgress() {
    var bar = el("div", { class: "progress", "aria-hidden": "true" });
    var fill = el("span");
    bar.appendChild(fill);
    doc.body.appendChild(bar);
    function update() {
      var h = root.scrollHeight - root.clientHeight;
      fill.style.width = (h > 0 ? (root.scrollTop / h) * 100 : 0) + "%";
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  /* ---------- Table of contents + scrollspy ---------- */
  function initToc() {
    var nav = $("nav.toc");
    var sections = $$("main > section").filter(function (s) { return $("h2", s); });
    if (!nav || !sections.length) return;

    var list = el("ol", { class: "toc-list", id: "toc-list" });
    var links = [];
    sections.forEach(function (s, i) {
      var h2 = $("h2", s);
      if (!s.id) s.id = slugify(h2.textContent);
      if (!s.classList.contains("tldr")) h2.setAttribute("data-num", String(i).padStart(2, "0"));
      var li = el("li");
      var a = el("a", { href: "#" + s.id }, s.getAttribute("data-toc") || h2.textContent);
      li.appendChild(a);
      links.push({ a: a, target: s, title: a.textContent });
      var subs = $$("h3[id]", s);
      if (subs.length) {
        var ol = el("ol");
        subs.forEach(function (h3) {
          var sa = el("a", { href: "#" + h3.id }, h3.getAttribute("data-toc") || h3.textContent);
          var sli = el("li");
          sli.appendChild(sa);
          ol.appendChild(sli);
        });
        li.appendChild(ol);
      }
      list.appendChild(li);
    });

    var toggle = el("button", { class: "toc-toggle", type: "button", "aria-expanded": "false", "aria-controls": "toc-list" });
    var label = el("span", { class: "toc-label" }, "Contents");
    var current = el("span", { class: "toc-current" }, links[0].title);
    toggle.appendChild(label);
    toggle.appendChild(current);
    nav.innerHTML = "";
    nav.appendChild(toggle);
    nav.appendChild(list);

    function setOpen(open) {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    }
    toggle.addEventListener("click", function () { setOpen(!nav.classList.contains("open")); });
    list.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    doc.addEventListener("click", function (e) { if (!nav.contains(e.target)) setOpen(false); });

    function spy() {
      var y = window.innerHeight * 0.3;
      var active = links[0];
      links.forEach(function (l) { if (l.target.getBoundingClientRect().top <= y) active = l; });
      links.forEach(function (l) { l.a.classList.toggle("active", l === active); });
      current.textContent = active.title;
    }
    window.addEventListener("scroll", spy, { passive: true });
    spy();
  }

  /* ---------- Citations: <a class="cite" href="#src-key"></a> -> [n], with back-links ---------- */
  function initCitations() {
    // Number sources by first citation in the text; uncited ones keep their order at the end.
    var list = $(".sources");
    if (list) {
      var order = [];
      $$("a.cite").forEach(function (a) {
        var id = (a.getAttribute("href") || "").replace(/^#/, "");
        if (order.indexOf(id) < 0) order.push(id);
      });
      $$(":scope > li[id]", list).sort(function (x, y) {
        var i = order.indexOf(x.id), j = order.indexOf(y.id);
        return (i < 0 ? 1e9 : i) - (j < 0 ? 1e9 : j);
      }).forEach(function (li) { list.appendChild(li); });
    }
    var sources = $$(".sources > li[id]");
    var index = {};
    sources.forEach(function (li, i) { index[li.id] = i + 1; li.setAttribute("value", i + 1); });
    var refs = {};
    $$("a.cite").forEach(function (a, i) {
      var id = (a.getAttribute("href") || "").replace(/^#/, "");
      if (!index[id]) {
        a.classList.add("missing");
        a.textContent = "?";
        console.warn("create-report: citation to missing source #" + id);
        return;
      }
      a.textContent = index[id];
      a.id = a.id || "ref-" + id + "-" + i;
      a.setAttribute("aria-label", "Source " + index[id]);
      (refs[id] = refs[id] || []).push(a.id);
    });
    sources.forEach(function (li) {
      var ids = refs[li.id];
      if (!ids) return;
      var span = el("span", { class: "backrefs" });
      ids.forEach(function (rid, k) {
        span.appendChild(el("a", { href: "#" + rid, "aria-label": "Back to citation" }, ids.length > 1 ? "↩" + (k + 1) : "↩"));
      });
      li.appendChild(span);
    });
  }

  /* ---------- Evidence tags: tooltips + a legend in the TL;DR ---------- */
  var EV = {
    fact: "Sourced fact",
    estimate: "Estimate: derived or approximate",
    assumption: "Assumption: taken as given, not verified",
    interpretation: "Interpretation: the author's reading of the evidence"
  };
  function initEvidence() {
    var used = {};
    $$("span.ev[data-ev]").forEach(function (s) {
      var k = s.getAttribute("data-ev");
      used[k] = true;
      if (!s.title && EV[k]) s.title = EV[k];
      s.tabIndex = 0;
    });
    $$(":is(div,p,aside).ev[data-ev]").forEach(function (s) { used[s.getAttribute("data-ev")] = true; });
    var kinds = Object.keys(EV).filter(function (k) { return used[k]; });
    var tldr = $(".tldr");
    if (!kinds.length || !tldr || $(".ev-legend")) return;
    var legend = el("p", { class: "ev-legend" });
    legend.appendChild(el("span", null, "Marked in text:"));
    kinds.forEach(function (k) {
      legend.appendChild(el("span", { class: "ev", "data-ev": k }, EV[k].split(":")[0]));
    });
    tldr.appendChild(legend);
  }

  /* ---------- Stacks: layered explorer (.layers > .layer) and step-through (.steps > .step) ---------- */
  function initStacks() {
    $$(".layers, .steps").forEach(function (box) {
      var isLayers = box.classList.contains("layers");
      var panes = $$(isLayers ? ":scope > .layer" : ":scope > .step", box);
      if (panes.length < 2) return;
      var titles = panes.map(function (p, i) { return p.getAttribute("data-title") || (isLayers ? "Level " : "Step ") + (i + 1); });
      var cur = 0;

      var bar = el("div", { class: "stack-bar" });
      var crumbs = el("div", { class: "crumbs", role: "tablist", "aria-label": box.getAttribute("data-label") || (isLayers ? "Depth" : "Steps") });
      var controls = el("div", { class: "stack-controls" });
      var prev = el("button", { type: "button", "aria-label": isLayers ? "Zoom out" : "Previous" }, isLayers ? "−" : "←");
      var next = el("button", { type: "button", "aria-label": isLayers ? "Zoom in" : "Next" }, isLayers ? "+" : "→");
      var count = el("span", { class: "count" });
      var range = null;
      var dots = null;
      var crumbBtns = [];

      if (isLayers) {
        titles.forEach(function (t, i) {
          if (i) crumbs.appendChild(el("span", { class: "sep", "aria-hidden": "true" }, "›"));
          var b = el("button", { type: "button", role: "tab" }, t);
          b.addEventListener("click", function () { go(i); });
          crumbs.appendChild(b);
          crumbBtns.push(b);
        });
        range = el("input", { type: "range", min: "0", max: String(panes.length - 1), step: "1", value: "0", "aria-label": "Depth" });
        range.addEventListener("input", function () { go(Number(range.value)); });
        controls.appendChild(prev);
        controls.appendChild(range);
        controls.appendChild(next);
      } else {
        var heading = el("div", { class: "crumbs" });
        crumbBtns.push(heading);
        crumbs = heading;
        dots = el("div", { class: "dots" });
        panes.forEach(function (_, i) {
          var d = el("button", { type: "button", "aria-label": titles[i] });
          d.addEventListener("click", function () { go(i); });
          dots.appendChild(d);
        });
        controls.appendChild(prev);
        controls.appendChild(dots);
        controls.appendChild(next);
      }
      controls.appendChild(count);
      bar.appendChild(crumbs);
      bar.appendChild(controls);
      box.insertBefore(bar, box.firstChild);

      prev.addEventListener("click", function () { go(cur - 1); });
      next.addEventListener("click", function () { go(cur + 1); });
      box.tabIndex = 0;
      box.addEventListener("keydown", function (e) {
        if (e.target.matches("input, select, textarea")) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "+") { e.preventDefault(); go(cur + 1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "-") { e.preventDefault(); go(cur - 1); }
      });

      // Swipe between panes on touch screens.
      var x0 = null;
      box.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      box.addEventListener("touchend", function (e) {
        if (x0 == null || e.target.closest(".stack-bar, input, .mermaid, canvas")) { x0 = null; return; }
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 60) go(cur + (dx < 0 ? 1 : -1));
        x0 = null;
      }, { passive: true });

      function go(i, initial) {
        i = Math.max(0, Math.min(panes.length - 1, i));
        var dirUp = i < cur;
        cur = i;
        panes.forEach(function (p, k) {
          p.hidden = k !== i;
          p.classList.remove("entering", "up");
        });
        if (!initial && !reduceMotion) {
          void panes[i].offsetWidth;
          panes[i].classList.add("entering");
          if (dirUp) panes[i].classList.add("up");
        }
        prev.disabled = i === 0;
        next.disabled = i === panes.length - 1;
        count.textContent = (i + 1) + " / " + panes.length;
        if (isLayers) {
          range.value = String(i);
          crumbBtns.forEach(function (b, k) {
            b.className = k < i ? "past" : k === i ? "current" : "future";
            b.setAttribute("aria-selected", String(k === i));
          });
        } else {
          crumbs.textContent = titles[i];
          $$("button", dots).forEach(function (d, k) { d.classList.toggle("current", k === i); });
        }
        renderDiagrams();
        resizeCharts(panes[i]);
      }
      go(0, true);
    });
  }

  /* ---------- Zoom: full-screen view for diagrams and marked images ---------- */
  function initZoom() {
    var dialog = null;
    function open(content) {
      if (!dialog) {
        dialog = el("dialog", { class: "zoom" });
        var close = el("button", { class: "zoom-close", type: "button", "aria-label": "Close" }, "✕");
        close.addEventListener("click", function () { dialog.close(); });
        dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
        dialog.appendChild(close);
        dialog.appendChild(el("div", { class: "zoom-content" }));
        doc.body.appendChild(dialog);
      }
      var box = $(".zoom-content", dialog);
      box.innerHTML = "";
      box.appendChild(content);
      dialog.showModal();
    }
    $$(".diagram, .figure[data-zoom]").forEach(function (fig) {
      var btn = el("button", { class: "zoom-btn", type: "button", "aria-label": "Expand", title: "Expand" }, "⤢");
      btn.addEventListener("click", function () {
        var target = fig.classList.contains("diagram") ? $(".mermaid svg", fig) || $("svg, img", fig) : $("img", fig);
        if (!target) return;
        if (target.tagName === "IMG") {
          var img = el("img", { src: target.currentSrc || target.src, alt: target.alt });
          open(img);
        } else {
          open(target.cloneNode(true));
        }
      });
      fig.appendChild(btn);
    });
  }

  /* ---------- Mermaid diagrams ---------- */
  var mermaidReady = null;
  function initMermaid() {
    if (!$(".mermaid")) return Promise.resolve();
    mermaidReady = loadScript("assets/vendor/mermaid.min.js").then(function () {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        securityLevel: "strict",
        fontFamily: cssVar("--font-body"),
        themeVariables: {
          background: cssVar("--bg-2"),
          primaryColor: cssVar("--bg-3"),
          primaryTextColor: cssVar("--ink"),
          primaryBorderColor: cssVar("--accent"),
          secondaryColor: cssVar("--bg-2"),
          tertiaryColor: cssVar("--bg"),
          lineColor: cssVar("--ink-2"),
          textColor: cssVar("--ink"),
          noteBkgColor: cssVar("--bg-3"),
          noteTextColor: cssVar("--ink"),
          noteBorderColor: cssVar("--ink-3"),
          actorBkg: cssVar("--bg-3"),
          actorBorder: cssVar("--accent"),
          actorTextColor: cssVar("--ink"),
          signalColor: cssVar("--ink-2"),
          signalTextColor: cssVar("--ink"),
          labelBoxBkgColor: cssVar("--bg-3"),
          clusterBkg: cssVar("--bg"),
          clusterBorder: cssVar("--ink-3"),
          edgeLabelBackground: cssVar("--bg-2"),
          fontSize: "15px"
        }
      });
      return renderDiagrams();
    }).catch(function (e) {
      console.warn("create-report:", e.message);
      $$(".mermaid").forEach(function (m) { m.style.color = "inherit"; });
    });
    return mermaidReady;
  }
  // Mermaid measures text, so only draw diagrams that are on screen (not in a closed
  // <details> or a hidden layer); the rest are drawn when they are revealed.
  function renderDiagrams() {
    if (!window.mermaid || !mermaidReady) return Promise.resolve();
    var nodes = $$(".mermaid:not([data-processed])").filter(visible);
    if (!nodes.length) return Promise.resolve();
    return window.mermaid.run({ nodes: nodes }).catch(function (e) { console.warn("create-report: mermaid:", e); });
  }

  /* ---------- Charts ---------- */
  var PALETTE = ["--c1", "--c2", "--c3", "--c4", "--c5", "--c6"];
  function chartDefaults(Chart) {
    Chart.defaults.font.family = cssVar("--font-body");
    Chart.defaults.color = cssVar("--ink-2");
    Chart.defaults.borderColor = cssVar("--grid");
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.plugins.tooltip.backgroundColor = cssVar("--bg-3") || "#222";
    Chart.defaults.plugins.tooltip.titleColor = cssVar("--ink");
    Chart.defaults.plugins.tooltip.bodyColor = cssVar("--ink");
    Chart.defaults.plugins.tooltip.borderColor = cssVar("--line");
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    if (reduceMotion) Chart.defaults.animation = false;
  }
  function styleDatasets(cfg) {
    var colors = PALETTE.map(cssVar);
    var type = cfg.type;
    var perPoint = type === "pie" || type === "doughnut" || type === "polarArea";
    (cfg.data.datasets || []).forEach(function (ds, i) {
      var t = ds.type || type;
      var c = colors[i % colors.length];
      if (perPoint) {
        if (!ds.backgroundColor) ds.backgroundColor = cfg.data.labels.map(function (_, k) { return colors[k % colors.length]; });
        if (ds.borderColor == null) ds.borderColor = cssVar("--bg-2");
        if (ds.borderWidth == null) ds.borderWidth = 2;
      } else if (t === "line" || t === "radar") {
        if (!ds.borderColor) ds.borderColor = c;
        if (!ds.backgroundColor) ds.backgroundColor = ds.fill ? c + "33" : c;
        if (ds.borderWidth == null) ds.borderWidth = 2;
        if (ds.pointRadius == null) ds.pointRadius = 0;
        if (ds.pointHoverRadius == null) ds.pointHoverRadius = 5;
        if (ds.tension == null) ds.tension = 0;
      } else if (t === "scatter" || t === "bubble") {
        if (!ds.backgroundColor) ds.backgroundColor = c;
        if (ds.pointRadius == null && t === "scatter") ds.pointRadius = 5;
      } else {
        if (!ds.backgroundColor) ds.backgroundColor = c;
        if (ds.borderRadius == null) ds.borderRadius = 4;
        if (ds.borderSkipped == null) ds.borderSkipped = "start";
        if (ds.maxBarThickness == null) ds.maxBarThickness = 48;
      }
    });
    var opts = cfg.options = cfg.options || {};
    opts.plugins = opts.plugins || {};
    opts.plugins.legend = opts.plugins.legend || {};
    if (opts.plugins.legend.display == null) {
      opts.plugins.legend.display = perPoint || (cfg.data.datasets || []).length > 1;
    }
    if (!perPoint && opts.interaction == null) opts.interaction = { mode: "index", intersect: false };
    if (cfg.format) {
      var f = function (v) { return fmt(v, cfg.format, { currency: cfg.currency }); };
      var valueAxis = opts.indexAxis === "y" ? "x" : "y";
      opts.scales = opts.scales || {};
      if (!perPoint) {
        opts.scales[valueAxis] = opts.scales[valueAxis] || {};
        opts.scales[valueAxis].ticks = opts.scales[valueAxis].ticks || {};
        opts.scales[valueAxis].ticks.callback = function (v) { return f(v); };
      }
      opts.plugins.tooltip = opts.plugins.tooltip || {};
      opts.plugins.tooltip.callbacks = {
        label: function (ctx) {
          var v = ctx.parsed && typeof ctx.parsed === "object" ? ctx.parsed[valueAxis] : ctx.parsed;
          return (ctx.dataset.label ? ctx.dataset.label + ": " : (ctx.label ? ctx.label + ": " : "")) + f(v);
        }
      };
    }
    delete cfg.format;
    delete cfg.currency;
    return cfg;
  }
  function dataTable(cfg) {
    var labels = cfg.data.labels || [];
    var sets = cfg.data.datasets || [];
    var table = el("table");
    var head = el("tr");
    head.appendChild(el("th", null, ""));
    sets.forEach(function (ds, i) { head.appendChild(el("th", { class: "num" }, ds.label || "Series " + (i + 1))); });
    table.appendChild(el("thead")).appendChild(head);
    var body = el("tbody");
    var rows = labels.length || Math.max.apply(null, sets.map(function (d) { return d.data.length; }));
    for (var r = 0; r < rows; r++) {
      var tr = el("tr");
      tr.appendChild(el("th", null, labels[r] != null ? String(labels[r]) : String(r + 1)));
      sets.forEach(function (ds) {
        var v = ds.data[r];
        var text = v != null && typeof v === "object" ? Object.keys(v).map(function (k) { return k + " " + v[k]; }).join(", ") : v;
        tr.appendChild(el("td", { class: "num" }, text == null ? "" : String(text)));
      });
      body.appendChild(tr);
    }
    table.appendChild(body);
    var wrap = el("div", { class: "table-wrap" });
    wrap.appendChild(table);
    var det = el("details", { class: "chart-data" });
    det.appendChild(el("summary", null, "Show data"));
    det.appendChild(wrap);
    return det;
  }
  function initCharts() {
    var figs = $$(".chart");
    if (!figs.length) return Promise.resolve();
    return loadScript("assets/vendor/chart.umd.min.js").then(function () {
      var Chart = window.Chart;
      chartDefaults(Chart);
      figs.forEach(function (fig, i) {
        var src = $('script[type="application/json"]', fig);
        if (!src) return;
        var cfg;
        try { cfg = JSON.parse(src.textContent); } catch (e) { console.warn("create-report: bad chart JSON in #" + fig.id, e); return; }
        var showTable = cfg.table !== false;
        delete cfg.table;
        var box = $(".chart-box", fig);
        if (!box) {
          box = el("div", { class: "chart-box" + (cfg.tall ? " tall" : "") });
          var cap = $("figcaption", fig);
          fig.insertBefore(box, cap || null);
        }
        delete cfg.tall;
        var canvas = $("canvas", box) || box.appendChild(el("canvas", { role: "img", "aria-label": ($("figcaption", fig) || {}).textContent || "Chart" }));
        styleDatasets(cfg);
        if (showTable) fig.appendChild(dataTable(cfg));
        charts[fig.id || "chart-" + i] = new Chart(canvas, cfg);
      });
    }).catch(function (e) { console.warn("create-report:", e.message); });
  }
  function resizeCharts(scope) {
    if (!window.Chart) return;
    $$("canvas", scope).forEach(function (c) { var ch = window.Chart.getChart(c); if (ch) ch.resize(); });
  }

  /* ---------- Interactive explorers ---------- */
  function readInputs(box) {
    var v = {};
    $$("input[name], select[name]", box).forEach(function (inp) {
      if (inp.type === "checkbox") v[inp.name] = inp.checked;
      else if (inp.type === "radio") { if (inp.checked) v[inp.name] = isNaN(inp.value) ? inp.value : Number(inp.value); }
      else v[inp.name] = inp.value === "" || isNaN(inp.value) ? inp.value : Number(inp.value);
    });
    return v;
  }
  function explorer(selector, compute) {
    var box = typeof selector === "string" ? $(selector) : selector;
    if (!box) { console.warn("create-report: explorer " + selector + " not found"); return; }
    function run() {
      var v = readInputs(box);
      $$("input[name], select[name]", box).forEach(function (inp) {
        var out = $('output[data-for="' + inp.name + '"]', box) || (inp.closest("label") && $("output", inp.closest("label")));
        if (out && inp.type !== "radio") out.textContent = fmtFor(inp, inp.type === "checkbox" ? (inp.checked ? "on" : "off") : v[inp.name]);
      });
      var res;
      try { res = compute(v, { chart: chart, fmt: fmt }) || {}; } catch (e) { console.error("create-report: explorer model error", e); return; }
      Object.keys(res).forEach(function (k) {
        $$('[data-out="' + k + '"]', box).forEach(function (o) { o.textContent = fmtFor(o, res[k]); });
      });
    }
    ready.then(function () {
      box.addEventListener("input", run);
      box.addEventListener("change", run);
      run();
    });
  }
  function chart(id) { return charts[id] || null; }

  /* ---------- Metadata drawer (from report.json) + reading time ---------- */
  function niceDate(s) {
    var d = new Date(s + (s && s.length === 10 ? "T12:00:00" : ""));
    return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  function initMeta() {
    var main = $("main");
    var words = main ? (main.innerText || main.textContent).split(/\s+/).length : 0;
    var minutes = Math.max(1, Math.round(words / 230));
    $$('[data-meta="reading-time"]').forEach(function (n) { n.textContent = minutes + " min read"; });
    var panel = $(".meta-panel");
    return fetch("report.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (m) {
      $$('[data-meta="date"]').forEach(function (n) {
        n.setAttribute("datetime", m.date);
        n.textContent = niceDate(m.date) + (m.updated ? " · updated " + niceDate(m.updated) : "");
      });
      if (!panel) return;
      var dl = el("dl");
      function row(k, v) { if (!v || (Array.isArray(v) && !v.length)) return; dl.appendChild(el("dt", null, k)); dl.appendChild(el("dd", null, Array.isArray(v) ? v.join(", ") : String(v))); }
      row("Created", niceDate(m.date));
      row("Updated", m.updated && niceDate(m.updated));
      row("Model", m.model);
      row("Agent", m.agent);
      row("Tags", m.tags);
      row("Sources", String($$(".sources > li").length || ""));
      row("Length", minutes + " min read");
      row("Report ID", m.slug);
      panel.innerHTML = "";
      panel.appendChild(dl);
    }).catch(function () { /* report.json unavailable (e.g. opened as a file): keep the static header. */ });
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    // Automated browsers (screenshots) get everything visible and loaded at once.
    if (navigator.webdriver) $$('img[loading="lazy"]').forEach(function (i) { i.loading = "eager"; });
    if (reduceMotion || navigator.webdriver || !("IntersectionObserver" in window)) return;
    var targets = $$("main > section > :is(figure, .kpis, .findings, .reconcile, .layers, .steps, .explorer, .table-wrap, .figure-row, .recs, .risks)");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    targets.forEach(function (t) {
      if (t.getBoundingClientRect().top < window.innerHeight) return;
      t.classList.add("reveal");
      io.observe(t);
    });
  }

  function init() {
    initProgress();
    initToc();
    initCitations();
    initEvidence();
    initStacks();
    initReveal();
    var meta = initMeta();
    var libs = Promise.all([initCharts(), initMermaid()]).then(initZoom);
    // A diagram inside a <details> that opens, or a newly revealed section, gets drawn then.
    doc.addEventListener("toggle", function (e) { renderDiagrams(); resizeCharts(e.target); }, true);
    queued.forEach(function (args) { explorer.apply(null, args); });
    Promise.all([meta, libs]).then(function () { readyResolve(); });
  }

  var queued = (window.Report && window.Report.q) || [];
  window.Report = { explorer: explorer, chart: chart, fmt: fmt, ready: ready };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
