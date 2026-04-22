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

function toCsv(rows) {
  const header = ["Month", "Interest Paid", "Principal Paid", "Remaining Balance"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.month,
        r.interest.toFixed(2),
        r.principalPaid.toFixed(2),
        r.balance.toFixed(2),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function main() {
  const html = document.documentElement;
  const themeToggle = document.getElementById("theme-toggle");

  const setTheme = (theme) => {
    if (theme === "dark") html.setAttribute("data-theme", "dark");
    else html.removeAttribute("data-theme");
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore
    }
  };

  const getSavedTheme = () => {
    try {
      const v = localStorage.getItem("theme");
      if (v === "dark" || v === "light") return v;
    } catch {
      // ignore
    }
    return null;
  };

  const applyInitialTheme = () => {
    const saved = getSavedTheme();
    const preferredDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved ?? (preferredDark ? "dark" : "light");
    setTheme(theme);
    if (themeToggle) themeToggle.checked = theme === "dark";
  };

  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      setTheme(themeToggle.checked ? "dark" : "light");
    });
  }
  applyInitialTheme();

  const form = document.getElementById("loan-form");
  const principalEl = document.getElementById("principal");
  const aprEl = document.getElementById("apr");
  const yearsEl = document.getElementById("years");
  const resetBtn = document.getElementById("reset");
  const exportBtn = document.getElementById("export-csv");

  let lastRows = [];
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.addEventListener("click", () => {
      if (!lastRows.length) return;
      const csv = toCsv(lastRows);
      downloadCsv("amortization-table.csv", csv);
    });
  }

  if (!form || !principalEl || !aprEl || !yearsEl || !resetBtn) {
    setError("Page error: missing fields. Refresh.");
    return;
  }

  resetBtn.addEventListener("click", () => {
    principalEl.value = "";
    aprEl.value = "";
    yearsEl.value = "";
    resetUI();
    lastRows = [];
    if (exportBtn) exportBtn.disabled = true;
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
    lastRows = rows;
    if (exportBtn) exportBtn.disabled = rows.length === 0;
  });
}

document.addEventListener("DOMContentLoaded", main);

