/* Notebook template: the report is a Jupyter-style notebook.
   Reads the page's cells and adds the chrome and the kernel:
   - cells: <section class="cell md|code|params" data-title data-tags> (see references/templates/notebook.md)
   - cell chrome: In/Out prompts, execution counters, evidence tags in the gutter
     (from data-tags, or derived from the .ev marks and citations inside the cell)
   - code cells: <pre class="src"> pseudo-code, highlighted, with ${path|format} placeholders
     filled from the model and [#src-id] citations; collapsed behind "show derivation"
   - the params cell, generated from Report.spec.params: editable fields, ValueError
     messages, Esc to restore, "default N", Reset params
   - the kernel: on Report "update", re-runs the cells below params, flashes only the
     cells whose output changed (and their rows in the cell index); stale state on errors
   - the cell index (sidebar on desktop, drawer on phones) with scroll-spy
   Topic-agnostic: everything comes from the markup and the Report API. */
(function () {
  "use strict";

  var R = window.Report;
  if (!R) return;
  var doc = document, root = doc.documentElement;
  var U = R.util, $ = U.$, $$ = U.$$, el = U.el;
  var reduce = R.reduceMotion;

  var KINDS = ["fact", "estimate", "assumption", "interpretation"];
  var TAG = { fact: "source", estimate: "estimate", assumption: "assumption", interpretation: "interpretation" };
  var TAG_CLASS = { fact: "src", estimate: "est", assumption: "asm", interpretation: "ai" };
  var SHORT = { estimate: "est", assumption: "asm", interpretation: "ai" };
  var KEYWORDS = /^(def|return|for|in|if|elif|else|while|import|from|as|and|or|not|is|lambda|None|True|False|with|yield|class|pass|max|min|ceil|floor|round|sum|len|abs|dict|list|range|print)$/;

  var nb, cells = [], kernelCells = [], paramsCell = null, counter = 0;
  var ui = {};                  // chrome elements
  var invalid = {};             // param key → message; while non-empty, cells below params are stale
  var fields = {};              // param key → {p, input, slider, err, def, py}
  var updates = 0, runToken = 0, booted = false, current = null;

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function hasModel() { return !!R.spec; }
  function snake(k) { return String(k).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase(); }
  function num(v) { return R.fmt(v, "number", { digits: Math.abs(v) < 10 && v % 1 ? 2 : null }); }
  function kindOf(cell) { return cell.classList.contains("params") ? "params" : cell.classList.contains("code") ? "code" : "md"; }
  function svgIcon(d) {
    return '<svg class="ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' + d + "</svg>";
  }

  /* ---------- syntax highlighter for pseudo-code (Python-flavoured) ---------- */
  // Placeholders and citations are swapped for sentinels first, so the tokenizer never
  // looks inside them; they come back as <span class="ph"> and <a class="cite">.
  function commentAt(line) {
    var q = null;
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === "#") return i;
    }
    return -1;
  }
  function highlightCode(code) {
    return esc(code).replace(/("[^"\n]*"|'[^'\n]*')|([A-Za-z_][\w]*)|(\d[\d_.,]*)/g, function (m, str, word, n) {
      if (str) return '<span class="s">' + str + "</span>";
      if (word) return KEYWORDS.test(word) ? '<span class="k">' + word + "</span>" : word;
      return '<span class="n">' + n + "</span>";
    });
  }
  function highlight(text, tokens) {
    text = text
      .replace(/\$\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?)\s*)?\}/g, function (m, path, f) { tokens.push({ path: path, f: f || "" }); return "\u0000QX" + (tokens.length - 1) + "\u0000"; })
      .replace(/\[#([\w-]+)\]/g, function (m, id) { tokens.push({ cite: id }); return "\u0000QX" + (tokens.length - 1) + "\u0000"; });
    var html = text.split("\n").map(function (line) {
      var i = commentAt(line);
      var body = i >= 0 ? line.slice(0, i) : line, com = i >= 0 ? line.slice(i) : "";
      return highlightCode(body) + (com ? '<span class="cm">' + esc(com) + "</span>" : "");
    }).join("\n");
    return html.replace(/\u0000QX(\d+)\u0000/g, function (m, i) {
      var t = tokens[+i];
      if (t.cite) return '<a class="cite" href="#' + t.cite + '"></a>';
      return '<span class="ph" data-ph="' + i + '">' + esc(phText(t)) + "</span>";
    });
  }
  // ${path} → value; ${path|int}, ${path|currency}, ${path|number:4} → formatted.
  // No format: params print as literals, other numbers with the "number" format. null → None.
  function phText(t) {
    var v = R.value(t.path);
    if (v == null || (typeof v === "number" && !isFinite(v))) return hasModel() ? "None" : "…";
    var parts = t.f.split(":"), f = parts[0], digits = parts[1];
    if (!f) {
      if (t.path.indexOf("params.") === 0 || typeof v !== "number") return Array.isArray(v) ? JSON.stringify(v) : String(v);
      f = "number";
    }
    return R.fmt(v, f, { digits: digits });
  }

  /* ---------- evidence ---------- */
  function kindsIn(scope) {
    var used = {};
    $$(".ev[data-ev]", scope).forEach(function (n) { R.evKinds(n).forEach(function (k) { used[k] = true; }); });
    if ($("a.cite", scope)) used.fact = true;
    return used;
  }
  function tagsFor(cell) {
    var used = {};
    if (cell.hasAttribute("data-tags")) {
      var attr = cell.getAttribute("data-tags");
      R.evKinds({ getAttribute: function () { return attr; } }).forEach(function (k) { used[k] = true; });
    } else if (cell._kind === "params" && hasModel()) {
      (R.spec.params || []).forEach(function (p) {
        R.evKinds({ getAttribute: function () { return p.ev || "assumption"; } }).forEach(function (k) { used[k] = true; });
        if (p.cite) used.fact = true;
      });
    } else used = kindsIn(cell);
    return KINDS.filter(function (k) { return used[k]; });
  }

  /* ---------- setup: build the cells and the chrome ---------- */
  function setup() {
    nb = $("main.notebook") || $("main") || doc.body;
    nb.classList.add("notebook");
    if (!nb.id) nb.id = "notebook";
    nb.tabIndex = -1;
    cells = $$(".cell", nb).filter(function (c) { return !c.parentElement.closest(".cell"); });
    var ids = {};
    cells.forEach(function (c, i) {
      c._kind = kindOf(c);
      if (c._kind === "md") c.classList.add("md");
      var h = $("h1, h2, h3, h4", c);
      c._title = c.getAttribute("data-title") || (h ? h.textContent.trim() : c._kind === "params" ? "params" : "cell " + (i + 1));
      if (!c.id) {
        var base = "c-" + U.slugify(c._title), id = base, n = 2;
        while (ids[id] || doc.getElementById(id)) id = base + "-" + n++;
        c.id = id;
      }
      ids[c.id] = true;
      c.tabIndex = -1;
      if (c._kind === "md") prepMd(c);
      else if (c._kind === "code") prepCode(c);
      else prepParams(c);
    });
    kernelCells = cells.filter(function (c) { return c._kind !== "md" && !c.hidden; });
    cells.forEach(function (c) { addGutter(c); });
    buildChrome();
    buildIndex();
    R.addRevealer(function (t) {
      var cell = t.closest && t.closest(".cell");
      if (cell && t.closest(".input[hidden]")) setDeriv(cell, true);
    });
  }

  function prepMd(c) {
    if ($(":scope > .md-body", c)) return;
    var body = el("div", { class: "md-body" });
    while (c.firstChild) body.appendChild(c.firstChild);
    c.appendChild(body);
  }

  function prepCode(c) {
    var src = $(":scope > pre.src", c);
    var out = $(":scope > .out", c);
    var notes = $$(":scope > .md-note", c);
    var body = el("div", { class: "cbody" });
    if (!out) {
      out = el("div", { class: "out" });
      Array.prototype.slice.call(c.childNodes).forEach(function (n) {
        if (n !== src && notes.indexOf(n) < 0) out.appendChild(n);
      });
    }
    notes.forEach(function (n) { body.appendChild(n); });
    c._tokens = [];
    if (src) {
      var text = src.textContent.replace(/^\n+|\s+$/g, "");
      src.innerHTML = highlight(text, c._tokens);
      src.classList.add("code");
      var input = el("div", { class: "input", hidden: "" });
      input.id = c.id + "-src";
      input.appendChild(src);
      body.appendChild(input);
    }
    var row = el("div", { class: "out-row" });
    row.appendChild(el("span", { class: "prompt pout", "aria-hidden": "true" }));
    row.lastChild.innerHTML = 'Out[<b class="cnt">&nbsp;</b>]:';
    row.appendChild(out);
    body.appendChild(row);
    if (src) {
      var btn = el("button", { type: "button", class: "deriv", "aria-expanded": "false", "aria-controls": c.id + "-src" }, "show derivation");
      btn.addEventListener("click", function () { setDeriv(c, btn.getAttribute("aria-expanded") !== "true"); });
      body.appendChild(btn);
    }
    c._out = out;
    c.appendChild(body);
  }

  function setDeriv(cell, open) {
    var btn = $(".deriv", cell), input = $(".input", cell);
    if (!btn || !input) return;
    input.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "hide derivation" : "show derivation";
    cell.classList.toggle("expanded", open);
  }

  function addGutter(c) {
    var gut = el("div", { class: "gut" });
    var h = "";
    if (c._kind !== "md") {
      h += '<span class="prompt pin">In&nbsp;[<b class="cnt">&nbsp;</b>]:</span>';
      if (c._kind === "code") h += '<span class="prompt pout gout" aria-hidden="true">Out[<b class="cnt">&nbsp;</b>]:</span>';
    }
    if (c.classList.contains("reconcile")) h += '<span class="role">reconcile</span>';
    h += '<span class="tags">' + tagsFor(c).map(function (k) {
      return '<span class="tag ' + TAG_CLASS[k] + '" title="' + U.esc(R.EV[k].long) + '">' + TAG[k] + "</span>";
    }).join("") + "</span>";
    gut.innerHTML = h;
    c.insertBefore(gut, c.firstChild);
  }

  /* ---------- params cell ---------- */
  function prepParams(c) {
    if (!hasModel()) { c.hidden = true; return; }
    var all = R.spec.params || [];
    var keysAttr = c.getAttribute("data-keys");
    var editable = keysAttr ? keysAttr.split(/[\s,]+/).filter(function (k) { return R.param(k); })
      : all.filter(function (p) { return !p.hidden; }).map(function (p) { return p.key; });
    var slAttr = c.getAttribute("data-sliders");
    var sliders = slAttr != null ? slAttr.split(/[\s,]+/) : all.filter(function (p) { return p.log; }).map(function (p) { return p.key; });
    var fixed = all.filter(function (p) { return editable.indexOf(p.key) < 0; }).map(function (p) { return p.key; });
    var order = editable.concat(fixed).map(function (k) { return R.param(k); });
    var width = Math.max.apply(null, order.map(function (p) { return (p.py || snake(p.key)).length; }));
    var pad = function (s) { return s + new Array(Math.max(0, width - s.length) + 1).join(" "); };

    var body = el("div", { class: "cbody" });
    $$(":scope > *", c).forEach(function (n) { n.classList.add("md-note"); body.appendChild(n); });
    var input = el("div", { class: "input open" });
    var pre = el("pre", { class: "code params-code" });
    pre.style.setProperty("--pad", (width + 3) + "ch");
    order.forEach(function (p) {
      var py = p.py || snake(p.key), id = "nbp-" + U.slugify(p.key), line = el("span", { class: "pl", "data-k": p.key });
      var comment = "# " + (p.label || p.key);
      if (editable.indexOf(p.key) < 0) {
        line.classList.add("ro");
        line.innerHTML = '<span class="v">' + esc(pad(py)) + '</span> = <span class="n">' + esc(String(p.default)) + '</span>  <span class="cm">' + esc(comment) + "</span>";
        pre.appendChild(line);
        return;
      }
      var ctl;
      if (p.options) {
        ctl = el("select", { id: id, "data-k": p.key, "aria-describedby": id + "-d" });
        p.options.forEach(function (o) {
          var v = o.value != null ? o.value : o;
          ctl.appendChild(el("option", { value: v }, o.label || String(v)));
        });
      } else {
        ctl = el("input", { id: id, "data-k": p.key, type: "number", inputmode: "decimal", step: p.step || "any", min: p.min, max: p.max, "aria-describedby": id + "-d" });
      }
      ctl.value = String(R.params[p.key]);
      var lab = el("label", { for: id, class: "v" }, py);
      line.appendChild(lab);
      line.appendChild(doc.createTextNode(pad(py).slice(py.length) + " = "));
      line.appendChild(ctl);
      var cm = el("span", { class: "cm", id: id + "-d" }, "  " + comment);
      if (p.cite) cm.appendChild(el("a", { class: "cite", href: "#" + p.cite }));
      line.appendChild(cm);
      var def = el("button", { type: "button", class: "pdef", "data-k": p.key, hidden: "", "aria-label": "Restore " + py + " to its default, " + p.default }, "default " + p.default);
      line.appendChild(def);
      var err = el("span", { class: "perr", id: id + "-e", hidden: "" });
      line.appendChild(err);
      pre.appendChild(line);
      var f = { p: p, py: py, input: ctl, err: err, def: def };
      if (p.note) pre.appendChild(el("span", { class: "pl-note cm" }, "# " + p.note));
      if (sliders.indexOf(p.key) >= 0 && !p.options && p.min != null && p.max != null) {
        var sl = el("input", { type: "range", min: 0, max: 1000, step: 1, "data-slider": p.key, "aria-label": (p.label || py) + (p.log ? " (log scale)" : "") });
        var wrap = el("span", { class: "sl" });
        wrap.appendChild(sl);
        pre.appendChild(wrap);
        f.slider = sl;
      }
      fields[p.key] = f;
    });
    input.appendChild(pre);
    ui.edited = el("p", { class: "edited-note", hidden: "" });
    input.appendChild(ui.edited);
    body.appendChild(input);
    c.appendChild(body);
    paramsCell = c;
    wireParams(c);
  }

  function sliderPos(p, v) {
    var t = p.log ? (Math.log(v) - Math.log(p.min)) / (Math.log(p.max) - Math.log(p.min)) : (v - p.min) / (p.max - p.min || 1);
    return Math.round(1000 * Math.max(0, Math.min(1, t)));
  }
  function sliderValue(p, pos) {
    var t = pos / 1000, v;
    if (p.log) {
      v = Math.exp(Math.log(p.min) + t * (Math.log(p.max) - Math.log(p.min)));
      var mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
      v = Math.round(v / mag) * mag;
      if (p.step) v = Math.round(v / p.step) * p.step;
    } else {
      v = p.min + t * (p.max - p.min);
      var s = p.step || 1;
      v = Math.round(v / s) * s;
    }
    return +Math.max(p.min, Math.min(p.max, v)).toFixed(6);
  }

  function rangeHint(p) {
    if (p.min == null || p.max == null) return "";
    return " Enter " + num(p.min) + " to " + num(p.max) + (p.unit ? " " + p.unit : "") + ".";
  }
  // Check one field. commit=false while typing: an empty or half-typed field waits quietly.
  function check(f, commit) {
    var p = f.p, inp = f.input;
    if (p.options) return { v: inp.value };
    var raw = inp.value.trim();
    if (raw === "" && inp.validity && inp.validity.badInput) return commit ? { msg: f.py + " is not a number." + rangeHint(p) } : { wait: true };
    if (raw === "") return commit ? { msg: f.py + " is empty." + rangeHint(p) } : { wait: true };
    var v = Number(raw);
    if (!isFinite(v)) return { msg: f.py + " is not a number." + rangeHint(p) };
    var err = R.validate(p.key, v);
    if (err) return { msg: f.py + " " + err + " (got " + num(v) + ")." + rangeHint(p) };
    return { v: v };
  }
  function setErr(k, msg) {
    var f = fields[k], first = invalid[k] !== msg;
    invalid[k] = msg;
    f.input.setAttribute("aria-invalid", "true");
    f.input.setAttribute("aria-describedby", f.input.id + "-d " + f.err.id);
    f.err.textContent = "ValueError: " + msg;
    f.err.hidden = false;
    if (first) announce("Error: " + msg + " The cells below were not re-run.");
  }
  function clearErr(k) {
    var f = fields[k];
    if (!f || !invalid[k]) return;
    delete invalid[k];
    f.input.removeAttribute("aria-invalid");
    f.input.setAttribute("aria-describedby", f.input.id + "-d");
    f.err.hidden = true;
    f.err.textContent = "";
  }
  function hasErr() { return Object.keys(invalid).length > 0; }

  // Apply changes through the model; if nothing changed (no "update"), still refresh the
  // kernel so a cleared error un-stales the cells.
  function apply(changes) {
    var before = updates;
    var errs = R.set(changes);
    if (errs) Object.keys(errs).forEach(function (k) { if (fields[k]) setErr(k, fields[k].py + " " + errs[k] + "."); });
    if (updates === before) runFrom(paramsCell, "changed", false);
  }

  var debounce;
  function wireParams(c) {
    function onField(inp, commit) {
      var k = inp.getAttribute("data-k"), f = fields[k], r = check(f, commit);
      if (r.wait) return;
      clearTimeout(debounce);
      if (r.msg) { setErr(k, r.msg); refresh(); markStale(true); return; }
      var wasErr = !!invalid[k];
      clearErr(k);
      if (f.slider) f.slider.value = sliderPos(f.p, r.v);
      var ch = {}; ch[k] = r.v;
      if (commit || wasErr) apply(ch);
      else debounce = setTimeout(function () { apply(ch); }, 180);
    }
    c.addEventListener("input", function (e) {
      var t = e.target;
      if (t.hasAttribute("data-slider")) {
        var k = t.getAttribute("data-slider"), f = fields[k], v = sliderValue(f.p, +t.value);
        f.input.value = v;
        clearErr(k);
        clearTimeout(debounce);
        debounce = setTimeout(function () { var ch = {}; ch[k] = v; apply(ch); }, 30);
      } else if (t.tagName === "INPUT" && t.hasAttribute("data-k")) onField(t, false);
    });
    c.addEventListener("change", function (e) {
      var t = e.target;
      if (t.tagName === "SELECT") { var ch = {}; ch[t.getAttribute("data-k")] = t.value; apply(ch); }
      else if (t.tagName === "INPUT" && t.hasAttribute("data-k")) onField(t, true);
    });
    // Esc puts back the last valid value (the model never took an invalid one)
    c.addEventListener("keydown", function (e) {
      var t = e.target;
      if (e.key !== "Escape" || t.tagName !== "INPUT" || !t.hasAttribute("data-k")) return;
      var k = t.getAttribute("data-k");
      if (!invalid[k] && Number(t.value) === R.params[k]) return;
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(debounce);
      t.value = R.params[k];
      clearErr(k);
      syncFields();
      runFrom(paramsCell, "changed", false);
    });
    c.addEventListener("click", function (e) {
      var b = e.target.closest(".pdef");
      if (!b) return;
      var k = b.getAttribute("data-k"), f = fields[k];
      clearTimeout(debounce);
      clearErr(k);
      f.input.value = R.defaults[k];
      var ch = {}; ch[k] = R.defaults[k];
      apply(ch);
      f.input.focus();
    });
  }
  function syncFields() {
    Object.keys(fields).forEach(function (k) {
      var f = fields[k], v = R.params[k];
      if (!invalid[k] && doc.activeElement !== f.input && String(f.input.value) !== String(v)) f.input.value = v;
      if (f.slider && !invalid[k]) {
        f.slider.value = sliderPos(f.p, v);
        f.slider.setAttribute("aria-valuetext", R.paramFmt(k, v));
      }
    });
  }
  function resetParams() {
    clearTimeout(debounce);
    Object.keys(invalid).forEach(clearErr);
    Object.keys(fields).forEach(function (k) { fields[k].input.value = R.defaults[k]; });
    var before = updates;
    R.reset();
    if (updates === before) runFrom(paramsCell, "changed", true);
  }

  /* ---------- chrome: top bar, layout, cell index ---------- */
  function buildChrome() {
    var h1 = $("h1", nb);
    var file = nb.getAttribute("data-file") || (U.slugify(h1 ? h1.textContent : doc.title).slice(0, 40) + ".ipynb");
    var skip = el("a", { class: "skip", href: "#" + nb.id }, "Skip to notebook");
    ui.announce = el("div", { class: "sr-only", "aria-live": "polite" });
    var bar = el("header", { class: "topbar" });
    var anySrc = cells.some(function (c) { return $(".input", c); });
    var model = hasModel() && kernelCells.length > 0;
    bar.innerHTML =
      '<div class="tb-file">' +
        '<button type="button" class="tbtn only-m nav-toggle" aria-expanded="false" aria-controls="nb-index" title="Cell index">' + svgIcon('<path d="M2.5 4h11M2.5 8h11M2.5 12h11"/>') + '<span class="sr-only">Cell index</span></button>' +
        '<span class="logo" aria-hidden="true"><svg viewBox="0 0 18 18" width="18" height="18" focusable="false"><rect x="3.5" y="1.75" width="12" height="14.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M1.75 5h3.5M1.75 9h3.5M1.75 13h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M8 6.5h4.5M8 9.5h4.5M8 12.5h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".7"/></svg></span>' +
        '<span class="fname"></span>' +
        (model ? '<span class="dirty" hidden title="params edited. Reset params restores the defaults."><i aria-hidden="true"></i><span class="sr-only">(params edited)</span></span>' +
          '<span class="kstate" aria-live="polite"><i class="dot" aria-hidden="true"></i><span>Idle</span></span>' : "") +
      "</div>" +
      '<div class="toolbar" role="toolbar" aria-label="Notebook">' +
        (model ? '<button type="button" class="tbtn run-all" aria-label="Run all" title="Re-run every code cell">' + svgIcon('<path d="M2.5 3.5v9l5-4.5zM8.5 3.5v9l5-4.5z" stroke-linejoin="round"/>') + '<span class="lbl">Run all</span></button>' +
          '<button type="button" class="tbtn reset" aria-label="Reset params" title="Reset every param to its default and re-run">' + svgIcon('<path d="M3.2 6.2A5 5 0 1 1 3 9.5"/><path d="M2.6 2.8v3.6h3.6" stroke-linejoin="round"/>') + '<span class="lbl">Reset params</span></button>' : "") +
        (anySrc ? '<button type="button" class="tbtn show-all" aria-label="Show all derivations" aria-pressed="false" title="Show or hide the code behind every output">' + svgIcon('<path d="M5.5 3C4 3 4 4 4 5.2v1.1C4 7.3 3.4 8 2.5 8c.9 0 1.5.7 1.5 1.7v1.1C4 12 4 13 5.5 13M10.5 3C12 3 12 4 12 5.2v1.1c0 1 .6 1.7 1.5 1.7-.9 0-1.5.7-1.5 1.7v1.1c0 1.2 0 2.2-1.5 2.2"/>') + '<span class="lbl">Show all derivations</span></button>' : "") +
        '<span class="here" aria-hidden="true"></span>' +
      "</div>";
    $(".fname", bar).textContent = file;
    ui.bar = bar;
    ui.kstate = $(".kstate", bar);
    ui.dirty = $(".dirty", bar);
    ui.reset = $(".reset", bar);
    ui.here = $(".here", bar);
    ui.navT = $(".nav-toggle", bar);

    var outline = el("nav", { class: "outline", id: "nb-index", "aria-label": "Cell index" });
    outline.innerHTML = '<div class="ol-head">Cell index</div>';
    ui.outline = outline;
    ui.scrim = el("div", { class: "scrim", hidden: "" });
    var layout = el("div", { class: "layout" });
    nb.parentNode.insertBefore(layout, nb);
    layout.appendChild(outline);
    layout.appendChild(ui.scrim);
    layout.appendChild(nb);
    doc.body.insertBefore(bar, layout);
    doc.body.insertBefore(ui.announce, bar);
    doc.body.insertBefore(skip, ui.announce);

    var runAll = $(".run-all", bar);
    if (runAll) runAll.addEventListener("click", function () { runFrom(null, "all", true); });
    if (ui.reset) ui.reset.addEventListener("click", resetParams);
    var showAll = $(".show-all", bar);
    if (showAll) showAll.addEventListener("click", function () {
      var on = showAll.getAttribute("aria-pressed") !== "true";
      showAll.setAttribute("aria-pressed", String(on));
      showAll.setAttribute("aria-label", on ? "Hide all derivations" : "Show all derivations");
      $(".lbl", showAll).textContent = on ? "Hide all derivations" : "Show all derivations";
      cells.forEach(function (c) { setDeriv(c, on); });
    });
    ui.navT.addEventListener("click", function () { drawer(!outline.classList.contains("open")); });
    ui.scrim.addEventListener("click", function () { drawer(false); });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && outline.classList.contains("open")) { drawer(false); ui.navT.focus(); }
    });
  }

  function buildIndex() {
    var list = el("ol"), parent = null;
    cells.forEach(function (c) {
      if (c.hidden) return;
      var li = el("li", { "data-for": c.id, class: c._kind === "md" ? "md" : "code" });
      li.innerHTML = '<a href="#' + c.id + '"><span class="olc">' + (c._kind === "md" ? "md" : "[ ]") + '</span><span class="olt"></span></a>';
      $(".olt", li).textContent = c._title;
      c._li = li;
      if (c._kind === "md") { list.appendChild(li); parent = li; }
      else if (parent) {
        var sub = $(":scope > ol", parent);
        if (!sub) { sub = el("ol"); parent.appendChild(sub); }
        sub.appendChild(li);
      } else list.appendChild(li);
    });
    ui.outline.appendChild(list);
    ui.list = list;
    list.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a) return;
      e.preventDefault();
      var c = doc.getElementById(a.getAttribute("href").slice(1));
      if (!c) return;
      drawer(false);
      c.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      c.focus({ preventScroll: true });
      select(c);
      history.replaceState(null, "", "#" + c.id);
    });
  }

  function drawer(open) {
    ui.outline.classList.toggle("open", open);
    ui.scrim.hidden = !open;
    ui.navT.setAttribute("aria-expanded", String(open));
    if (open) {
      var a = $("li.on > a", ui.list) || $("a", ui.list);
      if (a) a.focus();
    }
  }

  function select(cell) {
    if (!cell || cell === current) return;
    if (current) current.classList.remove("sel");
    current = cell;
    cell.classList.add("sel");
    $$("li", ui.list).forEach(function (li) {
      var on = li.getAttribute("data-for") === cell.id;
      li.classList.toggle("on", on);
      var a = $(":scope > a", li);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
    var cnt = $(".prompt.pin .cnt", cell);
    ui.here.textContent = (cnt ? "[" + cnt.textContent.trim() + "] " : "md · ") + cell._title;
    var on = $("li.on > a", ui.list);
    if (on && window.innerWidth > 860) {
      var r = on.getBoundingClientRect(), pr = ui.outline.getBoundingClientRect();
      if (r.top < pr.top + 40 || r.bottom > pr.bottom - 10) on.scrollIntoView({ block: "nearest" });
    }
  }
  function spy() {
    var line = window.innerHeight * 0.3, vis = cells.filter(function (c) { return !c.hidden; }), best = vis[0];
    for (var i = 0; i < vis.length; i++) {
      if (vis[i].getBoundingClientRect().top <= line) best = vis[i]; else break;
    }
    if (window.innerHeight + window.scrollY >= root.scrollHeight - 4) best = vis[vis.length - 1];
    select(best);
  }

  /* ---------- kernel ---------- */
  function announce(msg) {
    ui.announce.textContent = "";
    setTimeout(function () { ui.announce.textContent = msg; }, 30);
  }
  function setCount(c, v) {
    $$(".cnt", c).forEach(function (n) { n.textContent = v; });
    if (c._li) $(".olc", c._li).textContent = c === paramsCell && hasErr() ? "[!]" : "[" + v + "]";
  }
  function setBusy(b) {
    if (!ui.kstate) return;
    var err = !b && hasErr();
    ui.kstate.classList.toggle("busy", b);
    ui.kstate.classList.toggle("err", err);
    $("span", ui.kstate).innerHTML = b ? "Busy" : err ? 'Error<span class="ks-x"> in params</span>' : "Idle";
  }
  function below(start) {
    var i = start ? kernelCells.indexOf(start) : 0;
    return kernelCells.slice(Math.max(0, i));
  }
  function markStale(on) {
    if (!paramsCell) return;
    below(paramsCell).forEach(function (c) {
      if (c === paramsCell) return;
      c.classList.toggle("stale", on);
      if (c._li) c._li.classList.toggle("stale", on);
    });
    paramsCell.classList.toggle("errored", on);
    if (paramsCell._li) {
      paramsCell._li.classList.toggle("err", on);
      $(".olc", paramsCell._li).textContent = on ? "[!]" : "[" + $(".prompt.pin .cnt", paramsCell).textContent + "]";
    }
    setBusy(false);
  }
  // Text a reader sees in a cell's output: what "changed" is measured on.
  function sig(c) {
    var out = c._out;
    if (!out) return "";
    return out.textContent + "|" + $$("[data-show-if]", out).map(function (n) { return n.hidden ? 0 : 1; }).join("");
  }
  // Placeholders in derivations: refreshed on every model update.
  function refreshValues() {
    if (!hasModel()) return;
    cells.forEach(function (c) {
      (c._tokens || []).forEach(function (t, i) {
        if (t.cite) return;
        var n = $('.ph[data-ph="' + i + '"]', c);
        if (n) n.textContent = phText(t);
      });
    });
  }
  function flash(e, delay) {
    if (!e) return;
    e.classList.remove("flash");
    void e.offsetWidth;
    e.style.animationDelay = reduce ? "0ms" : (delay || 0) + "ms";
    e.classList.add("flash");
  }
  doc.addEventListener("animationend", function (e) {
    if (e.animationName === "nb-flash") { e.target.classList.remove("flash"); e.target.style.animationDelay = ""; }
  });
  function flashCell(c, k) {
    var d = Math.min(k * 45, 360);
    flash(c._out, d);
    flash(c._li, d);
  }
  // mode: "changed" flashes only cells whose output text changed; "all" flashes every cell.
  function runFrom(start, mode, animate) {
    var tok = ++runToken;
    if (paramsCell && hasErr()) {   // like Jupyter: params raised, later cells keep their old output
      markStale(true); refresh(); return;
    }
    markStale(false);
    refreshValues();
    var list = below(start);
    var changed = list.filter(function (c) { var s = sig(c), ch = s !== c._sig; c._sig = s; return ch; });
    var names = changed.map(function (c) { return c._title; });
    function hit(c) { return mode === "all" ? c !== paramsCell : changed.indexOf(c) >= 0; }
    function done() {
      setBusy(false);
      refresh();
      if (mode === "changed") announce(names.length ? "Re-ran " + names.length + (names.length === 1 ? " cell" : " cells") + " with new output: " + names.join(", ") + "." : "No outputs changed.");
      else if (mode === "all") announce("Ran all " + list.length + " code cells.");
    }
    if (!animate || reduce) {
      var k = 0;
      list.forEach(function (c) { setCount(c, ++counter); if (hit(c)) flashCell(c, k++); });
      return done();
    }
    setBusy(true);
    list.forEach(function (c) { $$(".cnt", c).forEach(function (n) { n.textContent = "*"; }); });
    (function step(i) {
      if (tok !== runToken) return;
      if (i >= list.length) return done();
      setCount(list[i], ++counter);
      if (hit(list[i])) flashCell(list[i], 0);
      setTimeout(function () { step(i + 1); }, 70);
    })(0);
  }
  // Edited state: which params differ from the report's defaults.
  function refresh() {
    if (!paramsCell) return;
    var ed = Object.keys(fields).filter(function (k) { return R.params[k] !== R.defaults[k]; });
    var bad = Object.keys(invalid);
    Object.keys(fields).forEach(function (k) { fields[k].def.hidden = R.params[k] === R.defaults[k] && !invalid[k]; });
    var dirty = ed.length || bad.length;
    if (ui.dirty) ui.dirty.hidden = !dirty;
    if (ui.reset) ui.reset.classList.toggle("attn", !!dirty);
    ui.edited.classList.toggle("is-err", !!bad.length);
    ui.edited.hidden = !dirty;
    ui.edited.textContent = bad.length
      ? "params has " + (bad.length === 1 ? "an error" : bad.length + " errors") + ", so the cells below were not re-run. They still show the last valid values. Fix the value, press Esc to undo, or restore the default."
      : ed.length ? "Edited: " + ed.map(function (k) { return fields[k].py; }).join(", ") + ". Live values re-ran; other numbers in the text are at the defaults." : "";
    setBusy(false);
  }

  function onUpdate(result, params, changedKeys) {
    updates++;
    if (!booted || !changedKeys || !changedKeys.length) return;
    syncFields();
    var animate = changedKeys.length > 1;   // a reset re-runs visibly; a single edit is instant
    runFrom(paramsCell || kernelCells[0], "changed", animate);
  }

  /* ---------- page touches that need core to have run ---------- */
  function evTags() {
    $$(".ev[data-ev]").forEach(function (n) {
      if (/^(DIV|P|ASIDE|SECTION|LI|UL|OL|BLOCKQUOTE|FIGURE|TABLE|TR|TD|TH)$/.test(n.tagName) || $(":scope > .ev-tag", n)) return;
      var short = R.evKinds(n).map(function (k) { return SHORT[k]; }).filter(Boolean);
      if (!short.length) return;
      var sup = el("sup", { class: "ev-tag", "aria-hidden": "true" }, short.join("·"));
      var btn = $(":scope > .ev-note-btn", n);
      n.insertBefore(sup, btn || null);
    });
  }
  function legend() {
    var DESC = { fact: "cited fact", estimate: "computed by a cell", assumption: paramsCell ? "set in params" : "taken as given", interpretation: "AI judgement" };
    $$("[data-ev-legend] .ev-key").forEach(function (key) {
      var k = key.getAttribute("data-ev"), mark = $(".ev-key-mark", key), name = $(".ev-key-name", key);
      if (!mark || !name || !TAG[k]) return;
      mark.className = "ev-key-mark tag " + TAG_CLASS[k];
      mark.textContent = TAG[k];
      name.textContent = DESC[k];
      if (k === "fact") name.insertAdjacentHTML("beforeend", ' <span class="cx">[n]</span>');
    });
  }
  // Wide tables stack into cards on phones: every cell learns its column name.
  function tables() {
    $$("table.compare").forEach(function (t) {
      var heads = $$("thead th", t).map(function (th) { return th.textContent.trim(); });
      if (heads.length < 4) return;
      t.classList.add("nb-stack");
      $$("tbody tr", t).forEach(function (tr) {
        $$(":scope > td", tr).forEach(function (td) {
          var i = Array.prototype.indexOf.call(tr.children, td);
          if (heads[i] && !td.hasAttribute("data-label")) td.setAttribute("data-label", heads[i]);
          if (!$(":scope > .cv", td)) {
            var cv = el("span", { class: "cv" });
            while (td.firstChild) cv.appendChild(td.firstChild);
            td.appendChild(cv);
          }
        });
      });
    });
  }
  // Marker labels that would overlap (e.g. "you" and "break-even" close together) step down.
  function nudgeMarkers(e) {
    var tags = $$(".rc-marker-tag", e.target);
    var placed = [];
    tags.forEach(function (g) {
      var r = g.getBBox(), dy = 0;
      placed.forEach(function (p) {
        if (r.x < p.x + p.width + 4 && p.x < r.x + r.width + 4 && Math.abs(r.y + dy - p.y) < r.height) dy = p.y - r.y + r.height + 3;
      });
      if (dy) g.setAttribute("transform", "translate(0," + dy + ")");
      placed.push({ x: r.x, y: r.y + dy, width: r.width, height: r.height });
    });
  }

  function ready() {
    if (!nb) return;
    doc.addEventListener("chart:drawn", nudgeMarkers);
    $$(".rc-chart").forEach(function (c) { nudgeMarkers({ target: c }); });
    evTags();
    legend();
    tables();
    refreshValues();
    kernelCells.forEach(function (c) { setCount(c, ++counter); c._sig = sig(c); });
    R.on("update", onUpdate);
    if (paramsCell) { syncFields(); refresh(); }
    booted = true;

    // links into the page: smooth jump, select the cell, flash a source
    doc.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.closest(".outline") || e.defaultPrevented) return;
      var id = a.getAttribute("href").slice(1), t;
      try { t = doc.getElementById(decodeURIComponent(id)); } catch (x) { return; }
      if (!t) return;
      e.preventDefault();
      var isCell = t.classList.contains("cell");
      t.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: isCell ? "start" : "center" });
      if (isCell) { t.focus({ preventScroll: true }); select(t); }
      if (t.closest(".sources")) flash(t, 0);
      history.replaceState(null, "", "#" + t.id);
    });
    nb.addEventListener("click", function (e) { var c = e.target.closest(".cell"); if (c && cells.indexOf(c) >= 0) select(c); });
    var raf = 0;
    window.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; spy(); }); }, { passive: true });
    spy();
  }

  R.hook("setup", setup);
  R.hook("ready", ready);
  R.notebook = {
    runAll: function () { runFrom(null, "all", true); },
    reset: function () { if (paramsCell) resetParams(); },
    showDerivation: function (id, open) { var c = doc.getElementById(id); if (c) setDeriv(c, open !== false); }
  };
})();
