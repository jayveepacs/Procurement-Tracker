/* ============================================================
   Auth + cloud data layer (Firebase) with admin-approval gate.
   Falls back to local (browser-only) storage when Firebase
   is not configured, so the UI works for testing.
   ============================================================ */
'use strict';

let DB = null;          // active data repository (Local or Cloud)
let CURRENT_USER = null; // { uid, email, role, status }
let fbAuth = null, fbDb = null;

/* ---------- LOCAL data repository (localStorage) ---------- */
const LOCAL_KEY = 'thaison_po_data_v1';
let _localSeq = 1;

const LocalDB = {
  mode: 'local',
  _read() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { rows: [], source: '' }; }
    catch (e) { return { rows: [], source: '' }; }
  },
  _write(store) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(store)); } catch (e) {} },
  async loadAll() {
    const store = this._read();
    (store.rows || []).forEach(r => { if (!r._id) r._id = 'L' + (_localSeq++); });
    this._write(store);
    STATE.source = store.source || '';
    return store.rows || [];
  },
  async replaceAll(rows, source) {
    rows.forEach(r => (r._id = 'L' + (_localSeq++)));
    this._write({ rows, source: source || '' });
  },
  async add(row) {
    const store = this._read();
    row._id = 'L' + Date.now() + Math.floor(Math.random() * 1000);
    store.rows.push(row);
    this._write(store);
    return row._id;
  },
  async update(id, patch) {
    const store = this._read();
    const r = store.rows.find(x => x._id === id);
    if (r) Object.assign(r, patch);
    this._write(store);
  },
  async clear() { this._write({ rows: [], source: '' }); }
};

/* ---------- CLOUD data repository (Firestore) ---------- */
const CloudDB = {
  mode: 'cloud',
  col() { return fbDb.collection('purchase_orders'); },
  async loadAll() {
    const snap = await this.col().orderBy('_created', 'desc').get().catch(async () => await this.col().get());
    const rows = [];
    snap.forEach(doc => rows.push(Object.assign({ _id: doc.id }, doc.data())));
    return rows;
  },
  async replaceAll(rows, source) {
    await this.clear();
    // batched writes (max 500 per batch)
    for (let i = 0; i < rows.length; i += 400) {
      const batch = fbDb.batch();
      rows.slice(i, i + 400).forEach(r => {
        const ref = this.col().doc();
        batch.set(ref, Object.assign({}, r, { _created: Date.now() }));
      });
      await batch.commit();
    }
  },
  async add(row) {
    const ref = await this.col().add(Object.assign({}, row, { _created: Date.now() }));
    return ref.id;
  },
  async update(id, patch) { await this.col().doc(id).update(patch); },
  async clear() {
    const snap = await this.col().get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = fbDb.batch();
      snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
};

/* ---------- Auth gate UI ---------- */
function authGateEl() {
  let el = document.getElementById('authGate');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'authGate';
  el.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
  el.style.background = 'linear-gradient(135deg,#1e4d3a 0%,#2e7d52 100%)';
  document.body.appendChild(el);
  return el;
}

function hideAuthGate() {
  const el = document.getElementById('authGate');
  if (el) el.remove();
}

function showLogin(mode) {
  const isReg = mode === 'register';
  const el = authGateEl();
  el.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
      <div class="flex items-center gap-2 mb-6">
        <div class="bg-brand-dark text-white font-extrabold rounded-md w-9 h-9 flex items-center justify-center text-lg">T</div>
        <div><div class="font-extrabold text-brand-dark leading-none">THAISON</div>
        <div class="text-[9px] tracking-[.2em] text-brand">PROCUREMENT TRACKER</div></div>
      </div>
      <h2 class="text-lg font-bold text-brand-dark mb-1">${isReg ? 'Create an account' : 'Sign in'}</h2>
      <p class="text-xs text-slate-400 mb-5">${isReg ? 'New accounts require admin approval before access.' : 'Enter your credentials to continue.'}</p>
      <form id="authForm" class="space-y-3">
        ${isReg ? `<input name="name" placeholder="Full name" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2.5" />` : ''}
        <input name="email" type="email" required placeholder="Email" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2.5" />
        <input name="password" type="password" required minlength="6" placeholder="Password (min 6 chars)" class="w-full border border-slate-200 rounded-lg text-sm px-3 py-2.5" />
        <div id="authErr" class="text-xs text-red-600 hidden"></div>
        <button class="w-full bg-brand hover:bg-brand-dark text-white text-sm font-semibold py-2.5 rounded-lg">${isReg ? 'Register' : 'Sign in'}</button>
      </form>
      <div class="text-xs text-slate-500 mt-4 text-center">
        ${isReg ? 'Already have an account?' : "Don't have an account?"}
        <a id="authSwitch" class="text-brand font-semibold cursor-pointer">${isReg ? 'Sign in' : 'Register'}</a>
      </div>
    </div>`;
  document.getElementById('authSwitch').onclick = () => showLogin(isReg ? 'login' : 'register');
  document.getElementById('authForm').onsubmit = e => { e.preventDefault(); doAuth(isReg, new FormData(e.target)); };
}

function authError(msg) {
  const e = document.getElementById('authErr');
  if (e) { e.textContent = msg; e.classList.remove('hidden'); }
}

async function doAuth(isReg, fd) {
  const email = String(fd.get('email')).trim();
  const password = String(fd.get('password'));
  const name = String(fd.get('name') || '').trim();
  try {
    if (isReg) {
      const cred = await fbAuth.createUserWithEmailAndPassword(email, password);
      // create pending profile
      await fbDb.collection('users').doc(cred.user.uid).set({
        email, displayName: name, status: 'pending', role: 'member', createdAt: Date.now()
      });
      // onAuthStateChanged will route to the pending screen
    } else {
      await fbAuth.signInWithEmailAndPassword(email, password);
    }
  } catch (err) {
    authError(err.message || 'Authentication failed');
  }
}

function showPending() {
  const el = authGateEl();
  el.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
      <div class="text-5xl mb-4">⏳</div>
      <h2 class="text-lg font-bold text-brand-dark mb-2">Waiting for approval</h2>
      <p class="text-sm text-slate-500 mb-6">Your account has been created and is pending admin approval. You'll get access once an administrator approves it.</p>
      <button id="pendingSignout" class="border border-slate-200 text-slate-600 text-sm px-5 py-2.5 rounded-lg hover:bg-slate-50">Sign out</button>
    </div>`;
  document.getElementById('pendingSignout').onclick = () => fbAuth.signOut();
}

/* ---------- Auth bootstrap ---------- */
function startAuth(onApproved) {
  firebase.initializeApp(FIREBASE_CONFIG);
  fbAuth = firebase.auth();
  fbDb = firebase.firestore();
  DB = CloudDB;

  fbAuth.onAuthStateChanged(async user => {
    if (!user) { CURRENT_USER = null; showLogin('login'); return; }
    // fetch profile
    let profile;
    try {
      const doc = await fbDb.collection('users').doc(user.uid).get();
      profile = doc.exists ? doc.data() : null;
    } catch (e) { profile = null; }

    if (!profile) {
      // profile missing (e.g. created outside flow) -> create pending
      await fbDb.collection('users').doc(user.uid).set({
        email: user.email, displayName: '', status: 'pending', role: 'member', createdAt: Date.now()
      });
      showPending();
      return;
    }
    CURRENT_USER = Object.assign({ uid: user.uid }, profile);
    if (profile.status !== 'approved') { showPending(); return; }

    hideAuthGate();
    setupUserChrome();
    onApproved();
  });
}

// Show who's logged in + sign out + admin nav (only for admins)
function setupUserChrome() {
  // sign-out button in top bar
  if (!document.getElementById('signOutBtn')) {
    const bar = document.querySelector('header .flex.items-end');
    if (bar) {
      const btn = document.createElement('button');
      btn.id = 'signOutBtn';
      btn.className = 'border border-slate-200 text-slate-600 text-sm font-semibold px-3 py-2 rounded-lg hover:bg-slate-50';
      btn.textContent = 'Sign out';
      btn.onclick = () => fbAuth.signOut();
      bar.appendChild(btn);
    }
  }
  // admin nav item
  if (CURRENT_USER && CURRENT_USER.role === 'admin' && !document.querySelector('[data-view="admin"]')) {
    const nav = document.getElementById('nav');
    const a = document.createElement('a');
    a.dataset.view = 'admin';
    a.className = 'nav-item flex items-center gap-3 px-5 py-3 cursor-pointer';
    a.innerHTML = '🛡️ <span>Admin</span>';
    a.addEventListener('click', () => setView('admin'));
    nav.appendChild(a);
  }
}

/* ---------- Admin panel: approve users ---------- */
async function renderAdmin() {
  const views = document.getElementById('views');
  views.innerHTML = `<div class="card p-5"><div class="text-sm font-bold text-brand-dark uppercase tracking-wide mb-4">User Access Management</div><div id="adminList" class="text-sm text-slate-400">Loading users...</div></div>`;
  if (!fbDb) { document.getElementById('adminList').textContent = 'Admin panel requires Firebase (cloud mode).'; return; }
  let users = [];
  try {
    const snap = await fbDb.collection('users').get();
    snap.forEach(d => users.push(Object.assign({ uid: d.id }, d.data())));
  } catch (e) {
    document.getElementById('adminList').textContent = 'Could not load users: ' + e.message;
    return;
  }
  users.sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1));
  drawAdminList(users);
}

function statusPill(st) {
  const m = { approved: 'bg-green-100 text-green-700', pending: 'bg-amber-100 text-amber-700', rejected: 'bg-red-100 text-red-700' };
  return `<span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${m[st] || 'bg-slate-100 text-slate-600'}">${st}</span>`;
}

function drawAdminList(users) {
  const body = users.map(u => {
    const isSelf = CURRENT_USER && u.uid === CURRENT_USER.uid;
    return `<tr class="border-t border-slate-100">
      <td class="px-3 py-2">${u.displayName || '-'}</td>
      <td class="px-3 py-2">${u.email || ''}</td>
      <td class="px-3 py-2">${u.role || 'member'}</td>
      <td class="px-3 py-2">${statusPill(u.status)}</td>
      <td class="px-3 py-2 text-right space-x-1">
        ${u.status !== 'approved' ? `<button data-act="approve" data-uid="${u.uid}" class="admin-act bg-brand hover:bg-brand-dark text-white text-[11px] px-2.5 py-1 rounded">Approve</button>` : ''}
        ${u.status !== 'rejected' && !isSelf ? `<button data-act="reject" data-uid="${u.uid}" class="admin-act border border-red-200 text-red-600 text-[11px] px-2.5 py-1 rounded hover:bg-red-50">Reject</button>` : ''}
        ${u.role !== 'admin' && u.status === 'approved' ? `<button data-act="makeAdmin" data-uid="${u.uid}" class="admin-act border border-slate-200 text-slate-600 text-[11px] px-2.5 py-1 rounded hover:bg-slate-50">Make admin</button>` : ''}
      </td>
    </tr>`;
  }).join('');
  document.getElementById('adminList').outerHTML = `
    <div id="adminList" class="overflow-auto border border-slate-100 rounded-lg">
      <table class="w-full text-xs">
        <thead class="bg-brand-pale text-brand-dark"><tr>
          <th class="px-3 py-2 text-left font-semibold">Name</th>
          <th class="px-3 py-2 text-left font-semibold">Email</th>
          <th class="px-3 py-2 text-left font-semibold">Role</th>
          <th class="px-3 py-2 text-left font-semibold">Status</th>
          <th class="px-3 py-2 text-right font-semibold">Actions</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  document.querySelectorAll('.admin-act').forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.dataset.uid, act = btn.dataset.act;
      const patch = act === 'approve' ? { status: 'approved' }
        : act === 'reject' ? { status: 'rejected' }
        : { role: 'admin', status: 'approved' };
      try { await fbDb.collection('users').doc(uid).update(patch); toast('User updated'); renderAdmin(); }
      catch (e) { toast('Failed: ' + e.message); }
    };
  });
}

/* ---------- Sample testing data ---------- */
function sampleData() {
  const vendors = ['HI-SAFETY INDUSTRIAL SUPPLIES INC', 'ST. JOAN PHARMACY', 'ABC CONSTRUCTION SUPPLY', 'PRIME STEEL CORP.', '588 ALUMINUM AND GLASS SUPPLY', 'METRO ELECTRICAL SUPPLY'];
  const projects = ['ACML', 'CSJ TOWER', 'LEGASPI SITE', 'MAKATI HQ'];
  const materials = ['SAFETY SHOES', 'PVC PIPE 4"', 'PORTLAND CEMENT', 'REBAR 10mm', 'ELECTRICAL WIRE THHN', 'SLIDING WINDOW', 'PARACETAMOL', 'GRASS CUTTER'];
  const units = ['Piece', 'Bag', 'Length', 'Roll', 'Set'];
  const statuses = ['ON-GOING', 'FOR DELIVERY', 'PARTIAL', 'SERVED', 'CANCELLED'];
  const rows = [];
  for (let i = 1; i <= 40; i++) {
    const qty = Math.ceil(Math.random() * 50);
    const price = Math.round((Math.random() * 5000 + 100) * 100) / 100;
    rows.push({
      pr: 'MRS-' + (1000 + i),
      po: '' + (1800 + i),
      vendor: vendors[i % vendors.length],
      material: materials[i % materials.length],
      qty, unit: units[i % units.length], price, total: qty * price,
      project: projects[i % projects.length],
      leadTime: Math.ceil(Math.random() * 70),
      status: statuses[Math.floor(Math.random() * statuses.length)],
      department: 'PURCHASING'
    });
  }
  return rows;
}

async function loadSampleData() {
  const rows = sampleData();
  await DB.replaceAll(rows, 'Sample Testing Data');
  STATE.rows = await DB.loadAll();
  buildProjectFilter();
  render();
  toast('Loaded ' + rows.length + ' sample records');
}
