/* create-report charts: small dependency-free SVG charts that take their colours and
   type from the template's CSS variables and redraw on resize and on model updates.

   Declarative:  <figure class="chart" id="cost"><script type="application/json">{…}</script>
                 <figcaption>…</figcaption></figure>
   Programmatic: ReportCharts.draw(el, spec) → handle {update(spec), cursor(x), spec}
                 Report.chart(id) → the handle of a declarative chart

   Types: line, bar, stack, range. See references/core.md for the spec. */
(function () {
  "use strict";

  var doc = document;
  var R = function () { return window.Report; };
  var handles = {};
  var uid = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }
  function fmt(v, f, axis) {
    axis = axis || {};
    if (axis.fmt) return axis.fmt(v);
    var s = R().fmt(v, f || axis.format, { currency: axis.currency, digits: axis.digits });
    return (axis.prefix || "") + s + (axis.suffix || "");
  }
  function niceStep(range, target) {
    if (!(range > 0)) return 1;
    var raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var step = niceStep(v, 5);
    return Math.ceil(v / step) * step;
  }
  function logTicks(lo, hi) {
    var out = [];
    for (var e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
      [1, 2, 5].forEach(function (m) { var v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); });
    }
    return out;
  }
  // keep ticks at least gap px apart (pos(v) gives the pixel position)
  function spaced(ticks, pos, gap) {
    var out = [], last = null;
    ticks.forEach(function (t) { var p = pos(t); if (last == null || Math.abs(p - last) >= gap) { out.push(t); last = p; } });
    return out;
  }
  var DASH = { estimate: "7 5", assumption: "2 4" };
  function color(s, i) { return s.color || "var(--s" + ((i % 6) + 1) + ")"; }
  function dashFor(s) { return s.dash || DASH[s.ev] || ""; }
  function svg(w, h, inner, label) {
    return '<svg class="rc-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" role="img"' +
      (label ? ' aria-label="' + esc(label) + '"' : "") + ">" + inner + "</svg>";
  }
  function textW(s, size) { return String(s).length * (size || 12) * 0.56; }

  // Axis options whose min / max are {"bind": "path"} read them from the model.
  function axis(a) {
    a = Object.assign({}, a || {});
    ["min", "max"].forEach(function (k) { if (a[k] && typeof a[k] === "object") a[k] = val(a[k]); });
    return a;
  }
  // Resolve {"bind": "path"} → value from the model (Report.value), anything else as is.
  function val(v) {
    if (v && typeof v === "object" && !Array.isArray(v) && v.bind) return R().value(v.bind);
    return v;
  }
  function resolveData(spec) {
    if (spec.bind) return R().value(spec.bind) || [];
    return spec.data || [];
  }
  // "You: {x}" → "You: 2,000 h" using the axis format
  function label(tpl, x, y, sx, sy) {
    if (tpl == null) return "";
    return String(tpl).replace(/\{x\}/g, x != null ? fmt(x, null, sx) : "").replace(/\{y\}/g, y != null ? fmt(y, null, sy) : "");
  }

  /* ---------------- line ---------------- */
  // spec: {type:"line", x:{key,label,format,min,max,log}, y:{label,format,min,max,log},
  //        series:[{key,name,short,ev,color,dash}], data:[rows] | bind:"path",
  //        markers:[{x|bind, label}], points:[{x,y | bind:{x,y} , label}], bands:[{from,to,label}],
  //        height, legend}
  function line(el, spec, st) {
    var data = resolveData(spec);
    var sx = axis(spec.x), sy = axis(spec.y);
    var xKey = sx.key || "x";
    var series = (spec.series || []).filter(function (s) { return !(st.hidden && st.hidden[s.key]); });
    var w = Math.max(240, el.clientWidth), narrow = w < 520;
    var h = spec.height || Math.round(Math.min(360, Math.max(220, w * 0.48)));
    var showEnds = spec.endLabels !== false && !narrow;
    var maxShort = Math.max.apply(null, [0].concat((spec.series || []).map(function (s) { return textW(s.short || s.name, 12); })));
    var yMaxGuess = sy.max != null ? sy.max : niceMax(Math.max.apply(null, [0].concat(data.reduce(function (a, d) {
      return a.concat(series.map(function (s) { return +d[s.key] || 0; }));
    }, []))));
    var m = { l: 14 + Math.max(textW(fmt(yMaxGuess, null, sy), 11.5), 30), r: showEnds ? Math.min(140, maxShort + 18) : 12, t: 14, b: sx.label ? 46 : 30 };
    var pw = w - m.l - m.r, ph = h - m.t - m.b;
    var xs = data.map(function (d) { return +d[xKey]; });
    var xMin = sx.min != null ? sx.min : Math.min.apply(null, xs.concat([sx.log ? 1 : 0]));
    var xMax = sx.max != null ? sx.max : Math.max.apply(null, xs);
    var yMax = sy.max != null ? sy.max : niceMax(Math.max.apply(null, [0].concat(data.reduce(function (a, d) {
      return a.concat(series.map(function (s) { return +d[s.key] || 0; }));
    }, []))));
    // log axis without a min: start at the decade below the smallest positive value
    var dataMin = Math.min.apply(null, [0].concat(data.reduce(function (a, d) {
      return a.concat(series.map(function (s) { return d[s.key] == null ? 0 : +d[s.key]; }));
    }, [])));
    // linear y starts at 0 unless the data go negative (e.g. a cumulative payback line)
    var yMin = sy.min != null ? sy.min : !sy.log ? (dataMin < 0 ? -niceMax(-dataMin) : 0) : (function () {
      var lo = Infinity;
      data.forEach(function (d) { series.forEach(function (s) { var v = +d[s.key]; if (v > 0 && v < lo) lo = v; }); });
      return isFinite(lo) ? Math.pow(10, Math.floor(Math.log10(lo))) : 1;
    })();
    var X = sx.log
      ? function (v) { return m.l + (Math.log10(Math.max(v, xMin)) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin)) * pw; }
      : function (v) { return m.l + (v - xMin) / (xMax - xMin || 1) * pw; };
    var Y = sy.log
      ? function (v) { return m.t + ph - (Math.log10(Math.max(Math.min(v, yMax * 1.04), yMin)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) * ph; }
      : function (v) { return m.t + ph - (Math.min(v, yMax * 1.04) - yMin) / (yMax - yMin || 1) * ph; };
    var Xinv = sx.log
      ? function (px) { return Math.pow(10, Math.log10(xMin) + (px - m.l) / pw * (Math.log10(xMax) - Math.log10(xMin))); }
      : function (px) { return xMin + (px - m.l) / pw * (xMax - xMin); };
    var id = "rcclip" + (++uid);
    var g = '<defs><clipPath id="' + id + '"><rect x="' + m.l + '" y="' + (m.t - 2) + '" width="' + pw + '" height="' + (ph + 4) + '"/></clipPath></defs>';
    // grid + y ticks
    // tick density follows the plot height (about one tick per 42 px), or y.ticks = target count
    var yTarget = sy.ticks || Math.max(2, Math.min(narrow ? 4 : 5, Math.floor(ph / 42)));
    var yt = sy.log ? spaced(logTicks(yMin, yMax), function (v) { return Y(v); }, 16) : (function () { var s = niceStep(yMax - yMin, yTarget), a = []; for (var v = Math.ceil(yMin / s - 1e-9) * s; v <= yMax + 1e-9; v += s) a.push(Math.abs(v) < s * 1e-9 ? 0 : v); return a; })();
    yt.forEach(function (v) {
      g += '<g class="rc-tick"><line x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text x="' + (m.l - 7) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + esc(fmt(v, null, sy)) + "</text></g>";
    });
    var xt = sx.log ? logTicks(xMin, xMax) : (function () { var s = niceStep(xMax - xMin, narrow ? 4 : 7), a = []; for (var v = Math.ceil(xMin / s) * s; v <= xMax + 1e-9; v += s) a.push(v); return a; })();
    xt.forEach(function (v) {
      g += '<text class="rc-xt" x="' + X(v) + '" y="' + (m.t + ph + 18) + '" text-anchor="middle">' + esc(fmt(v, null, sx)) + "</text>";
    });
    g += '<line class="rc-axis" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + (m.t + ph) + '" y2="' + (m.t + ph) + '"/>';
    if (sx.label) g += '<text class="rc-axis-label" x="' + (m.l + pw / 2) + '" y="' + (h - 6) + '" text-anchor="middle">' + esc(sx.label) + "</text>";
    // bands
    (spec.bands || []).forEach(function (b) {
      var a = val(b.from), z = val(b.to);
      if (a == null || z == null) return;
      g += '<rect class="rc-band" x="' + X(a) + '" y="' + m.t + '" width="' + Math.max(0, X(z) - X(a)) + '" height="' + ph + '"/>';
      if (b.label && !narrow) g += '<text class="rc-band-label" x="' + ((X(a) + X(z)) / 2) + '" y="' + (m.t + 13) + '" text-anchor="middle">' + esc(b.label) + "</text>";
    });
    // series
    var ends = [];
    series.forEach(function (s) {
      var i = (spec.series || []).indexOf(s);
      var pts = data.filter(function (d) { return d[s.key] != null && isFinite(d[s.key]); });
      if (!pts.length) return;
      var d = pts.map(function (p, k) { return (k ? "L" : "M") + X(+p[xKey]).toFixed(1) + " " + Y(+p[s.key]).toFixed(1); }).join("");
      var dash = dashFor(s);
      g += '<path class="rc-line" d="' + d + '" fill="none" stroke="' + color(s, i) + '" stroke-width="' + (s.width || 2.25) + '" stroke-linejoin="round" stroke-linecap="round"' +
        (dash ? ' stroke-dasharray="' + dash + '"' : "") + ' clip-path="url(#' + id + ')"/>';
      var last = pts[pts.length - 1];
      ends.push({ s: s, i: i, y: Y(+last[s.key]), clipped: +last[s.key] > yMax * 1.04 });
    });
    if (showEnds) {
      // clamp into the plot, space 15 px apart downwards, then push back up from the bottom
      ends.forEach(function (e) { e.y = Math.max(m.t + 8, Math.min(m.t + ph, e.y)); });
      ends.sort(function (a, b) { return a.y - b.y; });
      for (var k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
      for (k = ends.length - 1; k >= 0; k--) {
        var lim = k === ends.length - 1 ? m.t + ph + 4 : ends[k + 1].y - 15;
        if (ends[k].y > lim) ends[k].y = lim;
      }
      ends.forEach(function (e) {
        g += '<text class="rc-end" x="' + (m.l + pw + 7) + '" y="' + (e.y + 4) + '" style="fill:' + color(e.s, e.i) + '">' + esc(e.s.short || e.s.name) + (e.clipped ? " ↑" : "") + "</text>";
      });
    }
    function yOn(key, xv) {
      var rows = data.filter(function (d) { return d[key] != null; });
      for (var i = 1; i < rows.length; i++) {
        var a = rows[i - 1], z = rows[i];
        if (+a[xKey] <= xv && xv <= +z[xKey]) {
          var t = (xv - a[xKey]) / ((z[xKey] - a[xKey]) || 1);
          return +a[key] + t * (z[key] - a[key]);
        }
      }
      return null;
    }
    // points
    (spec.points || []).forEach(function (p) {
      // {bind:"path"} → an {x, y} object; or x / y each a number or {bind:"path"}
      // {on: "seriesKey"} reads y off that series at x (linear between data rows)
      var pv = p.bind ? R().value(p.bind) : p;
      if (typeof pv === "number") pv = { x: pv };
      var px = pv && val(pv.x != null ? pv.x : pv[xKey]), py = pv && val(pv.y);
      if (p.on && px != null) py = yOn(p.on, px);
      if (px == null || py == null || px > xMax || px < xMin) return;
      var cx = X(px), cy = Y(py), right = cx < m.l + pw * 0.62;
      g += '<circle class="rc-point" cx="' + cx + '" cy="' + cy + '" r="5"/>';
      if (p.label) g += '<text class="rc-point-label" x="' + (cx + (right ? 9 : -9)) + '" y="' + (cy - 9) + '" text-anchor="' + (right ? "start" : "end") + '">' +
        esc(label(p.label, px, py, p.format ? Object.assign({}, sx, { format: p.format }) : sx, p.yFormat ? Object.assign({}, sy, { format: p.yFormat }) : sy)) + "</text>";
    });
    // markers (vertical lines); tags that would overlap drop down a row
    var tags = [];
    (spec.markers || []).forEach(function (mk) {
      var mx = val(mk.bind ? { bind: mk.bind } : mk.x);
      if (mx == null || !isFinite(mx)) return;
      var over = mx > xMax;
      var px = X(Math.max(xMin, Math.min(mx, xMax)));
      var txt = label(mk.label, mx, null, mk.format ? Object.assign({}, sx, { format: mk.format }) : sx, sy) + (over ? " →" : "");
      g += '<line class="rc-marker" x1="' + px + '" x2="' + px + '" y1="' + m.t + '" y2="' + (m.t + ph) + '"/>';
      if (txt) {
        var tw = textW(txt, 12) + 10, left = px + tw + 4 > m.l + pw;
        var x0 = left ? px - tw - 4 : px + 4, row = 0;
        while (tags.some(function (t) { return t.row === row && x0 < t.x1 + 4 && x0 + tw > t.x0 - 4; })) row++;
        tags.push({ x0: x0, x1: x0 + tw, row: row });
        var ty = m.t + 1 + row * 22;
        g += '<g class="rc-marker-tag"><rect x="' + x0 + '" y="' + ty + '" width="' + tw + '" height="19" rx="3"/>' +
          '<text x="' + (left ? px - 9 : px + 9) + '" y="' + (ty + 13.5) + '" text-anchor="' + (left ? "end" : "start") + '">' + esc(txt) + "</text></g>";
      }
    });
    g += '<line class="rc-xh" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ph) + '" visibility="hidden"/>';
    g += '<line class="rc-cursor" x1="0" x2="0" y1="' + m.t + '" y2="' + (m.t + ph) + '" visibility="hidden"/>';
    g += '<rect class="rc-hit" x="' + m.l + '" y="' + m.t + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>';
    el.innerHTML = svg(w, h, g, spec.label || spec.title) + (showEnds ? "" : legend(series, spec.series)) + '<div class="rc-tip" hidden></div>';
    // crosshair tooltip: nearest data row
    var svgEl = el.querySelector("svg"), tip = el.querySelector(".rc-tip"), xh = el.querySelector(".rc-xh"), hit = el.querySelector(".rc-hit");
    function nearest(xv) {
      var best = null, bd = Infinity;
      data.forEach(function (d) { var dd = Math.abs(+d[xKey] - xv); if (dd < bd) { bd = dd; best = d; } });
      return best;
    }
    function move(ev) {
      // scale by the drawn size, so it works inside zoomed or transformed containers
      var r = svgEl.getBoundingClientRect(), cx = (ev.clientX - r.left) * (w / (r.width || w));
      var row = nearest(Xinv(Math.max(m.l, Math.min(m.l + pw, cx))));
      if (!row) return;
      var px = X(+row[xKey]);
      xh.setAttribute("x1", px); xh.setAttribute("x2", px); xh.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.innerHTML = '<div class="rc-tip-h">' + esc(fmt(+row[xKey], null, sx)) + "</div>" + series.map(function (s) {
        var i = (spec.series || []).indexOf(s);
        return '<div class="rc-tip-r"><span><i style="background:' + color(s, i) + '"></i>' + esc(s.name) + "</span><b>" + esc(fmt(row[s.key], null, sy)) + "</b></div>";
      }).join("");
      var tw = tip.offsetWidth, left = px + 12;
      if (left + tw > w) left = px - tw - 12;
      tip.style.left = Math.max(0, left) + "px";
      tip.style.top = (m.t + 6) + "px";
    }
    function leave() { tip.hidden = true; xh.setAttribute("visibility", "hidden"); }
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);
    return {
      cursor: function (xv) {
        var c = el.querySelector(".rc-cursor");
        if (!c) return;
        if (xv == null) { c.setAttribute("visibility", "hidden"); return; }
        var px = X(Math.max(xMin, Math.min(xMax, xv)));
        c.setAttribute("x1", px); c.setAttribute("x2", px); c.setAttribute("visibility", "visible");
      },
      x: X, y: Y
    };
  }

  /* ---------------- bar (horizontal, grouped) ---------------- */
  // spec: {type:"bar", x:{key:"label"}, y:{format,max}, series:[{key,name,ev,color}], data:[rows]}
  // Each row is a category; one bar per series. Values are labelled at the bar end.
  function bar(el, spec) {
    var data = resolveData(spec);
    var sx = spec.x || {}, sy = spec.y || {};
    var cat = sx.key || "label";
    var series = spec.series || [{ key: "value", name: "" }];
    var w = Math.max(240, el.clientWidth), narrow = w < 520;
    var lw = narrow ? 0 : Math.min(220, Math.max.apply(null, [60].concat(data.map(function (d) { return textW(d[cat], 12.5) + 14; }))));
    var barH = series.length > 1 ? 14 : 18, gap = 4;
    var rowH = series.length * (barH + gap) + (narrow ? 26 : 14);
    var maxV = sy.max != null ? sy.max : Math.max.apply(null, [0].concat(data.reduce(function (a, d) { return a.concat(series.map(function (s) { return +d[s.key] || 0; })); }, [])));
    var valW = Math.max.apply(null, [40].concat(data.reduce(function (a, d) { return a.concat(series.map(function (s) { return textW(fmt(d[s.key], null, sy), 12) + 12; })); }, [])));
    var m = { l: lw, r: valW, t: 6, b: 8 };
    var pw = w - m.l - m.r, h = m.t + data.length * rowH + m.b;
    var X = function (v) { return Math.max(0, v) / (maxV || 1) * pw; };
    var g = "";
    data.forEach(function (d, i) {
      var y = m.t + i * rowH + (narrow ? 20 : 4);
      if (narrow) g += '<text class="rc-cat" x="0" y="' + (y - 6) + '">' + esc(d[cat]) + "</text>";
      else g += '<text class="rc-cat" x="' + (m.l - 10) + '" y="' + (y + (series.length * (barH + gap) - gap) / 2 + 4) + '" text-anchor="end">' + esc(d[cat]) + "</text>";
      series.forEach(function (s, k) {
        var v = +d[s.key];
        if (d[s.key] == null || !isFinite(v)) return;
        var by = y + k * (barH + gap), bw = X(v);
        var dash = dashFor(s), hl = d._highlight === s.key || d._highlight === true;
        g += '<rect class="rc-bar' + (hl ? " rc-hl" : "") + '" x="' + m.l + '" y="' + by + '" width="' + Math.max(bw, v > 0 ? 2 : 0) + '" height="' + barH + '" rx="2" fill="' + color(s, k) + '"' +
          (dash ? ' fill-opacity=".35" stroke="' + color(s, k) + '" stroke-width="1.5" stroke-dasharray="' + dash + '"' : "") + "><title>" + esc((s.name ? s.name + ": " : "") + fmt(v, null, sy)) + "</title></rect>";
        g += '<text class="rc-val" x="' + (m.l + bw + 6) + '" y="' + (by + barH / 2 + 4) + '">' + esc(fmt(v, null, sy)) + "</text>";
      });
    });
    el.innerHTML = svg(w, h, g, spec.label || spec.title) + legend(series);
  }

  /* ---------------- stack (horizontal stacked bars) ---------------- */
  // spec: {type:"stack", x:{key:"label"}, y:{format}, series:[{key,name,color,ev}], data:[rows]}
  function stack(el, spec) {
    var data = resolveData(spec);
    var sx = spec.x || {}, sy = spec.y || {};
    var cat = sx.key || "label";
    var series = spec.series || [];
    var w = Math.max(240, el.clientWidth), narrow = w < 520;
    var lw = narrow ? 0 : Math.min(200, Math.max.apply(null, [60].concat(data.map(function (d) { return textW(d[cat], 12.5) + 14; }))));
    var rowH = narrow ? 44 : 32;
    var totals = data.map(function (d) { return series.reduce(function (a, s) { return a + (+d[s.key] || 0); }, 0); });
    var maxV = sy.max != null ? sy.max : Math.max.apply(null, [0].concat(totals));
    var valW = Math.max.apply(null, [44].concat(totals.map(function (t) { return textW(fmt(t, null, sy), 12) + 12; })));
    var m = { l: lw, r: valW, t: 4, b: 6 };
    var pw = w - m.l - m.r, h = m.t + data.length * rowH + m.b;
    var X = function (v) { return Math.max(0, v) / (maxV || 1) * pw; };
    var g = "";
    data.forEach(function (d, i) {
      var y = m.t + i * rowH + (narrow ? 20 : 6), x = m.l;
      if (narrow) g += '<text class="rc-cat" x="0" y="' + (y - 6) + '">' + esc(d[cat]) + "</text>";
      else g += '<text class="rc-cat" x="' + (m.l - 10) + '" y="' + (y + 14) + '" text-anchor="end">' + esc(d[cat]) + "</text>";
      series.forEach(function (s, k) {
        var v = +d[s.key] || 0;
        if (v <= 0) return;
        var bw = X(v), dash = dashFor(s);
        g += '<rect class="rc-bar" x="' + x + '" y="' + y + '" width="' + Math.max(1, bw - 1.5) + '" height="20" rx="2" fill="' + color(s, k) + '"' +
          (dash ? ' fill-opacity=".35" stroke="' + color(s, k) + '" stroke-dasharray="' + dash + '"' : "") + "><title>" + esc(s.name + ": " + fmt(v, null, sy)) + "</title></rect>";
        x += bw;
      });
      g += '<text class="rc-val rc-strong" x="' + (x + 6) + '" y="' + (y + 14.5) + '">' + esc(fmt(totals[i], null, sy)) + "</text>";
    });
    el.innerHTML = svg(w, h, g, spec.label || spec.title) + legend(series);
  }

  /* ---------------- range (dots and ranges on a shared axis) ---------------- */
  // spec: {type:"range", x:{format,min,max,log,label}, rows:[{label, value|values:[…],
  //        ranges:[[lo,hi]], note, ev, color, strong}], band:{from,to,label}, marker:{x,label}}
  function range(el, spec) {
    var sx = spec.x || {};
    var rows = (spec.bind ? (R().value(spec.bind) || []) : (spec.rows || [])).map(function (r) {
      // value / values / ranges may each be {bind:"path"}
      return Object.assign({}, r, { value: val(r.value), values: val(r.values), ranges: val(r.ranges) });
    });
    var w = Math.max(240, el.clientWidth), narrow = w < 520;
    var lw = narrow ? 0 : Math.min(240, Math.max.apply(null, [60].concat(rows.map(function (r) { return textW(r.label, 12.5) + 14; }))));
    var rowH = narrow ? 46 : 32, top = spec.marker ? 26 : 8;
    var m = { l: lw + 10, r: narrow ? 14 : 70, t: top, b: sx.label ? 42 : 26 };
    var pw = w - m.l - m.r, h = m.t + rows.length * rowH + m.b;
    var all = rows.reduce(function (a, r) {
      return a.concat(r.value != null ? [r.value] : [], r.values || [], (r.ranges || []).reduce(function (b, x) { return b.concat(x); }, []));
    }, []);
    var lo = sx.min != null ? sx.min : (sx.log ? Math.pow(10, Math.floor(Math.log10(Math.min.apply(null, all)))) : 0);
    var hi = sx.max != null ? sx.max : (sx.log ? Math.pow(10, Math.ceil(Math.log10(Math.max.apply(null, all)))) : niceMax(Math.max.apply(null, all)));
    var X = sx.log
      ? function (v) { return m.l + (Math.log10(Math.max(lo, Math.min(hi, v))) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * pw; }
      : function (v) { return m.l + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1) * pw; };
    var g = "";
    var ticks = sx.log ? logTicks(lo, hi) : (function () { var s = niceStep(hi - lo, narrow ? 4 : 6), a = []; for (var v = lo; v <= hi + 1e-9; v += s) a.push(v); return a; })();
    ticks.forEach(function (t) {
      var major = !sx.log || Math.abs(Math.log10(t) - Math.round(Math.log10(t))) < 1e-9;
      var showText = major || (!narrow && pw / ticks.length > 46);
      g += '<g class="rc-tick"><line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + m.t + '" y2="' + (h - m.b) + '"' + (major ? "" : ' stroke-opacity=".5"') + "/>" +
        (showText ? '<text x="' + X(t) + '" y="' + (h - m.b + 16) + '" text-anchor="middle">' + esc(fmt(t, null, sx)) + "</text>" : "") + "</g>";
    });
    if (sx.label) g += '<text class="rc-axis-label" x="' + (m.l + pw / 2) + '" y="' + (h - 6) + '" text-anchor="middle">' + esc(sx.label) + "</text>";
    if (spec.band) {
      var bf = val(spec.band.from), bt = val(spec.band.to);
      g += '<rect class="rc-band" x="' + X(bf) + '" y="' + m.t + '" width="' + Math.max(0, X(bt) - X(bf)) + '" height="' + (h - m.b - m.t) + '"/>';
      if (spec.band.label && !narrow) g += '<text class="rc-band-label" x="' + ((X(bf) + X(bt)) / 2) + '" y="' + (m.t - 4) + '" text-anchor="middle">' + esc(spec.band.label) + "</text>";
    }
    rows.forEach(function (r, i) {
      var cy = m.t + i * rowH + (narrow ? 32 : rowH / 2);
      var c = r.color || "var(--s" + ((i % 6) + 1) + ")";
      if (spec.colorBy === "ev" || r.ev) c = r.color || "var(--ink)";
      var note = r.note ? (narrow ? ": " + r.note : "") : "";
      if (narrow) g += '<text class="rc-cat' + (r.strong ? " rc-strong" : "") + '" x="' + m.l + '" y="' + (cy - 14) + '">' + esc(r.label) + (note ? '<tspan class="rc-muted">' + esc(note) + "</tspan>" : "") + "</text>";
      else g += '<text class="rc-cat' + (r.strong ? " rc-strong" : "") + '" x="' + (m.l - 10) + '" y="' + (cy + 4) + '" text-anchor="end">' + esc(r.label) + "</text>";
      g += '<line class="rc-row" x1="' + m.l + '" x2="' + (m.l + pw) + '" y1="' + cy + '" y2="' + cy + '"/>';
      var dash = DASH[r.ev] || "";
      var maxX = 0, minX = Infinity;
      (r.ranges || []).forEach(function (rg) {
        g += '<g><title>' + esc(r.label + ": " + fmt(rg[0], null, sx) + "–" + fmt(rg[1], null, sx)) + "</title>" +
          '<line x1="' + X(rg[0]) + '" x2="' + X(rg[1]) + '" y1="' + cy + '" y2="' + cy + '" stroke="' + c + '" stroke-width="6" stroke-linecap="round"' + (dash ? ' stroke-dasharray="' + dash + '" stroke-opacity=".8"' : "") + "/>" +
          '<circle class="rc-dot" cx="' + X(rg[0]) + '" cy="' + cy + '" r="4.5" fill="' + c + '"/>' +
          '<circle class="rc-dot rc-hollow" cx="' + X(rg[1]) + '" cy="' + cy + '" r="4.5" style="stroke:' + c + '"/></g>';
        maxX = Math.max(maxX, X(rg[1])); minX = Math.min(minX, X(rg[0]));
      });
      (r.values || (r.value != null ? [r.value] : [])).forEach(function (v) {
        g += '<g><title>' + esc(r.label + ": " + fmt(v, null, sx)) + "</title>" +
          (r.shape === "diamond"
            ? '<rect class="rc-dot" x="' + (X(v) - 5) + '" y="' + (cy - 5) + '" width="10" height="10" transform="rotate(45 ' + X(v) + " " + cy + ')" fill="' + c + '"/>'
            : '<circle class="rc-dot' + (r.hollow ? " rc-hollow" : "") + '" cx="' + X(v) + '" cy="' + cy + '" r="5.5" ' + (r.hollow ? 'style="stroke:' + c + '"' : 'fill="' + c + '"') + "/>") + "</g>";
        maxX = Math.max(maxX, X(v)); minX = Math.min(minX, X(v));
      });
      if (r.note && !narrow) {
        var lx = maxX + 10, anchor = "start";
        if (lx + textW(r.note, 12) > w) { lx = minX - 10; anchor = "end"; }
        g += '<text class="rc-val" x="' + lx + '" y="' + (cy + 4) + '" text-anchor="' + anchor + '">' + esc(r.note) + "</text>";
      }
    });
    if (spec.marker) {
      var mv = val(spec.marker.bind ? { bind: spec.marker.bind } : spec.marker.x);
      if (mv != null) {
        var mx = X(mv), txt = label(spec.marker.label, mv, null, spec.marker.format ? Object.assign({}, sx, { format: spec.marker.format }) : sx), tw = textW(txt, 12) + 10, right = mx + tw < w;
        g += '<line class="rc-marker" x1="' + mx + '" x2="' + mx + '" y1="' + (m.t - 4) + '" y2="' + (h - m.b) + '"/>';
        if (txt) g += '<g class="rc-marker-tag"><rect x="' + (right ? mx - 4 : mx - tw + 4) + '" y="2" width="' + tw + '" height="19" rx="3"/><text x="' + (right ? mx + 1 : mx - tw + 9) + '" y="15.5">' + esc(txt) + "</text></g>";
      }
    }
    el.innerHTML = svg(w, h, g, spec.label || spec.title);
  }

  // all: the full series list, so colours stay put when some series are hidden
  function legend(series, all) {
    if (!series || series.length < 2) return "";
    all = all || series;
    return '<div class="rc-legend">' + series.map(function (s) {
      var i = all.indexOf(s);
      return '<span class="rc-legend-item' + (dashFor(s) ? " rc-dashed" : "") + '"><i style="background:' + color(s, i) + (dashFor(s) ? ";opacity:.45" : "") + '"></i>' + esc(s.name) + "</span>";
    }).join("") + "</div>";
  }

  /* ---------------- data table ("Show data") ---------------- */
  function sample(rows, n) {
    if (rows.length <= n) return rows;
    var out = [], step = (rows.length - 1) / (n - 1);
    for (var i = 0; i < n; i++) out.push(rows[Math.round(i * step)]);
    return out;
  }
  function tableHTML(spec) {
    var sx = spec.x || {}, sy = spec.y || {};
    var head, body;
    if (spec.type === "range") {
      var rows = spec.bind ? (R().value(spec.bind) || []) : (spec.rows || []);
      head = "<tr><th></th><th class=\"num\">Values</th>" + (rows.some(function (r) { return r.note; }) ? "<th>Note</th>" : "") + "</tr>";
      body = rows.map(function (r) {
        var parts = (r.values || (r.value != null ? [r.value] : [])).map(function (v) { return fmt(v, null, sx); })
          .concat((r.ranges || []).map(function (g) { return fmt(g[0], null, sx) + "–" + fmt(g[1], null, sx); }));
        return "<tr><th>" + esc(r.label) + "</th><td class=\"num\">" + esc(parts.join(", ")) + "</td>" + (rows.some(function (x) { return x.note; }) ? "<td>" + esc(r.note || "") + "</td>" : "") + "</tr>";
      }).join("");
    } else {
      var data = resolveData(spec);
      var key = sx.key || (spec.type === "line" ? "x" : "label");
      var series = spec.series || [];
      if (spec.type === "line") data = sample(data, spec.tableRows || 12);
      head = "<tr><th>" + esc(sx.label || "") + "</th>" + series.map(function (s) { return "<th class=\"num\">" + esc(s.name) + "</th>"; }).join("") + "</tr>";
      body = data.map(function (d) {
        return "<tr><th>" + esc(spec.type === "line" ? fmt(+d[key], null, sx) : d[key]) + "</th>" + series.map(function (s) {
          return "<td class=\"num\">" + esc(d[s.key] == null ? "" : fmt(+d[s.key], null, sy)) + "</td>";
        }).join("") + "</tr>";
      }).join("");
    }
    return '<div class="rc-table-wrap"><table class="rc-data"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>";
  }

  /* ---------------- handles ---------------- */
  var TYPES = { line: line, bar: bar, stack: stack, range: range };
  function draw(el, spec) {
    var st = { hidden: {} };
    var h = { el: el, spec: spec, drawn: null, cursorX: null };
    function render() {
      var fn = TYPES[h.spec.type];
      if (!fn) { el.textContent = "Unknown chart type " + h.spec.type; return; }
      if (!el.clientWidth) return;   // hidden: drawn when it gets a size
      try {
        h.drawn = fn(el, h.spec, st) || null;
      } catch (e) {
        console.error("create-report: chart failed", el, e);
        return;
      }
      if (h.cursorX != null && h.drawn && h.drawn.cursor) h.drawn.cursor(h.cursorX);
      if (h.table) h.table.innerHTML = tableHTML(h.spec);
      el.dispatchEvent(new CustomEvent("chart:drawn", { bubbles: true }));
    }
    h.render = render;
    h.update = function (newSpec) { if (newSpec) h.spec = newSpec; render(); };
    h.cursor = function (x) { h.cursorX = x; if (h.drawn && h.drawn.cursor) h.drawn.cursor(x); };
    h.toggle = function (key, hidden) { st.hidden[key] = hidden; render(); };
    var force = R().observeResize(el, render);
    h.force = force;
    return h;
  }

  function init() {
    Array.prototype.slice.call(doc.querySelectorAll("figure.chart")).forEach(function (fig, i) {
      if (fig._chart) return;
      var src = fig.querySelector('script[type="application/json"]');
      if (!src) return;
      var spec;
      try { spec = JSON.parse(src.textContent); } catch (e) {
        console.error("create-report: bad chart JSON in #" + (fig.id || i), e);
        return;
      }
      var box = fig.querySelector(".rc-chart");
      if (!box) {
        box = doc.createElement("div");
        box.className = "rc-chart";
        fig.insertBefore(box, src.nextSibling);
      }
      var h = draw(box, spec);
      if (spec.table !== false) {
        var det = doc.createElement("details");
        det.className = "rc-chart-data";
        det.innerHTML = "<summary>Show data</summary>";
        var t = doc.createElement("div");
        det.appendChild(t);
        h.table = t;
        t.innerHTML = tableHTML(spec);
        var cap = fig.querySelector("figcaption");
        fig.insertBefore(det, cap ? cap.nextSibling : null);
      }
      fig._chart = h;
      handles[fig.id || "chart-" + i] = h;
    });
    R().on("update", function () {
      Object.keys(handles).forEach(function (k) {
        var h = handles[k];
        if (usesModel(h.spec)) h.render();
      });
    });
  }
  function usesModel(spec) {
    return /"bind"/.test(JSON.stringify(spec));
  }

  window.ReportCharts = {
    init: init, draw: draw, handles: handles,
    legend: legend,
    util: { niceStep: niceStep, niceMax: niceMax, logTicks: logTicks, esc: esc, fmt: fmt, textW: textW, DASH: DASH }
  };
  // core.js loads first, so Report exists here.
  if (window.Report) window.Report.chart = function (id) { return handles[id] || null; };
})();
