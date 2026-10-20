/* Example model for the roadmap template: the shared sandbox cost model (same rates, params
   and outputs as examples/_shared/model.js) plus a growth timeline. compute() also returns
   `timeline` (one row per month, t = 0…24) and `moments` (gate, break-even month, triggers),
   which the roadmap lanes, eras and milestones bind to. */
Report.model((function () {
  var RATES = {
    e2bVcpuHour: 0.0504,          // E2B docs: $0.000014 / vCPU-s
    e2bGibHour: 0.0162,           // E2B docs: $0.0000045 / GiB-s
    e2bProFee: 150,               // E2B pricing
    e2bProConcurrency: 100,
    e2bHobbyConcurrency: 20,
    modalCoreHour: 0.141912,      // Modal pricing: $0.00003942 / core-s, 1 core = 2 vCPU
    modalGibHour: 0.024012,       // Modal pricing: $0.00000667 / GiB-s
    modalStarterContainers: 100,
    ax42Eur: 97.30,               // Hetzner price adjustment, 15 June 2026
    ax42SetupEur: 49
  };
  var MONTHS = 24, SPEND_TRIGGER = 5000;

  function costs(p, H) {
    var e2bRate = p.vcpu * RATES.e2bVcpuHour + p.gib * RATES.e2bGibHour;
    var modalRate = (p.vcpu / 2) * RATES.modalCoreHour + p.gib * RATES.modalGibHour;
    var perBox = Math.max(1, Math.floor((64 - p.hostReserveGb) / p.gib));
    var peakConc = H / 730 * p.peak;
    var hosts = Math.max(2, Math.ceil(peakConc / perBox));
    var hw = hosts * (RATES.ax42Eur + RATES.ax42SetupEur / p.amort) * p.fx;
    var ops = p.opsHours * p.rate;
    var build = p.buildMonths * 160 * p.rate / p.amort;
    return {
      e2bRate: e2bRate, modalRate: modalRate, perBox: perBox, peakConc: peakConc, hosts: hosts,
      hardware: hw, ops: ops, build: build,
      e2bPro: RATES.e2bProFee + H * e2bRate, modal: H * modalRate, selfHw: hw, selfAll: hw + ops + build
    };
  }
  function breakEven(p, mode) {
    for (var H = 0; H <= 500000; H += 10) {
      var c = costs(p, H);
      if (c.e2bPro >= (mode === "hw" ? c.selfHw : c.selfAll)) return H;
    }
    return null;
  }
  function cheapestOf(c) {
    var best = "e2bPro";
    ["modal", "selfAll"].forEach(function (k) { if (c[k] < c[best]) best = k; });
    return best;
  }
  var NAMES = { e2bPro: "E2B Pro", modal: "Modal Starter", selfAll: "Self-host (all-in)" };

  return {
    rates: RATES,
    params: [
      { key: "hours", label: "Starting sandbox-hours / month", min: 100, max: 50000, log: true, step: 10, default: 2000, format: "int", unit: "h", ev: "assumption",
        note: "Report default: 2,000 h. 730 h = one sandbox always on." },
      { key: "growth", label: "Monthly usage growth", min: 0, max: 30, step: 1, default: 15, format: "int", unit: "%/month", ev: "assumption",
        note: "Illustrative default, not from the research. Set your own." },
      { key: "peak", label: "Peak ÷ average concurrency", min: 1, max: 6, step: 0.5, default: 2, format: "number", unit: "×", ev: "assumption",
        note: "Sizes the self-host fleet and the 100-concurrency trigger." },
      { key: "opsHours", label: "Ops hours per month", min: 0, max: 80, step: 1, default: 20, format: "int", unit: "h", ev: "assumption",
        note: "Your time keeping a self-hosted fleet running." },
      { key: "rate", label: "Loaded cost of an engineer-hour", min: 25, max: 250, step: 5, default: 100, format: "currency", ev: "assumption" },
      { key: "buildMonths", label: "Engineer-months to build", min: 0, max: 18, step: 1, default: 4, format: "int", unit: "mo", ev: "assumption",
        note: "A vendor estimates 12–18 for a production multi-tenant platform." },
      { key: "amort", label: "Months to spread the build over", min: 6, max: 48, step: 6, default: 24, format: "int", unit: "mo", ev: "assumption" },
      { key: "vcpu", label: "vCPU per sandbox", min: 1, max: 8, step: 1, default: 2, format: "int", ev: "assumption", hidden: true },
      { key: "gib", label: "GiB RAM per sandbox", min: 1, max: 16, step: 1, default: 4, format: "int", ev: "assumption", hidden: true },
      { key: "fx", label: "USD per EUR", min: 0.9, max: 1.4, step: 0.01, default: 1.16, format: "number", digits: 2, ev: "assumption", hidden: true },
      { key: "hostReserveGb", label: "RAM kept for the host (GB)", min: 4, max: 16, step: 1, default: 8, format: "int", ev: "assumption", hidden: true }
    ],
    compute: function (p) {
      var H = Math.max(0, +p.hours), g = Math.max(0, +p.growth) / 100;
      var c = costs(p, H);
      var cost = { e2bPro: c.e2bPro, modal: c.modal, selfHw: c.selfHw, selfAll: c.selfAll };
      var best = cheapestOf(cost);
      var warnings = [];
      if (c.peakConc > RATES.e2bProConcurrency) warnings.push("Peak " + Math.round(c.peakConc) + " concurrent exceeds E2B Pro's cap of 100 (Enterprise: $3,000/month minimum).");
      if (c.peakConc > RATES.modalStarterContainers) warnings.push("Peak " + Math.round(c.peakConc) + " concurrent exceeds Modal Starter's cap of 100 containers (Team: $250/month).");
      var be = breakEven(p);
      var maxH = Math.max(40000, Math.min(100000, Math.ceil(((be || 40000) * 1.25) / 10000) * 10000));
      var series = [];
      for (var i = 0; i <= 40; i++) {
        var h = Math.round(maxH * i / 40), s = costs(p, h);
        series.push({ hours: h, e2bPro: s.e2bPro, modal: s.modal, selfHw: s.selfHw, selfAll: s.selfAll });
      }
      var diff = c.modalRate - c.e2bRate;
      var modalCross = diff > 0 ? RATES.e2bProFee / diff : null;

      // growth timeline: usage H0 × (1 + g)^t, costs per month
      var timeline = [];
      for (var t = 0; t <= MONTHS; t++) {
        var Ht = H * Math.pow(1 + g, t), ct = costs(p, Ht), k = cheapestOf(ct);
        timeline.push({ t: t, usage: Ht, e2bPro: ct.e2bPro, modal: ct.modal, selfAll: ct.selfAll, selfHw: ct.selfHw,
          cheapest: k, cheapestName: NAMES[k], cheapestCost: ct[k], beLine: be });
      }
      // month at which usage first reaches Hx (fractional); null if never
      function monthAt(Hx) {
        if (Hx == null) return null;
        if (H >= Hx) return 0;
        if (g <= 0) return null;
        return Math.log(Hx / H) / Math.log(1 + g);
      }
      function within(m) { return m != null && m <= MONTHS ? m : null; }
      var spendH = (SPEND_TRIGGER - RATES.e2bProFee) / c.e2bRate;
      var capH = RATES.e2bProConcurrency * 730 / p.peak;
      var spendMonth = monthAt(spendH), capMonth = monthAt(capH * 1.0001), beMonth = monthAt(be);
      var crossMonth = modalCross != null && H < modalCross ? monthAt(modalCross) : null;
      // decision gate: 3 months above ~$5k/month, or the month peak passes 100 concurrent
      var trigS = spendMonth != null ? Math.ceil(spendMonth) + 2 : Infinity, trigC = capMonth != null ? Math.ceil(capMonth) : Infinity;
      var gate = Math.min(trigS, trigC), gateIn = gate <= MONTHS;
      var buildStart = gateIn ? Math.min(MONTHS, gate + 1) : null;
      var moments = {
        gate: gateIn ? gate : null,
        gateIn: gateIn,
        gateWhy: !gateIn ? "" : trigC <= trigS ? "E2B Pro’s 100-concurrent cap" : "3 months above ~$5k/month",
        watchEnd: gateIn ? gate : MONTHS,
        beMonth: within(beMonth),
        beIn: within(beMonth) != null,
        spendMonth: within(spendMonth), spendH: spendH,
        capMonth: within(capMonth), capH: capH,
        crossMonth: crossMonth != null && crossMonth > 0 ? within(crossMonth) : null,
        buildStart: buildStart,
        buildEnd: gateIn ? Math.min(MONTHS + 9, buildStart + 6) : null,
        buildEndSoft: gateIn ? buildStart + 9 : null,
        opsStart: gateIn && buildStart + 9 < MONTHS ? buildStart + 9 : null,
        opsEnd: gateIn && buildStart + 9 < MONTHS ? MONTHS + 1 : null,
        breakEvenPoint: within(beMonth) != null ? { x: beMonth, y: costs(p, be).e2bPro } : null
      };

      return {
        hours: H,
        e2bRate: c.e2bRate, modalRate: c.modalRate,
        avgConc: H / 730, peakConc: c.peakConc, perBox: c.perBox, hosts: c.hosts,
        cost: cost,
        parts: { hardware: c.hardware, ops: c.ops, build: c.build },
        partsRows: [{ label: "Self-host, all-in", hardware: c.hardware, ops: c.ops, build: c.build }],
        cheapest: best, cheapestName: NAMES[best],
        savingVsE2b: cost.e2bPro - cost[best],
        breakEven: be,
        breakEvenHw: breakEven(p, "hw"),
        breakEvenOps: breakEven(Object.assign({}, p, { buildMonths: 0 })),
        breakEvenAlwaysOn: be == null ? null : be / 730,
        modalCross: modalCross,
        hobbyFits: c.peakConc <= RATES.e2bHobbyConcurrency,
        warnings: warnings,
        series: series,
        seriesMax: maxH,
        timeline: timeline,
        moments: moments
      };
    }
  };
})());
