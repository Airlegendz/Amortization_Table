(() => {
  const now = () => new Date().toISOString().replace("T", " ").replace("Z", "");

  function createDebugPanel() {
    const panel = document.createElement("section");
    panel.className = "debug-panel";
    panel.id = "debug-panel";
    panel.setAttribute("data-open", "false");
    panel.innerHTML = `
      <div class="debug-header">
        <div><strong>Debug</strong> <span id="debug-status"></span></div>
        <div class="debug-actions">
          <button type="button" id="debug-clear">Clear</button>
          <button type="button" id="debug-close">Close</button>
        </div>
      </div>
      <div class="debug-log" id="debug-log" aria-label="Debug log"></div>
      <div class="debug-footer">If Calculate does nothing, check for red error lines here.</div>
    `;
    document.body.appendChild(panel);

    const logEl = panel.querySelector("#debug-log");
    const statusEl = panel.querySelector("#debug-status");

    const log = (level, msg, obj) => {
      const line = document.createElement("div");
      const color =
        level === "error"
          ? "rgba(255,107,107,0.95)"
          : level === "warn"
            ? "rgba(255,214,102,0.95)"
            : "rgba(255,255,255,0.88)";
      const details = obj ? ` ${safeJson(obj)}` : "";
      line.textContent = `[${now()}] ${level.toUpperCase()}: ${msg}${details}`;
      line.style.color = color;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    };

    const open = (v) => panel.setAttribute("data-open", v ? "true" : "false");

    panel.querySelector("#debug-clear").addEventListener("click", () => {
      logEl.innerHTML = "";
      log("info", "log cleared");
    });
    panel.querySelector("#debug-close").addEventListener("click", () => open(false));

    return { panel, log, open, statusEl };
  }

  function safeJson(obj) {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  const dbg = createDebugPanel();
  const debugToggle = document.getElementById("debug-toggle");
  if (debugToggle) {
    debugToggle.addEventListener("click", () => {
      const isOpen = dbg.panel.getAttribute("data-open") === "true";
      dbg.open(!isOpen);
      dbg.log("info", `debug panel ${!isOpen ? "opened" : "closed"}`);
    });
  }

  window.addEventListener("error", (e) => {
    dbg.open(true);
    dbg.log("error", "window error", {
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    dbg.open(true);
    dbg.log("error", "unhandled promise rejection", { reason: String(e.reason) });
  });

  function parseMoneyLike(input) {
    const cleaned = String(input ?? "").trim().replace(/[$, ]+/g, "");
    if (cleaned.length === 0) return NaN;
    return Number(cleaned);
  }

  function parsePercentLike(input) {
    const cleaned = String(input ?? "").trim().replace(/[% ]+/g, "");
    if (cleaned.length === 0) return NaN;
    return Number(cleaned);
  }

  function formatCurrency(n) {
    if (!Number.isFinite(n)) return "$0.00";
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
  }

  function roundToCents(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function computeMonthlyPayment(principal, monthlyRate, months) {
    if (months <= 0) return NaN;
    if (monthlyRate === 0) return principal / months;
    const pow = Math.pow(1 + monthlyRate, months);
    return principal * ((monthlyRate * pow) / (pow - 1));
  }

  function buildSchedule(principal, monthlyRate, months, monthlyPayment) {
    let balance = principal;
    const rows = [];

    for (let month = 1; month <= months; month++) {
      const interest = balance * monthlyRate;
      const principalPaid = monthlyPayment - interest;
      balance -= principalPaid;
      if (balance < 0) balance = 0;

      rows.push({
        month,
        interest: roundToCents(interest),
        principalPaid: roundToCents(principalPaid),
        balance: roundToCents(balance),
      });

      if (balance === 0) break;
    }

    return rows;
  }

  function setError(msg) {
    const el = document.getElementById("error");
    if (el) el.textContent = msg || "";
  }

  function resetUI() {
    setError("");
    const results = document.getElementById("results");
    if (results) results.hidden = true;
    const tbody = document.getElementById("schedule-body");
    if (tbody) tbody.innerHTML = "";
    const mp = document.getElementById("monthly-payment");
    if (mp) mp.textContent = "$0.00";
    const tm = document.getElementById("total-months");
    if (tm) tm.textContent = "0";
  }

  function renderResults(monthlyPayment, months, rows) {
    document.getElementById("monthly-payment").textContent = formatCurrency(monthlyPayment);
    document.getElementById("total-months").textContent = String(months);

    const tbody = document.getElementById("schedule-body");
    tbody.innerHTML = "";

    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.month}</td>
        <td>${formatCurrency(r.interest)}</td>
        <td>${formatCurrency(r.principalPaid)}</td>
        <td>${formatCurrency(r.balance)}</td>
      `;
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);

    document.getElementById("results").hidden = false;
  }

  function main() {
    dbg.log("info", "app.js loaded");

    const form = document.getElementById("loan-form");
    const principalEl = document.getElementById("principal");
    const aprEl = document.getElementById("apr");
    const yearsEl = document.getElementById("years");
    const resetBtn = document.getElementById("reset");
    const calcBtn = document.getElementById("calculate");

    dbg.log("info", "dom lookup", {
      form: !!form,
      principal: !!principalEl,
      apr: !!aprEl,
      years: !!yearsEl,
      reset: !!resetBtn,
      calculate: !!calcBtn,
    });

    if (!form || !principalEl || !aprEl || !yearsEl || !resetBtn || !calcBtn) {
      dbg.open(true);
      setError("Page error: missing fields. Refresh.");
      dbg.log("error", "missing required elements; check index.html ids");
      return;
    }

    calcBtn.addEventListener("click", () => dbg.log("info", "calculate button clicked"));

    resetBtn.addEventListener("click", () => {
      dbg.log("info", "reset clicked");
      principalEl.value = "";
      aprEl.value = "";
      yearsEl.value = "";
      resetUI();
      principalEl.focus();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      setError("");
      dbg.log("info", "form submitted");

      const principal = parseMoneyLike(principalEl.value);
      const aprPercent = parsePercentLike(aprEl.value);
      const years = Number(String(yearsEl.value ?? "").trim());

      dbg.log("info", "parsed inputs", { principal, aprPercent, years });

      if (!Number.isFinite(principal) || principal <= 0) {
        dbg.open(true);
        dbg.log("warn", "invalid principal", { raw: principalEl.value });
        return setError("Enter a valid loan amount (> 0).");
      }
      if (!Number.isFinite(aprPercent) || aprPercent < 0) {
        dbg.open(true);
        dbg.log("warn", "invalid apr", { raw: aprEl.value });
        return setError("Enter a valid APR (≥ 0).");
      }
      if (!Number.isFinite(years) || years <= 0) {
        dbg.open(true);
        dbg.log("warn", "invalid years", { raw: yearsEl.value });
        return setError("Enter a valid term in years (> 0).");
      }

      const monthlyRate = aprPercent / 100 / 12;
      const months = Math.round(years * 12);
      const monthlyPayment = computeMonthlyPayment(principal, monthlyRate, months);

      dbg.log("info", "computed", { monthlyRate, months, monthlyPayment });

      if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
        dbg.open(true);
        dbg.log("error", "payment compute failed");
        return setError("Could not compute payment.");
      }

      const rows = buildSchedule(principal, monthlyRate, months, monthlyPayment);
      dbg.log("info", "schedule built", { rows: rows.length });
      renderResults(roundToCents(monthlyPayment), months, rows);
    });

    dbg.statusEl.textContent = "(ready)";
  }

  document.addEventListener("DOMContentLoaded", main);
})();

function parseMoneyLike(input) {
  const cleaned = String(input ?? "").trim().replace(/[$, ]+/g, "");
  if (cleaned.length === 0) return NaN;
  return Number(cleaned);
}

function parsePercentLike(input) {
  const cleaned = String(input ?? "").trim().replace(/[% ]+/g, "");
  if (cleaned.length === 0) return NaN;
  return Number(cleaned);
}

function formatCurrency(n) {
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function roundToCents(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeMonthlyPayment(principal, monthlyRate, months) {
  if (months <= 0) return NaN;
  if (monthlyRate === 0) return principal / months;
  const pow = Math.pow(1 + monthlyRate, months);
  return principal * ((monthlyRate * pow) / (pow - 1));
}

function buildSchedule(principal, monthlyRate, months, monthlyPayment) {
  let balance = principal;
  const rows = [];

  for (let month = 1; month <= months; month++) {
    const interest = balance * monthlyRate;
    const principalPaid = monthlyPayment - interest;
    balance -= principalPaid;
    if (balance < 0) balance = 0;

    rows.push({
      month,
      interest: roundToCents(interest),
      principalPaid: roundToCents(principalPaid),
      balance: roundToCents(balance),
    });

    if (balance === 0) break;
  }

  return rows;
}

function setError(msg) {
  const el = document.getElementById("error");
  if (el) el.textContent = msg || "";
}

function resetUI() {
  setError("");
  const results = document.getElementById("results");
  if (results) results.hidden = true;
  const tbody = document.getElementById("schedule-body");
  if (tbody) tbody.innerHTML = "";
  const mp = document.getElementById("monthly-payment");
  if (mp) mp.textContent = "$0.00";
  const tm = document.getElementById("total-months");
  if (tm) tm.textContent = "0";
}

function renderResults(monthlyPayment, months, rows) {
  document.getElementById("monthly-payment").textContent = formatCurrency(monthlyPayment);
  document.getElementById("total-months").textContent = String(months);

  const tbody = document.getElementById("schedule-body");
  tbody.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.month}</td>
      <td>${formatCurrency(r.interest)}</td>
      <td>${formatCurrency(r.principalPaid)}</td>
      <td>${formatCurrency(r.balance)}</td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);

  document.getElementById("results").hidden = false;
}

function main() {
  const form = document.getElementById("loan-form");
  const principalEl = document.getElementById("principal");
  const aprEl = document.getElementById("apr");
  const yearsEl = document.getElementById("years");
  const resetBtn = document.getElementById("reset");

  if (!form || !principalEl || !aprEl || !yearsEl || !resetBtn) {
    setError("Page error: missing fields. Refresh.");
    return;
  }

  resetBtn.addEventListener("click", () => {
    principalEl.value = "";
    aprEl.value = "";
    yearsEl.value = "";
    resetUI();
    principalEl.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setError("");

    const principal = parseMoneyLike(principalEl.value);
    const aprPercent = parsePercentLike(aprEl.value);
    const years = Number(String(yearsEl.value ?? "").trim());

    if (!Number.isFinite(principal) || principal <= 0) return setError("Enter a valid loan amount (> 0).");
    if (!Number.isFinite(aprPercent) || aprPercent < 0) return setError("Enter a valid APR (≥ 0).");
    if (!Number.isFinite(years) || years <= 0) return setError("Enter a valid term in years (> 0).");

    const monthlyRate = aprPercent / 100 / 12;
    const months = Math.round(years * 12);
    const monthlyPayment = computeMonthlyPayment(principal, monthlyRate, months);
    if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) return setError("Could not compute payment.");

    const rows = buildSchedule(principal, monthlyRate, months, monthlyPayment);
    renderResults(roundToCents(monthlyPayment), months, rows);
  });
}

document.addEventListener("DOMContentLoaded", main);

function parseMoneyLike(input) {
  const cleaned = String(input ?? "").trim().replace(/[$, ]+/g, "");
  if (cleaned.length === 0) return NaN;
  return Number(cleaned);
}

function parsePercentLike(input) {
  const cleaned = String(input ?? "").trim().replace(/[% ]+/g, "");
  if (cleaned.length === 0) return NaN;
  return Number(cleaned);
}

function formatCurrency(n) {
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function roundToCents(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeMonthlyPayment({ principal, monthlyRate, months }) {
  if (months <= 0) return NaN;
  if (monthlyRate === 0) return principal / months;
  const pow = Math.pow(1 + monthlyRate, months);
  return principal * ((monthlyRate * pow) / (pow - 1));
}

function buildSchedule({ principal, monthlyRate, months, monthlyPayment }) {
  let balance = principal;
  const rows = [];

  for (let month = 1; month <= months; month++) {
    const interest = balance * monthlyRate;
    const principalPaid = monthlyPayment - interest;
    balance -= principalPaid;

    if (balance < 0) balance = 0;

    rows.push({
      month,
      interest: roundToCents(interest),
      principalPaid: roundToCents(principalPaid),
      balance: roundToCents(balance),
    });

    if (balance === 0) break;
  }

  return rows;
}

function setError(msg) {
  const el = document.getElementById("error");
  if (!el) return;
  el.textContent = msg || "";
}

function renderResults({ monthlyPayment, months, rows }) {
  document.getElementById("monthly-payment").textContent = formatCurrency(monthlyPayment);
  document.getElementById("total-months").textContent = String(months);

  const tbody = document.getElementById("schedule-body");
  tbody.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.month}</td>
      <td>${formatCurrency(r.interest)}</td>
      <td>${formatCurrency(r.principalPaid)}</td>
      <td>${formatCurrency(r.balance)}</td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);

  document.getElementById("results").hidden = false;
}

function resetUI() {
  setError("");
  document.getElementById("results").hidden = true;
  document.getElementById("schedule-body").innerHTML = "";
  document.getElementById("monthly-payment").textContent = "$0.00";
  document.getElementById("total-months").textContent = "0";
}

function main() {
  const form = document.getElementById("loan-form");
  const principalEl = document.getElementById("principal");
  const aprEl = document.getElementById("apr");
  const yearsEl = document.getElementById("years");
  const resetBtn = document.getElementById("reset");

  if (!form || !principalEl || !aprEl || !yearsEl || !resetBtn) {
    setError("Page error: missing form fields. Refresh the page.");
    return;
  }

  resetBtn.addEventListener("click", () => {
    principalEl.value = "";
    aprEl.value = "";
    yearsEl.value = "";
    resetUI();
    principalEl.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setError("");

    const principal = parseMoneyLike(principalEl.value);
    const aprPercent = parsePercentLike(aprEl.value);
    const years = Number(String(yearsEl.value ?? "").trim());

    if (!Number.isFinite(principal) || principal <= 0) return setError("Enter a valid loan amount (must be > 0).");
    if (!Number.isFinite(aprPercent) || aprPercent < 0) return setError("Enter a valid APR (must be ≥ 0).");
    if (!Number.isFinite(years) || years <= 0) return setError("Enter a valid loan term in years (must be > 0).");

    const monthlyRate = aprPercent / 100 / 12;
    const months = Math.round(years * 12);
    const monthlyPayment = computeMonthlyPayment({ principal, monthlyRate, months });

    if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
      return setError("Could not compute payment. Double-check your inputs.");
    }

    const rows = buildSchedule({ principal, monthlyRate, months, monthlyPayment });
    renderResults({ monthlyPayment: roundToCents(monthlyPayment), months, rows });
  });
}

document.addEventListener("DOMContentLoaded", main);

function parseMoneyLike(input) {
  const cleaned = String(input ?? "").trim().replace(/[$, ]+/g, "");
  if (cleaned.length === 0) return NaN;
  return Number(cleaned);
}

function parsePercentLike(input) {
  const cleaned = String(input ?? "").trim().replace(/[% ]+/g, "");
  if (cleaned.length === 0) return NaN;
  return Number(cleaned);
}

function formatCurrency(n) {
  if (!Number.isFinite(n)) return "$0.00";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n);
}

function roundToCents(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function computeMonthlyPayment({ principal, monthlyRate, months }) {
  if (months <= 0) return NaN;
  if (monthlyRate === 0) return principal / months;
  const pow = Math.pow(1 + monthlyRate, months);
  return principal * ((monthlyRate * pow) / (pow - 1));
}

function buildSchedule({ principal, monthlyRate, months, monthlyPayment }) {
  let balance = principal;
  const rows = [];

  for (let month = 1; month <= months; month++) {
    const interest = balance * monthlyRate;
    const principalPaid = monthlyPayment - interest;
    balance -= principalPaid;

    // Prevent negative pennies at the end due to floating point.
    if (balance < 0) balance = 0;

    rows.push({
      month,
      interest: roundToCents(interest),
      principalPaid: roundToCents(principalPaid),
      balance: roundToCents(balance),
    });

    if (balance === 0) break;
  }

  return rows;
}

function setError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg || "";
}

function renderResults({ monthlyPayment, months, rows }) {
  document.getElementById("monthly-payment").textContent = formatCurrency(monthlyPayment);
  document.getElementById("total-months").textContent = String(months);

  const tbody = document.getElementById("schedule-body");
  tbody.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.month}</td>
      <td>${formatCurrency(r.interest)}</td>
      <td>${formatCurrency(r.principalPaid)}</td>
      <td>${formatCurrency(r.balance)}</td>
    `;
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);

  document.getElementById("results").hidden = false;
}

function resetUI() {
  setError("");
  document.getElementById("results").hidden = true;
  document.getElementById("schedule-body").innerHTML = "";
  document.getElementById("monthly-payment").textContent = "$0.00";
  document.getElementById("total-months").textContent = "0";
}

function main() {
  const form = document.getElementById("loan-form");
  const principalEl = document.getElementById("principal");
  const aprEl = document.getElementById("apr");
  const yearsEl = document.getElementById("years");
  const resetBtn = document.getElementById("reset");

  resetBtn.addEventListener("click", () => {
    principalEl.value = "";
    aprEl.value = "";
    yearsEl.value = "";
    resetUI();
    principalEl.focus();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    setError("");

    const principal = parseMoneyLike(principalEl.value);
    const aprPercent = parsePercentLike(aprEl.value);
    const years = Number(String(yearsEl.value ?? "").trim());

    if (!Number.isFinite(principal) || principal <= 0) return setError("Enter a valid loan amount (must be > 0).");
    if (!Number.isFinite(aprPercent) || aprPercent < 0) return setError("Enter a valid APR (must be ≥ 0).");
    if (!Number.isFinite(years) || years <= 0) return setError("Enter a valid loan term in years (must be > 0).");

    const monthlyRate = aprPercent / 100 / 12;
    const months = Math.round(years * 12);
    const monthlyPayment = computeMonthlyPayment({ principal, monthlyRate, months });

    if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
      return setError("Could not compute payment. Double-check your inputs.");
    }

    const rows = buildSchedule({ principal, monthlyRate, months, monthlyPayment });
    renderResults({ monthlyPayment: roundToCents(monthlyPayment), months, rows });
  });
}

document.addEventListener("DOMContentLoaded", main);

const $ = (id) => document.getElementById(id);

function toNumber(raw) {
  const n = Number(String(raw).trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function formatMoney(n) {
  const v = Number(n);
  const safe = Number.isFinite(v) ? v : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatRate(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(4)}%`;
}

function computeMonthlyPayment(principal, monthlyRate, totalMonths) {
  if (totalMonths <= 0) return NaN;
  if (monthlyRate === 0) return principal / totalMonths;
  const r = monthlyRate;
  const n = totalMonths;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildSchedule(principal, annualRatePct, years) {
  const monthlyRate = (annualRatePct / 100) / 12;
  const totalMonths = Math.round(years * 12);
  // Use a fixed payment rounded to cents, matching typical amortization tables.
  const monthlyPayment = round2(computeMonthlyPayment(principal, monthlyRate, totalMonths));

  if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
    return { monthlyRate, totalMonths, monthlyPayment: NaN, rows: [] };
  }

  const rows = [];
  let balance = round2(principal);

  for (let month = 1; month <= totalMonths; month++) {
    const interest = round2(balance * monthlyRate);
    let principalPaid = round2(monthlyPayment - interest);

    // Clamp final payment so balance ends at exactly $0.00.
    if (principalPaid > balance) principalPaid = balance;

    balance = round2(balance - principalPaid);
    if (Math.abs(balance) < 1e-9) balance = 0;

    rows.push({
      month,
      interest,
      principal: principalPaid,
      balance,
    });

    if (balance <= 0) break;
  }

  return { monthlyRate, totalMonths, monthlyPayment, rows };
}

function drawBalanceChart(canvas, principal, rows) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  ctx.clearRect(0, 0, w, h);

  const padding = { l: 46 * dpr, r: 14 * dpr, t: 14 * dpr, b: 26 * dpr };
  const plotW = w - padding.l - padding.r;
  const plotH = h - padding.t - padding.b;

  // Background grid
  ctx.save();
  ctx.translate(padding.l, padding.t);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1 * dpr;
  const gridY = 4;
  for (let i = 0; i <= gridY; i++) {
    const y = (plotH * i) / gridY;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(plotW, y);
    ctx.stroke();
  }
  ctx.restore();

  if (!rows.length || !Number.isFinite(principal) || principal <= 0) return;

  const balances = [principal, ...rows.map((r) => r.balance)];
  const maxY = principal;
  const minY = 0;
  const count = balances.length;

  const xFor = (i) => padding.l + (plotW * i) / (count - 1);
  const yFor = (v) => padding.t + (plotH * (1 - (v - minY) / (maxY - minY)));

  // Line gradient
  const grad = ctx.createLinearGradient(0, padding.t, w, padding.t + plotH);
  grad.addColorStop(0, "rgba(124,92,255,0.95)");
  grad.addColorStop(1, "rgba(37,212,255,0.85)");

  // Area fill
  ctx.beginPath();
  ctx.moveTo(xFor(0), yFor(balances[0]));
  for (let i = 1; i < count; i++) ctx.lineTo(xFor(i), yFor(balances[i]));
  ctx.lineTo(xFor(count - 1), padding.t + plotH);
  ctx.lineTo(xFor(0), padding.t + plotH);
  ctx.closePath();
  ctx.fillStyle = "rgba(124,92,255,0.10)";
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(xFor(0), yFor(balances[0]));
  for (let i = 1; i < count; i++) ctx.lineTo(xFor(i), yFor(balances[i]));
  ctx.strokeStyle = grad;
  ctx.lineWidth = 2.25 * dpr;
  ctx.stroke();

  // Axis labels (simple)
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = `${12 * dpr}px ui-sans-serif, system-ui`;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const labels = 4;
  for (let i = 0; i <= labels; i++) {
    const v = (maxY * (labels - i)) / labels;
    const y = yFor(v);
    ctx.fillText(
      v.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      padding.l - 8 * dpr,
      y
    );
  }
}

function renderTable(rows, showFirstThree) {
  const tbody = $("amortTbody");
  tbody.innerHTML = "";

  const visibleRows = showFirstThree ? rows.slice(0, 3) : rows;
  if (!visibleRows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "empty";
    td.textContent = "No rows to display. Check your inputs.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  for (const r of visibleRows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.month}</td>
      <td class="num">${formatMoney(r.interest)}</td>
      <td class="num">${formatMoney(r.principal)}</td>
      <td class="num">${formatMoney(r.balance)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function downloadCsv(rows) {
  const header = ["Month", "Interest Paid", "Principal Paid", "Remaining Balance"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.month,
        r.interest.toFixed(2),
        r.principal.toFixed(2),
        r.balance.toFixed(2),
      ].join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "amortization-table.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const TEST_CASES = {
  1: { principal: 1000, annualRate: 12, years: 1 },
  2: { principal: 5000, annualRate: 5, years: 2 },
  3: { principal: 20000, annualRate: 7, years: 5 },
  4: { principal: 300000, annualRate: 4, years: 30 },
  5: { principal: 100, annualRate: 10, years: 1 },
};

function setInputs({ principal, annualRate, years }) {
  $("principal").value = String(principal);
  $("annualRate").value = String(annualRate);
  $("years").value = String(years);
}

function generateFromForm() {
  const principal = toNumber($("principal").value);
  const annualRate = toNumber($("annualRate").value);
  const years = toNumber($("years").value);

  if (!(principal > 0) || !(annualRate >= 0) || !(years > 0)) {
    $("monthlyPayment").textContent = "$—";
    $("totalMonths").textContent = "—";
    $("monthlyRate").textContent = "—";
    renderTable([], false);
    drawBalanceChart($("balanceChart"), 0, []);
    return { rows: [] };
  }

  const { monthlyRate, totalMonths, monthlyPayment, rows } = buildSchedule(
    principal,
    annualRate,
    years
  );

  $("monthlyPayment").textContent = formatMoney(Number(monthlyPayment.toFixed(2)));
  $("totalMonths").textContent = String(totalMonths);
  $("monthlyRate").textContent = formatRate(monthlyRate);

  const showFirstThree = $("toggleFirstThree").checked;
  renderTable(rows, showFirstThree);
  drawBalanceChart($("balanceChart"), principal, rows);

  return { principal, annualRate, years, monthlyRate, totalMonths, monthlyPayment, rows };
}

let lastResult = { rows: [] };

function init() {
  $("loanForm").addEventListener("submit", (e) => {
    e.preventDefault();
    lastResult = generateFromForm();
  });

  $("btnReset").addEventListener("click", () => {
    setInputs({ principal: "", annualRate: "", years: "" });
    $("toggleFirstThree").checked = false;
    lastResult = generateFromForm();
  });

  $("toggleFirstThree").addEventListener("change", () => {
    renderTable(lastResult.rows || [], $("toggleFirstThree").checked);
  });

  document.querySelectorAll("[data-testcase]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-testcase");
      const tc = TEST_CASES[id];
      if (tc) setInputs(tc);
    });
  });

  $("btnDownloadCsv").addEventListener("click", () => {
    if (lastResult.rows?.length) downloadCsv(lastResult.rows);
  });

  $("btnPrint").addEventListener("click", () => window.print());

  // Render once so the chart paints a clean empty state.
  drawBalanceChart($("balanceChart"), 0, []);
}

window.addEventListener("resize", () => {
  if (lastResult?.rows?.length) {
    drawBalanceChart($("balanceChart"), lastResult.principal, lastResult.rows);
  } else {
    drawBalanceChart($("balanceChart"), 0, []);
  }
});

init();
