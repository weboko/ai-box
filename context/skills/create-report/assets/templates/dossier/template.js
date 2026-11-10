/* Dossier engine. You write the brief, the entries and the prose; this file builds:
   - the sticky top bar: section tabs from main > section[data-title], scroll-spy, progress,
     and a count of blocking entries on the register's tab
   - section numbers (h2 gets a small "01")
   - per entry: an L2 body (.entry-body) that opens in place; blocking entries start open,
     and every entry starts open when a register has 6 or fewer
   - per register: status filter chips with counts, "changed since last round", group by
     area / status / severity, expand all, and "Copy as Markdown" (core kit)
   - "Print the brief" and "Copy the brief" buttons in the brief
   Without JavaScript everything shows, in document order. */
(function () {
  "use strict";
  var R = window.Report;
  if (!R) return;
  var U = R.util, $ = U.$, $$ = U.$$, el = U.el;
  var doc = document;

  /* ---------- setup: build markup before core wires things ---------- */
  R.hook("setup", function () {
    var main = $("main") || doc.body;
    var sections = $$(":scope > section.sec", main);

    // Section numbers.
    var n = 0;
    sections.forEach(function (s) {
      if (s.classList.contains("brief")) return;
      var h = $(":scope > h2", s);
      if (!h || $(".sec-n", h)) return;
      n++;
      h.insertBefore(el("span", { class: "sec-n", "aria-hidden": "true" }, (n < 10 ? "0" : "") + n), h.firstChild);
    });

    // Top bar with tabs.
    var bar = el("nav", { class: "topbar", "aria-label": "Sections" });
    var inner = el("div", { class: "topbar-inner" });
    var h1 = $("h1");
    var title = el("a", { class: "topbar-title", href: "#top" }, (doc.body.getAttribute("data-short-title") || (h1 ? h1.textContent : doc.title)).trim());
    inner.appendChild(title);
    var tabs = el("ul", { class: "tabs" });
    sections.forEach(function (s) {
      if (!s.id) s.id = U.slugify(s.getAttribute("data-title") || ($("h2", s) || {}).textContent || "section");
      var name = s.getAttribute("data-title") || ($(":scope > h2", s) || {}).textContent || s.id;
      var li = el("li");
      var a = el("a", { href: "#" + s.id, "data-for": s.id }, name.replace(/^\d+\s*/, "").trim());
      li.appendChild(a);
      tabs.appendChild(li);
    });
    inner.appendChild(tabs);
    bar.appendChild(inner);
    bar.appendChild(el("span", { class: "progress", "aria-hidden": "true" }));
    doc.body.insertBefore(bar, doc.body.firstElementChild.nextSibling);

    // Entry bodies: wrap everything after the head / summary / tags.
    $$(".entry").forEach(function (entry) {
      var body = $(":scope > .entry-body", entry);
      if (!body) {
        var rest = Array.prototype.slice.call(entry.children).filter(function (c) {
          return !c.matches(".entry-head, .entry-sum, .entry-tags");
        });
        if (!rest.length) return;
        body = el("div", { class: "entry-body" });
        rest.forEach(function (c) { body.appendChild(c); });
        entry.appendChild(body);
      }
      if (!entry.id) {
        var id = $(".entry-id", entry);
        entry.id = "e-" + U.slugify(id ? id.textContent : ($(".entry-title", entry) || {}).textContent || "entry");
      }
      body.id = body.id || entry.id + "-body";
      var label = entry.getAttribute("data-more") || "Details";
      var btn = el("button", { type: "button", class: "entry-toggle", "aria-expanded": "false", "aria-controls": body.id, "data-label": label }, label);
      var head = $(":scope > .entry-head", entry);
      if (head) head.appendChild(btn); else entry.insertBefore(btn, body);
      entry.classList.add("has-body");
      body.setAttribute("hidden", "until-found");
    });
  });

  /* ---------- open / close ---------- */
  function setOpen(entry, open, animate) {
    var body = $(":scope > .entry-body", entry), btn = $(".entry-toggle", entry);
    if (!body || !btn) return;
    if (open) body.removeAttribute("hidden"); else body.setAttribute("hidden", "until-found");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    var label = btn.getAttribute("data-label") || "Details";
    btn.textContent = open ? "Hide" : label;
    btn.setAttribute("aria-label", (open ? "Hide " : "Show ") + label.toLowerCase());
    if (open && animate && !R.reduceMotion) {
      body.classList.remove("is-opening"); void body.offsetWidth; body.classList.add("is-opening");
    }
  }

  /* ---------- registers ---------- */
  var GROUPS = { area: "data-area", status: "data-status", severity: "data-sev" };
  var SEV_ORDER = ["critical", "high", "medium", "low", "info", ""];
  var TONE_ORDER = ["bad", "warn", "good", "none", "info"];

  function initRegister(reg) {
    var entries = $$(":scope > .entry", reg);
    if (!entries.length) return;
    entries.forEach(function (e, i) { e._i = i; });
    var few = entries.length <= 6;
    entries.forEach(function (e) { setOpen(e, few || e.getAttribute("data-tone") === "bad" || e.hasAttribute("data-open"), false); });
    reg._entries = entries;

    var tools = el("div", { class: "reg-tools", role: "toolbar", "aria-label": "Filter and group the register" });
    var chips = el("div", { class: "chips", role: "group", "aria-label": "Show" });
    var state = { filter: "all", group: "" };

    // Filter chips: All, then one per status present (worst first), then "Changed".
    var counts = {};
    entries.forEach(function (e) { var k = e.getAttribute("data-status"); if (k) counts[k] = (counts[k] || 0) + 1; });
    var keys = Object.keys(counts).sort(function (a, b) {
      return TONE_ORDER.indexOf(R.kit.statusOf(a).tone) - TONE_ORDER.indexOf(R.kit.statusOf(b).tone);
    });
    function chip(key, label, count, tone) {
      var b = el("button", { type: "button", class: "chip", "data-filter": key, "aria-pressed": key === "all" ? "true" : "false" });
      if (tone) b.setAttribute("data-tone", tone);
      b.appendChild(doc.createTextNode(label + " "));
      b.appendChild(el("b", null, String(count)));
      b.addEventListener("click", function () { state.filter = key; apply(); });
      chips.appendChild(b);
    }
    chip("all", "All", entries.length);
    keys.forEach(function (k) { chip(k, R.kit.labelFor(entries, k), counts[k], R.kit.statusOf(k).tone); });
    var changed = entries.filter(function (e) { return e.hasAttribute("data-delta"); }).length;
    if (changed) chip("changed", "Changed", changed, "info");
    tools.appendChild(chips);

    // Group by: only the facets the entries carry.
    var facets = Object.keys(GROUPS).filter(function (g) {
      return g === "status" || entries.some(function (e) { return e.hasAttribute(GROUPS[g]); });
    });
    if (entries.length > 4) {
      var lab = el("label", null, "Group");
      var sel = el("select", { "aria-label": "Group the register" });
      sel.appendChild(el("option", { value: "" }, "None"));
      facets.forEach(function (f) { sel.appendChild(el("option", { value: f }, f.charAt(0).toUpperCase() + f.slice(1))); });
      sel.addEventListener("change", function () { state.group = sel.value; apply(); });
      lab.appendChild(sel);
      tools.appendChild(lab);
    }
    tools.appendChild(el("span", { class: "spacer" }));
    if (!few) {
      var all = el("button", { type: "button", class: "copy-btn", "data-expand": "" }, "Expand all");
      all.addEventListener("click", function () {
        var open = all.textContent === "Expand all";
        entries.forEach(function (e) { setOpen(e, open, false); });
        all.textContent = open ? "Collapse all" : "Expand all";
      });
      tools.appendChild(all);
    }
    if (reg.hasAttribute("data-export")) {
      tools.appendChild(R.kit.copyButton(function () { return R.kit.toMarkdown(reg); }, "Copy as Markdown"));
      var old = reg.previousElementSibling;
      if (old && old.classList.contains("export-bar")) old.remove();
    }
    reg.parentNode.insertBefore(tools, reg);
    // At-a-glance index (shown beside the register on wide screens).
    var layout = el("div", { class: "reg-layout" });
    reg.parentNode.insertBefore(layout, reg);
    layout.appendChild(reg);
    var index = el("nav", { class: "reg-index", "aria-label": "Register at a glance" });
    index.appendChild(el("p", null, "At a glance"));
    var ol = el("ol");
    var SYM = { good: "✓", warn: "◐", bad: "✗", none: "–", info: "✦" };
    entries.forEach(function (e) {
      var tone = e.getAttribute("data-tone") || "none";
      var li = el("li", { "data-tone": tone });
      var a = el("a", { href: "#" + e.id, title: R.kit.plainText($(".entry-title", e)) });
      a.appendChild(el("span", { class: "sym", "aria-label": R.kit.statusOf(e.getAttribute("data-status")).label }, SYM[tone] || "–"));
      var id = $(".entry-id", e);
      a.appendChild(el("code", null, id ? id.textContent.trim() : ""));
      a.appendChild(el("span", { class: "t" }, R.kit.plainText($(".entry-title", e))));
      li.appendChild(a);
      e._indexItem = li;
      ol.appendChild(li);
    });
    index.appendChild(ol);
    layout.appendChild(index);
    var empty = el("p", { class: "reg-empty", hidden: "" }, "Nothing matches this filter.");
    layout.parentNode.insertBefore(empty, layout.nextSibling);

    function matches(e) {
      if (state.filter === "all") return true;
      if (state.filter === "changed") return e.hasAttribute("data-delta");
      return e.getAttribute("data-status") === state.filter;
    }
    function apply() {
      $$(".chip", chips).forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-filter") === state.filter ? "true" : "false"); });
      $$(":scope > .reg-group-title", reg).forEach(function (h) { h.remove(); });
      var list = entries.slice();
      var attr = GROUPS[state.group];
      function keyOf(e) { return attr ? (e.getAttribute(attr) || "") : ""; }
      if (attr) {
        list.sort(function (a, b) {
          var ka = keyOf(a), kb = keyOf(b), d = 0;
          if (state.group === "severity") d = SEV_ORDER.indexOf(ka) - SEV_ORDER.indexOf(kb);
          else if (state.group === "status") d = TONE_ORDER.indexOf(R.kit.statusOf(ka).tone) - TONE_ORDER.indexOf(R.kit.statusOf(kb).tone) || (ka < kb ? -1 : ka > kb ? 1 : 0);
          else { var fa = firstIndex(ka), fb = firstIndex(kb); d = fa - fb; }
          return d || a._i - b._i;
        });
      } else list.sort(function (a, b) { return a._i - b._i; });
      function firstIndex(k) { for (var i = 0; i < entries.length; i++) if (keyOf(entries[i]) === k) return i; return 1e9; }
      var shown = 0, lastKey = null, groupCounts = {};
      list.forEach(function (e) { if (matches(e)) { var k = keyOf(e); groupCounts[k] = (groupCounts[k] || 0) + 1; } });
      list.forEach(function (e) {
        var ok = matches(e);
        e.classList.toggle("is-filtered", !ok);
        if (e._indexItem) e._indexItem.classList.toggle("is-filtered", !ok);
        if (ok) shown++;
        if (attr && ok && keyOf(e) !== lastKey) {
          lastKey = keyOf(e);
          var name = lastKey || "Other";
          if (state.group === "status") name = R.kit.labelFor(entries, lastKey);
          else if (state.group === "severity") name = lastKey ? lastKey.charAt(0).toUpperCase() + lastKey.slice(1) : "Not rated";
          var h = el("p", { class: "reg-group-title", role: "heading", "aria-level": "3" }, name + " ");
          h.appendChild(el("b", null, String(groupCounts[lastKey])));
          reg.appendChild(h);
        }
        reg.appendChild(e);
      });
      empty.hidden = shown > 0;
    }
    reg._reset = function () { if (state.filter !== "all") { state.filter = "all"; apply(); } };
  }

  /* ---------- ready ---------- */
  R.hook("ready", function () {
    $$(".register").forEach(initRegister);

    $$(".entry.has-body > .entry-sum").forEach(function (sum) {
      sum.addEventListener("click", function (ev) {
        if (ev.target.closest("a, button") || String(window.getSelection())) return;
        var btn = $(".entry-toggle", sum.parentNode);
        if (btn) btn.click();
      });
    });
    $$(".entry-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var entry = btn.closest(".entry");
        setOpen(entry, btn.getAttribute("aria-expanded") !== "true", true);
      });
    });
    // Find-in-page and links into a closed body open it.
    doc.addEventListener("beforematch", function (e) {
      var entry = e.target.closest && e.target.closest(".entry");
      if (entry) setTimeout(function () { setOpen(entry, true, false); }, 0);
    }, true);
    R.addRevealer(function (target) {
      var entry = target.closest && target.closest(".entry");
      if (!entry) return false;
      if (entry.classList.contains("is-filtered")) { var reg = entry.closest(".register"); if (reg && reg._reset) reg._reset(); }
      if (target !== entry || entry.getAttribute("data-tone") === "bad") setOpen(entry, true, false);
      entry.classList.remove("is-flash"); void entry.offsetWidth; entry.classList.add("is-flash");
      setTimeout(function () { entry.classList.remove("is-flash"); }, 1600);
      return true;
    });

    // Blocking count on the register's tab.
    $$(".tabs a").forEach(function (a) {
      var sec = doc.getElementById(a.getAttribute("data-for"));
      if (!sec) return;
      var bad = $$(".entry[data-tone='bad']", sec).length;
      if (bad) a.appendChild(el("span", { class: "tab-count", title: bad + " blocking" }, "✗ " + bad));
    });

    // Brief actions: print just the brief, copy it as text.
    var brief = $(".brief");
    if (brief && !$(".brief-actions", brief)) {
      var actions = el("p", { class: "brief-actions" });
      var pr = el("button", { type: "button", class: "copy-btn" }, "Print the brief");
      pr.addEventListener("click", function () {
        doc.body.classList.add("print-brief");
        window.print();
        setTimeout(function () { doc.body.classList.remove("print-brief"); }, 500);
      });
      actions.appendChild(pr);
      actions.appendChild(R.kit.copyButton(function () { return briefText(brief); }, "Copy the brief"));
      brief.appendChild(actions);
    }

    // Scroll-spy, stuck state and progress.
    var bar = $(".topbar"), links = $$(".tabs a");
    var targets = links.map(function (a) { return doc.getElementById(a.getAttribute("data-for")); });
    var ticking = false;
    function onScroll() {
      ticking = false;
      var y = window.scrollY, h = doc.documentElement.scrollHeight - window.innerHeight;
      bar.classList.toggle("is-stuck", y > 40);
      bar.style.setProperty("--p", h > 0 ? Math.min(1, y / h).toFixed(4) : 0);
      var line = (bar.offsetHeight || 52) + window.innerHeight * 0.25, cur = -1;
      targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top <= line) cur = i; });
      links.forEach(function (a, i) {
        var on = i === cur;
        if (on !== (a.getAttribute("aria-current") === "true")) {
          a.setAttribute("aria-current", on ? "true" : "false");
          if (on && a.scrollIntoView && window.innerWidth < 700) {
            var tabs = a.closest(".tabs");
            tabs.scrollTo({ left: a.offsetLeft - 12, behavior: R.reduceMotion ? "auto" : "smooth" });
          }
        }
      });
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  });

  // Plain-text brief for chat or email: the answer, the points, quotables, don'ts, asks.
  function briefText(brief) {
    var out = [];
    var h1 = $("h1");
    if (h1) out.push(h1.textContent.trim(), "");
    var v = $(".verdict-text", brief);
    var P = R.kit.plainText;
    if (v) out.push(P(v));
    var t = $(".tally", brief);
    if (t) out.push($$("li", t).map(P).join(" · "));
    function list(sel, head, bullet) {
      var items = $$(sel, brief);
      if (!items.length) return;
      out.push("", head);
      items.forEach(function (li, i) { out.push((bullet || (i + 1) + ".") + " " + P(li)); });
    }
    list("ol.know-list > li", "Know this:");
    var q = $$(".quotables > div", brief);
    if (q.length) {
      out.push("", "Numbers you can quote:");
      q.forEach(function (d) {
        var dt = $("dt", d), dd = $("dd", d);
        out.push("- " + P($("dt", d)) + " — " + P($("dd", d)));
      });
    }
    list("ul.dont > li", "Don't claim:", "✗");
    list("ul.asks > li", "Ask next:", "?");
    out.push("", "Full dossier: " + location.href.split("#")[0]);
    return out.join("\n");
  }
})();
