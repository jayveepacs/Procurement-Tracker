/* Metrics + rendering for Thaison Procurement Dashboard */
'use strict';

let CHARTS = {};
function destroyCharts() { Object.values(CHARTS).forEach(c => c && c.destroy()); CHARTS = {}; }

function currentRows() {
  const p = document.getElementById('projectFilter').value;
  if (!p) return STATE.rows;
  return STATE.rows.filter(r => s(r.project) === p);
}

function statusClass(status) {
  const t = s(status).toUpperCase();
  if (t.includes('SERVED') || t.includes('DONE') || t.includes('COMPLETE')) return 'served';
  if (t.includes('CANCEL')) return 'cancelled';
  if (t.includes('PARTIAL')) return 'partial';
  if (t === '') return 'pending';
  return 'pending';
}

function computeMetrics(rows) {
  const m = {
    lineItems: rows.length,
    pos: new Set(),
    prs: new Set(),
    totalSpend: 0,
    served: 0, pending: 0, partial: 0, cancelled: 0,
    prDone: 0, prPending: 0,
    leadTimes: [],
    vendors: {},
    projects: {},
    statuses: {},
    aging: { '0-7': 0, '8-14': 0, '15-30': 0, '31-60': 0, '61+': 0 },
    pendingPayments: 0, pendingInvoices: 0,
    emergency: 0
  };

  rows.forEach(r => {
    if (s(r.po)) m.pos.add(s(r.po));
    if (s(r.pr)) m.prs.add(s(r.pr));
    const total = num(r.total);
    m.totalSpend += total;

    const cls = statusClass(r.status);
    m[cls]++;

    const prS = s(r.prStatus).toUpperCase();
    if (prS.includes('DONE') || prS.includes('COMPLETE')) m.prDone++; else m.prPending++;

    const lt = num(r.leadTime);
    if (lt > 0) {
      m.leadTimes.push(lt);
      if (lt <= 7) m.aging['0-7']++;
      else if (lt <= 14) m.aging['8-14']++;
      else if (lt <= 30) m.aging['15-30']++;
      else if (lt <= 60) m.aging['31-60']++;
      else m.aging['61+']++;
    }

    const v = s(r.vendor) || 'Unknown';
    m.vendors[v] = (m.vendors[v] || 0) + total;

    const p = s(r.project) || 'Unspecified';
    m.projects[p] = (m.projects[p] || 0) + total;

    const st = s(r.status) || 'No Status';
    m.statuses[st] = (m.statuses[st] || 0) + 1;

    // pending payment = has invoice but not yet served, or no RFP
    if (cls !== 'served') { m.pendingPayments += total; m.pendingInvoices++; }

    if (lt > 0 && lt <= 3) m.emergency++;
  });

  m.avgLead = m.leadTimes.length ? (m.leadTimes.reduce((a, b) => a + b, 0) / m.leadTimes.length) : 0;
  m.topVendors = Object.entries(m.vendors).sort((a, b) => b[1] - a[1]).slice(0, 5);
  m.savings = m.totalSpend * 0.05; // estimated 5% negotiated savings indicator
  return m;
}

/* ---------- card helpers ---------- */
function kpiCard(title, value, sub, icon, iconBg) {
  return `<div class="card p-5">
    <div class="flex items-start justify-between">
      <div>
        <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-tight">${title}</div>
        <div class="text-3xl font-extrabold text-brand-dark mt-2">${value}</div>
        <div class="text-[11px] text-slate-400 mt-1">${sub || ''}</div>
      </div>
      <div class="w-11 h-11 rounded-full flex items-center justify-center text-xl ${iconBg}">${icon}</div>
    </div>
  </div>`;
}

function panel(title, bodyHtml, extra = '') {
  return `<div class="card p-5 ${extra}">
    <div class="text-sm font-bold text-brand-dark mb-4 uppercase tracking-wide">${title}</div>
    ${bodyHtml}
  </div>`;
}

/* ---------- dashboard view ---------- */
function renderDashboard() {
  const rows = currentRows();
  const m = computeMetrics(rows);
  const views = document.getElementById('views');

  views.innerHTML = `
    <!-- Row 1: KPIs -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      ${kpiCard('Total Purchase Orders', m.pos.size.toLocaleString(), m.lineItems.toLocaleString() + ' line items', '📄', 'bg-brand-pale')}
      ${kpiCard('Total Spend', peso(m.totalSpend), m.prs.size + ' purchase requests', '💰', 'bg-brand-pale')}
      ${kpiCard('Pending Orders', m.pending.toLocaleString(), 'awaiting delivery', '⏳', 'bg-orange-50')}
      ${kpiCard('Served / Completed', m.served.toLocaleString(), 'fully delivered', '✅', 'bg-green-50')}
    </div>

    <!-- Row 2: charts -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      ${panel('PO Aging Analysis (Lead Time)', '<canvas id="agingChart" height="200"></canvas>')}
      ${panel('Purchase Orders Overview', '<div class="relative"><canvas id="statusChart" height="200"></canvas></div>')}
      ${panel('Delivery Status', '<div id="deliveryBars" class="space-y-4 pt-2"></div>')}
    </div>

    <!-- Row 3: KPIs -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      ${kpiCard('Pending Payments', peso(m.pendingPayments), m.pendingInvoices + ' open items', '🧾', 'bg-brand-pale')}
      ${kpiCard('Avg Procurement Lead Time', m.avgLead.toFixed(1) + ' <span class="text-base">days</span>', 'supplier lead time', '⏱️', 'bg-brand-pale')}
      ${kpiCard('Rush / Emergency', m.emergency.toLocaleString(), '≤ 3 day lead time', '🚨', 'bg-red-50')}
      ${kpiCard('Est. Procurement Savings', peso(m.savings), '~5% negotiated', '📈', 'bg-green-50')}
    </div>

    <!-- Row 4 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      ${panel('Top Suppliers by Spend', topSuppliersTable(m))}
      ${panel('Spend by Project', '<canvas id="projectChart" height="220"></canvas>')}
      ${panel('Procurement Risk Status', riskPanel(m))}
    </div>

    <!-- Row 5: MRS/SRS received per month + per agent -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div class="lg:col-span-2">${panel('MRS/SRS Received per Month', '<canvas id="mrsMonthChart" height="120"></canvas>')}</div>
      ${panel('MRS/SRS Received per Agent', '<canvas id="mrsAgentChart" height="180"></canvas>')}
    </div>
  `;

  destroyCharts();
  drawAging(m);
  drawStatus(m);
  drawDelivery(m);
  drawProjects(m);
  drawMrsMonthly(rows);
  drawMrsByAgent(rows);
}

// Count distinct MRS/SRS numbers per purchasing agent.
function mrsPerAgent(rows) {
  const byAgent = {}; // agent -> Set of MRS/SRS numbers
  rows.forEach(r => {
    const agent = s(r.purchasingAgent) || 'Unassigned';
    (byAgent[agent] = byAgent[agent] || new Set()).add(s(r.pr) || ('row-' + (r._id || Math.random())));
  });
  return Object.entries(byAgent).map(([a, set]) => [a, set.size]).sort((x, y) => y[1] - x[1]);
}

function drawMrsByAgent(rows) {
  const ctx = document.getElementById('mrsAgentChart');
  if (!ctx) return;
  const data = mrsPerAgent(rows);
  if (!data.length) {
    ctx.parentElement.insertAdjacentHTML('beforeend', '<p class="text-sm text-slate-400 mt-2">No data yet.</p>');
    return;
  }
  CHARTS.mrsAgent = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d[0]),
      datasets: [{ label: 'MRS/SRS received', data: data.map(d => d[1]), backgroundColor: GREENS, borderRadius: 6, maxBarThickness: 46 }]
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x + ' MRS/SRS' } } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f4' } }, y: { grid: { display: false } } }
    }
  });
}

// Count distinct MRS/SRS numbers received per month (by MRS/SRS Date Received).
function mrsPerMonth(rows) {
  const byMonth = {}; // 'YYYY-MM' -> Set of MRS/SRS numbers (or synthetic keys)
  rows.forEach(r => {
    const d = excelDate(r.prfReceived); // -> 'YYYY-MM-DD' or '' 
    if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return;
    const key = d.slice(0, 7);
    (byMonth[key] = byMonth[key] || new Set()).add(s(r.pr) || ('row-' + (r._id || Math.random())));
  });
  return Object.keys(byMonth).sort().map(k => [k, byMonth[k].size]);
}

function monthLabel(ym) {
  const [y, mo] = ym.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[parseInt(mo, 10) - 1] + ' ' + y;
}

function drawMrsMonthly(rows) {
  const ctx = document.getElementById('mrsMonthChart');
  if (!ctx) return;
  const data = mrsPerMonth(rows);
  if (!data.length) {
    ctx.parentElement.insertAdjacentHTML('beforeend', '<p class="text-sm text-slate-400 mt-2">No MRS/SRS received dates available yet.</p>');
    return;
  }
  CHARTS.mrsMonth = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => monthLabel(d[0])),
      datasets: [{ label: 'MRS/SRS received', data: data.map(d => d[1]), backgroundColor: '#2e7d52', borderRadius: 6, maxBarThickness: 46 }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.y + ' MRS/SRS' } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f4' } }, x: { grid: { display: false } } }
    }
  });
}

function topSuppliersTable(m) {
  if (!m.topVendors.length) return '<p class="text-sm text-slate-400">No supplier data.</p>';
  const rows = m.topVendors.map(([name, val]) => {
    const pct = m.totalSpend ? (val / m.totalSpend * 100).toFixed(1) : 0;
    return `<tr class="border-t border-slate-100">
      <td class="py-2 pr-2 text-slate-700 truncate max-w-[150px]" title="${name}">${name}</td>
      <td class="py-2 px-2 text-right font-semibold text-brand-dark">${peso(val)}</td>
      <td class="py-2 pl-2 text-right text-slate-400">${pct}%</td>
    </tr>`;
  }).join('');
  return `<table class="w-full text-xs">
    <thead><tr class="text-slate-400 text-left">
      <th class="pb-1 font-medium">Supplier</th>
      <th class="pb-1 font-medium text-right">Total Spend</th>
      <th class="pb-1 font-medium text-right">% of Total</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

function riskPanel(m) {
  const openRatio = m.lineItems ? (m.pending + m.partial) / m.lineItems : 0;
  let level = 'LOW', color = 'text-green-600', deg = -60;
  if (openRatio > 0.6) { level = 'HIGH'; color = 'text-red-600'; deg = 60; }
  else if (openRatio > 0.3) { level = 'MEDIUM'; color = 'text-amber-500'; deg = 0; }
  return `<div class="flex flex-col items-center">
    <div class="relative w-40 h-20 overflow-hidden mb-2">
      <div class="absolute inset-0 rounded-t-full" style="background:conic-gradient(from 270deg,#22c55e 0deg 60deg,#eab308 60deg 120deg,#ef4444 120deg 180deg);"></div>
      <div class="absolute bg-white rounded-t-full" style="inset:14px 14px 0 14px;"></div>
      <div class="absolute left-1/2 bottom-0 w-1 h-16 bg-slate-700 origin-bottom rounded" style="transform:translateX(-50%) rotate(${deg}deg);"></div>
      <div class="absolute left-1/2 bottom-0 w-3 h-3 -ml-1.5 -mb-1.5 bg-slate-700 rounded-full"></div>
    </div>
    <div class="text-lg font-extrabold ${color}">${level} RISK</div>
    <div class="text-[11px] text-slate-400 mb-3">Based on open / pending ratio</div>
    <div class="w-full text-xs space-y-1">
      <div class="flex justify-between"><span class="text-slate-500">🟢 Served</span><span class="font-semibold">${m.served}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">🟡 Partial</span><span class="font-semibold">${m.partial}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">🔴 Pending</span><span class="font-semibold">${m.pending}</span></div>
      <div class="flex justify-between border-t border-slate-100 pt-1"><span class="text-slate-500">Total Items</span><span class="font-semibold">${m.lineItems}</span></div>
    </div>
  </div>`;
}

/* ---------- charts ---------- */
const GREENS = ['#1e4d3a', '#2e7d52', '#4caf7d', '#7cbf9a', '#a9d6bd', '#cfe8da'];

function drawAging(m) {
  const ctx = document.getElementById('agingChart');
  if (!ctx) return;
  CHARTS.aging = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(m.aging).map(k => k + ' days'),
      datasets: [{ label: 'POs', data: Object.values(m.aging), backgroundColor: '#2e7d52', borderRadius: 6, maxBarThickness: 42 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f4' } }, x: { grid: { display: false } } } }
  });
}

function drawStatus(m) {
  const ctx = document.getElementById('statusChart');
  if (!ctx) return;
  const entries = Object.entries(m.statuses).sort((a, b) => b[1] - a[1]).slice(0, 6);
  CHARTS.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: GREENS, borderWidth: 2, borderColor: '#fff' }]
    },
    options: { cutout: '62%', plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
  });
}

function drawDelivery(m) {
  const el = document.getElementById('deliveryBars');
  if (!el) return;
  const items = [
    ['Served / Delivered', m.served, '#1e4d3a'],
    ['Partial Deliveries', m.partial, '#4caf7d'],
    ['Pending', m.pending, '#f59e0b'],
    ['Cancelled', m.cancelled, '#ef4444']
  ];
  const max = Math.max(1, ...items.map(i => i[1]));
  el.innerHTML = items.map(([label, val, color]) => `
    <div>
      <div class="flex justify-between text-xs mb-1"><span class="text-slate-500">${label}</span><span class="font-bold text-brand-dark">${val}</span></div>
      <div class="h-3 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${(val / max * 100).toFixed(1)}%;background:${color}"></div></div>
    </div>`).join('');
}

function drawProjects(m) {
  const ctx = document.getElementById('projectChart');
  if (!ctx) return;
  const entries = Object.entries(m.projects).sort((a, b) => b[1] - a[1]).slice(0, 6);
  CHARTS.project = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(e => e[0]),
      datasets: [{ data: entries.map(e => e[1]), backgroundColor: '#4caf7d', borderRadius: 6, maxBarThickness: 30 }]
    },
    options: {
      indexAxis: 'y', plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, grid: { color: '#f1f5f4' }, ticks: { callback: v => peso(v) } }, y: { grid: { display: false } } }
    }
  });
}
