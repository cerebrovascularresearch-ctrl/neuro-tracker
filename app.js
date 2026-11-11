// Lyerly Neuro Tracker — app screens and logic (iOS-style UI).
(async function () {
const C = window.TRACKER_CONFIG || {};
const B = await window.Backend.create(C);

// ---------- constants ----------
const STAGE_VAR = {
  'Idea':'--st-idea','Feasibility':'--st-feas','In development':'--st-dev','In progress':'--st-prog','Data collection':'--st-data',
  'Data shared':'--st-shared','Analysis':'--st-anal','Writing':'--st-write','Internal review':'--st-review','Submitted':'--st-sub',
  'Revision':'--st-rev','Accepted':'--st-acc','Enrolling':'--st-enr','Published':'--st-pub','Done':'--st-done','On hold':'--st-hold','Closed':'--st-closed'
};
const PIPE = {
  paper:['Idea','Feasibility','Data collection','Data shared','Analysis','Writing','Internal review','Submitted','Revision','Accepted','Published'],
  video:['Idea','Writing','Internal review','Submitted','Accepted','Published'],
  study:['Feasibility','In development','Submitted','Accepted','Enrolling','Closed'],
  grant:['Idea','Writing','Submitted','Accepted','Done'],
  task:['Idea','In progress','Done']
};
const STEP_LABEL = { video:{'Writing':'Editing','Internal review':'Narration'}, study:{'Accepted':'Approved'}, grant:{'Accepted':'Awarded','Done':'Reporting'} };
const GROUPS = [
  ['Manuscripts','--st-data','paper'],['Collaborations','--st-shared','paper'],['Videocases','--st-review','video'],['Pediatrics','--st-write','paper'],
  ['Grants','--st-acc','grant'],['IRB studies','--st-feas','study'],['Lab','--st-anal','study'],['Upcoming studies','--st-dev','study'],
  ['BHRI trials','--st-enr','study'],['Miscellaneous','--st-prog','task'],['Future ideas','--st-idea','paper'],['Completed','--st-pub','paper']
];
const GVAR = Object.fromEntries(GROUPS.map(g => [g[0], g[1]]));
const GTYPE = Object.fromEntries(GROUPS.map(g => [g[0], g[2]]));
const DONE = new Set(['Published','Done','Closed']);
const GENERIC = ['Research fellows','Research team'];
const AV = ['--av1','--av2','--av3','--av4','--av5','--av6','--av7'];
const DAY = 864e5, MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const LOGO = '<svg class="logo" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="lgB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E2A4A"/><stop offset="1" stop-color="#0B1222"/></linearGradient></defs><path d="M50 0H72C90 0 100 10 100 28V72C100 90 90 100 72 100H28C10 100 0 90 0 72V28C0 10 10 0 28 0Z" fill="url(#lgB)"/><path d="M47.5 25C40 22 31 25 27.5 32C22.5 36 21.5 44 24 50C21.5 57 24.5 65 31.5 69C36 75 43 76 47.5 72Z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M52.5 25C60 22 69 25 72.5 32C77.5 36 78.5 44 76 50C78.5 57 75.5 65 68.5 69C64 75 57 76 52.5 72Z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M31 37C36 38 39 42 38 47M27.5 56C33 55 37 58 39.5 63M41 30C41.5 34 44 36 47 37M69 37C64 38 61 42 62 47M72.5 56C67 55 63 58 60.5 63M59 30C58.5 34 56 36 53 37" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".85"/><circle cx="74" cy="74" r="13" fill="#34C759" stroke="#0B1222" stroke-width="3.5"/><path d="M67.6 74.4l4.3 4.3 8.2-8.6" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ---------- state ----------
const S = { projects:[], updates:{}, members:[], me:null, email:null, offline:false };
const ui = { filter:'mine', q:'', person:'', dlScope:'mine' };
let lastList = 'home', installEvt = null, renderPending = false;

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const pd = s => { if (!s) return null; const [y,m,d] = String(s).slice(0,10).split('-').map(Number); return new Date(y, m-1, d); };
const iso = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
const days = s => { const d = pd(s); return d ? Math.round((d - today()) / DAY) : null; };
const fmt = s => { const d = pd(s); return d ? MON[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== today().getFullYear() ? ', ' + d.getFullYear() : '') : ''; };
const when = ts => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleDateString(undefined, {month:'short', day:'numeric', year: d.getFullYear() !== today().getFullYear() ? 'numeric' : undefined}) + ' at ' + d.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'}); };
const isDone = r => r.group === 'Completed' || DONE.has(r.stage);
const mine = r => S.me && r.owners.includes(S.me.name);
const canEdit = () => S.me && (S.me.role === 'admin' || S.me.role === 'editor');
const isAdmin = () => S.me && S.me.role === 'admin';
const proj = id => S.projects.find(p => p.id === id);
function initials(n){ const w = String(n).replace(/^Dr\.?\s*/, 'Dr ').split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : String(n).slice(0,2)).toUpperCase(); }
function avc(n){ let h = 0; for (const c of String(n)) h = (h*31 + c.charCodeAt(0)) >>> 0; return 'var(' + AV[h % AV.length] + ')'; }
const av = (n, cls) => '<span class="av ' + (cls || '') + '" style="background-color:' + avc(n) + '" aria-hidden="true">' + esc(initials(n)) + '</span>';
const avs = (l, max) => l.length ? '<span class="avs" title="' + esc(l.join(', ')) + '">' + l.slice(0, max || 3).map(n => av(n)).join('') + '</span>' : '';
const pill = (s, label) => '<span class="stage" style="--c:var(' + (STAGE_VAR[s] || '--st-idea') + ')">' + esc(label || s) + '</span>';
function dueTxt(r){
  if (!r.due || isDone(r)) return '';
  const d = days(r.due), cls = d < 0 ? 'over' : d <= 14 ? 'soon' : '';
  return '<span class="duet ' + cls + '">' + (d < 0 ? Math.abs(d) + 'd overdue' : d === 0 ? 'Due today' : 'Due ' + fmt(r.due)) + '</span>';
}
const I = (d, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' + (extra || '') + '>' + d + '</svg>';
const ICON = {
  chev:'<svg class="chev" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 1.5 6.5 7l-5 5.5"/></svg>',
  back:I('<path d="M15 4.5 7.5 12l7.5 7.5" stroke-width="2.6"/>'),
  plus:I('<path d="M12 5.5v13M5.5 12h13" stroke-width="2.4"/>'),
  wait:I('<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 4 5 4 8.5S8 16.5 8 20.5M16 3.5c0 4-4 5-4 8.5s4 4.5 4 8.5"/>'),
  cal:I('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'),
  pause:I('<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>'),
  play:I('<circle cx="12" cy="12" r="8.5"/><path d="M10.2 8.6 15.2 12l-5 3.4z" fill="currentColor"/>'),
  arrow:I('<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" stroke-width="2.4"/>'),
  send:I('<path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" stroke-width="2.6"/>'),
  search:I('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>'),
  folder:I('<path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" fill="currentColor" stroke="none"/>'),
  alert:I('<path d="M12 4.5 21 19.5H3z" fill="currentColor" stroke="none"/><path d="M12 10v4.5M12 17v.2" stroke="#fff" stroke-width="2.2"/>'),
  bell:I('<path d="M6 10a6 6 0 0 1 12 0v4l1.5 3h-15L6 14z" fill="currentColor" stroke="none"/><path d="M10 19.5a2 2 0 0 0 4 0" stroke-width="2"/>'),
  phone:I('<rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="currentColor" stroke="none"/><path d="M10.5 18.5h3" stroke="#fff"/>'),
  cloud:I('<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 5.5 5.5 0 0 1 10.6 1.4A3.8 3.8 0 0 1 17 18.5z" fill="currentColor" stroke="none"/>')
};
const hourglass = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v2c0 3-2.5 5-4.6 7 2.1 2 4.6 4 4.6 7v2H6v-2c0-3 2.5-5 4.6-7C8.5 10 6 8 6 5z"/></svg>';
function cell(r, opts){
  opts = opts || {};
  const meta = [pill(r.stage), dueTxt(r), r.waiting && !isDone(r) ? '<span class="wait">' + esc(r.waiting) + '</span>' : '', opts.showGroup ? '<span>' + esc(r.group) + '</span>' : ''].filter(Boolean).join('');
  return '<button class="cell" data-open="' + r.id + '">' + (opts.date || '') + '<span class="main"><span class="t">' + esc(r.name) + '</span><span class="m">' + meta + '</span></span>' + avs(r.owners, 2) + ICON.chev + '</button>';
}
function dateBlock(s){ const d = pd(s), n = days(s), cls = n < 0 ? 'over' : n <= 14 ? 'soon' : ''; return '<span class="dateb ' + cls + '"><i>' + MON[d.getMonth()] + '</i><b>' + d.getDate() + '</b></span>'; }
function people(){
  const c = {};
  S.members.filter(m => m.active).forEach(m => c[m.name] = 0);
  S.projects.filter(r => !isDone(r)).forEach(r => r.owners.forEach(o => c[o] = (c[o] || 0) + 1));
  return Object.keys(c).sort((a,b) => c[b] - c[a] || a.localeCompare(b)).map(n => [n, c[n]]);
}
// Nav bar + large title. The small centered title appears once the large title scrolls under the bar.
function nav(title, o){
  o = o || {};
  const back = o.back ? '<a class="nav-back" href="#' + esc(o.back[0]) + '">' + ICON.back + '<span>' + esc(o.back[1]) + '</span></a>' : '';
  return '<header class="nav"><div class="nav-in"><div class="nav-l">' + back + '</div><div class="nav-t">' + esc(o.small || title) + '</div><div class="nav-r">' + (o.right || '') + '</div></div></header>' +
    (o.large === false ? '' : '<div class="large-row">' + (o.eyebrow ? '<div class="eyebrow-d">' + esc(o.eyebrow) + '</div>' : '') + '<div class="large-line"><h1 class="large">' + esc(title) + '</h1>' + (o.largeRight ? '<div class="large-right">' + o.largeRight + '</div>' : '') + '</div></div>');
}
function updateNav(){
  const t = document.querySelector('.large, .ptitle'), n = document.querySelector('.nav');
  const compact = !t || !n || t.getBoundingClientRect().bottom < n.getBoundingClientRect().bottom + 4;
  document.body.classList.toggle('navc', compact);
}
window.addEventListener('scroll', updateNav, {passive:true});
const addBtn = '<button class="circ" data-act="new" aria-label="New project">' + ICON.plus + '</button>';
const addBtnBar = '<button class="circ conly" data-act="new" aria-label="New project" tabindex="-1">' + ICON.plus + '</button>';
let tt;
function toast(msg, err){
  let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role','status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.toggle('err', !!err); el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, err ? 3500 : 1800);
}
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushReady = () => B.mode === 'live' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && C.vapidPublicKey && !/^__/.test(C.vapidPublicKey);

// ---------- data ----------
const CACHE = () => 'lyerly-cache-' + (S.email || '');
function setData(d){
  S.projects = d.projects; S.members = d.members; S.updates = {};
  d.updates.forEach(u => (S.updates[u.projectId] = S.updates[u.projectId] || []).push(u));
  if (S.me) S.me = d.members.find(m => m.email === S.email && m.active) || S.me;
}
function cacheSave(){ if (B.mode !== 'live') return; try { localStorage.setItem(CACHE(), JSON.stringify({projects:S.projects, members:S.members, updates:Object.values(S.updates).flat()})); } catch(e) {} }
function cacheLoad(){ try { return JSON.parse(localStorage.getItem(CACHE()) || 'null'); } catch(e) { return null; } }
let loading = null, loadedAt = 0;
function loadData(){
  if (loading) return loading;   // one request at a time, shared by everyone who asks
  loading = (async () => {
    try { setData(await B.loadAll()); cacheSave(); S.offline = false; loadedAt = Date.now(); }
    catch (e) { const c = cacheLoad(); if (!c) throw e; setData(c); S.offline = true; toast('Offline: showing the last saved copy', true); }
  })().finally(() => { loading = null; });
  return loading;
}
function upsert(list, row, key){ const i = list.findIndex(x => x[key] === row[key]); if (i >= 0) list[i] = row; else list.push(row); }
function onChange(table, type, row){
  if (table === 'projects') { if (type === 'DELETE') S.projects = S.projects.filter(p => p.id !== row.id); else upsert(S.projects, row, 'id'); }
  if (table === 'updates' && type !== 'DELETE') { const l = S.updates[row.projectId] = S.updates[row.projectId] || []; upsert(l, row, 'id'); }
  if (table === 'members') { if (type === 'DELETE') S.members = S.members.filter(m => m.email !== row.email); else { upsert(S.members, row, 'email'); if (row.email === S.email) S.me = row; } }
  cacheSave(); softRender();
}
// Re-render for remote changes, but never while someone is typing or a sheet is open.
let frame = 0;
function softRender(){
  if (frame) return;   // many live changes in a row -> one redraw
  frame = requestAnimationFrame(() => {
    frame = 0;
    const a = document.activeElement;
    if ($('#sheetRoot').innerHTML || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { renderPending = true; return; }
    renderPending = false; route(true);
  });
}
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending) softRender(); }, 50));

async function changeProject(id, patch, log){
  if (!canEdit()) { toast('Your role can read projects and post updates only', true); return false; }
  const p = proj(id), before = Object.assign({}, p);
  Object.assign(p, patch); route(true);
  try {
    const [saved] = await Promise.all([B.updateProject(id, patch), log ? postUpdate(id, log, 'stage', true) : null]);
    upsert(S.projects, saved, 'id');
    cacheSave(); route(true); return true;
  } catch (e) { Object.assign(p, before); route(true); toast(e.message, true); return false; }
}
async function postUpdate(id, body, kind, quiet){
  // Show it right away; swap in the saved copy when the server answers, or take it back if saving fails.
  const l = S.updates[id] = S.updates[id] || [];
  const temp = {id:'tmp' + Date.now() + Math.random(), projectId:id, author:S.me.name, body, kind:kind || 'note', at:new Date().toISOString()};
  l.push(temp); if (!quiet) route(true);
  try {
    const u = await B.addUpdate(id, body, kind || 'note', S.me.name);
    const i = l.indexOf(temp); if (i >= 0) l.splice(i, 1);
    upsert(l, u, 'id');
    if (!quiet) { cacheSave(); route(true); }
    return true;
  } catch (e) { const i = l.indexOf(temp); if (i >= 0) l.splice(i, 1); route(true); toast(e.message, true); if (quiet) throw e; return false; }
}

// ---------- routing ----------
function route(keepScroll){
  if (!S.me) return;
  const h = location.hash.slice(1) || 'home';
  const y = window.scrollY;
  document.querySelectorAll('.tab[data-tab]').forEach(t => t.removeAttribute('aria-current'));
  const m = h.match(/^p(\d+)$/);
  if (m) renderProject(Number(m[1]));
  else {
    const screens = { home:renderHome, projects:renderProjects, deadlines:renderDeadlines, team:renderTeam, members:renderMembers };
    const key = screens[h] ? h : 'home';
    lastList = key;
    const tab = document.querySelector('.tab[data-tab="' + (key === 'members' ? 'team' : key) + '"]'); if (tab) tab.setAttribute('aria-current', 'page');
    screens[key]();
  }
  if (keepScroll) window.scrollTo(0, y);
  updateNav();
}
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (!/^p\d+$/.test(h)) lastList = h || 'home'; route(); window.scrollTo(0, 0); updateNav(); });
const open = id => { location.hash = 'p' + id; };

// ---------- screens ----------
function banner(color, icon, text, btn){ return '<div class="banner"><span class="bi" style="background:' + color + '">' + icon + '</span><span class="bt">' + text + '</span>' + (btn || '') + '</div>'; }
function banners(){
  let out = '';
  if (B.mode === 'demo') out += banner('var(--orange)', ICON.phone, 'Demo mode. Changes stay on this device.');
  if (S.offline) out += banner('var(--st-idea)', ICON.cloud, 'You are offline. Showing the last saved copy.');
  if (B.mode === 'live' && isIOS && !isStandalone()) out += banner('var(--accent)', ICON.phone, 'For reminders, tap <b>Share</b> → <b>Add to Home Screen</b>, then open the app from its icon.');
  else if (pushReady() && Notification.permission === 'default') out += banner('var(--red)', ICON.bell, 'Get reminders for due dates, follow-ups and IRB renewals.', '<button class="btn primary" data-act="enablePush">Turn On</button>');
  if (installEvt) out += banner('var(--accent)', ICON.phone, 'Install the app on this device.', '<button class="btn primary" data-act="install">Install</button>');
  return out;
}
function renderHome(){
  const name = S.me.name, hr = new Date().getHours();
  const greet = (hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening') + ', ' + name;
  const my = S.projects.filter(r => !isDone(r) && mine(r));
  const dueSoon = my.filter(r => r.due && !r.irbRenewBy && days(r.due) <= 14).sort((a,b) => a.due.localeCompare(b.due));
  const waiting = my.filter(r => r.waiting);
  const irb = S.projects.filter(r => r.irbRenewBy && !isDone(r) && days(r.irbRenewBy) <= 90).sort((a,b) => a.irbRenewBy.localeCompare(b.irbRenewBy));
  const over = my.filter(r => r.due && !r.irbRenewBy && days(r.due) < 0).length;
  const sec = (title, link, rows, more) => '<section class="sec"><div class="sech"><h2>' + title + '</h2>' + (link || '') + '</div><div class="list">' + (rows || '<div class="empty">' + more + '</div>') + '</div></section>';
  $('#screen').innerHTML =
    nav('Today', { eyebrow: new Date().toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'}), largeRight: addBtn + '<button class="me" data-act="profile" aria-label="Account and settings">' + av(name) + '</button>', right: addBtnBar }) +
    '<p class="muted" style="margin:-4px 0 14px;font-size:15px">' + esc(greet) + '</p>' + banners() +
    '<div class="tiles"><a class="tile" href="#projects" data-f="mine"><span class="ic" style="background:var(--accent)">' + ICON.folder + '</span><b>' + my.length + '</b><span>My projects</span></a>' +
    '<a class="tile" href="#projects" data-f="waiting"><span class="ic" style="background:var(--orange)">' + hourglass + '</span><b>' + waiting.length + '</b><span>Waiting</span></a>' +
    '<a class="tile" href="#deadlines"><span class="ic" style="background:' + (over ? 'var(--red)' : 'var(--green)') + '">' + ICON.alert + '</span><b>' + over + '</b><span>Overdue</span></a></div>' +
    sec('Next 2 Weeks', '<a href="#deadlines">See All</a>', dueSoon.slice(0, 6).map(r => cell(r, {date:dateBlock(r.due)})).join(''), 'Nothing of yours is due in the next 2 weeks.') +
    sec('Waiting on Others', waiting.length > 5 ? '<a href="#projects" data-f="waiting">See All</a>' : '', waiting.slice(0, 5).map(r => cell(r)).join(''), 'You are not waiting on anyone.') +
    sec('IRB Renewals', '', irb.map(r => cell(r, {date:dateBlock(r.irbRenewBy)})).join(''), 'No renewals in the next 90 days.');
}
function renderProjects(){
  const filters = [['mine','Mine'],['all','All'],['waiting','Waiting'],['hold','On Hold'],['done','Completed']].concat(GROUPS.filter(g => g[0] !== 'Completed').map(g => ['g:' + g[0], g[0]]));
  if (ui.person) filters.unshift(['person', ui.person]);
  $('#screen').innerHTML = nav('Projects', { right: addBtnBar, largeRight: addBtn }) +
    '<label class="search">' + ICON.search + '<input id="q" type="search" placeholder="Search" value="' + esc(ui.q) + '" aria-label="Search projects" autocomplete="off"></label>' +
    '<div class="chips" role="toolbar" aria-label="Filters">' + filters.map(f => '<button class="chip" data-filter="' + esc(f[0]) + '" aria-pressed="' + (ui.filter === f[0]) + '">' + esc(f[1]) + '</button>').join('') + '</div>' +
    '<div id="plist">' + projectList() + '</div>';
  let timer = 0;
  $('#q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { ui.q = e.target.value; $('#plist').innerHTML = projectList(); }, 160); });
}
function projectList(){
  const q = ui.q.trim().toLowerCase();
  const list = S.projects.filter(r => {
    const f = ui.filter;
    if (f === 'person') { if (!r.owners.includes(ui.person) || isDone(r)) return false; }
    else if (f === 'mine') { if (!mine(r) || isDone(r)) return false; }
    else if (f === 'done') { if (!isDone(r)) return false; }
    else if (f === 'hold') { if (r.stage !== 'On hold') return false; }
    else if (f === 'waiting') { if (!r.waiting || isDone(r) || !mine(r)) return false; }
    else if (f.startsWith('g:')) { if (r.group !== f.slice(2) || isDone(r)) return false; }
    else if (isDone(r)) return false;
    if (q && ![r.name, r.objective, r.comments, r.next, r.sponsor, r.waiting, r.owners.join(' '), r.irb].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const groups = GROUPS.map(g => g[0]).filter(g => list.some(r => r.group === g));
  return !list.length ? '<div class="list" style="margin-top:16px"><div class="empty">No projects match.</div></div>' :
    groups.map(g => { const rows = list.filter(r => r.group === g); return '<div class="gh col" style="--gc:var(' + GVAR[g] + ')">' + esc(g) + '<span>' + rows.length + '</span></div><div class="list">' + rows.map(r => cell(r)).join('') + '</div>'; }).join('');
}
function renderDeadlines(){
  const base = S.projects.filter(r => !isDone(r) && (ui.dlScope === 'team' || mine(r)));
  const irb = base.filter(r => r.irbRenewBy).sort((a,b) => a.irbRenewBy.localeCompare(b.irbRenewBy));
  const rest = base.filter(r => r.due && !r.irbRenewBy).sort((a,b) => a.due.localeCompare(b.due));
  const bucket = [['Overdue', r => days(r.due) < 0], ['This Week', r => days(r.due) >= 0 && days(r.due) <= 7], ['Next Week', r => days(r.due) > 7 && days(r.due) <= 14], ['Later', r => days(r.due) > 14]];
  const sec = (t, rows, key, d) => rows.length ? '<div class="gh">' + t + '<span>' + rows.length + '</span></div><div class="list">' + rows.map(r => cell(r, {date:dateBlock(r[key])})).join('') + '</div>' + (d ? '<p class="foot">' + d + '</p>' : '') : '';
  $('#screen').innerHTML = nav('Deadlines') +
    '<div class="seg" role="group" aria-label="Whose deadlines"><button data-scope="mine" aria-pressed="' + (ui.dlScope === 'mine') + '">Mine</button><button data-scope="team" aria-pressed="' + (ui.dlScope === 'team') + '">Whole Team</button></div>' +
    sec('IRB renewals', irb, 'irbRenewBy', 'Red dates have passed. Confirm the renewal and update the date in the project details.') +
    bucket.map(([t, fn]) => sec(t, rest.filter(fn), 'due', t === 'Later' ? 'Dates marked Suggested come from default stage lengths. Open a project to set the real one.' : '')).join('') +
    (!irb.length && !rest.length ? '<div class="list" style="margin-top:16px"><div class="empty">No dates yet.</div></div>' : '');
}
function renderTeam(){
  const list = S.projects.filter(r => !isDone(r));
  const genericOnly = list.filter(r => r.owners.length && r.owners.every(o => GENERIC.includes(o))).length;
  const rows = people().map(([n, c]) => {
    const rs = list.filter(r => r.owners.includes(n));
    const w = rs.filter(r => r.waiting).length, o = rs.filter(r => r.due && days(r.due) < 0).length;
    const segs = {}; rs.forEach(r => segs[r.stage] = (segs[r.stage] || 0) + 1);
    return '<button class="cell" data-person="' + esc(n) + '">' + av(n, 'lg') + '<span class="main"><span class="t">' + esc(n) + (n === S.me.name ? ' <span class="muted">(you)</span>' : '') + '</span>' +
      '<span class="pstats">' + c + ' projects' + (w ? ' · <span class="w">' + w + ' waiting</span>' : '') + (o ? ' · <span class="o">' + o + ' overdue</span>' : '') + (GENERIC.includes(n) ? ' · group' : '') + '</span>' +
      (rs.length ? '<span class="minibar">' + Object.keys(STAGE_VAR).filter(s => segs[s]).map(s => '<span style="width:' + (segs[s] / rs.length * 100) + '%;background:var(' + STAGE_VAR[s] + ')"></span>').join('') + '</span>' : '') + '</span>' + ICON.chev + '</button>';
  }).join('');
  const waitingOn = {}; list.forEach(r => { if (r.waiting) waitingOn[r.waiting] = (waitingOn[r.waiting] || 0) + 1; });
  const wo = Object.entries(waitingOn).sort((a,b) => b[1] - a[1]).slice(0, 6);
  $('#screen').innerHTML = nav('Team', { right: '<a class="nav-btn" href="#members">Members</a>' }) +
    (genericOnly ? '<div class="note"><b>' + genericOnly + ' projects</b> are assigned only to “Research fellows” or “Research team”. Give each one a named lead.</div>' : '') +
    '<div class="gh">Workload</div><div class="list">' + rows + '</div>' +
    (wo.length ? '<div class="gh">Waiting on</div><div class="list">' + wo.map(([n, c]) => '<div class="cell"><span class="main"><span class="t">' + esc(n) + '</span></span><span class="val">' + c + '</span></div>').join('') + '</div><p class="foot">Who the team is waiting on most, across all active projects.</p>' : '');
}
function renderMembers(){
  const rows = S.members.slice().sort((a,b) => (b.active - a.active) || a.name.localeCompare(b.name)).map(m =>
    '<button class="cell" data-member="' + esc(m.email) + '"' + (m.active ? '' : ' style="opacity:.5"') + '>' + av(m.name, 'lg') +
    '<span class="main"><span class="t">' + esc(m.fullName || m.name) + (m.email === S.email ? ' <span class="muted">(you)</span>' : '') + '</span>' +
    '<span class="m"><span class="role ' + m.role + '">' + esc(m.role[0].toUpperCase() + m.role.slice(1)) + '</span><span>' + esc(m.email) + '</span>' + (!m.active ? '<span>Removed</span>' : !m.joined ? '<span>Not signed in yet</span>' : '') + '</span></span>' + (isAdmin() ? ICON.chev : '') + '</button>').join('');
  $('#screen').innerHTML = nav('Members', { back:['team','Team'], right: isAdmin() ? '<button class="circ" data-act="addMember" aria-label="Add member">' + ICON.plus + '</button>' : '' }) +
    '<div class="list">' + rows + '</div>' +
    '<p class="foot">' + (isAdmin() ? 'Only people on this list can sign in. Tap + to add someone, then send them the app link.' : 'Only people on this list can sign in. Ask an admin to add or remove people.') + '</p>' +
    '<p class="foot"><b>Admin</b> adds and removes members. <b>Editor</b> changes projects. <b>Viewer</b> reads and posts updates.</p>';
}
function renderProject(id){
  const r = proj(id);
  const back = { home:'Today', projects:'Projects', deadlines:'Deadlines', team:'Team', members:'Members' }[lastList] || 'Back';
  if (!r) { $('#screen').innerHTML = nav('Project', { back:[lastList, back], large:false }) + '<div class="list"><div class="empty">This project was not found. It may have been deleted.</div></div>'; return; }
  const type = GTYPE[r.group] || 'paper', pipe = PIPE[type], lab = STEP_LABEL[type] || {};
  const ci = pipe.indexOf(r.stage), held = r.stage === 'On hold', ed = canEdit();
  const next = ci >= 0 && ci < pipe.length - 1 ? pipe[ci + 1] : null;
  const steps = pipe.map((s, i) => '<button class="step ' + (ci >= 0 && i < ci ? 'past' : i === ci ? 'cur' : '') + '" data-stage="' + esc(s) + '" style="--sc:var(' + STAGE_VAR[s] + ')" aria-label="Move to ' + esc(lab[s] || s) + '"' + (i === ci ? ' aria-current="step"' : '') + (ed ? '' : ' disabled') + '><i></i>' + esc(lab[s] || s) + '</button>').join('');
  const kv = (k, v) => v ? '<div class="kv"><span>' + k + '</span><span>' + esc(v) + '</span></div>' : '';
  const ups = (S.updates[id] || []).slice().sort((a,b) => String(b.at).localeCompare(String(a.at)));
  const details = kv('Objective', r.objective) + kv('Comments', r.comments) + kv('Sponsor', r.sponsor) + kv('Start date', r.start) +
    (r.irbRenewBy || r.irbExpires ? kv('IRB dates', (r.irbRenewBy ? 'Renew by ' + fmt(r.irbRenewBy) : '') + (r.irbExpires ? '\nExpires ' + fmt(r.irbExpires) : '')) : '') +
    kv('Last changed', (r.updatedBy ? r.updatedBy + ', ' : '') + when(r.updatedAt));
  $('#screen').innerHTML =
    nav(r.name, { back:[lastList, back], large:false, small:r.name, right: ed ? '<button class="nav-btn" data-act="editDetails">Edit</button>' : '' }) +
    '<div class="phead" style="--gc:var(' + (GVAR[r.group] || '--st-idea') + ')"><div class="eyebrow">' + esc(r.group) + (r.irb ? ' · IRB ' + esc(r.irb) : '') + '</div><h1 class="ptitle">' + esc(r.name) + '</h1>' +
    '<div class="owners">' + (r.owners.length ? avs(r.owners, 4) + '<span>' + esc(r.owners.join(', ')) + '</span>' : '<span>No owner yet</span>') + (ed ? ' <button class="btn ghost" data-act="owners">Edit</button>' : '') + '</div>' +
    (r.flags.length && !isDone(r) ? '<div class="flags">' + r.flags.map(f => '<span class="flag">' + esc(f) + '</span>').join('') + (ed ? '<button class="btn ghost" data-act="clearFlags">Mark as fixed</button>' : '') + '</div>' : '') + '</div>' +
    '<div class="gh">Stage</div><div class="card"><div class="cardh"><span>' + (held ? 'Paused' : 'Current') + '</span>' + pill(r.stage, lab[r.stage]) + '</div>' +
      (held ? '<div class="held">' + ICON.pause.replace('<svg', '<svg width="20" height="20"') + '<span>On hold.' + (ed ? ' Tap a step or Resume to restart.' : '') + '</span></div>' : '') +
      '<div class="steps">' + steps + '</div>' +
      (next && !held && ed ? '<button class="btn primary block" data-stage="' + esc(next) + '" style="margin-top:14px">Move to ' + esc(lab[next] || next) + '</button>' : '') + '</div>' +
    (ed ? '<div class="acts">' +
        '<button class="act" data-act="wait">' + hourglass.replace('<svg', '<svg width="24" height="24"') + 'Waiting on<small>' + esc(r.waiting || 'Nobody') + '</small></button>' +
        '<button class="act" data-act="due">' + ICON.cal + 'Due date<small>' + esc(r.due ? fmt(r.due) : 'Not set') + '</small></button>' +
        '<button class="act" data-act="hold">' + (held ? ICON.play + 'Resume<small>Back to work</small>' : ICON.pause + 'On hold<small>Pause it</small>') + '</button>' +
      '</div>' : '<p class="foot">Waiting on: ' + esc(r.waiting || 'nobody') + ' · Due: ' + esc(r.due ? fmt(r.due) : 'not set') + '</p>') +
    '<div class="gh">Next step</div><div class="card">' + (ed ? '<textarea class="nexttx" id="nextTx" aria-label="Next step" placeholder="What happens next?">' + esc(r.next) + '</textarea>' : '<div style="white-space:pre-line">' + esc(r.next || '—') + '</div>') + '</div>' +
    '<div class="gh">Updates</div><div class="card"><div class="addu"><input id="updIn" placeholder="Post an update" aria-label="New update" enterkeyhint="send"><button class="send" id="updBtn" aria-label="Post update">' + ICON.send + '</button></div>' +
      '<div class="updates">' + (ups.length ? ups.map(u => '<div class="upd ' + esc(u.kind) + '"><span class="dotl"></span><div>' + esc(u.body) + '<small>' + esc(u.author ? u.author + ' · ' : '') + esc(when(u.at)) + '</small></div></div>').join('') : '<div class="muted" style="font-size:15px;padding:8px 0">No updates yet.</div>') + '</div></div>' +
    (details ? '<div class="gh">Details</div><div class="list">' + details + '</div>' : '') +
    (isAdmin() ? '<div class="list" style="margin-top:24px"><button class="cell rowbtn red" data-act="delete">Delete Project</button></div>' : '');
  const nt = $('#nextTx');
  if (nt) nt.addEventListener('change', () => changeProject(id, {next:nt.value}).then(ok => ok && toast('Next step saved')));
  const post = async () => { const inp = $('#updIn'), v = inp.value.trim(); if (!v) return; inp.value = ''; if (await postUpdate(id, v, 'note')) toast('Update posted'); };
  $('#updBtn').onclick = post;
  $('#updIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); post(); } });
  const cur = $('.step.cur'); if (cur) cur.scrollIntoView({block:'nearest', inline:'center'});
}

// ---------- clicks ----------
$('#screen').addEventListener('click', e => {
  const o = e.target.closest('[data-open]'); if (o) { open(Number(o.dataset.open)); return; }
  const f = e.target.closest('[data-f]'); if (f) { ui.filter = f.dataset.f; ui.person = ''; }
  const c = e.target.closest('[data-filter]'); if (c) { ui.filter = c.dataset.filter; if (c.dataset.filter !== 'person') ui.person = ''; renderProjects(); return; }
  const sc = e.target.closest('[data-scope]'); if (sc) { ui.dlScope = sc.dataset.scope; renderDeadlines(); return; }
  const p = e.target.closest('[data-person]'); if (p) { ui.person = p.dataset.person; ui.filter = 'person'; ui.q = ''; location.hash = 'projects'; return; }
  const mb = e.target.closest('[data-member]'); if (mb) { if (isAdmin()) sheetMember(S.members.find(m => m.email === mb.dataset.member)); return; }
  const a = e.target.closest('[data-act]');
  if (a) {
    const act = a.dataset.act;
    if (act === 'profile') return sheetProfile();
    if (act === 'enablePush') return enablePush();
    if (act === 'install') return doInstall();
    if (act === 'addMember') return sheetMember(null);
    if (act === 'new') return sheetNew();
  }
  const id = Number((location.hash.match(/^#p(\d+)$/) || [])[1]);
  if (!id) return;
  const r = proj(id); if (!r) return;
  const st = e.target.closest('[data-stage]');
  if (st) {
    const s = st.dataset.stage; if (s === r.stage) return;
    const patch = {stage:s, prevStage:r.stage}; if (DONE.has(s)) patch.waiting = '';
    changeProject(id, patch, 'Moved from ' + r.stage + ' to ' + s).then(ok => ok && toast('Moved to ' + s));
    return;
  }
  if (!a) return;
  const act = a.dataset.act;
  if (act === 'wait') sheetWait(r);
  if (act === 'due') sheetDue(r);
  if (act === 'owners') sheetOwners(r);
  if (act === 'editDetails') sheetDetails(r);
  if (act === 'clearFlags') changeProject(id, {flags:[]}).then(ok => ok && toast('Marked as fixed'));
  if (act === 'hold') {
    if (r.stage === 'On hold') { const pipe = PIPE[GTYPE[r.group] || 'paper']; const back = r.prevStage && r.prevStage !== 'On hold' ? r.prevStage : pipe[0]; changeProject(id, {stage:back, prevStage:'On hold'}, 'Resumed at ' + back).then(ok => ok && toast('Resumed')); }
    else changeProject(id, {stage:'On hold', prevStage:r.stage}, 'Put on hold').then(ok => ok && toast('Put on hold'));
  }
  if (act === 'delete') {
    if (a.dataset.armed) { B.deleteProject(id).then(() => { S.projects = S.projects.filter(x => x.id !== id); cacheSave(); location.hash = lastList; toast('Project deleted'); }).catch(err => toast(err.message, true)); }
    else { a.dataset.armed = '1'; a.textContent = 'Tap Again to Delete for Everyone'; setTimeout(() => { if (a.isConnected) { delete a.dataset.armed; a.textContent = 'Delete Project'; } }, 4000); }
  }
});

// ---------- sheets (Cancel · Title · Save) ----------
let lastFocus = null;
function sheet(html, after, o){
  o = o || {};
  lastFocus = document.activeElement;
  const done = o.done ? '<button class="sh-b strong" id="' + o.done.id + '" ' + (o.done.form ? 'type="submit" form="' + o.done.form + '"' : 'type="button"') + (o.done.close ? ' data-close' : '') + '>' + esc(o.done.label) + '</button>' : '<span></span>';
  const head = '<div class="sh-h">' + (o.noCancel ? '<span></span>' : '<button type="button" class="sh-b" data-close>Cancel</button>') + '<h2>' + esc(o.title || '') + '</h2>' + done + '</div>';
  $('#sheetRoot').innerHTML = '<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(o.title || '') + '"><div class="grab"></div>' + head + html + '</div>';
  const first = $('#sheetRoot .sheet input:not([type=hidden]), #sheetRoot .sheet select');
  if (first && !('ontouchstart' in window)) first.focus();
  if (after) after();
}
function closeSheet(){ $('#sheetRoot').innerHTML = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); if (renderPending) softRender(); }
$('#sheetRoot').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheetRoot').innerHTML) closeSheet(); });

function sheetWait(r){
  const seen = {}; S.projects.forEach(p => { if (p.waiting && p.waiting !== 'Not named') seen[p.waiting] = (seen[p.waiting] || 0) + 1; });
  const common = [...new Set(Object.keys(seen).sort((a,b) => seen[b] - seen[a]).slice(0, 5).concat(['Co-authors','Sponsor','IRB']))].slice(0, 7);
  sheet('<p class="s">Who has to act before this project can move? You will get a follow-up reminder in 14 days.</p>' +
    '<div class="form"><div class="fr"><label for="wIn">Waiting on</label><input id="wIn" value="' + esc(r.waiting) + '" placeholder="Name or group"></div></div>' +
    '<div class="pick">' + common.map(c => '<button class="chip" data-w="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
    (r.waiting ? '<div class="list"><button class="cell rowbtn red" id="wClear">Not Waiting on Anyone</button></div>' : ''), () => {
      $('#sheetRoot .pick').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) $('#wIn').value = b.dataset.w; });
      const save = v => {
        const patch = {waiting:v};
        if (v && !r.irbRenewBy) { const d = today(); d.setDate(d.getDate() + 14); patch.due = iso(d); patch.dueKind = 'Follow up'; }
        closeSheet();
        changeProject(r.id, patch, v ? 'Waiting on ' + v : 'No longer waiting on ' + (r.waiting || 'anyone')).then(ok => ok && toast(v ? 'Follow-up set for 14 days' : 'Not waiting'));
      };
      $('#wSave').onclick = () => save($('#wIn').value.trim());
      const c = $('#wClear'); if (c) c.onclick = () => save('');
    }, { title:'Waiting On', done:{label:'Save', id:'wSave'} });
}
function sheetDue(r){
  const plus = [['1 week',7],['2 weeks',14],['1 month',30],['3 months',90]];
  sheet('<p class="s">' + (r.dueKind === 'Suggested' ? 'This date was suggested from the stage. Set the real one.' : 'Pick a date or a quick option.') + '</p>' +
    '<div class="form"><div class="fr"><label for="dIn">Due</label><input id="dIn" type="date" value="' + esc(r.due) + '"></div></div>' +
    '<div class="pick">' + plus.map(p => '<button class="chip" data-d="' + p[1] + '">In ' + p[0] + '</button>').join('') + '</div>' +
    (r.due ? '<div class="list"><button class="cell rowbtn red" id="dClear">Remove Date</button></div>' : ''), () => {
      $('#sheetRoot .pick').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; const d = today(); d.setDate(d.getDate() + Number(b.dataset.d)); $('#dIn').value = iso(d); });
      $('#dSave').onclick = () => { const v = $('#dIn').value; closeSheet(); changeProject(r.id, {due:v, dueKind:v ? 'Set' : ''}).then(ok => ok && toast('Date saved')); };
      const c = $('#dClear'); if (c) c.onclick = () => { closeSheet(); changeProject(r.id, {due:'', dueKind:''}).then(ok => ok && toast('Date removed')); };
    }, { title:'Due Date', done:{label:'Save', id:'dSave'} });
}
function ownerPicker(selected){
  const names = [...new Set(people().map(p => p[0]).concat(selected))];
  return '<div class="pick" id="ownPick">' + names.map(n => '<button type="button" class="chip" data-o="' + esc(n) + '" aria-pressed="' + selected.includes(n) + '">' + esc(n) + '</button>').join('') + '</div>';
}
function bindOwnerPicker(){ $('#ownPick').addEventListener('click', e => { const b = e.target.closest('[data-o]'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); }); }
const pickedOwners = () => [...document.querySelectorAll('#ownPick [aria-pressed="true"]')].map(b => b.dataset.o);
function sheetOwners(r){
  sheet('<p class="s">Tap to add or remove people.</p>' + ownerPicker(r.owners), () => {
    bindOwnerPicker();
    $('#oSave').onclick = () => { const o = pickedOwners(); closeSheet(); changeProject(r.id, {owners:o}).then(ok => ok && toast('Owners saved')); };
  }, { title:'Owners', done:{label:'Save', id:'oSave'} });
}
function categorySelect(id, val, noCompleted){ return '<select id="' + id + '">' + GROUPS.filter(g => !(noCompleted && g[0] === 'Completed')).map(g => '<option' + (g[0] === val ? ' selected' : '') + '>' + esc(g[0]) + '</option>').join('') + '</select>'; }
function sheetDetails(r){
  sheet('<form id="detF">' +
    '<div class="form"><div class="fr stack"><label for="eName">Name</label><textarea id="eName" required rows="2" style="min-height:0">' + esc(r.name) + '</textarea></div>' +
    '<div class="fr"><label for="eGroup">Category</label>' + categorySelect('eGroup', r.group) + '</div></div>' +
    '<div class="gh">IRB</div><div class="form"><div class="fr"><label for="eIrb">Number</label><input id="eIrb" value="' + esc(r.irb) + '" placeholder="None"></div>' +
    '<div class="fr"><label for="eRenew">Renew by</label><input id="eRenew" type="date" value="' + esc(r.irbRenewBy) + '"></div>' +
    '<div class="fr"><label for="eExp">Expires</label><input id="eExp" type="date" value="' + esc(r.irbExpires) + '"></div></div>' +
    '<div class="gh">About</div><div class="form"><div class="fr stack"><label for="eObj">Objective</label><textarea id="eObj">' + esc(r.objective) + '</textarea></div>' +
    '<div class="fr stack"><label for="eCom">Comments</label><textarea id="eCom">' + esc(r.comments) + '</textarea></div>' +
    '<div class="fr"><label for="eSp">Sponsor</label><input id="eSp" value="' + esc(r.sponsor) + '" placeholder="None"></div></div></form>', () => {
      $('#detF').addEventListener('submit', e => {
        e.preventDefault();
        const patch = {name:$('#eName').value.trim() || r.name, group:$('#eGroup').value, irb:$('#eIrb').value.trim(), irbRenewBy:$('#eRenew').value, irbExpires:$('#eExp').value, objective:$('#eObj').value, comments:$('#eCom').value, sponsor:$('#eSp').value.trim()};
        if (patch.irbRenewBy !== r.irbRenewBy) { patch.due = patch.irbRenewBy || r.due; if (patch.irbRenewBy) patch.dueKind = 'IRB renewal'; }
        closeSheet(); changeProject(r.id, patch).then(ok => ok && toast('Details saved'));
      });
    }, { title:'Edit Details', done:{label:'Save', id:'detSave', form:'detF'} });
}
function sheetNew(){
  if (!canEdit()) { toast('Your role can read projects and post updates only', true); return; }
  sheet('<form id="newF"><div class="form"><div class="fr stack"><label for="nName">Name</label><textarea id="nName" required rows="2" style="min-height:0" placeholder="e.g. Flow diverter outcomes in elderly patients"></textarea></div>' +
    '<div class="fr"><label for="nGroup">Category</label>' + categorySelect('nGroup', 'Manuscripts', true) + '</div>' +
    '<div class="fr"><label for="nDue">Due date</label><input id="nDue" type="date"></div></div>' +
    '<div class="gh">Owners</div>' + ownerPicker([S.me.name]) +
    '<div class="form"><div class="fr stack"><label for="nNext">Next step</label><textarea id="nNext" placeholder="What happens next?"></textarea></div></div></form>', () => {
      bindOwnerPicker();
      $('#newF').addEventListener('submit', async e => {
        e.preventDefault();
        const name = $('#nName').value.trim(); if (!name) { $('#nName').focus(); return; }
        const g = $('#nGroup').value, due = $('#nDue').value;
        $('#nSave').disabled = true;
        try {
          const p = await B.addProject({name, group:g, next:$('#nNext').value.trim(), owners:pickedOwners(), stage:PIPE[GTYPE[g] || 'paper'][0], due, dueKind:due ? 'Set' : '', start:iso(today())});
          upsert(S.projects, p, 'id'); await postUpdate(p.id, 'Project created', 'system', true); cacheSave();
          closeSheet(); open(p.id); toast('Project added');
        } catch (err) { $('#nSave').disabled = false; toast(err.message, true); }
      });
    }, { title:'New Project', done:{label:'Add', id:'nSave', form:'newF'} });
}
function sheetMember(m){
  const isNew = !m; m = m || {email:'', name:'', fullName:'', role:'editor', active:true};
  const self = m.email === S.email;
  sheet('<form id="memF"><div class="form">' +
    '<div class="fr"><label for="mFull">Full name</label><input id="mFull" required value="' + esc(m.fullName) + '" placeholder="Fernanda Silva"></div>' +
    '<div class="fr"><label for="mName">Short name</label><input id="mName" required value="' + esc(m.name) + '" placeholder="Fernanda"' + (isNew ? '' : ' readonly') + '></div>' +
    (isNew ? '<div class="fr"><label for="mEmail">Email</label><input id="mEmail" type="email" required autocomplete="off" autocapitalize="off" placeholder="name@example.com"></div>' : '<div class="fr"><span class="lb">Email</span><span class="muted" style="margin-left:auto;overflow:hidden;text-overflow:ellipsis">' + esc(m.email) + '</span></div>') +
    '<div class="fr"><label for="mRole">Role</label><select id="mRole"' + (self ? ' disabled' : '') + '>' + [['admin','Admin'],['editor','Editor'],['viewer','Viewer']].map(o => '<option value="' + o[0] + '"' + (m.role === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div></div>' +
    '<p class="hint">The short name is how they appear as a project owner' + (isNew ? ' and cannot be changed later' : '') + '. ' + (self ? 'You cannot change your own role.' : 'Admin adds and removes members. Editor changes projects. Viewer reads and posts updates.') + '</p></form>' +
    (!isNew && !self ? '<div class="list"><button class="cell rowbtn red" id="mToggle">' + (m.active ? 'Remove Access' : 'Restore Access') + '</button></div>' : ''), () => {
      const save = async active => {
        const row = {email: isNew ? $('#mEmail').value.trim().toLowerCase() : m.email, name:$('#mName').value.trim(), fullName:$('#mFull').value.trim(), role: self ? m.role : $('#mRole').value, active};
        if (!row.email || !row.name) return;
        try { upsert(S.members, await B.saveMember(row, isNew), 'email'); closeSheet(); route(true); toast(isNew ? row.name + ' added' : active === false ? 'Access removed' : 'Saved'); }
        catch (err) { toast(err.message, true); }
      };
      $('#memF').addEventListener('submit', e => { e.preventDefault(); save(m.active); });
      const t = $('#mToggle'); if (t) t.onclick = () => save(!m.active);
    }, { title: isNew ? 'Add Member' : 'Edit Member', done:{label: isNew ? 'Add' : 'Save', id:'mSave', form:'memF'} });
}

// ---------- account, notifications, export ----------
async function pushState(){
  if (!pushReady()) return B.mode === 'demo' ? 'demo' : 'unsupported';
  if (isIOS && !isStandalone()) return 'install';
  if (Notification.permission === 'denied') return 'blocked';
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); return sub ? 'on' : 'off'; } catch (e) { return 'off'; }
}
async function sheetProfile(){
  const st = await pushState();
  const pushNote = {
    demo:'Available once the app is connected.', unsupported:'Not supported in this browser.',
    install:'First add the app to your Home Screen, then open it from the icon.', blocked:'Blocked in Settings. Allow notifications for this app there.',
    on:'On for this device.', off:'Off for this device.'
  }[st];
  const pushBtns = st === 'on' ? '<button class="btn" data-p="test">Test</button>' : st === 'off' ? '<button class="btn primary" data-p="on">Turn On</button>' : '';
  sheet('<div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin:6px 0 20px;text-align:center">' + av(S.me.name, 'xl') + '<div style="font-size:22px;font-weight:700;margin-top:6px">' + esc(S.me.fullName || S.me.name) + '</div><div class="muted" style="font-size:15px">' + esc(S.me.email) + '</div><span class="role ' + S.me.role + '">' + esc(S.me.role[0].toUpperCase() + S.me.role.slice(1)) + '</span></div>' +
    '<div class="gh">Reminders</div><div class="list">' +
      '<div class="srow"><div class="main"><b>Notifications</b><small>' + pushNote + '</small></div>' + pushBtns + '</div>' +
      (st === 'on' ? '<button class="cell rowbtn" data-p="off" style="justify-content:flex-start">Turn Off on This Device</button>' : '') +
      '<div class="srow"><div class="main"><b>Email reminders</b><small>When notifications are off on all your devices.</small></div><button class="switch" role="switch" id="swEmail" aria-checked="' + !!S.me.notifyEmail + '" aria-label="Email reminders"></button></div>' +
    '</div>' +
    (installEvt ? '<div class="list" style="margin-top:16px"><button class="cell rowbtn" data-p="install">Install App</button></div>' : '') +
    '<div class="gh">Team</div><div class="list">' +
      '<a class="cell" href="#members" data-close><span class="main"><span class="t">Members</span></span><span class="val">' + S.members.filter(x => x.active).length + '</span>' + ICON.chev + '</a>' +
      '<button class="cell" id="exportBtn"><span class="main"><span class="t">Export to Excel</span></span>' + ICON.chev + '</button></div>' +
    '<div class="list" style="margin-top:24px"><button class="cell rowbtn red" id="signOut">Sign Out</button></div>' +
    '<p class="foot" style="text-align:center;margin-top:14px">' + (B.mode === 'demo' ? 'Demo mode · data saved on this device' : 'Connected · changes sync for the whole team') + '</p>', () => {
      $('#sheetRoot .sheet').addEventListener('click', async e => {
        const b = e.target.closest('[data-p]'); if (!b) return;
        if (b.dataset.p === 'test') { try { const r = await B.testPush(); toast(r && r.sent ? 'Test sent. It should arrive in a few seconds.' : 'No device to send to. Turn notifications on first.', !(r && r.sent)); } catch (err) { toast(err.message, true); } return; }
        if (b.dataset.p === 'on') await enablePush();
        if (b.dataset.p === 'off') await disablePush();
        if (b.dataset.p === 'install') await doInstall();
        closeSheet(); sheetProfile();
      });
      $('#swEmail').onclick = async () => { const v = !S.me.notifyEmail; try { await B.setMyPrefs(S.me.email, {notifyEmail:v}); S.me.notifyEmail = v; $('#swEmail').setAttribute('aria-checked', v); } catch (err) { toast(err.message, true); } };
      $('#exportBtn').onclick = exportCsv;
      $('#signOut').onclick = async () => { await B.signOut(); try { localStorage.removeItem(CACHE()); } catch (e) {} location.hash = ''; location.reload(); };
    }, { title:'Account', noCancel:true, done:{label:'Done', id:'pDone', close:true} });
}
function urlB64(s){ const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map(c => c.charCodeAt(0))); }
async function enablePush(){
  if (!pushReady()) { toast('Notifications are not available here', true); return; }
  if (isIOS && !isStandalone()) { toast('On iPhone, add the app to your Home Screen first', true); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications were not allowed', true); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:urlB64(C.vapidPublicKey)});
    const j = sub.toJSON();
    await B.savePush(S.me.email, {endpoint:j.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth, user_agent:navigator.userAgent.slice(0, 200)});
    if (!S.me.notifyPush) { await B.setMyPrefs(S.me.email, {notifyPush:true}); S.me.notifyPush = true; }
    toast('Notifications are on'); route(true);
  } catch (e) { toast('Could not turn on notifications: ' + e.message, true); }
}
async function disablePush(){
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await B.removePush(sub.endpoint); await sub.unsubscribe(); } toast('Notifications are off for this device'); }
  catch (e) { toast(e.message, true); }
}
async function doInstall(){ if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; route(true); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (S.me) route(true); });
function exportCsv(){
  const cols = [['Project','name'],['Category','group'],['Stage','stage'],['Owners', r => r.owners.join(', ')],['Waiting on','waiting'],['Due date','due'],['Due type','dueKind'],
    ['Next step','next'],['Objective','objective'],['Comments','comments'],['Sponsor','sponsor'],['IRB #','irb'],['IRB renew by','irbRenewBy'],['IRB expires','irbExpires'],
    ['Last update', r => { const u = (S.updates[r.id] || []).filter(x => x.kind === 'note').sort((a,b) => String(b.at).localeCompare(String(a.at)))[0]; return u ? u.body + ' (' + u.author + ', ' + String(u.at).slice(0,10) + ')' : ''; }],
    ['Last changed', r => String(r.updatedAt).slice(0,10)],['Changed by','updatedBy']];
  const cellv = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lines = [cols.map(c => cellv(c[0])).join(',')].concat(S.projects.slice().sort((a,b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)).map(r => cols.map(c => cellv(typeof c[1] === 'function' ? c[1](r) : r[c[1]])).join(',')));
  const blob = new Blob(['﻿' + lines.join('\r\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Lyerly projects ' + iso(today()) + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('Export downloaded');
}

// ---------- sign in ----------
function showLogin(step, email, err){
  document.body.classList.add('noTabs'); document.body.classList.remove('navc'); $('#tabbar').hidden = true;
  const demo = B.mode === 'demo';
  if (step !== 'code') {
    $('#screen').innerHTML = '<div class="login">' + LOGO + '<h1>Neuro Tracker</h1><p>Lyerly Neurosurgery research projects.<br>Sign in with your email to get a 6-digit code.</p>' +
      (err ? '<div class="err" role="alert">' + esc(err) + '</div>' : '') +
      '<form id="loginF"><div class="field"><input id="lEmail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" required value="' + esc(email || '') + '" placeholder="Email" aria-label="Email"></div>' +
      '<button class="btn primary block" id="lBtn">Continue</button></form>' +
      (demo ? '<div class="demo"><b>Demo mode.</b> Tap a person to fill in their email. The code is <b>123456</b>.<div class="pick" id="demoPick"></div></div>' : '') + '</div>';
    if (demo) B.loadAll().then(d => { $('#demoPick').innerHTML = d.members.map(m => '<button type="button" class="chip" data-e="' + esc(m.email) + '">' + esc(m.name) + '</button>').join(''); });
    const dp = $('#demoPick'); if (dp) dp.addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (b) $('#lEmail').value = b.dataset.e; });
    $('#loginF').addEventListener('submit', async e => {
      e.preventDefault();
      const em = $('#lEmail').value.trim().toLowerCase(); if (!em) return;
      $('#lBtn').disabled = true; $('#lBtn').textContent = 'Sending…';
      try { await B.sendCode(em); showLogin('code', em); } catch (x) { showLogin('email', em, x.message); }
    });
  } else {
    $('#screen').innerHTML = '<div class="login">' + LOGO + '<h1>Check Your Email</h1><p>Enter the code sent to<br><b style="color:var(--fg)">' + esc(email) + '</b></p>' +
      (err ? '<div class="err" role="alert">' + esc(err) + '</div>' : '') +
      '<form id="codeF"><div class="field"><input id="lCode" class="codein" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" required placeholder="••••••" aria-label="Code"></div>' +
      '<button class="btn primary block" id="cBtn">Sign In</button></form>' +
      '<div class="linkrow"><button class="btn ghost" id="lBack">Different email</button><button class="btn ghost" id="lResend">Send new code</button></div>' +
      '<p class="foot" style="margin-top:18px">It can take a minute to arrive. Check spam too.</p>' +
      (demo ? '<div class="demo">Demo mode: the code is <b>123456</b>.</div>' : '') + '</div>';
    $('#lCode').focus();
    $('#codeF').addEventListener('submit', async e => {
      e.preventDefault();
      const code = $('#lCode').value.replace(/\D/g, ''); if (!code) return;
      $('#cBtn').disabled = true; $('#cBtn').textContent = 'Signing In…';
      try { await B.verifyCode(email, code); await boot(); } catch (x) { showLogin('code', email, x.message); }
    });
    $('#lBack').onclick = () => showLogin('email', email);
    $('#lResend').onclick = async () => { try { await B.sendCode(email); toast('New code sent'); } catch (x) { toast(x.message, true); } };
  }
}
function showNoAccess(){
  document.body.classList.add('noTabs'); $('#tabbar').hidden = true;
  $('#screen').innerHTML = '<div class="login">' + LOGO + '<h1>No Access</h1><p><b>' + esc(S.email) + '</b> is not on the active team list. Ask an admin to add you, then sign in again.</p><button class="btn block" id="naOut">Sign Out</button></div>';
  $('#naOut').onclick = async () => { await B.signOut(); location.reload(); };
}

// ---------- start ----------
function showSkeleton(){
  const row = '<div class="cell sk-row"><span class="sk sk-date"></span><span class="main"><span class="sk sk-line"></span><span class="sk sk-line short"></span></span></div>';
  $('#screen').innerHTML = '<div class="sk-wrap" aria-busy="true" aria-label="Loading projects"><span class="sk sk-eyebrow"></span><span class="sk sk-title"></span>' +
    '<div class="tiles">' + '<div class="tile"><span class="sk sk-dot"></span><span class="sk sk-num"></span></div>'.repeat(3) + '</div>' +
    '<span class="sk sk-h"></span><div class="list">' + row.repeat(5) + '</div></div>';
}
let subscribed = false;
async function boot(){
  let email = null;
  try { email = await B.currentEmail(); } catch (e) {}
  if (!email) { showLogin(); return; }
  S.email = email;
  showSkeleton();
  try { await loadData(); } catch (e) { $('#screen').innerHTML = '<div class="login">' + LOGO + '<h1>Could Not Load</h1><p>' + esc(e.message) + '</p><button class="btn primary block" id="retry">Try Again</button></div>'; $('#retry').onclick = () => location.reload(); return; }
  S.me = S.members.find(m => m.email === email && m.active) || null;
  if (!S.me) { showNoAccess(); return; }
  if (!subscribed) { B.subscribe(onChange); subscribed = true; }
  document.body.classList.remove('noTabs'); $('#tabbar').hidden = false;
  route();
}
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('online', () => { if (S.offline && S.me) loadData().then(() => { route(true); toast('Back online'); }); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me && B.mode === 'live' && Date.now() - loadedAt > 60000) loadData().then(() => softRender()).catch(() => {}); });
boot();
})();
