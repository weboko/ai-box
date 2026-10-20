/* create-report template "atlas": the report drawn as a map.
   Reads the page's markup and turns it into an atlas:
     section.world              world page: cartouche (title, TL;DR, key), world map, highlights
     article.plate[data-region] one region = one plate (page); data-name, data-weight, data-kind,
                                data-l0, data-label, data-sub, data-tint, data-unit, data-ridge,
                                data-shape, data-from, data-to, data-map
     article.place[data-place]  a place inside a region (nested in it, or data-region="<id>")
     ol.sources                 the sources page
   It generates the map (squarified treemap of the regions, organic shared borders, nested
   places, islands, reefs, routes, flags), a hash router (world → plate → place, Back/Forward
   with scroll restore), the viewBox fly-in, hover/tap/Tab previews (a bottom sheet on phones),
   a locator inset with "you are here", breadcrumbs, a gazetteer index with grid references,
   "charted" flags and the "still uncharted" list, and cartographic evidence symbols.
   Without JavaScript the same markup reads as one plain document. */
(function () {
  "use strict";
  var R = window.Report;
  if (!R) return;
  var U = R.util, $ = U.$, $$ = U.$$, el = U.el, esc = U.esc;
  var doc = document, root = doc.documentElement;
  var reduce = R.reduceMotion;

  var W = 1000, H = 640, COLS = "ABCDEFGHIJ", EPS = 0.05, STEP = 16;
  var LAND_KINDS = { land: 1, disputed: 1 };
  var SEA_KINDS = { island: 1, reef: 1 };
  var SYM = { fact: "S", estimate: "E", assumption: "A", interpretation: "I" };
  var SYM_NAME = { S: "surveyed", E: "estimated", A: "assumed", I: "cartographer's note" };
  var SYM_LONG = {
    S: "sourced fact; the number after it links to the source.",
    E: "calculated from surveyed inputs; tap the dashed ring to see the calculation.",
    A: "a premise chosen for this report, not verified.",
    I: "the author's interpretation or judgement, set in italics."
  };

  var REG = [], PL = [], byId = {}, byEl = new Map();
  var main, world, sourcesPage, indexPage, pages = [];
  var state = { page: null, booted: false };
  var seed = 1, LR = null, verts = [];
  var svgCount = 0;

  function roman(n) {
    var m = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]], s = "";
    m.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } });
    return s;
  }
  function attr(n, k) { var v = n.getAttribute(k); return v == null || v === "" ? null : v; }
  function num(v, d) { var x = parseFloat(v); return isFinite(x) && x > 0 ? x : d; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function grid(c) { return c ? COLS[Math.max(0, Math.min(9, Math.floor(c[0] / 100)))] + (Math.max(0, Math.min(5, Math.floor(c[1] / (H / 6)))) + 1) : "—"; }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }
  function headingOf(n, isRegion) {
    var hs = $$("h1, h2, h3, h4", n);
    for (var i = 0; i < hs.length; i++) {
      if (!isRegion || !hs[i].closest("[data-place], .place")) return hs[i];
    }
    return null;
  }
  function textOf(n) { return n ? n.textContent.replace(/\s+/g, " ").trim() : ""; }

  /* ================= setup: read the markup, build the pages ================= */

  function setup() {
    main = $("main") || doc.body;
    root.classList.add("atlas-js");
    world = $(".world");
    if (!world) { world = el("section", { class: "world" }); main.insertBefore(world, main.firstChild); }
    if (!world.id) world.id = "world";
    seed = num(attr(world, "data-seed"), 0) || hashStr(doc.title || "atlas");

    $$(".plate, [data-region]").forEach(function (n) {
      if (n.matches("[data-place], .place")) return;
      var h = headingOf(n, true);
      var name = attr(n, "data-name") || textOf(h) || "Region";
      if (!n.id) n.id = "r-" + U.slugify(name);
      var l0p = $$(".l0", n).filter(function (x) { return !x.closest("[data-place], .place"); })[0];
      var kind = (attr(n, "data-kind") || "land").toLowerCase();
      if (kind === "hazard" || kind === "hazards") kind = "reef";
      if (!LAND_KINDS[kind] && !SEA_KINDS[kind] && kind !== "route" && kind !== "flag") kind = "land";
      var r = {
        type: "region", id: n.id, el: n, h: h, name: name, label: attr(n, "data-label") || name,
        weight: num(attr(n, "data-weight"), 1), kind: kind, l0: attr(n, "data-l0") || textOf(l0p),
        sub: attr(n, "data-sub"), unit: attr(n, "data-unit"), ridge: attr(n, "data-ridge"),
        shape: attr(n, "data-shape"), places: [], n: REG.length + 1
      };
      REG.push(r); byId[r.id] = r; byEl.set(n, r);
    });
    var regionSel = REG.map(function (r) { return "#" + CSS.escape(r.id); }).join(",");
    $$("[data-place], .place").forEach(function (n) {
      var reg = (regionSel && n.parentElement && n.parentElement.closest(regionSel)) || doc.getElementById(attr(n, "data-region") || "");
      var r = reg && byEl.get(reg);
      if (!r) return;
      var h = headingOf(n);
      var name = attr(n, "data-name") || textOf(h) || "Place";
      if (!n.id) n.id = "p-" + U.slugify(name);
      var l0p = $(".l0", n);
      var p = {
        type: "place", id: n.id, el: n, h: h, region: r, name: name, label: attr(n, "data-label") || name,
        weight: num(attr(n, "data-weight"), 1), kind: (attr(n, "data-kind") || "area").toLowerCase() === "point" ? "point" : "area",
        l0: attr(n, "data-l0") || textOf(l0p), sub: attr(n, "data-sub"), num: attr(n, "data-n")
      };
      r.places.push(p); PL.push(p); byId[p.id] = p; byEl.set(n, p);
    });
    // places become pages of their own, right after their region
    REG.forEach(function (r) {
      var after = r.el;
      r.places.forEach(function (p) { after.parentNode.insertBefore(p.el, after.nextSibling); after = p.el; });
    });

    var src = $("ol.sources");
    sourcesPage = $("#sources");
    if (!sourcesPage && src) {
      sourcesPage = src.closest("section, article");
      if (!sourcesPage || byEl.get(sourcesPage) || sourcesPage === world) {
        sourcesPage = el("section", { class: "atlas-sources" });
        src.parentNode.insertBefore(sourcesPage, src);
        sourcesPage.appendChild(src);
      }
      sourcesPage.id = "sources";
    }
    indexPage = el("section", { class: "atlas-index", id: "index", "aria-labelledby": "atlas-index-h" });
    if (sourcesPage && sourcesPage.parentNode) sourcesPage.parentNode.insertBefore(indexPage, sourcesPage);
    else main.appendChild(indexPage);

    pages = [world].concat(REG.reduce(function (a, r) { return a.concat([r.el], r.places.map(function (p) { return p.el; })); }, []), [indexPage], sourcesPage ? [sourcesPage] : []);
    pages.forEach(function (p) { p.classList.add("atlas-page"); });

    buildGeo();
    buildChrome();
  }

  /* ================= geometry ================= */
  // squarified treemap, keeping input order
  function squarify(items, rect) {
    var total = items.reduce(function (a, it) { return a + it.w; }, 0) || 1;
    var scale = rect.w * rect.h / total;
    var areas = items.map(function (it) { return it.w * scale; });
    var out = [], r = { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, row = [], i = 0;
    function worst(rw, side) {
      var s = 0, mx = 0, mn = Infinity;
      rw.forEach(function (a) { s += a; mx = Math.max(mx, a); mn = Math.min(mn, a); });
      return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn));
    }
    function layout(rw, last) {
      var s = rw.reduce(function (a, b) { return a + b; }, 0), k0 = out.length;
      if (r.w >= r.h) {
        var cw = last ? r.w : s / r.h, y = r.y;
        rw.forEach(function (a, j) { var hh = j === rw.length - 1 ? r.y + r.h - y : a / cw; out.push({ x: r.x, y: y, w: cw, h: hh }); y += hh; });
        r.x += cw; r.w -= cw;
      } else {
        var rh = last ? r.h : s / r.w, x = r.x;
        rw.forEach(function (a, j) { var ww = j === rw.length - 1 ? r.x + r.w - x : a / rh; out.push({ x: x, y: r.y, w: ww, h: rh }); x += ww; });
        r.y += rh; r.h -= rh;
      }
      return k0;
    }
    while (i < areas.length) {
      var side = Math.min(r.w, r.h);
      if (!row.length || worst(row.concat([areas[i]]), side) <= worst(row, side)) { row.push(areas[i]); i++; }
      else { layout(row, false); row = []; }
    }
    if (row.length) layout(row, true);
    return out.map(function (c) {
      var x0 = r2(c.x), y0 = r2(c.y), x1 = r2(c.x + c.w), y1 = r2(c.y + c.h);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    });
  }
  // deterministic smooth noise
  function hash(i, j, s) {
    var h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  }
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function onCoast(x, y) {
    return LR && (Math.abs(x - LR.x) < EPS || Math.abs(x - LR.x - LR.w) < EPS || Math.abs(y - LR.y) < EPS || Math.abs(y - LR.y - LR.h) < EPS);
  }
  // one displacement field for every border, so neighbours always share the same line
  function disp(x, y) {
    var a = 6.5;
    var dx = (vnoise(x / 62, y / 62, seed) - 0.5) * 2 * a + (vnoise(x / 21, y / 21, seed + 11) - 0.5) * a * 0.6;
    var dy = (vnoise(x / 62, y / 62, seed + 5) - 0.5) * 2 * a + (vnoise(x / 21, y / 21, seed + 17) - 0.5) * a * 0.6;
    if (onCoast(x, y)) {
      dx += (vnoise(x / 34, y / 34, seed + 23) - 0.5) * 18;
      dy += (vnoise(x / 34, y / 34, seed + 29) - 0.5) * 18;
    }
    return [r2(x + dx), r2(y + dy)];
  }
  function edgePts(ax, ay, bx, by) {
    var horiz = Math.abs(ay - by) < EPS;
    var a = horiz ? ax : ay, b = horiz ? bx : by, lo = Math.min(a, b), hi = Math.max(a, b), fixed = horiz ? ay : ax;
    var ts = [];
    for (var v = Math.ceil((lo + EPS) / STEP) * STEP; v < hi - EPS; v += STEP) ts.push(v);
    verts.forEach(function (p) {
      var along = horiz ? p[0] : p[1], off = horiz ? p[1] : p[0];
      if (Math.abs(off - fixed) < EPS && along > lo + EPS && along < hi - EPS) ts.push(along);
    });
    ts.sort(function (m, n) { return a < b ? m - n : n - m; });
    var out = [[ax, ay]];
    ts.forEach(function (t, k) {
      if (k && Math.abs(t - ts[k - 1]) < EPS) return;
      out.push(horiz ? [t, ay] : [ax, t]);
    });
    return out;
  }
  function rawPoly(c) {
    var x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
    return [].concat(edgePts(x0, y0, x1, y0), edgePts(x1, y0, x1, y1), edgePts(x1, y1, x0, y1), edgePts(x0, y1, x0, y0));
  }
  function pathOf(raw) { return "M" + raw.map(function (p) { var d = disp(p[0], p[1]); return d[0] + "," + d[1]; }).join("L") + "Z"; }
  function center(c) { return disp(c.x + c.w / 2, c.y + c.h / 2); }
  // contested borders: the parts of an outline that are not coast
  function contestPath(raw) {
    var s = "", open = false;
    for (var i = 0; i < raw.length; i++) {
      var a = raw[i], b = raw[(i + 1) % raw.length];
      var coast = onCoast(a[0], a[1]) && onCoast(b[0], b[1]) && (Math.abs(a[0] - b[0]) < EPS ? Math.abs(a[0] - LR.x) < EPS || Math.abs(a[0] - LR.x - LR.w) < EPS : Math.abs(a[1] - LR.y) < EPS || Math.abs(a[1] - LR.y - LR.h) < EPS);
      if (coast) { open = false; continue; }
      var da = disp(a[0], a[1]), db = disp(b[0], b[1]);
      if (!open) s += "M" + da[0] + "," + da[1];
      s += "L" + db[0] + "," + db[1];
      open = true;
    }
    return s;
  }
  function blob(cx, cy, rx, ry, salt) {
    var pts = [], n = 18;
    for (var k = 0; k < n; k++) {
      var t = k / n * Math.PI * 2, j = 1 + (vnoise(Math.cos(t) * 1.6 + salt, Math.sin(t) * 1.6 + salt, seed + 41) - 0.5) * 0.5;
      pts.push([cx + Math.cos(t) * rx * j, cy + Math.sin(t) * ry * j]);
    }
    var mid = function (p, q) { return [r2((p[0] + q[0]) / 2), r2((p[1] + q[1]) / 2)]; };
    var m0 = mid(pts[n - 1], pts[0]), s = "M" + m0.join(",");
    for (var i = 0; i < n; i++) { var m = mid(pts[i], pts[(i + 1) % n]); s += "Q" + r2(pts[i][0]) + "," + r2(pts[i][1]) + " " + m.join(","); }
    return s + "Z";
  }

  function buildGeo() {
    var land = REG.filter(function (r) { return LAND_KINDS[r.kind]; });
    var sea = REG.filter(function (r) { return SEA_KINDS[r.kind]; });
    LR = { x: 70, y: 80, w: 860, h: sea.length ? 430 : 500 };
    if (land.length) {
      squarify(land.map(function (r) { return { w: r.weight }; }), LR).forEach(function (c, i) { land[i].rect = c; });
    }
    land.forEach(function (r) {
      var c = r.rect, area = r.places.filter(function (p) { return p.kind === "area"; }), pts = r.places.filter(function (p) { return p.kind === "point"; });
      var inner = { x: c.x, y: c.y, w: c.w, h: c.h };
      if (area.length) {
        var bh = r2(Math.min(30, c.h * 0.2));
        r.band = { x: c.x, y: c.y, w: c.w, h: bh };
        inner = { x: c.x, y: r2(c.y + bh), w: c.w, h: r2(c.h - bh) };
        if (pts.length) {
          var ph = r2(Math.min(34, inner.h * 0.24));
          r.ptBand = { x: c.x, y: r2(inner.y + inner.h - ph), w: c.w, h: ph };
          inner.h = r2(inner.h - ph);
        }
        squarify(area.map(function (p) { return { w: p.weight }; }), inner).forEach(function (pc, i) { area[i].rect = pc; });
      }
      r.inner = inner;
      pts.forEach(function (p, i) {
        if (r.ptBand) p.pt = [c.x + (i + 0.5) * c.w / pts.length - 30, r.ptBand.y + r.ptBand.h / 2];
        else p.pt = [c.x + (i + 0.5) * c.w / pts.length - 20, c.y + c.h * (i % 2 ? 0.72 : 0.4)];
        p.pt = disp(p.pt[0], p.pt[1]);
      });
    });
    // T-junctions: every cell corner, so shared borders get identical points
    verts = [];
    function addV(c) { if (c) verts.push([c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.h], [c.x + c.w, c.y + c.h]); }
    addV(LR);
    land.forEach(function (r) { addV(r.rect); addV(r.band); addV(r.ptBand); r.places.forEach(function (p) { addV(p.rect); }); });
    land.forEach(function (r) {
      r.raw = rawPoly(r.rect);
      r.path = r.shape || pathOf(r.raw);
      r.c = center(r.rect);
      r.labelAt = r.band ? center(r.band) : disp(r.rect.x + r.rect.w / 2, r.rect.y + Math.min(26, r.rect.h * 0.22));
      r.badgeAt = r.c;
      r.places.forEach(function (p) {
        if (p.rect) { p.path = pathOf(rawPoly(p.rect)); p.c = center(p.rect); }
        else p.c = p.pt;
      });
      var pad = 46, bx = r.rect.x - pad, by = r.rect.y - pad, bw = r.rect.w + pad * 2, bhh = r.rect.h + pad * 2;
      r.box = aspectBox(bx, by, bw, bhh);
    });
    LR.raw = rawPoly(LR);
    LR.path = pathOf(LR.raw);
    // sea features along the bottom
    var y0 = LR.y + LR.h, rowY = y0 + (H - y0) / 2 + 4;
    sea.forEach(function (r, i) {
      var cx = 120 + (i + 0.5) * 760 / sea.length, base = Math.min(56, 380 / sea.length);
      var rad = Math.max(18, Math.min(base, 14 + 14 * Math.sqrt(r.weight)));
      r.c = [r2(cx), r2(rowY - 6)];
      r.rad = rad;
      r.path = r.shape || (r.kind === "reef" ? blob(cx, rowY - 6, rad * 2.3, rad * 0.95, i * 3.7) : blob(cx, rowY - 10, rad * 1.25, rad * 0.62, i * 3.7));
      r.labelAt = r.kind === "reef" ? [cx, rowY - 4] : [cx, rowY + rad * 0.62 + 8];
      r.badgeAt = r.c;
      r.box = aspectBox(cx - 170, rowY - 110, 340, 200);
      r.places.forEach(function (p, k) { p.c = [r2(cx - rad + (k + 1) * 2 * rad / (r.places.length + 1)), r2(rowY - 6)]; });
    });
    REG.filter(function (r) { return r.kind === "flag"; }).forEach(function (r, i) {
      r.c = [38 + i * 190, 44];
      r.labelAt = [56 + i * 190, 40];
      r.badgeAt = [70 + i * 190, 92];
      r.box = aspectBox(r.c[0] - 60, 0, 360, 200);
      r.places.forEach(function (p) { p.c = r.c; });
    });
    REG.filter(function (r) { return r.kind === "route"; }).forEach(function (r) {
      var a = byId[attr(r.el, "data-from") || ""], b = byId[attr(r.el, "data-to") || ""];
      a = a && a.c ? a : land[0]; b = b && b.c ? b : land[land.length - 1];
      var A = a ? a.c : [200, 300], B = b ? b.c : [800, 300];
      if (A === B) B = [A[0] + 200, A[1]];
      // stop short of both centres, where their labels sit
      var A0 = A;
      A = [r2(A0[0] + (B[0] - A0[0]) * 0.22), r2(A0[1] + (B[1] - A0[1]) * 0.22)];
      B = [r2(B[0] - (B[0] - A0[0]) * 0.22), r2(B[1] - (B[1] - A0[1]) * 0.22)];
      var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L * 24, ny = dx / L * 24;
      r.path = r.shape || "M" + A.join(",") + "C" + r2(A[0] + dx / 3 + nx) + "," + r2(A[1] + dy / 3 + ny) + " " + r2(A[0] + 2 * dx / 3 - nx) + "," + r2(A[1] + 2 * dy / 3 - ny) + " " + B.join(",");
      r.c = [r2(A[0] + dx / 2), r2(A[1] + dy / 2)];
      r.labelAt = [r.c[0], r.c[1] - 9];
      r.badgeAt = [r.c[0] - 40, r.c[1] + 14];
      r.box = aspectBox(Math.min(A[0], B[0]) - 60, Math.min(A[1], B[1]) - 90, Math.abs(dx) + 120, Math.abs(dy) + 180);
      r.places.forEach(function (p) { p.c = r.c; });
    });
    REG.forEach(function (r) { if (!r.c) { r.c = [500, 320]; r.labelAt = r.c; r.badgeAt = r.c; r.box = [0, 0, W, H]; } });
  }
  function aspectBox(x, y, w, h) {
    var ar = w / h;
    if (ar < 1.2) { var nw = h * 1.2; x -= (nw - w) / 2; w = nw; }
    else if (ar > 2.1) { var nh = w / 2.1; y -= (nh - h) / 2; h = nh; }
    return [r2(x), r2(y), r2(w), r2(h)];
  }

  /* ================= map drawing ================= */
  function txt(x, y, s, cls, fs, extra) {
    return '<text x="' + r2(x) + '" y="' + r2(y) + '" class="' + cls + '" data-fs="' + fs + '" style="font-size:' + fs + 'px"' + (extra || "") + ">" + esc(s) + "</text>";
  }
  function tint(r) {
    var land = REG.filter(function (x) { return LAND_KINDS[x.kind]; });
    var t = num(attr(r.el, "data-tint"), 0) || (land.indexOf(r) % 6) + 1;
    return "--tint:var(--land-" + t + ")";
  }
  function fillAttr(r, pid) { return ' style="' + tint(r) + (r.kind === "disputed" ? ";fill:url(#hatch-" + pid + ")" : "") + '"'; }

  function placeArt(p, pid, labels) {
    var r = p.region, s = "";
    if (p.kind === "area" && p.path) {
      var i = r.places.indexOf(p);
      s += '<path d="' + p.path + '" class="land sub f' + (i % 3) + (r.kind === "disputed" ? " hatched" : "") + '"' + fillAttr(r, pid) + "/>";
      if (labels) {
        var c = p.c, wmax = p.rect.w - 10, y = c[1];
        if (p.num) { s += '<circle cx="' + c[0] + '" cy="' + r2(y - 14) + '" r="11" class="dnum"/>' + txt(c[0], y - 10, p.num, "dnumt", 12, ' text-anchor="middle"'); y += 8; }
        s += txt(c[0], y + 2, p.label, "plabel", p.rect.w > 160 ? 15 : 12, ' text-anchor="middle" data-maxw="' + r2(wmax) + '"');
        if (p.sub) s += txt(c[0], y + 17, p.sub, "psub minor", 10, ' text-anchor="middle" data-maxw="' + r2(wmax) + '"');
      }
    } else if (p.c) {
      s += '<circle cx="' + p.c[0] + '" cy="' + p.c[1] + '" r="14" class="hit-pt"/><circle cx="' + p.c[0] + '" cy="' + p.c[1] + '" r="5" class="well"/>';
      if (labels) s += txt(p.c[0] + 10, p.c[1] + 4, p.label, "plabel-sm", 11, ' data-maxw="' + r2(Math.max(80, (r.rect ? r.rect.w : 200) / Math.max(1, r.places.filter(function (q) { return q.kind === "point"; }).length) - 14)) + '"');
    }
    return s;
  }
  function regionLabel(r) {
    if (!LAND_KINDS[r.kind]) return "";
    var maxw = r.rect.w - 16;
    return txt(r.labelAt[0], r.labelAt[1] + 5, r.label.toUpperCase(), "rlabel", r.rect.w > 300 ? 15 : 12, ' text-anchor="middle" letter-spacing="3" data-maxw="' + r2(maxw) + '"');
  }
  function ridgeInner(r) {
    var fig = doc.getElementById(r.ridge || "");
    var script = fig && $('script[type="application/json"]', fig);
    if (!script || !r.rect) return "";
    var spec;
    try { spec = JSON.parse(script.textContent); } catch (e) { return ""; }
    var data = spec.bind ? R.value(spec.bind) || [] : spec.data || [];
    var xk = (spec.x || {}).key || "x";
    var want = (attr(r.el, "data-ridge-series") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var series = (spec.series || []).map(function (s, i) { return { s: s, i: i }; }).filter(function (o) { return !want.length || want.indexOf(o.s.key) >= 0; });
    if (!data.length || !series.length) return "";
    var box = r.inner || r.rect;
    var xs = data.map(function (d) { return +d[xk]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var ymax = (spec.y || {}).max || Math.max.apply(null, data.reduce(function (a, d) { return a.concat(series.map(function (o) { return +d[o.s.key] || 0; })); }, [0]));
    var X = function (v) { return r2(box.x + box.w * 0.1 + (v - x0) / (x1 - x0 || 1) * box.w * 0.8); };
    var Y = function (v) { return r2(box.y + box.h * 0.86 - Math.min(v, ymax * 1.05) / (ymax || 1) * box.h * 0.56); };
    var s = '<path d="M' + X(x0) + "," + Y(0) + "H" + X(x1) + '" class="ridge-base"/>';
    series.forEach(function (o) {
      s += '<path d="' + data.map(function (d, k) { return (k ? "L" : "M") + X(+d[xk]) + "," + Y(+d[o.s.key]); }).join("") + '" class="ridge-line" style="stroke:var(--s' + ((o.i % 6) + 1) + ')"/>';
      var atEnd = series.indexOf(o) % 2 === 0, pt = atEnd ? data[data.length - 1] : data[0];
      s += txt(X(+pt[xk]) + (atEnd ? -2 : 2), Y(+pt[o.s.key]) - 6, o.s.short || o.s.name, "ridge-label minor", 9.5, atEnd ? ' text-anchor="end"' : "");
    });
    var passTpl = attr(r.el, "data-ridge-pass");
    if (passTpl && series.length >= 2) {
      var a = series[0].s.key, b = series[1].s.key;
      for (var k = 1; k < data.length; k++) {
        var d0 = data[k - 1][a] - data[k - 1][b], d1 = data[k][a] - data[k][b];
        if (d0 === 0 || d0 * d1 < 0) {
          var t = d0 === 0 ? 0 : d0 / (d0 - d1), xv = +data[k - 1][xk] + t * (data[k][xk] - data[k - 1][xk]), yv = +data[k - 1][a] + t * (data[k][a] - data[k - 1][a]);
          var px = X(xv), py = Y(yv);
          s += '<path d="M' + r2(px - 7) + "," + r2(py + 5) + "L" + px + "," + r2(py - 7) + "L" + r2(px + 7) + "," + r2(py + 5) + 'Z" class="passmark"/>';
          var passTxt = passTpl.replace(/\{([\w.]+)\}/g, function (m, k) { return k === "x" ? R.fmt(xv, (spec.x || {}).format || "int") : R.fmt(R.value(k), "int"); });
          s += txt(px, py + 20, passTxt, "plabel-sm", 11, ' text-anchor="middle"');
          break;
        }
      }
    }
    return s;
  }
  function regionArt(r, pid, o) {
    var s = "", labels = o.labels;
    if (LAND_KINDS[r.kind]) {
      s += '<path d="' + r.path + '" class="land region' + (r.kind === "disputed" ? " hatched" : "") + '"' + fillAttr(r, pid) + "/>";
      if (o.places) r.places.forEach(function (p) { if (p.kind === "area") s += placeArt(p, pid, labels && o.placeLabels); });
      if (r.ridge) s += '<g class="ridge" data-ridge-for="' + esc(r.id) + '">' + (labels ? ridgeInner(r) : ridgeInner(r).replace(/<text[\s\S]*?<\/text>/g, "")) + "</g>";
      if (o.places && r.places.some(function (p) { return p.kind === "area"; })) s += '<path d="' + r.path + '" class="outline"/>';
      if (o.places) r.places.forEach(function (p) { if (p.kind === "point") s += placeArt(p, pid, labels && o.placeLabels); });
      if (labels) s += regionLabel(r);
    } else if (r.kind === "island") {
      s += '<path d="' + r.path + '" class="land island"/>';
      if (labels) {
        s += txt(r.labelAt[0], r.labelAt[1] + 4, r.label, "plabel-sm", 11.5, ' text-anchor="middle" data-maxw="' + r2(Math.max(110, 700 / REG.length)) + '"');
        if (r.sub) s += txt(r.labelAt[0], r.labelAt[1] + 17, r.sub, "psub minor", 9.5, ' text-anchor="middle" data-maxw="150"');
      }
    } else if (r.kind === "reef") {
      s += '<path d="' + r.path + '" class="reef"/>';
      var c = r.c, rad = r.rad;
      [[-1.8, -0.1], [-1.2, 0.55], [1.2, -0.5], [1.8, 0.35]].forEach(function (q) {
        var x = r2(c[0] + q[0] * rad), y = r2(c[1] + q[1] * rad * 0.7);
        s += '<path d="M' + x + "," + r2(y - 7) + "l7,12h-14Z" + '" class="haz"/>';
      });
      if (labels) {
        s += txt(c[0], c[1] + 4, r.label.toUpperCase(), "plabel", 13, ' text-anchor="middle" letter-spacing="3" data-maxw="' + r2(rad * 3.4) + '"');
        if (r.sub) s += txt(c[0], c[1] + 19, r.sub, "psub minor", 10, ' text-anchor="middle" font-style="italic" data-maxw="' + r2(rad * 3.4) + '"');
      }
    } else if (r.kind === "route") {
      s += '<path d="' + r.path + '" class="route-hit"/><path d="' + r.path + '" class="route"/>';
      if (labels) s += txt(r.labelAt[0], r.labelAt[1], r.label.toUpperCase(), "tlabel", 10, ' text-anchor="middle" letter-spacing="2" data-maxw="220"');
    } else if (r.kind === "flag") {
      var x = r.c[0], y = r.c[1], tgt = byId[attr(r.el, "data-to") || ""];
      if (tgt && tgt.c) s += '<path d="M' + (x + 6) + "," + (y + 6) + "Q" + r2(x + 10) + "," + r2((y + tgt.c[1]) / 2) + " " + tgt.c.join(",") + '" class="trail"/>';
      s += '<circle cx="' + x + '" cy="' + y + '" r="16" class="hit-pt"/><path d="M' + (x - 6) + "," + (y + 8) + "V" + (y - 14) + "L" + (x + 8) + "," + (y - 9) + "L" + (x - 6) + "," + (y - 4) + '" class="flagmark"/>';
      if (labels) {
        s += txt(r.labelAt[0], r.labelAt[1], r.label, "plabel-sm", 12, ' data-maxw="230"');
        if (r.sub) s += txt(r.labelAt[0], r.labelAt[1] + 13, r.sub, "psub minor", 9.5, ' font-style="italic" data-maxw="230"');
      }
    }
    return s;
  }
  var DRAW_ORDER = { land: 0, disputed: 0, island: 1, reef: 1, flag: 2, route: 3 };
  function mapSVG(mode, focus) {
    var pid = "m" + (++svgCount);
    var vb = mode === "plate" ? focus.box : [0, 0, W, H];
    var label = mode === "plate" ? "Regional map: " + focus.name : mode === "inset" ? "Locator map" : "World map of the report";
    var s = '<svg class="map map-' + mode + '" viewBox="' + vb.join(" ") + '" data-base="' + vb.join(" ") + '" role="' + (mode === "inset" ? "img" : "group") + '" aria-label="' + esc(label) + '">' +
      '<defs><pattern id="sea-' + pid + '" width="40" height="18" patternUnits="userSpaceOnUse"><path d="M0,9 q5,-4 10,0 t10,0" class="wave"/></pattern>' +
      '<pattern id="hatch-' + pid + '" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="10" class="hatchbg"/><line x1="0" y1="0" x2="0" y2="10" class="hatchline"/></pattern></defs>' +
      '<rect x="-400" y="-400" width="1800" height="1440" class="sea"/><rect x="-400" y="-400" width="1800" height="1440" fill="url(#sea-' + pid + ')"/>';
    if (REG.some(function (r) { return LAND_KINDS[r.kind]; })) s += '<path d="' + LR.path + '" class="coast-halo"/><path d="' + LR.path + '" class="coast"/>';
    if (mode !== "inset") {
      for (var i = 0; i < 10; i++) s += txt(50 + i * 100, 13, COLS[i], "gridref", 9, ' text-anchor="middle"');
      for (i = 0; i < 6; i++) s += txt(8, 56 + i * H / 6, String(i + 1), "gridref", 9, ' text-anchor="middle"');
      for (i = 1; i < 10; i++) s += '<line x1="' + i * 100 + '" y1="0" x2="' + i * 100 + '" y2="18" class="gridtick"/>';
    }
    REG.slice().sort(function (a, b) { return DRAW_ORDER[a.kind] - DRAW_ORDER[b.kind]; }).forEach(function (r) {
      if (mode === "inset") { s += '<g class="u" data-id="' + esc(r.id) + '">' + regionArt(r, pid, { places: true, labels: false }) + "</g>"; return; }
      if (mode === "plate" && r === focus) {
        s += '<g class="base">' + regionArt(r, pid, { places: false, labels: true }) + "</g>";
        r.places.forEach(function (p) {
          s += '<a class="u place" data-id="' + esc(p.id) + '" href="#' + esc(p.id) + '" aria-label="' + esc(p.name) + '">' + placeArt(p, pid, true) + "</a>";
        });
        return;
      }
      var dim = mode === "plate";
      s += '<a class="u' + (dim ? " dim" : "") + '" data-id="' + esc(r.id) + '" href="#' + esc(r.id) + '" aria-label="' + esc(r.name + (dim ? " (neighbouring plate)" : "")) + '">' +
        regionArt(r, pid, { places: true, labels: true, placeLabels: mode === "world" }) + "</a>";
    });
    REG.filter(function (r) { return r.kind === "disputed"; }).forEach(function (r) { s += '<path d="' + contestPath(r.raw) + '" class="contest" aria-hidden="true"/>'; });
    if (mode === "world") {
      s += '<g class="badges" aria-hidden="true">' + REG.map(function (r) {
        var b = r.badgeAt;
        return '<g class="badge"><circle cx="' + b[0] + '" cy="' + b[1] + '" r="26"/><text x="' + b[0] + '" y="' + r2(b[1] + 8) + '" text-anchor="middle">' + roman(r.n) + "</text></g>";
      }).join("") + "</g>";
    }
    if (mode === "inset") s += '<g class="here" style="display:none"><circle r="26" class="here-ring"/><circle r="11" class="here-dot"/></g>';
    return s + "</svg>";
  }

  // labels stay ≥ 10.5px on screen; long ones shrink, then truncate (the full name stays in aria-label)
  function fitMap(svg) {
    if (!svg || !svg.isConnected) return;
    var vb = svg.viewBox.baseVal, rect = svg.getBoundingClientRect();
    if (!rect.width || !vb.width) return;
    var sc = Math.min(rect.width / vb.width, rect.height / vb.height);
    var isWorld = svg.classList.contains("map-world");
    svg.classList.toggle("compact", isWorld && sc < 0.62);     // world: numbered badges
    svg.classList.toggle("small", !isWorld && sc < 0.62);      // plate: drop the sub-labels only
    $$("text[data-fs]", svg).forEach(function (t) { t.style.fontSize = Math.max(+t.getAttribute("data-fs"), 10.5 / sc) + "px"; });
    $$("text[data-maxw]", svg).forEach(function (t) {
      if (!t._full) t._full = t.textContent;
      t.textContent = t._full;
      if (t.getClientRects().length === 0) return;
      var maxw = +t.getAttribute("data-maxw"), len = t.getComputedTextLength();
      if (!len || len <= maxw) return;
      var fs = parseFloat(t.style.fontSize);
      t.style.fontSize = Math.max(10.5 / sc, fs * maxw / len) + "px";
      var s = t._full;
      len = t.getComputedTextLength();
      while (len > maxw && s.length > 2) { s = s.slice(0, -1); t.textContent = s.replace(/[\s·,.:-]+$/, "") + "…"; len = t.getComputedTextLength(); }
    });
    if (svg.classList.contains("map-world")) sizeScale(sc);
  }
  function sizeScale(sc) {
    $$(".lg-scale i[data-region]").forEach(function (i) {
      var r = byId[i.getAttribute("data-region")];
      if (!r || !r.unitArea) return;
      var side = Math.sqrt(r.unitArea) * sc;
      i.style.width = i.style.height = Math.max(4, side).toFixed(1) + "px";
    });
  }

  /* hover / tap / Tab preview */
  function info(id) {
    var o = byId[id];
    if (!o) return null;
    if (o.type === "place") return { name: o.name, sub: "Place in " + o.region.name + " · grid " + grid(o.c), l0: o.l0, href: "#" + o.id, cta: "Open " + o.name + " →" };
    return { name: o.name, sub: "Plate " + roman(o.n) + " · grid " + grid(o.c), l0: o.l0, href: "#" + o.id, cta: "Open plate " + roman(o.n) + ": " + o.name + " →" };
  }
  function bindMap(box) {
    var svg = $("svg", box), prev = $(".preview", box), lastType = "mouse", shown = null, downAt = 0;
    function show(id, unit, at) {
      var i = info(id);
      if (!i) return;
      shown = id;
      prev.innerHTML = '<button type="button" class="pv-close" aria-label="Close preview"><svg class="ico" aria-hidden="true"><use href="#atl-close"/></svg></button>' +
        '<p class="pv-sub">' + esc(i.sub) + '</p><p class="pv-name">' + esc(i.name) + "</p>" + (i.l0 ? '<p class="pv-l0">' + esc(i.l0) + "</p>" : "") + '<a class="pv-go" href="' + esc(i.href) + '">' + esc(i.cta) + "</a>";
      $(".pv-close", prev).addEventListener("click", function () { var u = $(".u.hot", svg); hide(); if (u) u.focus({ preventScroll: true }); });
      prev.hidden = false;
      $$(".u", svg).forEach(function (u) { u.classList.toggle("hot", u.getAttribute("data-id") === id); });
      if (box.clientWidth > 700 && unit) {
        var r = unit.getBoundingClientRect(), b = box.getBoundingClientRect(), ph = prev.offsetHeight || 150, pw = prev.offsetWidth || 280;
        var left, top;
        if (at) {          // mouse: beside the pointer, never under it
          left = at[0] - b.left + 18; top = at[1] - b.top + 18;
          if (left + pw > b.width - 8) left = at[0] - b.left - pw - 18;
          if (top + ph > b.height - 8) top = at[1] - b.top - ph - 18;
        } else {           // keyboard: below or above the territory, else beside it
          left = r.left - b.left + r.width / 2 - pw / 2; top = r.bottom - b.top + 8;
          if (top + ph > b.height) top = r.top - b.top - ph - 8;
          if (top < 8) {
            top = r.top - b.top + r.height / 2 - ph / 2;
            left = r.right - b.left + 10;
            if (left + pw > b.width - 8) left = r.left - b.left - pw - 10;
          }
        }
        prev.style.left = Math.max(8, Math.min(b.width - pw - 8, left)) + "px";
        prev.style.top = Math.max(8, Math.min(b.height - ph - 8, top)) + "px";
      } else { prev.style.left = ""; prev.style.top = ""; }
    }
    function hide() { prev.hidden = true; shown = null; $$(".u.hot", svg).forEach(function (u) { u.classList.remove("hot"); }); }
    box._hide = hide;
    box.addEventListener("focusout", function (e) { if (!box.contains(e.relatedTarget) && !box.matches(":hover") && innerWidth > 720) hide(); });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !prev.hidden) { e.stopPropagation(); var u = $(".u.hot", svg); hide(); if (u) u.focus({ preventScroll: true }); }
    });
    $$(".u", svg).forEach(function (u) {
      if (!u.hasAttribute("href")) return;
      var id = u.getAttribute("data-id");
      u.addEventListener("pointerdown", function (e) { lastType = e.pointerType; downAt = Date.now(); });
      u.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") show(id, u, [e.clientX, e.clientY]); });
      u.addEventListener("focus", function () { if (Date.now() - downAt > 600) show(id, u); });
      u.addEventListener("click", function (e) {
        e.preventDefault();
        if (lastType !== "mouse" && shown !== id) show(id, u);
        else { hide(); go("#" + id, true); }
        lastType = "mouse";
      });
    });
    box.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hide(); });
  }
  function mapBox(host, mode, focus) {
    var box = el("div", { class: "mapbox mapbox-" + mode });
    box.innerHTML = mapSVG(mode, focus) + '<div class="preview" hidden role="status"></div>';
    host.insertBefore(box, $(":scope > figcaption, :scope > .mapcap", host));
    bindMap(box);
    R.observeResize(box, function () { fitMap($("svg", box)); });
    return box;
  }

  /* ================= chrome ================= */
  var SPRITE = '<svg class="atl-sprite" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    '<symbol id="atl-S" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.1" fill="currentColor"/></symbol>' +
    '<symbol id="atl-E" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.1 1.55"/></symbol>' +
    '<symbol id="atl-A" viewBox="0 0 12 12"><path d="M6 1.7 10.6 10.1H1.4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></symbol>' +
    '<symbol id="atl-I" viewBox="0 0 12 12"><path d="M1.9 10.1 2.8 7.1 8.3 1.6 10.4 3.7 4.9 9.2ZM2.8 7.1 4.9 9.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></symbol>' +
    '<symbol id="atl-mark" viewBox="0 0 12 12"><path d="M6 .4 7.15 4.85 11.6 6 7.15 7.15 6 11.6 4.85 7.15.4 6 4.85 4.85Z" fill="currentColor"/></symbol>' +
    '<symbol id="atl-locate" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="6" r="1.7" fill="currentColor"/></symbol>' +
    '<symbol id="atl-flag" viewBox="0 0 12 12"><path d="M3 11.2V1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M3.6 1.8 10 3.9 3.6 6Z" fill="currentColor"/></symbol>' +
    '<symbol id="atl-hazard" viewBox="0 0 12 12"><path d="M6 1.4 11 10.4H1Z" style="fill:var(--hazard)" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/><path d="M6 4.9v2.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6" cy="9" r=".7" fill="currentColor"/></symbol>' +
    '<symbol id="atl-close" viewBox="0 0 12 12"><path d="M3 3 9 9M9 3 3 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></symbol>' +
    "</defs></svg>";
  function symSVG(letter, cls) { return '<svg class="sym sym-' + letter + (cls ? " " + cls : "") + '" aria-hidden="true" focusable="false"><use href="#atl-' + letter + '"/></svg>'; }
  function flagSVG() { return '<svg class="ico flag" aria-hidden="true" focusable="false"><use href="#atl-flag"/></svg><span class="sr-only"> (charted)</span>'; }

  var top, crumbsEl, legendEl, insetEl, worldMapHost, platesHost;
  function buildChrome() {
    doc.body.insertAdjacentHTML("afterbegin", SPRITE);
    top = $(".atlas-top");
    if (!top) { top = el("header", { class: "atlas-top" }); doc.body.insertBefore(top, main); }
    var row = $(".top-row", top);
    if (!row) {
      row = el("div", { class: "top-row" });
      while (top.firstChild) row.appendChild(top.firstChild);
      top.appendChild(row);
    }
    var brand = $(".brand", top);
    if (brand && !$(".brand-mark", brand)) brand.insertAdjacentHTML("afterbegin", '<svg class="brand-mark" aria-hidden="true"><use href="#atl-mark"/></svg> ');
    var tools = el("nav", { class: "atlas-tools", "aria-label": "Atlas tools" });
    tools.innerHTML = '<a data-v="index" href="#index">Index</a><button type="button" class="legend-btn" aria-expanded="false" aria-controls="atlas-legend">Legend</button>' + (sourcesPage ? '<a data-v="sources" href="#sources">Sources</a>' : "");
    row.appendChild(tools);
    var cn = el("nav", { class: "crumbs-nav", "aria-label": "You are here" });
    crumbsEl = el("ol", { class: "crumbs" });
    cn.appendChild(crumbsEl);
    top.appendChild(cn);

    // plate heads, plate maps, place lists, neighbour and sibling navigation
    REG.concat(PL).forEach(function (o) {
      var n = o.el, head = el("header", { class: "plate-head" });
      if (o.h) { o.h.parentNode.insertBefore(head, o.h); head.appendChild(o.h); o.h.setAttribute("tabindex", "-1"); o.h.classList.add("plate-title"); }
      else { n.insertBefore(head, n.firstChild); head.appendChild(el("h2", { class: "plate-title", tabindex: "-1" }, o.name)); o.h = $("h2", head); }
      if (o.type === "place" && o.num) o.h.insertAdjacentHTML("afterbegin", '<span class="dn big" aria-hidden="true">' + esc(o.num) + "</span> ");
      head.appendChild(el("p", { class: "plate-no" }, "Plate " + roman((o.region || o).n) + " · " + grid(o.c)));
      var l0p = $$(":scope > .l0", n)[0];
      if (l0p) { l0p.classList.add("plate-sub"); head.appendChild(l0p); }
      else if (o.l0) head.appendChild(el("p", { class: "plate-sub" }, o.l0));
    });
    REG.forEach(function (r) {
      var n = r.el, host = $$("[data-map]", n)[0];
      var want = host ? attr(host, "data-map") !== "none" : (attr(n, "data-map") !== "none" && (r.places.length > 0 || attr(n, "data-map") === "show") && LAND_KINDS[r.kind]);
      if (want && !host) {
        host = el("div", { class: "plate-map", "data-map": "" });
        var lead = $(":scope > .lead", n);
        if (lead) {
          var split = el("div", { class: "split" });
          n.insertBefore(split, lead);
          split.appendChild(host);
          split.appendChild(lead);
        } else {
          var head = $(":scope > .plate-head", n);
          n.insertBefore(host, head ? head.nextSibling : n.firstChild);
        }
      }
      if (want) { r.mapHost = host; host.classList.add("plate-map"); }
      if (r.places.length) {
        var sec = el("section", { class: "places", "aria-label": "Places in " + r.name });
        sec.innerHTML = "<h2>Places in this region</h2>";
        var ol = el("ol", { class: "placelist" });
        r.places.forEach(function (p) {
          ol.insertAdjacentHTML("beforeend", '<li><a href="#' + esc(p.id) + '"><span class="pl-name">' + (p.num ? '<b class="dn">' + esc(p.num) + "</b>" : "") + esc(p.name) + "</span>" +
            (p.l0 ? '<span class="pl-l0">' + esc(p.l0) + "</span>" : "") + '<span class="pl-grid">' + grid(p.c) + "</span></a></li>");
        });
        sec.appendChild(ol);
        n.appendChild(sec);
      }
      r.neigh = el("nav", { class: "neigh", "aria-label": "Other plates" });
      n.appendChild(r.neigh);
      // area scale for regions whose place areas mean something
      if (r.unit && r.rect && r.places.length) {
        var tot = 0, wsum = 0;
        r.places.forEach(function (p) { if (p.rect) { tot += p.rect.w * p.rect.h; wsum += p.weight; } });
        if (wsum) r.unitArea = tot / wsum;
      }
    });
    PL.forEach(function (p) {
      var sib = p.region.places, i = sib.indexOf(p);
      var nav = el("nav", { class: "sibnav", "aria-label": "Neighbouring places" });
      nav.innerHTML = (i > 0 ? '<a href="#' + esc(sib[i - 1].id) + '">← ' + esc(sib[i - 1].name) + "</a>" : "<span></span>") +
        '<a class="up" href="#' + esc(p.region.id) + '">↑ Up to ' + esc(p.region.name) + "</a>" +
        (i < sib.length - 1 ? '<a href="#' + esc(sib[i + 1].id) + '">' + esc(sib[i + 1].name) + " →</a>" : "<span></span>");
      p.el.appendChild(nav);
    });

    // world page: map and plate list
    worldMapHost = $("[data-map]", world);
    if (!worldMapHost) {
      worldMapHost = el("div", { "data-map": "" });
      var cart = $(".cartouche", world);
      world.insertBefore(worldMapHost, cart ? cart.nextSibling : world.firstChild);
    }
    worldMapHost.classList.add("world-map");
    if (!$(":scope > figcaption, :scope > .mapcap", worldMapHost)) {
      worldMapHost.appendChild(el("p", { class: "mapcap" }, attr(worldMapHost, "data-caption") ||
        "Point at, tap or Tab to a territory to preview it; click, tap again or press Enter to open its plate." + (REG.some(function (r) { return r.unit; }) ? " Places with a scale are drawn to it; see the legend." : "")));
    }
    platesHost = $("[data-plates]", world);
    if (!platesHost) { platesHost = el("section", { class: "plates", "data-plates": "" }); world.appendChild(platesHost); }
    platesHost.classList.add("plates");

    // gazetteer
    var rows = [];
    REG.forEach(function (r) { rows.push({ name: r.name, kind: "Region", plate: roman(r.n), g: grid(r.c), href: "#" + r.id, l0: r.l0 }); });
    PL.forEach(function (p) { rows.push({ name: p.name, kind: "Place", plate: roman(p.region.n), g: grid(p.c), href: "#" + p.id, l0: p.l0 }); });
    if (sourcesPage) rows.push({ name: "Sources", kind: "Appendix", plate: "—", g: "—", href: "#sources", l0: "The survey records: all " + $$(".sources > li").length + " numbered sources." });
    rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    indexPage.innerHTML = '<header class="plate-head"><h2 class="plate-title" id="atlas-index-h" tabindex="-1">Atlas index</h2><p class="plate-no">Gazetteer</p>' +
      '<p class="plate-sub">Every region and place, alphabetical, with plate and grid reference.</p></header>' +
      '<div class="table-wrap"><table class="compare gaz"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Plate</th><th scope="col">Grid</th><th scope="col" class="gz-l0">What you find there</th></tr></thead><tbody>' +
      rows.map(function (x) { return '<tr><th scope="row"><a href="' + esc(x.href) + '">' + esc(x.name) + "</a></th><td>" + x.kind + "</td><td>" + x.plate + "</td><td>" + x.g + '</td><td class="gz-l0">' + esc(x.l0 || "") + "</td></tr>"; }).join("") +
      "</tbody></table></div>";
    if (sourcesPage && !$(".plate-head", sourcesPage)) {
      var sh = $(":scope > h2, :scope > h1", sourcesPage);
      var shead = el("header", { class: "plate-head" });
      if (sh) { sourcesPage.insertBefore(shead, sh); shead.appendChild(sh); sh.classList.add("plate-title"); sh.setAttribute("tabindex", "-1"); }
      else { sourcesPage.insertBefore(shead, sourcesPage.firstChild); shead.appendChild(el("h2", { class: "plate-title", tabindex: "-1" }, "Sources")); }
      shead.appendChild(el("p", { class: "plate-no" }, "Appendix"));
    }

    // legend panel
    legendEl = el("aside", { id: "atlas-legend", class: "atlas-legend", hidden: "", "aria-label": "Map legend" });
    var lg = '<div class="legend-head"><h2 tabindex="-1">Legend</h2><button type="button" class="legend-close" aria-label="Close legend"><svg class="ico" aria-hidden="true"><use href="#atl-close"/></svg></button></div>' +
      '<h3>Evidence symbols</h3><ul class="lg-ev">' + ["S", "E", "A", "I"].map(function (k) {
        return "<li>" + symSVG(k) + "<b>" + SYM_NAME[k].charAt(0).toUpperCase() + SYM_NAME[k].slice(1) + "</b>: " + SYM_LONG[k] + "</li>";
      }).join("") + '</ul><h3>Map conventions</h3><ul class="lg-map">';
    REG.filter(function (r) { return LAND_KINDS[r.kind]; }).forEach(function (r) {
      lg += '<li><span class="sw-land' + (r.kind === "disputed" ? " disputed" : "") + '" style="' + tint(r) + '"></span>' + esc(r.name) + (r.kind === "disputed" ? '; <span class="sw-line contest"></span> contested border' : "") + "</li>";
    });
    if (REG.some(function (r) { return r.kind === "island"; })) lg += '<li><span class="sw-land island"></span>Islands: tools and side plates</li>';
    if (REG.some(function (r) { return r.kind === "reef"; })) lg += '<li><svg class="ico hz" aria-hidden="true"><use href="#atl-hazard"/></svg> Reefs: hazards and risks</li>';
    if (REG.some(function (r) { return r.kind === "route"; })) lg += '<li><span class="sw-line route"></span> Routes: comparisons between regions</li>';
    if (REG.some(function (r) { return r.kind === "flag"; })) lg += '<li><svg class="ico flag" aria-hidden="true"><use href="#atl-flag"/></svg> Flag: where the expedition lands (the recommendation)</li>';
    REG.filter(function (r) { return r.ridge; }).forEach(function (r) { lg += '<li><span class="sw-line ridge"></span> Ridges in ' + esc(r.name) + ": the curves of its chart, live</li>"; });
    REG.filter(function (r) { return r.unitArea; }).forEach(function (r) {
      lg += '<li class="lg-scale"><i data-region="' + esc(r.id) + '" aria-hidden="true"></i><span><b>Area scale (' + esc(r.name) + " only):</b> this square = 1 " + esc(r.unit) + " at the current map size.</span></li>";
    });
    lg += "<li>" + esc(attr(world, "data-weight-means") || "Territory size shows each region's weight in the report.") + "</li>";
    lg += "<li>Grid letters A–J and rows 1–6 locate places; see the Atlas index.</li></ul>";
    legendEl.innerHTML = lg;
    doc.body.appendChild(legendEl);

    // locator inset
    insetEl = el("aside", { class: "atlas-inset", "aria-label": "Locator map" });
    insetEl.innerHTML = '<button class="inset-chip" type="button" aria-expanded="false" aria-controls="atlas-inset-panel"><svg class="ico" aria-hidden="true"><use href="#atl-locate"/></svg> <span class="inset-chip-label">World</span></button>' +
      '<div class="inset-panel" id="atlas-inset-panel"><a href="#world" class="inset-map" aria-label="Locator map: go to the world map"></a><p class="inset-cap"><b>You are here:</b> <span class="inset-label">World</span> · <span class="inset-grid"></span></p></div>';
    doc.body.appendChild(insetEl);
  }

  /* ================= evidence: cartographic symbols ================= */
  function decorateEvidence() {
    $$(".ev[data-ev]").forEach(function (n) {
      if (n._atl) return;
      n._atl = true;
      var kinds = (n.getAttribute("data-ev") || "").split(" ").filter(function (k) { return SYM[k]; });
      if (!kinds.length) return;
      var btn = $(":scope > .ev-note-btn", n);
      var letters = kinds.map(function (k) { return SYM[k]; });
      var sr = el("span", { class: "sr-only" }, " (" + kinds.map(function (k) { return R.EV[k].name.toLowerCase(); }).join(", ") + ")");
      var block = getComputedStyle(n).display !== "inline";
      if (block) {
        n.classList.add("ev-block");
        var flag = el("span", { class: "ev-flag" });
        flag.innerHTML = letters.map(function (l) { return symSVG(l); }).join("");
        flag.appendChild(sr);
        n.insertBefore(flag, n.firstChild);
        if (btn) { btn.innerHTML = symSVG("E"); btn.classList.add("ev-ring"); }
        return;
      }
      var holder = el("span", { class: "syms" });
      holder.innerHTML = letters.filter(function (l) { return !(l === "E" && btn); }).map(function (l) { return symSVG(l); }).join("");
      holder.appendChild(sr);
      if (btn) {
        btn.innerHTML = symSVG("E");
        btn.classList.add("ev-ring");
        n.insertBefore(holder, btn);
        holder.appendChild(btn);
      } else n.appendChild(holder);
      // keep the last word and its symbol on one line
      var prev = holder.previousSibling;
      if (prev && prev.nodeType === 3) {
        var t = prev.textContent, i = t.search(/\S+\s*$/);
        if (i >= 0) {
          var nw = el("span", { class: "nw" });
          nw.appendChild(doc.createTextNode(t.slice(i)));
          prev.textContent = t.slice(0, i);
          n.insertBefore(nw, holder);
          nw.appendChild(holder);
        }
      } else if (prev && prev.nodeType === 1 && prev.textContent.length < 28) {
        var nw2 = el("span", { class: "nw" });
        n.insertBefore(nw2, prev);
        nw2.appendChild(prev);
        nw2.appendChild(holder);
      }
    });
    $$(".ev-key").forEach(function (k) {
      var kind = k.getAttribute("data-ev"), l = SYM[kind];
      var mark = $(".ev-key-mark", k), name = $(".ev-key-name", k);
      if (mark && l) mark.innerHTML = symSVG(l);
      if (name && l) name.textContent = SYM_NAME[l];
    });
    $$(".cartouche [data-ev-legend]").forEach(function (lgd) {
      if (lgd.nextElementSibling && lgd.nextElementSibling.matches(".legend-open")) return;
      lgd.insertAdjacentHTML("afterend", ' <button type="button" class="linkbtn legend-open">Full legend</button>');
    });
  }

  /* ================= router ================= */
  function resolve(href) {
    var id = String(href || "").replace(/^#\/?/, "");
    try { id = decodeURIComponent(id); } catch (e) { /* keep raw */ }
    if (id === "main") return null;
    if (!id || id === "world" || id === "top") return { page: world };
    var t = doc.getElementById(id);
    if (!t) return { page: world, notice: "There is no “" + id + "” in this atlas. You are on the world map; every plate is listed below it." };
    if (t.classList.contains("atlas-page")) return { page: t };
    var page = t.closest(".atlas-page");
    if (!page) return main.contains(t) ? { page: world, target: t } : null;
    return { page: page, target: t };
  }
  function saveY() { try { history.replaceState(Object.assign({}, history.state, { y: Math.round(scrollY) }), ""); } catch (e) { /* storage blocked */ } }
  function go(href, push) {
    var r = resolve(href);
    if (!r) return false;
    if (push) {
      saveY();
      var h = href.charAt(0) === "#" ? href : "#" + href;
      try { history.pushState({ y: 0 }, "", h); } catch (e) { location.hash = h; return true; }
    }
    show(r, { y: 0, focus: push && !r.target });
    return true;
  }

  var seen = [];
  var storeKey = "atlas-charted:" + location.pathname;
  try { seen = JSON.parse(sessionStorage.getItem(storeKey) || "[]"); } catch (e) { seen = []; }
  function chart(id) {
    if (!id || seen.indexOf(id) >= 0) return;
    seen.push(id);
    try { sessionStorage.setItem(storeKey, JSON.stringify(seen)); } catch (e) { /* private mode */ }
  }

  function refreshLists() {
    platesHost.innerHTML = "<h2>Plates in this atlas" + (seen.length ? ' <span class="charted">Charted ' + Math.min(seen.length, REG.length) + " of " + REG.length + "</span>" : "") + "</h2>" +
      '<ol class="platelist">' + REG.map(function (r) {
        return '<li><a href="#' + esc(r.id) + '"><b>' + roman(r.n) + "</b><span>" + esc(r.name) + (seen.indexOf(r.id) >= 0 ? " " + flagSVG() : "") + "</span>" +
          (r.l0 ? "<small>" + esc(r.l0) + "</small>" : "") + "<i>" + grid(r.c) + "</i></a></li>";
      }).join("") + "</ol>";
    REG.forEach(function (r) {
      r.neigh.innerHTML = "<span>Other plates:</span>" + REG.filter(function (x) { return x !== r; }).map(function (x) {
        return '<a href="#' + esc(x.id) + '">' + roman(x.n) + " " + esc(x.name) + (seen.indexOf(x.id) >= 0 ? " " + flagSVG() : "") + "</a>";
      }).join("");
    });
    $$("[data-uncharted]").forEach(function (n) {
      var left = REG.filter(function (r) { return seen.indexOf(r.id) < 0; });
      n.classList.add("uncharted");
      n.innerHTML = left.length ? "Still uncharted: " + left.map(function (r) { return '<a href="#' + esc(r.id) + '">' + esc(r.name) + "</a>"; }).join(", ") + "." : flagSVG().replace(/<span[\s\S]*<\/span>/, "") + " Every plate charted.";
    });
  }

  function show(r, opts) {
    opts = opts || {};
    var page = r.page, prevPage = state.page, o = byEl.get(page) || null;
    var region = o ? (o.type === "place" ? o.region : o) : null, place = o && o.type === "place" ? o : null;
    pages.forEach(function (p) { p.hidden = p !== page; });
    state.page = page;
    if (region) chart(region.id);
    refreshLists();
    var old = $(".atlas-notice", main);
    if (old) old.remove();
    if (r.notice) main.insertBefore(el("p", { class: "atlas-notice", role: "status" }, r.notice), main.firstChild);
    // breadcrumbs
    var bc = [["World", "#world"]];
    if (region) bc.push([region.name, "#" + region.id]);
    if (place) bc.push([place.name, "#" + place.id]);
    if (page === indexPage) bc.push(["Atlas index", "#index"]);
    if (page === sourcesPage) bc.push(["Sources", "#sources"]);
    crumbsEl.innerHTML = bc.map(function (b, i) {
      return i === bc.length - 1 ? '<li><span aria-current="page">' + esc(b[0]) + "</span></li>" : '<li><a href="' + b[1] + '">' + esc(b[0]) + "</a></li>";
    }).join("");
    $$(".atlas-tools a", top).forEach(function (a) {
      var v = a.getAttribute("data-v");
      a.toggleAttribute("aria-current", (v === "index" && page === indexPage) || (v === "sources" && page === sourcesPage));
    });
    var brand = $(".brand", top);
    var base = (brand && brand.textContent.trim()) || "Atlas";
    doc.title = (place ? place.name + " — " : region ? region.name + " — " : page === indexPage ? "Index — " : page === sourcesPage ? "Sources — " : "") + (state.baseTitle || (state.baseTitle = doc.title || base));
    updateInset(region, place, page);
    if (state.booted && prevPage !== page) {
      page.classList.remove("enter");
      void page.offsetWidth;
      page.classList.add("enter");
      fly(page, prevPage);
    }
    $$(".mapbox svg", page).forEach(fitMap);
    if (legendEl && !legendEl.hidden) { var wsvg = $(".mapbox-world svg"); if (wsvg) fitMap(wsvg); }
    insetEl.classList.remove("open");
    $(".inset-chip", insetEl).setAttribute("aria-expanded", "false");
    $$(".mapbox").forEach(function (b) { if (b._hide) b._hide(); });
    if (r.target) {
      var t = r.target;
      requestAnimationFrame(function () {
        t.scrollIntoView({ block: t.closest(".sources") ? "center" : "start" });
        if (t.closest(".sources") || t.matches("a.cite")) {
          t.classList.remove("flash");
          void t.offsetWidth;
          t.classList.add("flash");
        }
      });
    } else window.scrollTo(0, opts.y || 0);
    if (opts.focus) { var h = $(".plate-title", page) || $("h1", page); if (h) { if (!h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } }
  }

  // the cartographic zoom: the map's viewBox flies from where you were to where you are
  function boxAround(cx, cy, w, h) { return [cx - w / 2, cy - h / 2, w, h]; }
  function fly(page, prevPage) {
    var svg = $(".mapbox svg", page);
    if (reduce || !svg) return;
    var to = svg.getAttribute("data-base").split(" ").map(Number), w = to[2], h = to[3], from = null;
    var cur = byEl.get(page), prev = prevPage && byEl.get(prevPage);
    if (cur && cur.type === "region") {
      if (prev && prev.type === "place" && prev.region === cur && prev.c) from = boxAround(prev.c[0], prev.c[1], w * 0.5, h * 0.5);
      else if (prev && prev.type === "region" && prev !== cur) from = boxAround(prev.c[0], prev.c[1], w, h);
      else { var k = Math.min(2.6, Math.max(W / w, H / h)); from = boxAround(to[0] + w / 2, to[1] + h / 2, w * k, h * k); }
    } else if (page === world && prev) {
      var reg = prev.type === "place" ? prev.region : prev, b = reg.box, f = Math.max(b[2] / w, b[3] / h);
      from = boxAround(b[0] + b[2] / 2, b[1] + b[3] / 2, w * f, h * f);
    }
    if (!from) return;
    var t0 = null, D = 520;
    function frame(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / D), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      svg.setAttribute("viewBox", from.map(function (v, i) { return (v + (to[i] - v) * e).toFixed(2); }).join(" "));
      if (p < 1 && svg.isConnected) requestAnimationFrame(frame);
      else { svg.setAttribute("viewBox", to.join(" ")); fitMap(svg); }
    }
    svg.setAttribute("viewBox", from.join(" "));
    requestAnimationFrame(frame);
  }

  function updateInset(region, place, page) {
    var svg = $(".inset-map svg", insetEl);
    if (!svg) return;
    $$(".u", svg).forEach(function (u) {
      var id = u.getAttribute("data-id");
      u.classList.toggle("cur", !!region && id === region.id);
      u.classList.toggle("faded", !!region && id !== region.id);
    });
    var here = $(".here", svg), pt = place ? place.c : region ? region.c : null;
    if (pt) {
      var key = pt.join(","), moved = here.getAttribute("data-at") !== key;
      if (here.style.display === "none") { here.classList.add("nojump"); here.style.display = ""; }
      here.style.transform = "translate(" + pt[0] + "px," + pt[1] + "px)";
      here.setAttribute("data-at", key);
      void here.getBoundingClientRect();
      here.classList.remove("nojump");
      if (moved && !reduce) { here.classList.remove("arrive"); void here.getBoundingClientRect(); here.classList.add("arrive"); }
    } else { here.style.display = "none"; here.setAttribute("data-at", ""); }
    var label = place ? region.name + " › " + place.name : region ? region.name : page === indexPage ? "Atlas index" : page === sourcesPage ? "Sources" : "World";
    $(".inset-label", insetEl).textContent = label;
    $(".inset-chip-label", insetEl).textContent = label;
    var chip = $(".inset-chip", insetEl);
    chip.setAttribute("aria-label", "Locator map. You are here: " + label);
    chip.title = label;
    $(".inset-grid", insetEl).textContent = pt ? "grid " + grid(pt) : "whole map";
  }

  /* ================= ready: maps, behaviour, first render ================= */
  function ready() {
    decorateEvidence();
    $$("[data-controls]").forEach(function (n) {
      if (n._atl) return;
      n._atl = true;
      var keys = attr(n, "data-controls");
      R.controls(n, keys ? { keys: keys.split(/[\s,]+/).filter(Boolean) } : {});
    });
    function bestTiles() {
      $$("[data-best]").forEach(function (box) {
        var v = R.value(box.getAttribute("data-best"));
        $$("[data-key]", box).forEach(function (t) { t.classList.toggle("best", String(t.getAttribute("data-key")) === String(v)); });
      });
    }
    // <ul data-list="warnings"> renders an array of strings from the model as list items
    function lists() {
      $$("[data-list]").forEach(function (ul) {
        var v = R.value(ul.getAttribute("data-list"));
        v = Array.isArray(v) ? v : v ? [v] : [];
        ul.innerHTML = v.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
      });
    }
    bestTiles();
    lists();
    R.on("update", function () {
      bestTiles();
      lists();
      REG.filter(function (r) { return r.ridge; }).forEach(function (r) {
        var inner = ridgeInner(r);
        $$('g.ridge[data-ridge-for="' + CSS.escape(r.id) + '"]').forEach(function (g) {
          g.innerHTML = g.closest(".map-inset") ? inner.replace(/<text[\s\S]*?<\/text>/g, "") : inner;
          var svg = g.closest("svg");
          if (svg && !svg.closest("[hidden]")) fitMap(svg);
        });
      });
    });

    mapBox(worldMapHost, "world", null);
    REG.forEach(function (r) { if (r.mapHost) mapBox(r.mapHost, "plate", r); });
    $(".inset-map", insetEl).innerHTML = mapSVG("inset", null);

    // legend and inset controls
    var lbtn = $(".legend-btn", top);
    function closeLegend(refocus) { legendEl.hidden = true; lbtn.setAttribute("aria-expanded", "false"); if (refocus) lbtn.focus(); }
    function openLegend() {
      legendEl.hidden = false;
      lbtn.setAttribute("aria-expanded", "true");
      var wsvg = $(".mapbox-world svg");
      if (wsvg) { var sc = wsvg.getBoundingClientRect().width / W; if (sc) sizeScale(sc); }
      $("h2", legendEl).focus({ preventScroll: true });
    }
    lbtn.addEventListener("click", function () { if (legendEl.hidden) openLegend(); else closeLegend(false); });
    $(".legend-close", legendEl).addEventListener("click", function () { closeLegend(true); });
    doc.addEventListener("click", function (e) { if (e.target.closest(".legend-open")) { e.preventDefault(); openLegend(); } });
    var chip = $(".inset-chip", insetEl);
    chip.addEventListener("click", function () { var o = insetEl.classList.toggle("open"); chip.setAttribute("aria-expanded", String(o)); });
    doc.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!legendEl.hidden) closeLegend(legendEl.contains(doc.activeElement));
      if (insetEl.classList.contains("open")) { insetEl.classList.remove("open"); chip.setAttribute("aria-expanded", "false"); chip.focus(); }
    });
    doc.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".mapbox")) return;
      if (innerWidth <= 720) $$(".mapbox").forEach(function (b) { if (b._hide) b._hide(); });
    });

    // links: every in-page link is a route; Back/Forward return to where the reader was
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    var st;
    window.addEventListener("scroll", function () { clearTimeout(st); st = setTimeout(saveY, 120); }, { passive: true });
    doc.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[href^='#']");
      if (!a) return;
      var href = a.getAttribute("href");
      if (!resolve(href)) return;
      e.preventDefault();
      clearTimeout(st);
      go(href, true);
    });
    window.addEventListener("popstate", function () {
      var r = resolve(location.hash);
      if (r) show(r, { y: history.state && typeof history.state.y === "number" ? history.state.y : 0 });
    });
    // typed or external hash changes (Back/Forward also fire this, after popstate already showed the page)
    window.addEventListener("hashchange", function () { var r = resolve(location.hash); if (r && (r.page !== state.page || r.target)) show(r, { y: 0 }); });

    var first = resolve(location.hash) || { page: world };
    show(first, { y: history.state && typeof history.state.y === "number" ? history.state.y : 0 });
    state.booted = true;
    root.classList.add("atlas-ready");
  }

  // Registered last: core may already have initialised (it starts on a timer that can fire
  // before this deferred script runs), in which case the hooks run right away and every
  // definition above must already exist.
  R.hook("setup", setup);
  R.hook("ready", ready);
  R.atlas = { regions: REG, places: PL, go: function (id) { return go("#" + String(id).replace(/^#/, ""), true); }, grid: grid };
})();
