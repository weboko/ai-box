/* Example model: self-host Firecracker on Hetzner vs rent E2B / Modal.
   Rates are sourced (see the Sources list in each example page); params are the
   report's assumptions, which the reader can change. */
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
  // Smallest sandbox-hours / month where self-hosting costs no more than E2B Pro,
  // searched in 10 h steps with the fleet re-sized at each step. null = beyond 500,000 h.
  function breakEven(p, mode) {
    for (var H = 0; H <= 500000; H += 10) {
      var c = costs(p, H);
      if (c.e2bPro >= (mode === "hw" ? c.selfHw : c.selfAll)) return H;
    }
    return null;
  }
  var NAMES = { e2bPro: "E2B Pro", modal: "Modal Starter", selfAll: "Self-host (all-in)" };

  return {
    rates: RATES,
    params: [
      { key: "hours", label: "Sandbox-hours per month", min: 100, max: 100000, log: true, step: 10, default: 2000, format: "int", unit: "h", ev: "assumption",
        note: "Total time sandboxes are running in a month. 730 h = one sandbox always on." },
      { key: "peak", label: "Peak ÷ average concurrency", min: 1, max: 6, step: 0.5, default: 2, format: "number", unit: "×", ev: "assumption",
        note: "Sizes the self-host fleet for peaks." },
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
      var H = Math.max(0, +p.hours);
      var c = costs(p, H);
      var cost = { e2bPro: c.e2bPro, modal: c.modal, selfHw: c.selfHw, selfAll: c.selfAll };
      var best = "e2bPro";
      ["modal", "selfAll"].forEach(function (k) { if (cost[k] < cost[best]) best = k; });
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
      return {
        hours: H,
        e2bRate: c.e2bRate, modalRate: c.modalRate,
        avgConc: H / 730, peakConc: c.peakConc, perBox: c.perBox, hosts: c.hosts,
        cost: cost,
        parts: { hardware: c.hardware, ops: c.ops, build: c.build },
        partsRows: [{ label: "Self-host, all-in", hardware: c.hardware, ops: c.ops, build: c.build }],
        cheapest: best, cheapestName: NAMES[best],
        cheapestCost: cost[best],                                  // added for prose: the cheapest option's bill
        hobbyCost: H * c.e2bRate,                                  // E2B Hobby (no plan fee), if it fits
        breakEvenGap: be != null && H < be ? be - H : null,        // hours short of the all-in break-even
        pastBreakEven: be != null && H >= be,
        savingVsE2b: cost.e2bPro - cost[best],
        breakEven: be,
        breakEvenHw: breakEven(p, "hw"),
        breakEvenOps: breakEven(Object.assign({}, p, { buildMonths: 0 })),
        breakEvenAlwaysOn: be == null ? null : be / 730,
        modalCross: diff > 0 ? RATES.e2bProFee / diff : null,
        hobbyFits: c.peakConc <= RATES.e2bHobbyConcurrency,
        warnings: warnings,
        series: series,
        seriesMax: maxH
      };
    }
  };
})());
