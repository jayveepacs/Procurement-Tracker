/* Secondary views: orders table, suppliers, deliveries, add form, settings */
'use strict';

const COLS = [
  ['pr', 'PR#'], ['po', 'PO#'], ['poDate', 'PO Date'], ['vendor', 'Vendor'],
  ['material', 'Material'], ['qty', 'Qty'], ['unit', 'Unit'], ['price', 'Price'],
  ['total', 'Total'], ['project', 'Project'], ['status', 'Status']
];
const DATE_KEYS = new Set(['poDate', 'prfDate', 'prfReceived', 'poDateNeeded', 'rfpDate', 'mrrDate', 'siDate', 'drDate']);

let ordersSearch = '';

function badge(status) {
  const cls = statusClass(status);
  const map = {
    served: 'bg-green-100 text-green-700',
    partial: 'bg-blue-100 text-blue-700',
    pending: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-700'
  };
  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[cls]}">${s(status) || 'Pending'}</span>`;
}

function renderOrders() {
  const views = document.getElementById('views');
  let rows = currentRows();
  const q = ordersSearch.toLowerCase();
  if (q) rows = rows.filter(r => [r.vendor, r.material, r.po, r.pr, r.project].some(v => s(v).toLowerCase().includes(q)));
  const shown = rows.slice(0, 500);

  const body = shown.map(r => `<tr class="border-t border-slate-100 hover:bg-slate-50">
    ${COLS.map(([k]) => {
      let v = r[k];
      if (DATE_KEYS.has(k)) v = excelDate(v);
      else if (k === 'total' || k === 'price') v = num(v) ? pesoFull(v) : '';
      else if (k === 'status') return `<td class="px-3 py-2">${badge(r.status)}</td>`;
      else v = s(v);
      const cls = (k === 'material' || k === 'vendor') ? 'max-w-[200px] truncate' : '';
      return `<td class="px-3 py-2 ${cls}" title="${s(r[k])}">${v}</td>`;
    }).join('')}
  </tr>`).join('');

  views.innerHTML = `
    <div class="card p-5">
      <div class="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div class="text-sm font-bold text-brand-dark uppercase tracking-wide">Purchase Orders <span class="text-slate-400 font-normal">(${rows.length.toLocaleString()} records${rows.length > 500 ? ', showing 500' : ''})</span></div>
        <input id="ordersSearch" value="${ordersSearch}" placeholder="Search vendor, material, PO#..." class="border border-slate-200 rounded-lg text-sm px-3 py-2 w-72" />
      </div>
      <div class="overflow-auto max-h-[70vh] border border-slate-100 rounded-lg">
        <table class="w-full text-xs">
          <thead class="bg-brand-pale text-brand-dark sticky top-0">
            <tr>${COLS.map(([, l]) => `<th class="px-3 py-2 text-left font-semibold">${l}</th>`).join('')}</tr>
          </thead>
          <tbody>${body || '<tr><td class="px-3 py-6 text-center text-slate-400" colspan="11">No records</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;

  const si = document.getElementById('ordersSearch');
  si.addEventListener('input', e => { ordersSearch = e.target.value; renderOrders(); si2focus(); });
  function si2focus() { const el = document.getElementById('ordersSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
}

function renderSuppliers() {
  const rows = currentRows();
  const m = computeMetrics(rows);
  const all = Object.entries(m.vendors).sort((a, b) => b[1] - a[1]);
  const counts = {};
  rows.forEach(r => { const v = s(r.vendor) || 'Unknown'; counts[v] = (counts[v] || 0) + 1; });
  const body = all.map(([name, val]) => `<tr class="border-t border-slate-100 hover:bg-slate-50">
    <td class="px-3 py-2 font-medium text-slate-700">${name}</td>
    <td class="px-3 py-2 text-right">${counts[name] || 0}</td>
    <td class="px-3 py-2 text-right font-semibold text-brand-dark">${pesoFull(val)}</td>
    <td class="px-3 py-2 text-right text-slate-400">${m.totalSpend ? (val / m.totalSpend * 100).toFixed(1) : 0}%</td>
  </tr>`).join('');
  document.getElementById('views').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      ${kpiCard('Total Suppliers', all.length, 'unique vendors', '👥', 'bg-brand-pale')}
      ${kpiCard('Total Spend', peso(m.totalSpend), 'across all suppliers', '💰', 'bg-brand-pale')}
      ${kpiCard('Avg Spend / Supplier', peso(all.length ? m.totalSpend / all.length : 0), '', '📊', 'bg-brand-pale')}
    </div>
    <div class="card p-5">
      <div class="text-sm font-bold text-brand-dark uppercase tracking-wide mb-4">All Suppliers by Spend</div>
      <div class="overflow-auto max-h-[65vh] border border-slate-100 rounded-lg">
        <table class="w-full text-xs">
          <thead class="bg-brand-pale text-brand-dark sticky top-0"><tr>
            <th class="px-3 py-2 text-left font-semibold">Supplier</th>
            <th class="px-3 py-2 text-right font-semibold">Line Items</th>
            <th class="px-3 py-2 text-right font-semibold">Total Spend</th>
            <th class="px-3 py-2 text-right font-semibold">% of Total</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;
}

function renderDeliveries() {
  const rows = currentRows();
  const m = computeMetrics(rows);
  const pending = rows.filter(r => statusClass(r.status) !== 'served').slice(0, 300);
  const body = pending.map(r => `<tr class="border-t border-slate-100 hover:bg-slate-50">
    <td class="px-3 py-2">${s(r.po)}</td>
    <td class="px-3 py-2 max-w-[200px] truncate" title="${s(r.vendor)}">${s(r.vendor)}</td>
    <td class="px-3 py-2 max-w-[220px] truncate" title="${s(r.material)}">${s(r.material)}</td>
    <td class="px-3 py-2">${excelDate(r.poDateNeeded)}</td>
    <td class="px-3 py-2">${num(r.leadTime) || '-'}</td>
    <td class="px-3 py-2">${badge(r.status)}</td>
  </tr>`).join('');
  document.getElementById('views').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      ${kpiCard('Served', m.served, 'delivered', '✅', 'bg-green-50')}
      ${kpiCard('Partial', m.partial, 'partial delivery', '📦', 'bg-blue-50')}
      ${kpiCard('Pending', m.pending, 'awaiting', '⏳', 'bg-amber-50')}
      ${kpiCard('Avg Lead Time', m.avgLead.toFixed(1) + ' d', 'supplier', '⏱️', 'bg-brand-pale')}
    </div>
    <div class="card p-5">
      <div class="text-sm font-bold text-brand-dark uppercase tracking-wide mb-4">Outstanding / Pending Deliveries <span class="text-slate-400 font-normal">(${pending.length})</span></div>
      <div class="overflow-auto max-h-[65vh] border border-slate-100 rounded-lg">
        <table class="w-full text-xs">
          <thead class="bg-brand-pale text-brand-dark sticky top-0"><tr>
            <th class="px-3 py-2 text-left font-semibold">PO#</th>
            <th class="px-3 py-2 text-left font-semibold">Vendor</th>
            <th class="px-3 py-2 text-left font-semibold">Material</th>
            <th class="px-3 py-2 text-left font-semibold">Date Needed</th>
            <th class="px-3 py-2 text-left font-semibold">Lead Time</th>
            <th class="px-3 py-2 text-left font-semibold">Status</th>
          </tr></thead>
          <tbody>${body || '<tr><td colspan="6" class="px-3 py-6 text-center text-slate-400">Nothing pending</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

const FORM_FIELDS = [
  ['pr', 'PR#'], ['po', 'PO#'], ['poDate', 'PO Date'], ['vendor', 'Vendor Name'],
  ['material', 'Material Description'], ['qty', 'Quantity'], ['unit', 'Unit'],
  ['price', 'Unit Price'], ['total', 'Total'], ['project', 'Project'],
  ['department', 'Department'], ['terms', 'Terms'], ['status', 'Status']
];

function renderAdd() {
  document.getElementById('views').innerHTML = `
    <div class="card p-6 max-w-3xl">
      <div class="text-sm font-bold text-brand-dark uppercase tracking-wide mb-1">Add Purchase Order Record</div>
      <p class="text-xs text-slate-400 mb-5">Manually input a record. It is added to the current dataset and saved in your browser.</p>
      <form id="addForm" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${FORM_FIELDS.map(([k, l]) => `
          <div>
            <label class="block text-xs font-medium text-slate-500 mb-1">${l}</label>
            <input name="${k}" ${k === 'poDate' ? 'type="date"' : ''} class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2" />
          </div>`).join('')}
        <div class="md:col-span-2 flex gap-3 pt-2">
          <button type="submit" class="bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg">Add Record</button>
          <button type="reset" class="border border-slate-200 text-slate-600 text-sm px-5 py-2.5 rounded-lg hover:bg-slate-50">Clear</button>
        </div>
      </form>
    </div>`;

  document.getElementById('addForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rec = {};
    FORM_FIELDS.forEach(([k]) => (rec[k] = s(fd.get(k))));
    // auto compute total if empty
    if (!num(rec.total) && num(rec.qty) && num(rec.price)) rec.total = num(rec.qty) * num(rec.price);
    if (!s(rec.po) && !s(rec.vendor) && !s(rec.material)) { toast('Please fill at least PO#, Vendor or Material'); return; }
    STATE.rows.push(rec);
    save();
    buildProjectFilter();
    toast('Record added. Total records: ' + STATE.rows.length);
    e.target.reset();
  });
}

function renderSettings() {
  document.getElementById('views').innerHTML = `
    <div class="card p-6 max-w-2xl space-y-5">
      <div>
        <div class="text-sm font-bold text-brand-dark uppercase tracking-wide mb-2">Dataset</div>
        <p class="text-xs text-slate-500">Source: <b>${STATE.source || 'manual / none'}</b></p>
        <p class="text-xs text-slate-500">Records loaded: <b>${STATE.rows.length.toLocaleString()}</b></p>
      </div>
      <div class="flex gap-3 flex-wrap">
        <label class="bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer">
          Import Excel<input id="fileInput3" type="file" accept=".xlsx,.xls" class="hidden" />
        </label>
        <button id="exportBtn2" class="border border-slate-200 text-slate-600 text-sm px-4 py-2 rounded-lg hover:bg-slate-50">Export to Excel</button>
        <button id="clearBtn" class="border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg hover:bg-red-50">Clear All Data</button>
      </div>
      <p class="text-[11px] text-slate-400">Data is stored only in your browser (localStorage). Nothing is uploaded to any server.</p>
    </div>`;
  document.getElementById('fileInput3').addEventListener('change', e => handleFile(e.target.files[0]));
  document.getElementById('exportBtn2').addEventListener('click', exportExcel);
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (confirm('Clear all loaded data? This cannot be undone.')) {
      STATE = { rows: [], source: '' }; save(); buildProjectFilter(); render(); toast('Data cleared');
    }
  });
}
