/* Secondary views: orders table, suppliers, deliveries, add form, settings */
'use strict';

const COLS = [
  ['pr', 'PR#'], ['prfDate', 'MRS/SRS Date'], ['prfReceived', 'MRS/SRS Received'],
  ['po', 'PO#'], ['poDiscount', 'PO Discount'], ['poDate', 'PO Date'], ['vendor', 'Vendor'],
  ['material', 'Material'], ['qty', 'Qty'], ['unit', 'UOM'], ['price', 'Price'],
  ['total', 'Total'], ['deliveredQty', 'Delivered Qty'], ['deliveredUnit', 'Del. UOM'],
  ['balance', 'Balance to Deliver'],
  ['purchasingAgent', 'Purchasing Agent'],
  ['project', 'Project'], ['status', 'Status'], ['paymentStatus', 'Payment']
];
const DATE_KEYS = new Set(['poDate', 'prfDate', 'prfReceived', 'poDateNeeded', 'rfpDate', 'mrrDate', 'siDate', 'drDate', 'paidDate']);

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

const STATUS_OPTIONS = ['ON-GOING', 'FOR DELIVERY', 'PARTIAL', 'SERVED', 'CANCELLED'];
const PAYMENT_OPTIONS = ['Pending Payment', 'Partially Paid', 'Fully Paid', 'On Hold'];
const AGENT_OPTIONS = ['Nhowei', 'Mark', 'Russel'];

function paymentClass(v) {
  const t = s(v).toUpperCase();
  if (t.includes('FULLY')) return 'paid';
  if (t.includes('PARTIAL')) return 'partial';
  if (t.includes('HOLD')) return 'hold';
  return 'pending';
}

// Editable payment-status dropdown bound to a record's position in STATE.rows
function paymentSelect(record) {
  const idx = STATE.rows.indexOf(record);
  const cur = s(record.paymentStatus);
  const opts = [...PAYMENT_OPTIONS];
  if (cur && !opts.some(o => o.toUpperCase() === cur.toUpperCase())) opts.unshift(cur);
  const colorMap = {
    paid: 'text-green-700 bg-green-50 border-green-200',
    partial: 'text-blue-700 bg-blue-50 border-blue-200',
    hold: 'text-red-700 bg-red-50 border-red-200',
    pending: 'text-amber-700 bg-amber-50 border-amber-200'
  };
  const color = colorMap[paymentClass(cur)];
  return `<select data-idx="${idx}" class="payment-select text-[10px] font-semibold rounded-full px-2 py-1 border cursor-pointer outline-none ${color}">
    <option value="">— set —</option>
    ${opts.map(o => `<option value="${o}" ${o.toUpperCase() === cur.toUpperCase() ? 'selected' : ''}>${o}</option>`).join('')}
  </select>`;
}

// Editable status dropdown bound to a record's position in STATE.rows
function statusSelect(record) {
  const idx = STATE.rows.indexOf(record);
  const cur = s(record.status);
  const opts = [...STATUS_OPTIONS];
  if (cur && !opts.some(o => o.toUpperCase() === cur.toUpperCase())) opts.unshift(cur);
  const colorMap = {
    served: 'text-green-700 bg-green-50 border-green-200',
    partial: 'text-blue-700 bg-blue-50 border-blue-200',
    pending: 'text-amber-700 bg-amber-50 border-amber-200',
    cancelled: 'text-red-700 bg-red-50 border-red-200'
  };
  const color = colorMap[statusClass(cur)];
  return `<select data-idx="${idx}" class="status-select text-[10px] font-semibold rounded-full px-2 py-1 border cursor-pointer outline-none ${color}">
    ${opts.map(o => `<option value="${o}" ${o.toUpperCase() === cur.toUpperCase() ? 'selected' : ''}>${o}</option>`).join('')}
  </select>`;
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
      else if (k === 'status') return `<td class="px-3 py-2">${statusSelect(r)}</td>`;
      else if (k === 'paymentStatus') return `<td class="px-3 py-2">${paymentSelect(r)}</td>`;
      else if (k === 'balance') v = (s(r.balance) !== '' && r.balance != null) ? r.balance : (num(r.qty) ? num(r.qty) - num(r.deliveredQty) : '');
      else v = s(v);
      const cls = (k === 'material' || k === 'vendor') ? 'max-w-[200px] truncate' : '';
      return `<td class="px-3 py-2 ${cls}" title="${s(r[k])}">${v}</td>`;
    }).join('')}
    <td class="px-3 py-2 whitespace-nowrap text-right">
      <button data-del="${r._id}" title="Delete" class="row-del text-red-500 hover:text-red-700 px-1.5">🗑️</button>
    </td>
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
            <tr>${COLS.map(([, l]) => `<th class="px-3 py-2 text-left font-semibold">${l}</th>`).join('')}<th class="px-3 py-2 text-right font-semibold">Actions</th></tr>
          </thead>
          <tbody>${body || '<tr><td class="px-3 py-6 text-center text-slate-400" colspan="20">No records</td></tr>'}</tbody>
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
    <td class="px-3 py-2">${statusSelect(r)}</td>
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

function paymentPill(v) {
  const map = { paid: 'bg-green-100 text-green-700', partial: 'bg-blue-100 text-blue-700', hold: 'bg-red-100 text-red-700', pending: 'bg-amber-100 text-amber-700' };
  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[paymentClass(v)]}">${s(v) || 'Pending Payment'}</span>`;
}

function renderPayment() {
  const rows = currentRows();
  // paid = fully or partially paid
  const paid = rows.filter(r => { const c = paymentClass(r.paymentStatus); return c === 'paid' || c === 'partial'; });
  const fully = rows.filter(r => paymentClass(r.paymentStatus) === 'paid');
  const partial = rows.filter(r => paymentClass(r.paymentStatus) === 'partial');
  const onHold = rows.filter(r => paymentClass(r.paymentStatus) === 'hold');
  const pending = rows.filter(r => paymentClass(r.paymentStatus) === 'pending');

  const paidAmount = fully.reduce((a, r) => a + num(r.total), 0);
  const partialAmount = partial.reduce((a, r) => a + num(r.total), 0);
  const outstanding = pending.concat(onHold).reduce((a, r) => a + num(r.total), 0);

  // sort paid records by payment date (most recent first)
  const sorted = [...paid].sort((a, b) => (excelDate(b.paidDate) || '').localeCompare(excelDate(a.paidDate) || ''));

  const body = sorted.map(r => `<tr class="border-t border-slate-100 hover:bg-slate-50">
    <td class="px-3 py-2">${excelDate(r.paidDate) || '<span class="text-slate-300">—</span>'}</td>
    <td class="px-3 py-2">${s(r.po)}</td>
    <td class="px-3 py-2 max-w-[180px] truncate" title="${s(r.vendor)}">${s(r.vendor)}</td>
    <td class="px-3 py-2 max-w-[200px] truncate" title="${s(r.material)}">${s(r.material)}</td>
    <td class="px-3 py-2 text-right font-semibold text-brand-dark">${num(r.total) ? pesoFull(r.total) : ''}</td>
    <td class="px-3 py-2">${paymentPill(r.paymentStatus)}</td>
    <td class="px-3 py-2">${s(r.project)}</td>
  </tr>`).join('');

  document.getElementById('views').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-4 gap-5">
      ${kpiCard('Fully Paid', fully.length, peso(paidAmount), '✅', 'bg-green-50')}
      ${kpiCard('Partially Paid', partial.length, peso(partialAmount), '🧾', 'bg-blue-50')}
      ${kpiCard('Pending Payment', pending.length, '', '⏳', 'bg-amber-50')}
      ${kpiCard('On Hold', onHold.length, peso(outstanding) + ' outstanding', '⛔', 'bg-red-50')}
    </div>
    <div class="card p-5">
      <div class="text-sm font-bold text-brand-dark uppercase tracking-wide mb-4">Payment Monitoring <span class="text-slate-400 font-normal">(${paid.length} paid / partially paid)</span></div>
      <div class="overflow-auto max-h-[65vh] border border-slate-100 rounded-lg">
        <table class="w-full text-xs">
          <thead class="bg-brand-pale text-brand-dark sticky top-0"><tr>
            <th class="px-3 py-2 text-left font-semibold">Payment Date</th>
            <th class="px-3 py-2 text-left font-semibold">PO#</th>
            <th class="px-3 py-2 text-left font-semibold">Vendor</th>
            <th class="px-3 py-2 text-left font-semibold">Material</th>
            <th class="px-3 py-2 text-right font-semibold">Amount</th>
            <th class="px-3 py-2 text-left font-semibold">Payment Status</th>
            <th class="px-3 py-2 text-left font-semibold">Project</th>
          </tr></thead>
          <tbody>${body || '<tr><td colspan="7" class="px-3 py-6 text-center text-slate-400">No payments recorded yet. Mark records as paid in the Purchase Orders table.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
}

function renderSettings() {
  const mode = DB && DB.mode === 'cloud' ? 'Cloud (Firebase - shared)' : 'Local (this browser only)';
  const who = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER) ? `${CURRENT_USER.email} (${CURRENT_USER.role})` : 'not signed in';
  document.getElementById('views').innerHTML = `
    <div class="card p-6 max-w-2xl space-y-5">
      <div>
        <div class="text-sm font-bold text-brand-dark uppercase tracking-wide mb-2">Dataset</div>
        <p class="text-xs text-slate-500">Storage mode: <b>${mode}</b></p>
        <p class="text-xs text-slate-500">Signed in as: <b>${who}</b></p>
        <p class="text-xs text-slate-500">Source: <b>${STATE.source || 'manual / none'}</b></p>
        <p class="text-xs text-slate-500">Records loaded: <b>${STATE.rows.length.toLocaleString()}</b></p>
      </div>
      <div class="flex gap-3 flex-wrap">
        <label class="bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer">
          Import Excel<input id="fileInput3" type="file" accept=".xlsx,.xls" class="hidden" />
        </label>
        <button id="exportBtn2" class="border border-slate-200 text-slate-600 text-sm px-4 py-2 rounded-lg hover:bg-slate-50">Export to Excel</button>
        <button id="sampleBtn" class="border border-brand text-brand text-sm px-4 py-2 rounded-lg hover:bg-brand-pale">Load Sample Data</button>
        ${isAdminUser() ? '<button id="clearBtn" class="border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg hover:bg-red-50">Clear All Data</button>' : ''}
      </div>
      ${isAdminUser() ? '' : '<p class="text-[11px] text-slate-400">Only administrators can clear all data.</p>'}
      <p class="text-[11px] text-slate-400">Local mode keeps data in this browser only. Cloud mode (Firebase) shares data across your approved team.</p>
    </div>`;
  document.getElementById('fileInput3').addEventListener('change', e => handleFile(e.target.files[0]));
  document.getElementById('exportBtn2').addEventListener('click', exportExcel);
  document.getElementById('sampleBtn').addEventListener('click', loadSampleData);
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) clearBtn.addEventListener('click', async () => {
    if (confirm('Clear all data? This cannot be undone.')) {
      await DB.clear(); STATE.rows = []; STATE.source = ''; buildProjectFilter(); render();
      if (typeof logActivity === 'function') logActivity('Clear data', 'All purchase order records cleared');
      toast('Data cleared');
    }
  });
}


/* ===== Manual multi-row (spreadsheet-style) data entry ===== */
const ENTRY_HEADER_FIELDS = [
  ['pr', 'MRS/SRS Number'], ['prfDate', 'MRS/SRS Date'], ['prfReceived', 'MRS/SRS Date Received'],
  ['po', 'PO#'], ['poDiscount', 'PO Discount'], ['poDate', 'PO Date'], ['vendor', 'Vendor Name'],
  ['project', 'Project'], ['scope', 'Scope'], ['terms', 'Terms'],
  ['purchasingAgent', 'Purchasing Agent'],
  ['status', 'Status'], ['paymentStatus', 'Payment Processing Status'], ['paidDate', 'Payment Date'],
  ['rfp', 'RFP#'],
  ['remarks', 'Remarks']
];
const GRID_COLS = [
  ['material', 'Material Description'], ['qty', 'QTY'], ['unit', 'UOM'],
  ['price', 'Price'], ['total', 'Total Price'], ['deliveredQty', 'PO Delivered Qty'], ['deliveredUnit', 'UOM'],
  ['balance', 'Balance to Deliver']
];

function gridRowHtml() {
  const inp = (n, w, ex, ph) => `<input name="${n}" placeholder="${ph || ''}" class="${ex || ''} ${w} border border-slate-200 rounded px-2 py-1.5 text-sm" />`;
  return `<tr class="grid-row border-t border-slate-100">
    <td class="p-1">${inp('material', 'w-full min-w-[200px]', '', 'Material description')}</td>
    <td class="p-1">${inp('qty', 'w-16', 'grid-calc text-right')}</td>
    <td class="p-1">${inp('unit', 'w-16', '', 'UOM')}</td>
    <td class="p-1">${inp('price', 'w-24', 'grid-calc text-right')}</td>
    <td class="p-1">${inp('total', 'w-28', 'grid-total text-right bg-slate-50', 'auto')}</td>
    <td class="p-1">${inp('deliveredQty', 'w-24', 'grid-calc text-right')}</td>
    <td class="p-1">${inp('deliveredUnit', 'w-16', '', 'UOM')}</td>
    <td class="p-1">${inp('balance', 'w-24', 'grid-balance text-right bg-slate-50', 'auto')}</td>
    <td class="p-1 text-center"><button type="button" class="grid-del text-red-500 hover:text-red-700 px-2 text-base" title="Remove row">✕</button></td>
  </tr>`;
}

function renderAdd() {
  const rows = [gridRowHtml(), gridRowHtml(), gridRowHtml()].join('');
  document.getElementById('views').innerHTML = `
    <div class="card p-6">
      <div class="text-sm font-bold text-brand-dark uppercase tracking-wide mb-1">Add / Input Data</div>
      <p class="text-xs text-slate-400 mb-5">Enter the shared PO details once, then add one or more material line items in the grid below. Any approved user can input multiple records at once.</p>
      <form id="entryForm">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        ${ENTRY_HEADER_FIELDS.map(([k, l]) => {
          let f;
          if (k === 'status') f = `<select name="${k}" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white">${STATUS_OPTIONS.map(o => `<option>${o}</option>`).join('')}</select>`;
          else if (k === 'paymentStatus') f = `<select name="${k}" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white"><option value="">— select —</option>${PAYMENT_OPTIONS.map(o => `<option>${o}</option>`).join('')}</select>`;
          else if (k === 'purchasingAgent') f = `<select name="${k}" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2 bg-white"><option value="">— select —</option>${AGENT_OPTIONS.map(o => `<option>${o}</option>`).join('')}</select>`;
          else if (k === 'remarks') f = `<textarea name="${k}" rows="2" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2"></textarea>`;
          else if (DATE_KEYS.has(k)) f = `<input name="${k}" type="date" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2" />`;
          else f = `<input name="${k}" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2" />`;
          return `<div class="${k === 'remarks' ? 'md:col-span-3' : ''}"><label class="block text-xs font-medium text-slate-500 mb-1">${l}</label>${f}</div>`;
        }).join('')}
        </div>
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs font-bold text-brand-dark uppercase tracking-wide">Material Line Items</div>
          <button type="button" id="addRowBtn" class="bg-brand-pale text-brand-dark text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-brand hover:text-white">+ Add Row</button>
        </div>
        <div class="overflow-auto border border-slate-100 rounded-lg">
          <table class="w-full text-xs">
            <thead class="bg-brand-pale text-brand-dark"><tr>
              ${GRID_COLS.map(([, l]) => `<th class="px-2 py-2 text-left font-semibold">${l}</th>`).join('')}<th class="px-2 py-2"></th>
            </tr></thead>
            <tbody id="gridBody">${rows}</tbody>
          </table>
        </div>
        <div class="flex gap-3 pt-5">
          <button type="submit" class="bg-brand hover:bg-brand-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg">Save All Records</button>
          <button type="button" id="clearGridBtn" class="border border-slate-200 text-slate-600 text-sm px-5 py-2.5 rounded-lg hover:bg-slate-50">Clear</button>
        </div>
      </form>
    </div>`;

  const form = document.getElementById('entryForm');
  document.getElementById('addRowBtn').addEventListener('click', () => {
    document.getElementById('gridBody').insertAdjacentHTML('beforeend', gridRowHtml());
  });
  form.addEventListener('click', e => {
    const d = e.target.closest('.grid-del');
    if (!d) return;
    if (form.querySelectorAll('.grid-row').length > 1) d.closest('.grid-row').remove();
    else toast('At least one row is required');
  });
  form.addEventListener('input', e => {
    if (!e.target.classList.contains('grid-calc')) return;
    const r = e.target.closest('.grid-row');
    const q = num(r.querySelector('[name="qty"]').value);
    const p = num(r.querySelector('[name="price"]').value);
    const d = num(r.querySelector('[name="deliveredQty"]').value);
    if (q && p) r.querySelector('.grid-total').value = (q * p).toFixed(2);
    r.querySelector('.grid-balance').value = (q - d);
  });
  document.getElementById('clearGridBtn').addEventListener('click', () => renderAdd());

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const header = {};
    ENTRY_HEADER_FIELDS.forEach(([k]) => (header[k] = s(form.elements[k].value)));
    const recs = [];
    form.querySelectorAll('.grid-row').forEach(tr => {
      const line = {};
      GRID_COLS.forEach(([k]) => (line[k] = s(tr.querySelector(`[name="${k}"]`).value)));
      if (!s(line.material) && !num(line.qty) && !num(line.price)) return; // skip blank rows
      if (!num(line.total) && num(line.qty) && num(line.price)) line.total = num(line.qty) * num(line.price);
      if (s(line.balance) === '' && num(line.qty)) line.balance = num(line.qty) - num(line.deliveredQty);
      recs.push(Object.assign({}, header, line));
    });
    if (!recs.length) { toast('Add at least one line item (material, qty or price)'); return; }
    try {
      await addRecords(recs);
      toast('Saved ' + recs.length + ' record(s). Total: ' + STATE.rows.length);
      renderAdd();
    } catch (err) { toast('Failed: ' + err.message); }
  });
}
