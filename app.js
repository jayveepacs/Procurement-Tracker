/* Thaison Procurement Dashboard - data logic */
'use strict';

// Header text -> internal key. Matching is done case-insensitively and trimmed.
const HEADER_MAP = {
  'ACTUAL PRF DATE': 'prfDate',
  'PRF DATE RECEIVED': 'prfReceived',
  'PR#': 'pr',
  'PR STATUS': 'prStatus',
  'PO DATE': 'poDate',
  'PR TO PO CONVERSION': 'prToPo',
  'REMARKS': 'remarks',
  'PO#': 'po',
  'PO DATE NEEDED': 'poDateNeeded',
  'FAXED/ EMAILED DATE': 'faxedDate',
  'SUPPLIER LEAD TIME': 'leadTime',
  'CHECK DUE DATE  (BASED ON ACTUAL DELIVERY DATE)': 'checkDue',
  'RFP #': 'rfp',
  'RFP DATE': 'rfpDate',
  'VENDOR CODE': 'vendorCode',
  'VENDOR NAME': 'vendor',
  'NAV CODE': 'navCode',
  'MATERIAL DESCRIPTION': 'material',
  'QTY': 'qty',
  'UNIT': 'unit',
  'PRICE': 'price',
  'TOTAL': 'total',
  'TERMS': 'terms',
  'PROJECT': 'project',
  'DEPARTMENT': 'department',
  'DELIVERY ADDRESS': 'deliveryAddress',
  'INVOICE TO': 'invoiceTo',
  'ACTUAL PRR  DATE RECEIVED': 'prrReceived',
  'ACTUAL MRR DATE RECEIVED': 'mrrReceived',
  'MRR#': 'mrr',
  'MRR DATE': 'mrrDate',
  'SI#': 'si',
  'SI DATE': 'siDate',
  'DR#': 'dr',
  'DR DATE': 'drDate',
  'PO TO DR': 'poToDr',
  'STATUS': 'status',
  'PAYMENT PROCESSING STATUS': 'paymentStatus',
  'PAYMENT DATE': 'paidDate',
  'NOTES': 'notes',
  'PURPOSE': 'purpose'
};

let STATE = { rows: [], source: '' };

/* ---------- utilities ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._to);
  t._to = setTimeout(() => (t.style.opacity = '0'), 2600);
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function peso(v) {
  const n = num(v);
  if (Math.abs(n) >= 1e6) return '₱ ' + (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '₱ ' + (n / 1e3).toFixed(1) + 'K';
  return '₱ ' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function pesoFull(v) {
  return '₱ ' + num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Excel serial date -> JS date string
function excelDate(v) {
  const n = num(v);
  if (!n || n < 20000 || n > 60000) return String(v ?? '');
  const d = new Date(Math.round((n - 25569) * 86400 * 1000));
  return d.toISOString().slice(0, 10);
}

function s(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

/* ---------- import ---------- */
function normalizeHeader(h) {
  return s(h).replace(/\s+/g, ' ').toUpperCase();
}

function parseWorkbook(data) {
  const wb = XLSX.read(data, { type: 'array' });
  // prefer sheet named ALI, else first
  const sheetName = wb.SheetNames.includes('ALI') ? 'ALI' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!aoa.length) return [];

  const headers = aoa[0].map(normalizeHeader);
  // build normalized lookup of HEADER_MAP
  const mapNorm = {};
  Object.keys(HEADER_MAP).forEach(k => (mapNorm[normalizeHeader(k)] = HEADER_MAP[k]));

  const rows = [];
  for (let i = 1; i < aoa.length; i++) {
    const raw = aoa[i];
    if (!raw || raw.every(c => s(c) === '')) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      const key = mapNorm[h];
      if (key && obj[key] === undefined) obj[key] = raw[idx];
    });
    // skip rows with no meaningful content (need at least a PO or vendor or material)
    if (!s(obj.po) && !s(obj.vendor) && !s(obj.material) && !s(obj.pr)) continue;
    rows.push(obj);
  }
  return rows;
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const rows = parseWorkbook(new Uint8Array(e.target.result));
      if (!rows.length) { toast('No rows found in file'); return; }
      toast('Importing ' + rows.length + ' records...');
      await DB.replaceAll(rows, file.name);
      STATE.rows = await DB.loadAll();
      STATE.source = file.name;
      buildProjectFilter();
      render();
      if (typeof logActivity === 'function') logActivity('Import', 'Imported ' + rows.length + ' records from ' + file.name);
      toast('Imported ' + STATE.rows.length + ' records from ' + file.name);
    } catch (err) {
      console.error(err);
      toast('Failed to import: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ---------- data operations (via DB repository) ---------- */
async function addRecord(rec) {
  const id = await DB.add(rec);
  rec._id = id;
  STATE.rows.push(rec);
  buildProjectFilter();
  render();
  if (typeof logActivity === 'function') logActivity('Add record', [rec.po, rec.vendor, rec.material].filter(Boolean).join(' | '));
}

async function updateRecord(id, patch) {
  await DB.update(id, patch);
  const rec = STATE.rows.find(r => r._id === id);
  if (rec) Object.assign(rec, patch);
  buildProjectFilter();
  render();
  if (typeof logActivity === 'function') logActivity('Edit record', [patch.po, patch.vendor, patch.material].filter(Boolean).join(' | '));
}

async function deleteRecord(id) {
  const rec = STATE.rows.find(r => r._id === id);
  await DB.remove(id);
  STATE.rows = STATE.rows.filter(r => r._id !== id);
  buildProjectFilter();
  render();
  if (typeof logActivity === 'function') logActivity('Delete record', rec ? [rec.po, rec.vendor, rec.material].filter(Boolean).join(' | ') : String(id));
}

// Admin check: in cloud mode requires admin role; in local (single-user) mode always true
function isAdminUser() {
  if (DB && DB.mode === 'cloud') return typeof CURRENT_USER !== 'undefined' && CURRENT_USER && CURRENT_USER.role === 'admin';
  return true;
}

async function boot() {
  STATE.rows = await DB.loadAll();
  buildProjectFilter();
  render();
}

/* ---------- project filter ---------- */
function buildProjectFilter() {
  const sel = document.getElementById('projectFilter');
  const prev = sel.value;
  const projects = [...new Set(STATE.rows.map(r => s(r.project)).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All Projects</option>' + projects.map(p => `<option value="${p}">${p}</option>`).join('');
  if (projects.includes(prev)) sel.value = prev;
}

/* ---------- export ---------- */
function exportExcel() {
  if (!STATE.rows.length) { toast('No data to export'); return; }
  const inv = {};
  Object.entries(HEADER_MAP).forEach(([label, key]) => (inv[key] = label));
  const data = STATE.rows.map(r => {
    const o = {};
    Object.keys(r).forEach(k => {
      if (k === '_id' || k === '_created') return; // internal fields
      o[inv[k] || k] = r[k];
    });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ALI');
  XLSX.writeFile(wb, 'Procurement_Export.xlsx');
  toast('Exported ' + data.length + ' records');
}

/* ---------- router ---------- */
let currentView = 'dashboard';
function render() {
  const has = STATE.rows.length > 0;
  document.getElementById('emptyState').classList.toggle('hidden', has);
  document.getElementById('views').classList.toggle('hidden', !has);
  if (!has) return;

  const map = {
    dashboard: renderDashboard,
    orders: renderOrders,
    suppliers: renderSuppliers,
    deliveries: renderDeliveries,
    payment: renderPayment,
    add: renderAdd,
    settings: renderSettings,
    admin: renderAdmin,
    log: renderLog
  };
  (map[currentView] || renderDashboard)();
}

// views that should render even with no data loaded
const NO_DATA_VIEWS = ['add', 'settings', 'admin', 'log'];

function setView(v) {
  currentView = v;
  $$('#nav .nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  if (NO_DATA_VIEWS.includes(v) && !STATE.rows.length) {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('views').classList.remove('hidden');
    ({ add: renderAdd, settings: renderSettings, admin: renderAdmin, log: renderLog })[v]();
    return;
  }
  render();
}

/* ---------- init ---------- */
function init() {
  $$('#nav .nav-item').forEach(a => a.addEventListener('click', () => setView(a.dataset.view)));

  ['fileInput', 'fileInput2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => handleFile(e.target.files[0]));
  });
  document.getElementById('projectFilter').addEventListener('change', render);
  document.getElementById('exportBtn').addEventListener('click', exportExcel);

  // Editable status / payment dropdowns (event delegation - #views persists across renders)
  document.getElementById('views').addEventListener('change', async e => {
    const statusSel = e.target.closest('.status-select');
    const paySel = e.target.closest('.payment-select');
    const sel = statusSel || paySel;
    if (!sel) return;
    const idx = parseInt(sel.dataset.idx, 10);
    if (isNaN(idx) || !STATE.rows[idx]) return;
    const rec = STATE.rows[idx];
    const field = statusSel ? 'status' : 'paymentStatus';
    const label = statusSel ? 'Status change' : 'Payment status change';
    const oldVal = rec[field] || '(none)';
    rec[field] = sel.value;
    const patch = { [field]: sel.value };
    // auto-stamp payment date when marked paid
    if (paySel) {
      const v = sel.value.toUpperCase();
      if ((v.includes('FULLY') || v.includes('PARTIAL')) && !s(rec.paidDate)) {
        rec.paidDate = new Date().toISOString().slice(0, 10);
        patch.paidDate = rec.paidDate;
      }
    }
    try { await DB.update(rec._id, patch); } catch (err) { toast('Save failed: ' + err.message); }
    render();
    if (typeof logActivity === 'function') logActivity(label, (rec.po || rec.pr || rec.material || 'record') + ': ' + oldVal + ' -> ' + (sel.value || '(none)'));
    toast('Updated');
  });

  // Edit / delete buttons in tables (event delegation)
  document.getElementById('views').addEventListener('click', async e => {
    const editBtn = e.target.closest('.row-edit');
    const delBtn = e.target.closest('.row-del');
    if (editBtn) { editRecord(editBtn.dataset.edit); return; }
    if (delBtn) {
      const id = delBtn.dataset.del;
      const rec = STATE.rows.find(r => r._id === id);
      const label = rec ? (rec.po || rec.vendor || rec.material || 'this record') : 'this record';
      if (confirm('Delete "' + label + '"? This cannot be undone.')) {
        try { await deleteRecord(id); toast('Record deleted'); }
        catch (err) { toast('Delete failed: ' + err.message); }
      }
    }
  });
  const addManual = document.getElementById('addManualBtn');
  if (addManual) addManual.addEventListener('click', () => setView('add'));
  const sampleBtn = document.getElementById('sampleDataBtn');
  if (sampleBtn) sampleBtn.addEventListener('click', () => loadSampleData());

  // Choose data source: Firebase cloud (with login + approval) or local browser storage
  if (typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED) {
    startAuth(boot);           // shows login; calls boot() once approved
  } else {
    DB = LocalDB;
    boot();
  }
}

document.addEventListener('DOMContentLoaded', init);
