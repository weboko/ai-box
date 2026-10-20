/* create-report core: what every template shares.
   - Report.fmt / data-format: number formatting
   - Report.model(): the report's live model (params + compute), bound to [data-out],
     [data-param] inputs and [data-param-value] read-outs, with a "update" event
   - citations (a.cite → [n], sources numbered by first citation, back-links)
   - evidence marks (.ev[data-ev]): labels, estimate notes, legend
   - metadata from report.json ([data-meta], .meta-panel)
   - layered figures (figure[data-levels] with data-from / data-to inside)
   - helpers for templates: Report.on, Report.hook, Report.observeResize, Report.util
   Load order (all defer): core.js, charts.js, model.js (optional), template.js. */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  root.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function el(tag, attrs, text) {
    var e = doc.createElement(tag);
    for (var k in attrs || {}) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function cssVar(name, ctx) { return getComputedStyle(ctx || root).getPropertyValue(name).trim(); }
  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section"; }
  function get(obj, path) {
    if (obj == null || path == null || path === "") return obj;
    return String(path).split(".").reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
  }

  /* ---------- events and hooks ---------- */
  var listeners = {};
  function on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); return fn; }
  function off(name, fn) { listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; }); }
  function emit(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    (listeners[name] || []).slice().forEach(function (fn) {
      try { fn.apply(null, args); } catch (e) { console.error("create-report: " + name + " handler failed", e); }
    });
    doc.dispatchEvent(new CustomEvent("report:" + name, { detail: args }));
  }
  // Phases a template can hook into, in order:
  //   "setup"  DOM transforms before core wires anything (move, wrap, build markup)
  //   "ready"  after citations, evidence, figures, model and charts are in place
  var phases = { setup: [], ready: [] };
  var phaseDone = {};
  function hook(phase, fn) {
    if (!phases[phase]) throw new Error("create-report: unknown phase " + phase);
    if (phaseDone[phase]) { fn(); return; }
    phases[phase].push(fn);
  }
  function runPhase(phase) {
    phases[phase].forEach(function (fn) {
      try { fn(); } catch (e) { console.error("create-report: " + phase + " hook failed", e); }
    });
    phaseDone[phase] = true;
    // Inline page scripts run before the deferred core, so they listen for these:
    //   document.addEventListener("report:ready", function () { … Report.set(…) … });
    doc.dispatchEvent(new CustomEvent("report:" + phase));
  }

  /* ---------- resize: run fn(width) now and whenever the element's width changes ---------- */
  function observeResize(node, fn) {
    var last = -1;
    function run() {
      var w = node.clientWidth;
      if (w === 0) { last = -1; return; }   // hidden: redraw when shown, even at the same width
      if (w !== last) { last = w; fn(w); }
    }
    if ("ResizeObserver" in window) new ResizeObserver(run).observe(node);
    else window.addEventListener("resize", run);
    run();
    return function force() { last = -1; run(); };
  }

  /* ---------- number formatting ---------- */
  // format: currency | percent | int | number | compact | raw | date | month
  // opts: {currency, digits, locale}
  function fmt(value, format, opts) {
    opts = opts || {};
    if (value == null || value === "" || (typeof value === "number" && !isFinite(value))) return opts.empty != null ? opts.empty : "–";
    if (format === "date" && !(typeof value === "number")) {
      var d0 = new Date(value);
      if (!isNaN(d0)) return d0.toLocaleDateString(opts.locale || "en-US", { year: "numeric", month: "short", day: "numeric" });
    }
    if (typeof value !== "number") return String(value);
    var lang = opts.locale || "en-US";
    var digits = opts.digits != null && opts.digits !== "" ? Number(opts.digits) : null;
    switch (format) {
      case "currency":
        return new Intl.NumberFormat(lang, {
          style: "currency", currency: opts.currency || "USD",
          notation: Math.abs(value) >= 1e7 ? "compact" : "standard",
          maximumFractionDigits: digits != null ? digits : (Math.abs(value) >= 100 ? 0 : 2),
          minimumFractionDigits: digits != null ? Math.min(digits, 2) : 0
        }).format(value);
      case "percent":
        return new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: digits != null ? digits : 1 }).format(value);
      case "int":
        return new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(Math.round(value));
      case "compact":
        return new Intl.NumberFormat(lang, { notation: "compact", maximumFractionDigits: digits != null ? digits : 1 }).format(value);
      case "raw":
        return String(value);
      case "date":
        return new Date(value).toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric" });
      default:
        return new Intl.NumberFormat(lang, {
          maximumFractionDigits: digits != null ? digits : (Math.abs(value) >= 100 ? 0 : 2),
          minimumFractionDigits: digits != null ? digits : 0
        }).format(value);
    }
  }
  // Format a value the way a node asks for: data-format, data-currency, data-digits,
  // data-prefix, data-suffix, data-empty (text for a missing value).
  function fmtFor(node, value, fallbackFormat) {
    var a = function (k) { return node.getAttribute("data-" + k); };
    var out = fmt(value, a("format") || fallbackFormat, { currency: a("currency"), digits: a("digits"), empty: a("empty") });
    if (value == null || (typeof value === "number" && !isFinite(value))) return out;
    return (a("prefix") || "") + out + (a("suffix") || "");
  }

  /* ---------- model: params + compute, bound to the page ---------- */
  var model = null;         // {params:[...], compute(p)}
  var paramIndex = {};
  var state = {};           // current param values
  var defaults = {};
  var result = null;

  function defineModel(spec) {
    if (!spec || typeof spec.compute !== "function") throw new Error("create-report: Report.model needs a compute(p) function");
    model = spec;
    (spec.params || []).forEach(function (p) {
      paramIndex[p.key] = p;
      defaults[p.key] = p.default;
      state[p.key] = p.default;
    });
    if (phaseDone.ready) recompute([]);
    return api;
  }
  function validate(key, value) {
    var p = paramIndex[key];
    if (!p) return "unknown parameter " + key;
    if (p.options) {
      var ok = p.options.some(function (o) { return String(o.value != null ? o.value : o) === String(value); });
      return ok ? null : "must be one of " + p.options.map(function (o) { return o.label || o.value || o; }).join(", ");
    }
    if (typeof value !== "number" || !isFinite(value)) return "must be a number";
    if (p.min != null && value < p.min) return "must be ≥ " + fmt(p.min, p.format);
    if (p.max != null && value > p.max) return "must be ≤ " + fmt(p.max, p.format);
    if (p.validate) return p.validate(value, state) || null;
    return null;
  }
  function coerce(key, value) {
    var p = paramIndex[key];
    if (p && p.options) {
      var match = p.options.filter(function (o) { return String(o.value != null ? o.value : o) === String(value); })[0];
      return match == null ? value : (match.value != null ? match.value : match);
    }
    if (typeof value === "string" && value.trim() !== "" && !isNaN(value)) return Number(value);
    return value;
  }
  // set("hours", 3000) or set({hours: 3000, peak: 2}). Invalid values are rejected and
  // returned as {key: message}; valid ones are applied and the model re-runs once.
  function set(key, value) {
    var changes = {};
    if (typeof key === "object") changes = key; else changes[key] = value;
    var errors = {}, changed = [];
    Object.keys(changes).forEach(function (k) {
      var v = coerce(k, changes[k]);
      var err = validate(k, v);
      if (err) { errors[k] = err; return; }
      if (state[k] !== v) { state[k] = v; changed.push(k); }
    });
    if (changed.length) recompute(changed);
    return Object.keys(errors).length ? errors : null;
  }
  function reset(keys) {
    var ch = {};
    (keys || Object.keys(defaults)).forEach(function (k) { ch[k] = defaults[k]; });
    return set(ch);
  }
  function changedCount() {
    return Object.keys(defaults).filter(function (k) { return state[k] !== defaults[k]; }).length;
  }
  // Run compute with other params, e.g. compute({hours: 500}) for a what-if, without
  // changing the page.
  function computeWith(overrides) {
    if (!model) return null;
    return model.compute(Object.assign({}, state, overrides || {}));
  }
  function recompute(changed) {
    if (!model) return;
    try {
      result = model.compute(Object.assign({}, state));
    } catch (e) {
      console.error("create-report: model compute failed", e);
      return;
    }
    bindOutputs(doc);
    emit("update", result, state, changed || []);
  }
  // Look up a path: "params.hours" reads a param, anything else reads the result.
  function value(path) {
    if (path == null) return undefined;
    if (path.indexOf("params.") === 0) return state[path.slice(7)];
    return get(result, path);
  }
  function paramFmt(key, v) {
    var p = paramIndex[key] || {};
    if (p.options) {
      var o = p.options.filter(function (x) { return String(x.value != null ? x.value : x) === String(v); })[0];
      return o && o.label ? o.label : String(v);
    }
    var s = p.fmt ? p.fmt(v) : fmt(v, p.format, { currency: p.currency, digits: p.digits });
    return s + (p.unit ? (p.unit.match(/^[%/]/) ? "" : " ") + p.unit : "");
  }
  // data-with="buildMonths: 0, hours: 500" evaluates data-out at other params (a what-if
  // next to the live value). Values are numbers, strings, params.<key> or result.<path>
  // (e.g. "hours: result.breakEvenOps": the bill at the break-even point).
  function parseWith(str) {
    var o = {};
    String(str).split(",").forEach(function (pair) {
      var m = pair.split(":");
      if (m.length < 2) return;
      var k = m[0].trim(), raw = m.slice(1).join(":").trim();
      o[k] = raw.indexOf("params.") === 0 ? state[raw.slice(7)]
        : raw.indexOf("result.") === 0 ? get(result, raw.slice(7))
        : (raw !== "" && !isNaN(raw) ? Number(raw) : raw);
    });
    return o;
  }
  function bindOutputs(scope) {
    var whatIf = {};
    $$("[data-out]", scope).forEach(function (n) {
      var path = n.getAttribute("data-out"), v;
      if (n.hasAttribute("data-with")) {
        var w = n.getAttribute("data-with");
        if (!(w in whatIf)) whatIf[w] = computeWith(parseWith(w));
        v = path.indexOf("params.") === 0 ? Object.assign({}, state, parseWith(w))[path.slice(7)] : get(whatIf[w], path);
      } else v = value(path);
      var txt;
      if (Array.isArray(v) && (n.tagName === "UL" || n.tagName === "OL")) {   // arrays into lists → <li>s
        var items = v.map(function (x) { return typeof x === "number" ? fmtFor(n, x) : String(x); });
        if (n._items !== items.join("\u0000")) {
          n._items = items.join("\u0000");
          n.innerHTML = "";
          items.forEach(function (t) { n.appendChild(el("li", null, t)); });
        }
        return;
      }
      if (Array.isArray(v)) {   // data-join=", " sets the separator
        txt = v.map(function (x) { return typeof x === "number" ? fmtFor(n, x) : String(x); }).join(n.getAttribute("data-join") || ", ");
      } else txt = fmtFor(n, v);
      if (n.textContent !== txt) {
        var had = n.textContent !== "";
        n.textContent = txt;
        if (had && !reduceMotion && phaseDone.ready) {
          n.classList.remove("changed");
          void n.offsetWidth;
          n.classList.add("changed");
        }
      }
    });
    $$("[data-param-value]", scope).forEach(function (n) {
      var k = n.getAttribute("data-param-value");
      n.textContent = n.hasAttribute("data-format") ? fmtFor(n, state[k]) : paramFmt(k, state[k]);
    });
    $$("[data-show-if]", scope).forEach(function (n) {
      var expr = n.getAttribute("data-show-if"), neg = expr.charAt(0) === "!";
      var v = value(neg ? expr.slice(1) : expr);
      var truthy = Array.isArray(v) ? v.length > 0 : !!v;
      n.hidden = neg ? truthy : !truthy;
    });
    // data-highlight="cheapest=e2bPro" | "path" | "!path" toggles .is-hl (e.g. the cheapest row)
    $$("[data-highlight]", scope).forEach(function (n) {
      var ex = n.getAttribute("data-highlight"), neg = ex.charAt(0) === "!", e = neg ? ex.slice(1) : ex, eq = e.indexOf("="), hit;
      if (eq > 0) hit = String(value(e.slice(0, eq).trim())) === e.slice(eq + 1).trim();
      else { var hv = value(e); hit = Array.isArray(hv) ? hv.length > 0 : !!hv; }
      n.classList.toggle("is-hl", neg ? !hit : hit);
    });
    $$("[data-param]", scope).forEach(syncInput);
  }

  // Inputs: <input type="range|number" data-param="hours">, <select data-param>,
  // <input type="checkbox" data-param>. A log param maps a 0–1000 range slider onto
  // min…max logarithmically.
  function sliderPos(p, v) {
    if (!p.log) return v;
    return Math.round(1000 * (Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min)));
  }
  function sliderValue(p, pos) {
    if (!p.log) return pos;
    var v = Math.exp(Math.log(p.min) + (pos / 1000) * (Math.log(p.max) - Math.log(p.min)));
    var step = p.step || niceRound(v);
    return Math.max(p.min, Math.min(p.max, Math.round(v / step) * step));
  }
  function niceRound(v) {
    var mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v) || 1)) - 1);
    return Math.max(mag, 1e-9);
  }
  function setupInput(inp) {
    if (inp._bound) return;
    var key = inp.getAttribute("data-param"), p = paramIndex[key];
    if (!p) { console.warn("create-report: data-param=\"" + key + "\" is not a model param"); return; }
    inp._bound = true;
    if (inp.type === "range") {
      if (p.log) { inp.min = 0; inp.max = 1000; inp.step = 1; }
      else { if (p.min != null) inp.min = p.min; if (p.max != null) inp.max = p.max; if (p.step) inp.step = p.step; }
    } else if (inp.type === "number") {
      if (p.min != null) inp.min = p.min;
      if (p.max != null) inp.max = p.max;
      if (p.step) inp.step = p.step;
    } else if (inp.tagName === "SELECT" && !inp.options.length && p.options) {
      p.options.forEach(function (o) {
        inp.appendChild(el("option", { value: o.value != null ? o.value : o }, o.label || String(o.value != null ? o.value : o)));
      });
    }
    if (!inp.getAttribute("aria-label") && !inp.id && !inp.closest("label")) inp.setAttribute("aria-label", p.label || key);
    var handler = function () {
      var v;
      if (inp.type === "checkbox") v = inp.checked;
      else if (inp.type === "range") v = sliderValue(p, Number(inp.value));
      else v = inp.value;
      var err = set(key, v);
      var msg = err && err[key];
      inp.setCustomValidity ? inp.setCustomValidity(msg || "") : null;
      inp.toggleAttribute("aria-invalid", !!msg);
      emit("input-error", key, msg || null, inp);
    };
    inp.addEventListener(inp.type === "number" || inp.tagName === "SELECT" || inp.type === "checkbox" ? "change" : "input", handler);
    if (inp.type === "number") inp.addEventListener("input", handler);
  }
  function syncInput(inp) {
    var key = inp.getAttribute("data-param"), p = paramIndex[key];
    if (!p) return;
    setupInput(inp);
    var v = state[key];
    if (doc.activeElement === inp && inp.type === "number") return;  // don't fight the typist
    if (inp.type === "checkbox") inp.checked = !!v;
    else if (inp.type === "range") inp.value = String(sliderPos(p, v));
    else if (String(inp.value) !== String(v)) inp.value = v;
    if (inp.type === "range") inp.setAttribute("aria-valuetext", paramFmt(key, v));
  }

  // Standard controls: label, slider, value, help, and a reset button.
  // controls(container, {keys: [...], reset: true}) renders them; templates may build
  // their own markup with data-param instead.
  function controls(container, opts) {
    opts = opts || {};
    if (!model) return null;
    var keys = opts.keys || (model.params || []).filter(function (p) { return !p.hidden; }).map(function (p) { return p.key; });
    var wrap = el("div", { class: "rc-controls" });
    keys.forEach(function (k) {
      var p = paramIndex[k];
      if (!p) { console.warn("create-report: controls: unknown param " + k); return; }
      var id = "rc-" + slugify(k) + "-" + Math.random().toString(36).slice(2, 6);
      var row = el("div", { class: "rc-control" + (p.ev ? " ev-" + p.ev : "") });
      var lab = el("label", { for: id, class: "rc-label" });
      lab.appendChild(el("span", { class: "rc-name" }, p.label || k));
      var val = el("output", { class: "rc-value", for: id, "data-param-value": k });
      lab.appendChild(val);
      row.appendChild(lab);
      var inp;
      if (p.options) {
        inp = el("select", { id: id, "data-param": k });
      } else {
        inp = el("input", { id: id, type: "range", "data-param": k });
      }
      row.appendChild(inp);
      if (p.note || p.cite) {
        var help = el("p", { class: "rc-help" });
        if (p.note) help.appendChild(doc.createTextNode(p.note));
        if (p.cite) {
          var a = el("a", { class: "cite", href: "#" + p.cite });
          help.appendChild(a);
        }
        row.appendChild(help);
      }
      wrap.appendChild(row);
    });
    if (opts.reset !== false) {
      var r = el("button", { type: "button", class: "rc-reset" }, "Reset to report values");
      r.addEventListener("click", function () { reset(keys); });
      var upd = function () {
        var n = keys.filter(function (k) { return state[k] !== defaults[k]; }).length;
        r.disabled = n === 0;
        r.textContent = n ? "Reset to report values (" + n + " changed)" : "Report values";
      };
      on("update", upd);
      upd();
      wrap.appendChild(r);
    }
    container.appendChild(wrap);
    bindOutputs(wrap);
    if (phaseDone.citations) numberCitations();
    return wrap;
  }

  /* ---------- citations ---------- */
  // <a class="cite" href="#src-key"></a> → text "n", title = the source, back-links on the
  // source. Sources are numbered by their first citation in document order; uncited ones
  // keep their order at the end. Templates add brackets etc. with CSS (a.cite::before).
  function numberCitations() {
    var list = $(".sources");
    var cites = $$("a.cite");
    if (list && !list.hasAttribute("data-keep-order")) {
      var order = [];
      cites.forEach(function (a) {
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
    sources.forEach(function (li, i) {
      index[li.id] = i + 1;
      li.setAttribute("value", i + 1);
      li.setAttribute("data-n", i + 1);
    });
    var refs = {};
    cites.forEach(function (a, i) {
      var id = (a.getAttribute("href") || "").replace(/^#/, "");
      var n = index[id];
      if (!n) {
        a.classList.add("missing");
        a.textContent = "?";
        console.warn("create-report: citation to missing source #" + id);
        return;
      }
      a.textContent = String(n);
      a.setAttribute("data-n", n);
      if (!a.id || a.id.indexOf("ref-") === 0) a.id = "ref-" + id + "-" + i;
      var src = doc.getElementById(id);
      var title = src ? (src.getAttribute("data-title") || (src.querySelector("a, cite") || src).textContent.trim()) : "";
      a.setAttribute("aria-label", "Source " + n + (title ? ": " + title : ""));
      if (title) a.title = title;
      (refs[id] = refs[id] || []).push(a.id);
    });
    sources.forEach(function (li) {
      var old = $(":scope > .backrefs", li);
      if (old) old.remove();
      var ids = refs[li.id];
      if (!ids) return;
      var span = el("span", { class: "backrefs" });
      ids.forEach(function (rid, k) {
        if (k) span.appendChild(doc.createTextNode(" "));   // lets a long row wrap on phones
        span.appendChild(el("a", { href: "#" + rid, "aria-label": "Back to citation " + (k + 1) }, ids.length > 1 ? "↩" + (k + 1) : "↩"));
      });
      li.appendChild(span);
    });
    phaseDone.citations = true;
  }

  /* ---------- evidence ---------- */
  var EV = {
    fact: { letter: "S", name: "Sourced", long: "Sourced fact: the numbered citation gives the source" },
    estimate: { letter: "E", name: "Estimate", long: "Estimate: derived or approximate, calculated from sourced inputs" },
    assumption: { letter: "A", name: "Assumption", long: "Assumption: taken as given, not verified" },
    interpretation: { letter: "I", name: "Interpretation", long: "Interpretation: the author's reading of the evidence" }
  };
  var ALIASES = { s: "fact", source: "fact", sourced: "fact", e: "estimate", est: "estimate", a: "assumption", asm: "assumption", i: "interpretation", ai: "interpretation", interp: "interpretation", judgement: "interpretation", judgment: "interpretation" };
  function evKinds(node) {
    return (node.getAttribute("data-ev") || "").toLowerCase().split(/[\s,]+/).map(function (k) { return ALIASES[k] || k; }).filter(function (k) { return EV[k]; });
  }
  function initEvidence() {
    var used = {};
    $$(".ev[data-ev]").forEach(function (n) {
      var kinds = evKinds(n);
      if (!kinds.length) { console.warn("create-report: unknown data-ev=\"" + n.getAttribute("data-ev") + "\""); return; }
      kinds.forEach(function (k) { used[k] = true; });
      n.setAttribute("data-ev", kinds.join(" "));
      n.setAttribute("data-ev-letter", kinds.map(function (k) { return EV[k].letter; }).join(""));
      if (!n.title) n.title = kinds.map(function (k) { return EV[k].long; }).join(" · ") + (n.getAttribute("data-note") ? ". " + n.getAttribute("data-note") : "");
    });
    $$("[data-ev-legend]").forEach(function (box) {
      if (box.children.length) return;  // a hand-written legend stays
      var all = box.getAttribute("data-ev-legend") === "all";
      Object.keys(EV).forEach(function (k) {
        if (!all && !used[k]) return;
        var item = el("span", { class: "ev-key", "data-ev": k, "data-ev-letter": EV[k].letter, title: EV[k].long });
        item.appendChild(el("span", { class: "ev-key-mark", "aria-hidden": "true" }, EV[k].letter));
        item.appendChild(el("span", { class: "ev-key-name" }, EV[k].name));
        box.appendChild(item);
      });
    });
    return used;
  }

  /* ---------- metadata (report.json) and reading time ---------- */
  function niceDate(s) {
    if (!s) return "";
    var d = new Date(s + (s.length === 10 ? "T12:00:00" : ""));
    return isNaN(d) ? s : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  var meta = {};
  function initMeta() {
    // Reading time counts the prose that shows by default, not collapsed depth or sources.
    var main = $("main") || doc.body;
    var words = (main.innerText || main.textContent || "").split(/\s+/).length;
    $$(".sources", main).forEach(function (s) { words -= (s.innerText || "").split(/\s+/).length; });
    var minutes = Math.max(1, Math.round(words / 230));
    $$('[data-meta="reading-time"]').forEach(function (n) { n.textContent = minutes + " min read"; });
    function apply(m) {
      meta = m || {};
      $$("[data-meta]").forEach(function (n) {
        var k = n.getAttribute("data-meta");
        if (k === "reading-time") return;
        var v = meta[k];
        if (k === "date" && meta.date) {
          n.setAttribute("datetime", meta.date);
          v = niceDate(meta.date) + (meta.updated ? " · updated " + niceDate(meta.updated) : "");
        } else if (k === "updated") v = niceDate(v);
        else if (k === "sources") v = String($$(".sources > li").length || "");
        if (Array.isArray(v)) v = v.join(", ");
        if (v) n.textContent = v;
      });
      $$(".meta-panel").forEach(function (panel) {
        if (panel.hasAttribute("data-static")) return;
        var dl = el("dl");
        function row(k, v) {
          if (!v || (Array.isArray(v) && !v.length)) return;
          dl.appendChild(el("dt", null, k));
          dl.appendChild(el("dd", null, Array.isArray(v) ? v.join(", ") : String(v)));
        }
        row("Created", niceDate(meta.date));
        row("Updated", meta.updated && niceDate(meta.updated));
        row("Model", meta.model);
        row("Agent", meta.agent);
        row("Tags", meta.tags);
        row("Notes", meta.notes);
        row("Sources", String($$(".sources > li").length || ""));
        row("Length", minutes + " min read");
        panel.innerHTML = "";
        panel.appendChild(dl);
      });
      emit("meta", meta);
    }
    var inline = $("script#report-meta[type='application/json']");
    if (inline) {
      try { apply(JSON.parse(inline.textContent)); return Promise.resolve(); } catch (e) { console.warn("create-report: bad #report-meta JSON", e); }
    }
    if (location.protocol === "file:") { apply({}); return Promise.resolve(); }
    return fetch("report.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(apply)
      .catch(function () { apply({}); });
  }

  /* ---------- layered figures ---------- */
  // <figure data-levels="Overview|Components|Effort"> … <x data-from="1"> … <y data-to="0"> …
  // Elements show at levels from…to (inclusive). Core adds the level buttons (into
  // .levels-control if present, otherwise before the first child) and sets
  // data-level on the figure. Without JS everything shows.
  function initLevels() {
    $$("[data-levels]").forEach(function (fig) {
      if (fig._levels) return;
      var names = fig.getAttribute("data-levels").split("|").map(function (s) { return s.trim(); });
      var cur = Math.max(0, Math.min(names.length - 1, Number(fig.getAttribute("data-level") || 0)));
      var bar = $(".levels-control", fig);
      if (!bar) {
        bar = el("div", { class: "levels-control" });
        fig.insertBefore(bar, fig.firstChild);
      }
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", fig.getAttribute("data-levels-label") || "Detail level");
      var btns = names.map(function (n, i) {
        var b = el("button", { type: "button", "data-level": i, "aria-pressed": "false" }, n);
        b.addEventListener("click", function () { go(i); });
        bar.appendChild(b);
        return b;
      });
      fig.addEventListener("keydown", function (e) {
        if (!e.target.closest(".levels-control")) return;
        if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1, true); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1, true); }
      });
      // quiet: no entrance animation (for programmatic switches, e.g. measuring)
      function go(i, focus, quiet) {
        i = Math.max(0, Math.min(names.length - 1, i));
        var prev = cur;
        cur = i;
        fig.setAttribute("data-level", i);
        if (fig.hasAttribute("data-weights-at")) fig.toggleAttribute("data-weighted", i >= Number(fig.getAttribute("data-weights-at")));
        btns.forEach(function (b, k) { b.setAttribute("aria-pressed", String(k === i)); });
        if (focus) btns[i].focus();
        $$("[data-from], [data-to]", fig).forEach(function (n) {
          if (n.closest("[data-levels]") !== fig) return;
          var from = n.hasAttribute("data-from") ? Number(n.getAttribute("data-from")) : 0;
          var to = n.hasAttribute("data-to") ? Number(n.getAttribute("data-to")) : 99;
          var show = i >= from && i <= to;
          var was = !n.hidden;
          n.hidden = !show;
          if (show && !was && prev !== i && !reduceMotion && !quiet) {
            n.classList.remove("level-in");
            void n.offsetWidth;
            n.classList.add("level-in");
          }
        });
        emit("level", fig, i, names[i]);
      }
      fig._levels = { go: go, get: function () { return cur; }, names: names };
      go(cur);
    });
  }

  /* ---------- box diagrams: weights → treemap ---------- */
  // When a .boxes figure has data-weighted (set by hand, or by data-weights-at from that
  // level on), each .items grid becomes an ordered strip treemap: boxes keep the author's
  // order and their area is proportional to data-weight. Tunable per template with CSS
  // variables on .items: --treemap-aspect (0.62), --treemap-min-area (px², 17000),
  // --treemap-min-row (px, 76), --treemap-min-width (px, 130).
  function cssNum(node, name, fb) { var v = parseFloat(getComputedStyle(node).getPropertyValue(name)); return isFinite(v) ? v : fb; }
  function clearTreemap(items) {
    if (!items.classList.contains("rc-treemap")) return;
    items.classList.remove("rc-treemap");
    items.style.height = "";
    $$(":scope > .box", items).forEach(function (b) { ["left", "top", "width", "height"].forEach(function (p) { b.style[p] = ""; }); });
  }
  function treemap(fig) {
    $$(".items", fig).forEach(function (items) {
      var boxes = $$(":scope > .box", items).filter(function (b) { return !b.hidden; });
      var W = items.clientWidth;
      if (!fig.hasAttribute("data-weighted") || !W || boxes.length < 2) { clearTreemap(items); return; }
      var ws = boxes.map(function (b) { return Math.max(0.05, parseFloat(b.getAttribute("data-weight")) || 1); });
      var total = ws.reduce(function (a, b) { return a + b; }, 0), wmin = Math.min.apply(null, ws);
      var aspect = cssNum(items, "--treemap-aspect", 0.62), minArea = cssNum(items, "--treemap-min-area", 17000);
      var H = Math.max(W * aspect, minArea * total / wmin / W);
      var scale = W * H / total, rows = [], cur = [];
      function sum(row) { return row.reduce(function (a, i) { return a + ws[i]; }, 0); }
      function worst(row) {
        var rh = sum(row) * scale / W;
        return Math.max.apply(null, row.map(function (i) { var r = (ws[i] * scale / rh) / (rh * 1.5); return Math.max(r, 1 / r); }));
      }
      // no box narrower than --treemap-min-width: in a narrow container rows hold fewer boxes
      // (a single-box row is full width, its height still ∝ weight)
      var minW = Math.min(W, cssNum(items, "--treemap-min-width", 130));
      function wide(row) { return Math.min.apply(null, row.map(function (i) { return ws[i]; })) * W / sum(row) >= minW; }
      ws.forEach(function (w, i) {
        if (!cur.length) { cur.push(i); return; }
        var t = cur.concat([i]);
        if (wide(t) && worst(t) <= worst(cur)) cur = t; else { rows.push(cur); cur = [i]; }
      });
      if (cur.length) rows.push(cur);
      // a row too short for a label joins its neighbour, if the boxes stay wide enough
      var minH = cssNum(items, "--treemap-min-row", 76);
      function rowH(row) { return sum(row) * scale / W; }
      for (var ri = rows.length - 1; ri > 0; ri--) {
        if (rowH(rows[ri]) < minH && wide(rows[ri - 1].concat(rows[ri]))) { rows[ri - 1] = rows[ri - 1].concat(rows[ri]); rows.splice(ri, 1); }
      }
      if (rows.length > 1 && rowH(rows[0]) < minH && wide(rows[0].concat(rows[1]))) { rows[1] = rows[0].concat(rows[1]); rows.shift(); }
      // rows that stay short grow to minH, and every row grows to fit its boxes' content
      // (readability over exact areas); the total height follows
      items.classList.add("rc-treemap");
      var heights = rows.map(function (row) {
        var need = 0;
        row.forEach(function (i) {
          var st = boxes[i].style;
          st.width = "calc(" + (ws[i] / sum(row) * 100) + "% - 6px)"; st.height = ""; st.left = "0"; st.top = "0";
          need = Math.max(need, boxes[i].offsetHeight + 6);
        });
        return Math.max(rowH(row), Math.min(minH, rowH(row) * 2), need);
      });
      H = heights.reduce(function (a, b) { return a + b; }, 0);
      var y = 0;
      rows.forEach(function (row, r) {
        var rh = heights[r], x = 0;
        row.forEach(function (i) {
          var bw = ws[i] * W / sum(row), st = boxes[i].style;
          st.left = "calc(" + (x / W * 100) + "% + 3px)"; st.top = "calc(" + (y / H * 100) + "% + 3px)";
          st.width = "calc(" + (bw / W * 100) + "% - 6px)"; st.height = "calc(" + (rh / H * 100) + "% - 6px)";
          x += bw;
        });
        y += rh;
      });
      items.classList.add("rc-treemap");
      items.style.height = Math.round(H) + "px";
    });
  }
  function initBoxes() {
    $$(".boxes").forEach(function (fig) {
      if (fig._boxes) return;
      fig._boxes = true;
      $$(".items", fig).forEach(function (items) { observeResize(items, function () { treemap(fig); }); });
      treemap(fig);
    });
    on("level", function (fig) { if (fig.classList && fig.classList.contains("boxes")) treemap(fig); });
  }

  /* ---------- estimate notes: .ev[data-note] → small toggle that shows the note ---------- */
  function initNotes() {
    if (api.options.evNotes === false) return;
    $$(".ev[data-note]").forEach(function (n, i) {
      if (n._note) return;
      n._note = true;
      var id = "evn-" + i;
      var btn = el("button", { type: "button", class: "ev-note-btn", "aria-expanded": "false", "aria-controls": id, "aria-label": "How this was worked out" }, "?");
      var note = el("span", { class: "ev-note", id: id, role: "note", hidden: "" });
      note.textContent = n.getAttribute("data-note");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var open = note.hidden;
        note.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
      });
      n.appendChild(btn);
      n.appendChild(note);
    });
  }

  /* ---------- zoom: full-screen view for marked images ---------- */
  function initZoom() {
    var dialog = null;
    function open(img) {
      if (!dialog) {
        dialog = el("dialog", { class: "rc-zoom", "aria-label": "Image" });
        var close = el("button", { class: "rc-zoom-close", type: "button", "aria-label": "Close" }, "✕");
        close.addEventListener("click", function () { dialog.close(); });
        dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
        dialog.appendChild(close);
        dialog.appendChild(el("div", { class: "rc-zoom-content" }));
        doc.body.appendChild(dialog);
      }
      var box = $(".rc-zoom-content", dialog);
      box.innerHTML = "";
      box.appendChild(img);
      dialog.showModal();
    }
    $$("figure[data-zoom]").forEach(function (fig) {
      var target = $("img", fig);
      if (!target || $(".rc-zoom-btn", fig)) return;
      var btn = el("button", { class: "rc-zoom-btn", type: "button", "aria-label": "View full size", title: "View full size" }, "⤢");
      btn.addEventListener("click", function () {
        open(el("img", { src: target.currentSrc || target.src, alt: target.alt }));
      });
      fig.appendChild(btn);
    });
  }

  /* ---------- opening hidden targets (details, levels) when a link points into them ---------- */
  var revealers = [];
  // Templates register fn(target) → true if they revealed it (e.g. switched page or level).
  function addRevealer(fn) { revealers.push(fn); }
  function reveal(target) {
    if (!target) return;
    revealers.forEach(function (fn) { try { fn(target); } catch (e) { console.error(e); } });
    var d = target.closest("details");
    while (d) { d.open = true; d = d.parentElement && d.parentElement.closest("details"); }
    var fig = target.closest("[data-levels]");
    if (fig && fig._levels && target.hidden) {
      var from = Number(target.getAttribute("data-from") || 0);
      fig._levels.go(from);
    }
  }
  function initReveal() {
    function handle(hash) {
      if (!hash || hash.length < 2) return;
      var t;
      try { t = doc.getElementById(decodeURIComponent(hash.slice(1))); } catch (e) { return; }
      if (!t) return;
      reveal(t);
    }
    doc.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (a) handle(a.getAttribute("href"));
    }, true);
    window.addEventListener("hashchange", function () { handle(location.hash); });
    if (location.hash) setTimeout(function () {
      handle(location.hash);
      var t = doc.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (t) t.scrollIntoView();
    }, 0);
  }

  /* ---------- Mermaid (optional): loaded only when the page has .mermaid ---------- */
  // new-report.sh --vendor <slug> puts the library in assets/vendor/. Diagrams are drawn
  // when visible (Mermaid measures text), so ones in closed details or hidden levels are
  // drawn when they are revealed.
  var mermaidLoading = null;
  function renderMermaid() {
    if (!window.mermaid) return;
    var nodes = $$(".mermaid:not([data-processed])").filter(function (n) { return n.getClientRects().length > 0; });
    if (nodes.length) window.mermaid.run({ nodes: nodes }).catch(function (e) { console.warn("create-report: mermaid:", e); });
  }
  function initMermaid() {
    if (!$(".mermaid") || mermaidLoading) return;
    mermaidLoading = new Promise(function (resolve) {
      var s = el("script", { src: "assets/vendor/mermaid.min.js" });
      s.onload = function () {
        var v = function (n, d) { return cssVar(n) || d; };
        window.mermaid.initialize({
          startOnLoad: false, theme: "base", securityLevel: "strict", fontFamily: v("--font", "sans-serif"),
          themeVariables: {
            background: v("--sheet", "#fff"), primaryColor: v("--sheet", "#fff"), primaryTextColor: v("--ink", "#222"),
            primaryBorderColor: v("--ink-2", "#555"), secondaryColor: v("--bg", "#fafafa"), tertiaryColor: v("--bg", "#fafafa"),
            lineColor: v("--ink-3", "#777"), textColor: v("--ink", "#222"), noteBkgColor: v("--bg", "#fafafa"),
            noteTextColor: v("--ink", "#222"), noteBorderColor: v("--rule", "#ccc"), clusterBkg: v("--bg", "#fafafa"),
            clusterBorder: v("--rule", "#ccc"), edgeLabelBackground: v("--sheet", "#fff"), fontSize: "15px"
          }
        });
        renderMermaid();
        resolve();
      };
      s.onerror = function () {
        console.warn("create-report: assets/vendor/mermaid.min.js is missing (new-report.sh --vendor <slug>)");
        resolve();
      };
      doc.head.appendChild(s);
    });
    doc.addEventListener("toggle", renderMermaid, true);
    on("level", renderMermaid);
  }

  /* ---------- init ---------- */
  var inited = false;
  function init() {
    if (inited) return;
    inited = true;
    runPhase("setup");
    numberCitations();
    api.evidenceUsed = initEvidence();
    initNotes();
    initLevels();
    initBoxes();
    initZoom();
    initReveal();
    var metaReady = initMeta();
    if (model) {
      result = model.compute(Object.assign({}, state));
      bindOutputs(doc);
    }
    if (window.ReportCharts) window.ReportCharts.init();
    initMermaid();
    runPhase("ready");
    if (model) emit("update", result, state, []);
    metaReady.then(function () { readyResolve(api); });
  }
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  var api = {
    version: "1",
    options: {},
    // model
    model: defineModel,
    set: set,
    reset: reset,
    validate: validate,
    value: value,
    computeWith: computeWith,
    changedCount: changedCount,
    controls: controls,
    paramFmt: paramFmt,
    get params() { return state; },
    get defaults() { return defaults; },
    get result() { return result; },
    get spec() { return model; },
    param: function (k) { return paramIndex[k]; },
    // formatting
    fmt: fmt,
    fmtFor: fmtFor,
    // events and phases
    on: on,
    off: off,
    emit: emit,
    hook: hook,
    ready: ready,
    // page services
    EV: EV,
    evKinds: evKinds,
    renumber: numberCitations,
    rebind: function (scope) { bindOutputs(scope || doc); },
    levels: initLevels,
    reveal: reveal,
    addRevealer: addRevealer,
    renderDiagrams: renderMermaid,
    observeResize: observeResize,
    get meta() { return meta; },
    reduceMotion: reduceMotion,
    util: { $: $, $$: $$, el: el, esc: esc, cssVar: cssVar, slugify: slugify, get: get, niceDate: niceDate }
  };
  window.Report = api;
  // Deferred scripts run while readyState is "interactive", before DOMContentLoaded, so
  // wait for that event unless the page has fully loaded already.
  if (doc.readyState !== "complete") {
    doc.addEventListener("DOMContentLoaded", init, { once: true });
    window.addEventListener("load", init, { once: true });   // fallback; init runs once
  } else setTimeout(init, 0);
})();
