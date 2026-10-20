/* Example only: outputs the shared example model doesn't return (the examples share one
   model.js). In a real report these lines belong in model.js compute(). */
(function () {
  var spec = window.Report && Report.spec;
  if (!spec) return;
  var base = spec.compute, fee = spec.rates.e2bProFee, CAP = 500000;
  function h(v) { return v == null ? "> 500k" : Report.fmt(v, "int"); }
  spec.compute = function (p) {
    var r = base(p);
    var be12 = base(Object.assign({}, p, { buildMonths: 12 })).breakEven;
    var hw = r.breakEvenHw || CAP, ops = r.breakEvenOps || CAP, all = r.breakEven || CAP;
    r.beCost = r.breakEven == null ? null : fee + r.breakEven * r.e2bRate;   // E2B Pro bill at break-even
    // range rows with live value labels
    r.ladder = [
      { label: "Hardware only", ranges: [[100, hw]], color: "var(--s5)", note: h(r.breakEvenHw) },
      { label: "+ " + p.opsHours + " ops-h/mo", ranges: [[100, ops]], color: "var(--s4)", note: h(r.breakEvenOps) },
      { label: "+ " + p.buildMonths + " eng-mo build (yours)", ranges: [[100, all]], color: "var(--s3)", strong: true, note: h(r.breakEven) },
      { label: "+ 12 eng-mo build", ranges: [[100, be12 || CAP]], color: "var(--s5)", note: h(be12) }
    ];
    r.disputeA = [
      { label: "Side 1 (pre-June prices)", value: 400, hollow: true, color: "var(--s5)", note: "~400" },
      { label: "Side 1 recomputed, 2×AX42", value: hw, color: "var(--s4)", note: h(r.breakEvenHw) },
      { label: "+ ops labor (Side 2)", ranges: [[hw, ops]], color: "var(--s4)", note: h(r.breakEvenOps) },
      { label: "+ build (Side 2)", ranges: [[ops, all]], color: "var(--s3)", strong: true, note: h(r.breakEven) }
    ];
    // stacked bar rows: E2B splits into plan fee + usage
    r.splitRows = [
      { label: "E2B Pro", fee: fee, usage: r.cost.e2bPro - fee },
      { label: "Modal Starter", modal: r.cost.modal },
      { label: "Self-host, all-in", hardware: r.parts.hardware, ops: r.parts.ops, build: r.parts.build }
    ];
    return r;
  };
})();
