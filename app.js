/* Thaison Procurement Dashboard - data logic */
'use strict';

const STORAGE_KEY = 'thaison_po_data_v1';

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
  reader.onload = e => {
    try {
      const rows = parseWorkbook(new Uint8Array(e.target.result));
      if (!rows.length) { toast('No rows found in file'); return; }
      STATE.rows = rows;
      STATE.source = file.name;
      save();
      buildProjectFilter();
      render();
      toast('Imported ' + rows.length + ' records from ' + file.name);
    } catch (err) {
      console.error(err);
      toast('Failed to read file: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ---------- persistence ---------- */
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE)); } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) STATE = JSON.parse(raw);
  } catch (e) {}
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
    Object.keys(r).forEach(k => (o[inv[k] || k] = r[k]));
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
    add: renderAdd,
    settings: renderSettings
  };
  (map[currentView] || renderDashboard)();
}

function setView(v) {
  currentView = v;
  $$('#nav .nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  // add + settings should show even with no data
  if ((v === 'add' || v === 'settings') && !STATE.rows.length) {
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('views').classList.remove('hidden');
    (v === 'add' ? renderAdd : renderSettings)();
    return;
  }
  render();
}

/* ---------- init ---------- */
function init() {
  load();
  buildProjectFilter();

  $$('#nav .nav-item').forEach(a => a.addEventListener('click', () => setView(a.dataset.view)));

  ['fileInput', 'fileInput2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => handleFile(e.target.files[0]));
  });
  document.getElementById('projectFilter').addEventListener('change', render);
  document.getElementById('exportBtn').addEventListener('click', exportExcel);
  const addManual = document.getElementById('addManualBtn');
  if (addManual) addManual.addEventListener('click', () => setView('add'));

  render();
}

document.addEventListener('DOMContentLoaded', init);
