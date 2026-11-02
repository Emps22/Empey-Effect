/* Eyebolt — safety & compliance app
   Plain JavaScript, no build step. Data lives in Supabase (see supabase/schema.sql). */
(function () {
'use strict';

/* =====================================================================
   Settings and small helpers
   ===================================================================== */
const CFG = window.EYEBOLT_CONFIG || {};
if (CFG.supabaseUrl) CFG.supabaseUrl = String(CFG.supabaseUrl).trim().replace(/\/(rest|auth|storage)\/v1\/?$/, '').replace(/\/+$/, '');
const APP = CFG.appName || 'Eyebolt';
const TAG = CFG.tagline || 'Safety & Compliance';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YEAR = new Date().getFullYear();
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TODAY = iso(new Date());
const D = s => new Date(s + 'T12:00:00');
const days = (a, b) => Math.round((D(b) - D(a)) / 864e5);
const addDays = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
const addYears = (s, n) => { const d = D(s); d.setFullYear(d.getFullYear() + n); return iso(d); };
const fmt = s => { if (!s) return ''; const d = D(s); return MONTHS[d.getMonth()] + ' ' + d.getDate() + (d.getFullYear() !== YEAR ? ', ' + d.getFullYear() : ''); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n2 = x => isFinite(x) ? Number(x).toFixed(2) : '—';
const num = x => Number(x || 0).toLocaleString();
const $ = id => document.getElementById(id);
const val = id => { const e = $(id); return e ? e.value.trim() : ''; };
const markSVG = () => $('markTpl').innerHTML;

function toast(t, bad) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = t; el.setAttribute('role', 'status');
  if (bad) el.style.background = 'var(--red)';
  document.body.appendChild(el); setTimeout(() => el.remove(), bad ? 5200 : 3200);
}
function friendly(err) {
  const m = (err && (err.message || err.error_description || err)) + '';
  if (/Invalid login/i.test(m)) return 'That email and password don’t match. Try again or reset your password.';
  if (/Email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
  if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
  if (/row-level security|permission denied|Not allowed/i.test(m)) return 'You don’t have permission to do that.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Can’t reach the server. Check your connection and try again.';
  return m.replace(/^FAIL: /, '');
}
async function q(p, okMsg) {
  try {
    const r = await p;
    if (r && r.error) { toast(friendly(r.error), true); return null; }
    if (okMsg) toast(okMsg);
    return r ? (r.data === undefined ? true : (r.data === null ? true : r.data)) : true;
  } catch (e) { toast(friendly(e), true); return null; }
}
function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.textContent; btn.textContent = 'Working…'; } else if (btn.dataset.label) btn.textContent = btn.dataset.label; }
function copyText(text, el) {
  const done = () => toast('Copied.');
  try { navigator.clipboard.writeText(text).then(done, () => selectEl(el)); } catch (e) { selectEl(el); }
}
function selectEl(el) { if (!el) return; const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Copy it from here.'); }
function armed(btn, label) { if (btn.dataset.arm) return true; btn.dataset.arm = '1'; btn.dataset.orig = btn.textContent; btn.textContent = label || 'Tap again to confirm'; btn.style.color = 'var(--red)'; setTimeout(() => { if (btn.isConnected && btn.dataset.arm) { delete btn.dataset.arm; btn.textContent = btn.dataset.orig; btn.style.color = ''; } }, 4000); return false; }

/* =====================================================================
   Reference data
   ===================================================================== */
const TYPES = { injury: { l: 'Injury', p: 'p-red', c: 'var(--red)' }, nearmiss: { l: 'Near miss', p: 'p-blue', c: 'var(--blue)' }, damage: { l: 'Property damage', p: 'p-amber', c: 'var(--amber)' }, vehicle: { l: 'Vehicle', p: 'p-violet', c: 'var(--violet)' } };
const TREAT = { none: 'No injury', firstaid: 'First aid only', medical: 'Medical treatment beyond first aid', restricted: 'Restricted work or job transfer', away: 'Days away from work', loc: 'Loss of consciousness', fatal: 'Fatality' };
const REC = new Set(['medical', 'restricted', 'away', 'loc', 'fatal']);
const TEMPLATES = {
  crane: { name: 'Crane daily inspection', ref: 'Shift inspection, 29 CFR 1926.1412(d)', items: ['Control mechanisms operate correctly', 'Load moment indicator and anti-two-block working', 'Wire rope: no visible broken wires, kinks or crushing', 'Hook and safety latch condition', 'Outriggers, pads and cribbing', 'Ground conditions and level indicator', 'Hydraulic hoses: no leaks or damage', 'Tires or tracks', 'Operator aids and load chart in cab'] },
  rigging: { name: 'Rigging gear', ref: 'Before use, 29 CFR 1926.251', items: ['Sling tags present and legible', 'No cuts, abrasion or heat damage', 'Shackle pins seated, correct size', 'Hook throat opening and twist within limits', 'Spreader bar and below-the-hook devices marked'] },
  dvir: { name: 'Driver pre-trip (DVIR)', ref: '49 CFR 396.11 / 396.13', items: ['Service brakes and parking brake', 'Lights and reflectors', 'Tires and wheels', 'Coupling devices', 'Mirrors and windshield', 'Horn and wipers', 'Load securement and oversize permits', 'Emergency equipment (triangles, extinguisher)'] },
  ext: { name: 'Fire extinguisher monthly', ref: '29 CFR 1910.157(e)(2)', items: ['Gauge in green', 'Pin and tamper seal intact', 'Tag dated and initialed', 'Accessible, not blocked', 'Mounted and visible'] },
  ladder: { name: 'Ladders and scaffolds', ref: '29 CFR 1926.1053 / 1926.451', items: ['Rails, rungs and feet undamaged', 'Labels and duty rating legible', 'Scaffold planks and guardrails in place', 'Base plates, mudsills and ties', 'Access and fall protection'] },
  office: { name: 'Office walk-through', ref: 'General duty', items: ['Exits and aisles clear', 'Cords off walkways', 'First aid kit stocked', 'Eyewash or AED checked', 'Lighting and stairs in good condition'] }
};
const CCO_CERTS = ['Mobile Crane Operator', 'Boom Truck Operator', 'Articulating Crane Operator', 'Tower Crane Operator', 'Overhead Crane Operator', 'Digger Derrick Operator', 'Rigger Level I', 'Rigger Level II', 'Signal Person', 'Crane Inspector', 'Lift Director'];
const CCO_WIN = 90;
const INSP_TYPES = ['Annual crane inspection', 'DOT annual inspection', 'Personnel platform annual inspection', 'Fuel tank alarm and leak detection test', 'Fire suppression system', 'Forklift annual inspection', 'Overhead hoist annual inspection', 'Fall protection / harness annual inspection', 'Other'];
const STARTER_REQS = [
  { name: 'Certificate of insurance (GL and auto)', kind: 'doc', expires: true, help: 'List us as additional insured.' },
  { name: 'Workers’ comp certificate', kind: 'doc', expires: true },
  { name: 'EMR (experience mod rate)', kind: 'number', max_value: 1.0, help: 'From your insurance carrier.' },
  { name: 'TRIR, current year', kind: 'number', max_value: 3.0, auto: 'trir' },
  { name: 'DART rate, current year', kind: 'number', auto: 'dart' },
  { name: 'OSHA 300A summary, last full year', kind: 'doc', auto: '300a' },
  { name: 'Written safety program', kind: 'doc' },
  { name: 'Crane operator certifications', kind: 'doc', expires: true, crane_only: true, auto: 'cco', help: 'Crane and rigging subs only.' },
  { name: 'W-9', kind: 'doc' }
];
const AWARD_PROGRAMS = [
  { name: 'Crane & Rigging Safety Award', organization: 'SC&RA (Specialized Carriers & Rigging Association)', category: 'Crane & rigging' },
  { name: 'Crane & Rigging Project Safety Award', organization: 'SC&RA (Specialized Carriers & Rigging Association)', category: 'Project' },
  { name: 'Transportation Safety Award', organization: 'SC&RA (Specialized Carriers & Rigging Association)', category: 'Trucking' },
  { name: 'Wisconsin Corporate Safety Award', organization: 'Wisconsin Safety Council (WMC)', category: 'Company-wide' },
  { name: 'Fleet Safety Award', organization: 'Wisconsin Motor Carriers Association', category: 'Trucking' },
  { name: 'STEP Safety Management System', organization: 'ABC (Associated Builders and Contractors)', category: 'Safety program' },
  { name: 'Insurance carrier safety recognition', organization: 'Your insurance carrier', category: 'Company-wide' }
];
const AWARD_STATUS = { planned: { l: 'Planning to apply', p: 'p-grey' }, in_progress: { l: 'Working on it', p: 'p-blue' }, submitted: { l: 'Submitted', p: 'p-violet' }, won: { l: 'Won', p: 'p-green' }, not_selected: { l: 'Not selected', p: 'p-grey' } };
const RIB = { gold: ['#E3B23C', '#9A6F0A', '#FFF3C9'], silver: ['#B8C0C8', '#5E6873', '#F1F4F7'], bronze: ['#C58A5A', '#7A4824', '#F6E1CF'], blue: ['#3B6FB6', '#1F3F73', '#DCE8F7'], red: ['#C0392B', '#771D15', '#F7DCD8'], green: ['#2E8B57', '#17502F', '#D9F0E2'] };
function ribbonSVG(color, year, size) {
  const [m, d, l] = RIB[color] || RIB.gold; let pts = '';
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, r = i % 2 ? 37 : 42; pts += (50 + r * Math.sin(a)).toFixed(1) + ',' + (45 - r * Math.cos(a)).toFixed(1) + ' '; }
  return `<svg viewBox="0 0 100 132" ${size ? `width="${size}" height="${Math.round(size * 1.32)}"` : ''} aria-hidden="true" class="ribbon-svg">
   <path d="M33 66 L20 128 L32 118 L44 128 L50 74Z" fill="${d}"/><path d="M67 66 L80 128 L68 118 L56 128 L50 74Z" fill="${m}"/>
   <polygon points="${pts}" fill="${m}"/><circle cx="50" cy="45" r="31" fill="${d}"/><circle cx="50" cy="45" r="27" fill="${l}"/>
   <circle cx="50" cy="45" r="27" fill="none" stroke="${m}" stroke-width="2" stroke-dasharray="2 3"/>
   ${year ? `<text x="50" y="52" text-anchor="middle" font-family="Barlow Condensed,Arial Narrow,Arial,sans-serif" font-weight="700" font-size="22" fill="${d}">${year}</text>` : `<path d="M50 30l4.4 9 9.9 1.4-7.2 7 1.7 9.8L50 52.6l-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4z" fill="${d}"/>`}</svg>`;
}
const VIEWS = [['overview', 'Overview'], ['report', 'Report'], ['incidents', 'Incidents'], ['osha', 'OSHA logs'], ['hours', 'Hours & rates'], ['inspections', 'Inspections'], ['actions', 'Actions'], ['cco', 'CCO cards'], ['people', 'Drivers & equipment'], ['portal', 'Sub portal'], ['subs', 'Subcontractors (GC)'], ['awards', 'Awards'], ['settings', 'Company & team']];
const LOCKED = new Set(['overview', 'settings']);
const NAV_DESC = { overview: 'Dashboard and things to watch', report: 'Incident and near-miss form', incidents: 'All reports', osha: 'OSHA 300, 300A and DOT accident register', hours: 'Hours worked, TRIR and DART', inspections: 'Checklists and recent inspections', actions: 'Corrective actions', cco: 'NCCCO crane operator, rigger and signal cards', people: 'CDL drivers and annual inspections', portal: 'Your documents for the GCs you work for', subs: 'Manage your own subcontractors', awards: 'Award applications, deadlines and your ribbon wall', settings: 'Company details, codes and team' };

/* =====================================================================
   State
   ===================================================================== */
let sb = null, session = null, recovering = false;
let memberships = [];       // [{company, role}]
let C = null, ROLE = 'member';
let S = emptyState();
let cur = 'overview', lastLoad = 0;
let incFilter = 'all', actFilter = 'open', ccoFilter = 'all', hoursYear = YEAR, oshaYear = YEAR;
let awardYear = YEAR, awardDraft = null;
let pendingPhotos = [];
let inspRun = null, portalGc = null, gateTab = 'signin', setupTab = 'create';
function emptyState() { return { awards: [], incidents: [], actions: [], inspections: [], drivers: [], operators: [], units: [], hours: {}, members: [], reqs: [], links: [], subIn: [], gcReqs: [], subOut: [] }; }

const byNewest = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.no || '').localeCompare(a.no || '');
const mapInc = r => ({ id: r.id, no: r.case_no, date: r.occurred_on, type: r.type, division: r.division, location: r.location, desc: r.description, employee: r.employee, job: r.job_title, nature: r.nature, treatment: r.treatment, daysAway: r.days_away, daysRestricted: r.days_restricted, privacy: r.privacy_case, dot: r.dot || {}, photos: [...new Set([...(r.photo_paths || []), r.photo_path].filter(Boolean))] });
const mapAct = r => ({ id: r.id, title: r.title, src: r.source, owner: r.owner, due: r.due, done: r.done });
const mapInsp = r => ({ id: r.id, tmpl: r.template, asset: r.asset, by: r.inspected_by, date: r.inspected_on, fails: r.fails, total: r.total });
const mapDrv = r => ({ id: r.id, name: r.name, cdl: r.cdl_exp, med: r.med_exp, mvr: r.mvr_due });
const mapCert = r => ({ id: r.id, name: r.name, cert: r.cert, spec: r.specialty, card: r.card_no, exp: r.expires, evalDate: r.eval_date });
const mapUnit = r => ({ id: r.id, unit: r.unit, kind: r.kind, what: r.inspection, due: r.due });
const mapReq = r => ({ id: r.id, gc: r.gc_id, name: r.name, kind: r.kind, expires: r.expires, max: r.max_value == null ? null : Number(r.max_value), onlyCrane: r.crane_only, auto: r.auto, help: r.help, sort: r.sort });

/* =====================================================================
   Boot and sign-in
   ===================================================================== */
const root = () => $('root');
function configured() { return CFG.supabaseUrl && /^https?:\/\//.test(CFG.supabaseUrl) && CFG.supabaseAnonKey && !/PASTE_/.test(CFG.supabaseAnonKey); }

async function boot() {
  document.title = APP;
  if (!configured()) { renderNotConfigured(); return; }
  if (!window.supabase || !window.supabase.createClient) { root().innerHTML = gateWrap(`<h2>Can’t load ${esc(APP)}</h2><p class="sub">A required script didn’t load. Check your internet connection and refresh.</p>`); return; }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  sb.auth.onAuthStateChange((ev, s) => {
    session = s;
    if (ev === 'PASSWORD_RECOVERY') { recovering = true; renderGate(); return; }
    if (ev === 'SIGNED_OUT') { C = null; memberships = []; S = emptyState(); renderGate(); }
  });
  const { data } = await sb.auth.getSession();
  session = data.session;
  if (recovering) return;
  if (!session) renderGate(); else await afterSignIn();
}

function gateWrap(inner, wide) {
  return `<div class="gate"><div class="gate-card ${wide ? 'wide' : ''}"><div class="gate-brand">${markSVG()}<div><b>${esc(APP)}</b><small>${esc(TAG.toUpperCase())}</small></div></div>${inner}</div></div>`;
}
function renderNotConfigured() {
  root().innerHTML = gateWrap(`<h2 style="margin:0">Almost ready</h2><p class="sub" style="margin:0">${esc(APP)} isn’t connected to a database yet. Open <b>config.js</b> and paste your Supabase project URL and anon key, then redeploy. The setup guide (SETUP.md) walks through it.</p>`);
}
function renderGate() {
  if (recovering) {
    root().innerHTML = gateWrap(`<h2 style="margin:0">Set a new password</h2><form id="f_newpw" novalidate><div class="f"><label for="np_pw">New password</label><input id="np_pw" type="password" autocomplete="new-password" minlength="8"></div><p class="err" id="gerr" hidden></p><button class="btn primary block" type="submit">Save password</button></form>`);
    return;
  }
  const tabs = `<div class="tabs" role="tablist"><button type="button" class="${gateTab === 'signin' ? 'on' : ''}" data-gtab="signin">Sign in</button><button type="button" class="${gateTab === 'signup' ? 'on' : ''}" data-gtab="signup">Create account</button></div>`;
  let form = '';
  if (gateTab === 'signin') form = `<form id="f_signin" novalidate>
    <div class="f"><label for="si_email">Email</label><input id="si_email" type="email" autocomplete="email"></div>
    <div class="f"><label for="si_pw">Password</label><input id="si_pw" type="password" autocomplete="current-password"></div>
    <p class="err" id="gerr" hidden></p><p class="msg" id="gmsg" hidden></p>
    <button class="btn primary block" type="submit">Sign in</button>
    <button class="linkbtn" type="button" data-gtab="forgot" style="align-self:flex-start">Forgot password?</button></form>`;
  else if (gateTab === 'signup') form = `<form id="f_signup" novalidate>
    <div class="f"><label for="su_name">Your name</label><input id="su_name" autocomplete="name"></div>
    <div class="f"><label for="su_email">Work email</label><input id="su_email" type="email" autocomplete="email"></div>
    <div class="f"><label for="su_pw">Password <span class="hint">· at least 8 characters</span></label><input id="su_pw" type="password" autocomplete="new-password"></div>
    <p class="err" id="gerr" hidden></p><p class="msg" id="gmsg" hidden></p>
    <button class="btn primary block" type="submit">Create account</button></form>`;
  else form = `<form id="f_forgot" novalidate><p class="sub" style="margin:0">We’ll email you a link to set a new password.</p>
    <div class="f"><label for="fg_email">Email</label><input id="fg_email" type="email" autocomplete="email"></div>
    <p class="err" id="gerr" hidden></p><p class="msg" id="gmsg" hidden></p>
    <button class="btn primary block" type="submit">Send reset link</button>
    <button class="linkbtn" type="button" data-gtab="signin" style="align-self:flex-start">Back to sign in</button></form>`;
  root().innerHTML = gateWrap((gateTab === 'forgot' ? '' : tabs) + form);
}
function gateMsg(err, msg) { const e = $('gerr'), m = $('gmsg'); if (e) { e.hidden = !err; e.textContent = err || ''; } if (m) { m.hidden = !msg; m.textContent = msg || ''; } }
const redirectUrl = () => location.origin + location.pathname;

async function afterSignIn() {
  if (recovering) return;
  root().innerHTML = '<div class="loading">Loading your company…</div>';
  const r = await q(sb.from('members').select('role, full_name, company:companies(*)').eq('user_id', session.user.id));
  if (!r) { root().innerHTML = gateWrap(`<p class="sub">Couldn’t load your account. <button class="linkbtn" type="button" id="retry">Try again</button></p>`); return; }
  memberships = r.filter(m => m.company).map(m => ({ company: m.company, role: m.role }));
  if (!memberships.length) { renderSetup(); return; }
  let pick = null; try { pick = localStorage.getItem('eb-company'); } catch (e) { }
  const m = memberships.find(x => x.company.id === pick) || memberships[0];
  await openCompany(m.company.id);
}

function renderSetup(adding) {
  const name = (session.user.user_metadata && session.user.user_metadata.full_name) || '';
  const tabs = `<div class="tabs"><button type="button" class="${setupTab === 'create' ? 'on' : ''}" data-stab="create">Set up my company</button><button type="button" class="${setupTab === 'join' ? 'on' : ''}" data-stab="join">Join my team</button></div>`;
  const body = setupTab === 'create' ? `<form id="f_create" novalidate>
    <div class="split"><div class="f"><label for="cc_name">Company name</label><input id="cc_name" autocomplete="organization"></div>
    <div class="f"><label for="cc_you">Your name</label><input id="cc_you" value="${esc(name)}" autocomplete="name"></div></div>
    <div class="split"><div class="f"><label for="cc_trade">Trade</label><input id="cc_trade" list="tradeList" placeholder="e.g. Crane rental"><datalist id="tradeList">${['Crane & rigging', 'Trucking', 'General contractor', 'Electrical', 'Mechanical', 'Concrete', 'Steel erection', 'Roofing', 'Excavation', 'Landscaping', 'Manufacturing'].map(t => `<option value="${t}">`).join('')}</datalist></div>
    <div class="f"><label for="cc_divs">Divisions <span class="hint">· comma separated</span></label><input id="cc_divs" value="Operations, Office"></div></div>
    <div class="checks"><label><input type="checkbox" id="cc_crane"> We run cranes or do rigging (turns on CCO card tracking)</label></div>
    <div class="f"><label for="cc_gc">General contractor code <span class="hint">· optional, if a GC invited you</span></label><input id="cc_gc" placeholder="e.g. SUMMIT-4F2A9C"></div>
    <p class="err" id="gerr" hidden></p>
    <button class="btn primary block" type="submit">Create company</button></form>`
    : `<form id="f_join" novalidate><p class="sub" style="margin:0">Ask your company’s ${esc(APP)} admin for the team code. It’s under Company &amp; team.</p>
    <div class="split"><div class="f"><label for="jn_code">Team code</label><input id="jn_code" placeholder="TEAM-…"></div>
    <div class="f"><label for="jn_you">Your name</label><input id="jn_you" value="${esc(name)}"></div></div>
    <p class="err" id="gerr" hidden></p>
    <button class="btn primary block" type="submit">Join team</button></form>`;
  root().innerHTML = gateWrap(`<div><h2 style="margin:0">${adding ? 'Add another company' : 'Welcome to ' + esc(APP)}</h2><p class="sub" style="margin:4px 0 0">Signed in as ${esc(session.user.email)}. ${adding ? '' : 'Set up your company, or join one your coworkers already use.'}</p></div>${tabs}${body}
   <div class="row" style="justify-content:space-between">${adding ? '<button class="linkbtn" type="button" id="setupBack">Back to my company</button>' : '<span></span>'}<button class="linkbtn" type="button" id="signOut">Sign out</button></div>`, true);
}

/* =====================================================================
   Loading a company's data
   ===================================================================== */
async function openCompany(id) {
  const m = memberships.find(x => x.company.id === id); if (!m) return;
  C = m.company; ROLE = m.role;
  try { localStorage.setItem('eb-company', id); } catch (e) { }
  root().innerHTML = '<div class="loading">Loading…</div>';
  await loadAll();
  renderShell();
}
async function loadAll() {
  const cid = C.id;
  const [co, inc, act, insp, drv, cert, unit, hrs, mem, reqs, links, subIn, subOut, awd] = await Promise.all([
    sb.from('companies').select('*').eq('id', cid).single(),
    sb.from('incidents').select('*').eq('company_id', cid).order('occurred_on', { ascending: false }).order('case_no', { ascending: false }),
    sb.from('actions').select('*').eq('company_id', cid).order('due'),
    sb.from('inspections').select('*').eq('company_id', cid).order('inspected_on', { ascending: false }).limit(200),
    sb.from('drivers').select('*').eq('company_id', cid).order('name'),
    sb.from('certs').select('*').eq('company_id', cid).order('expires'),
    sb.from('units').select('*').eq('company_id', cid).order('due'),
    sb.from('hours').select('*').eq('company_id', cid).in('year', [YEAR, YEAR - 1]),
    sb.from('members').select('*').eq('company_id', cid).order('joined_at'),
    sb.from('requirements').select('*').eq('gc_id', cid).order('sort').order('created_at'),
    sb.rpc('linked_companies', { p_company: cid }),
    sb.from('submissions').select('*').eq('gc_id', cid),
    sb.from('submissions').select('*').eq('sub_id', cid),
    sb.from('awards').select('*').eq('company_id', cid).order('year', { ascending: false }).order('deadline', { ascending: true, nullsFirst: false })
  ]);
  const bad = [co, inc, act, insp, drv, cert, unit, hrs, mem, reqs, links, subIn, subOut].find(r => r.error);
  if (awd.error && !/awards/.test(awd.error.message || '')) toast(friendly(awd.error), true);
  const awardsMissing = !!awd.error;
  if (bad) toast(friendly(bad.error), true);
  if (co.data) { C = co.data; const m = memberships.find(x => x.company.id === cid); if (m) m.company = co.data; }
  S = emptyState();
  S.incidents = (inc.data || []).map(mapInc);
  S.actions = (act.data || []).map(mapAct);
  S.inspections = (insp.data || []).map(mapInsp);
  S.drivers = (drv.data || []).map(mapDrv);
  S.operators = (cert.data || []).map(mapCert);
  S.units = (unit.data || []).map(mapUnit);
  S.members = mem.data || [];
  S.reqs = (reqs.data || []).map(mapReq);
  S.links = links.data || [];
  S.subIn = subIn.data || [];
  S.subOut = subOut.data || [];
  S.awards = awd.data || []; S.awardsMissing = awardsMissing;
  S.hours = {};
  (hrs.data || []).forEach(h => { const k = h.year + '|' + h.division; (S.hours[k] = S.hours[k] || Array(12).fill(null))[h.month - 1] = Number(h.hours); });
  const gcIds = S.links.filter(l => l.relation === 'gc').map(l => l.id);
  if (gcIds.length) {
    const g = await sb.from('requirements').select('*').in('gc_id', gcIds).order('sort').order('created_at');
    S.gcReqs = (g.data || []).map(mapReq);
  }
  lastLoad = Date.now();
}
window.addEventListener('focus', async () => { if (C && sb && Date.now() - lastLoad > 60000 && !document.querySelector('.overlay')) { await loadAll(); render(true); } });

/* =====================================================================
   Calculations
   ===================================================================== */
const divs = () => (C && C.divisions && C.divisions.length ? C.divisions : ['Operations']);
const recordable = i => !!i.treatment && REC.has(i.treatment);
function cls(i) { if (!recordable(i)) return null; if (i.treatment === 'fatal') return 'death'; if (i.treatment === 'away' || i.daysAway > 0) return 'away'; if (i.treatment === 'restricted' || i.daysRestricted > 0) return 'restricted'; return 'other'; }
const dotAcc = i => i.type === 'vehicle' && i.dot && (i.dot.fatal || i.dot.injured || i.dot.towed);
const hoursArr = (y, dv) => S.hours[y + '|' + dv] || Array(12).fill(null);
function hoursTotal(y, dv) { let t = 0; const list = dv ? [dv] : Object.keys(S.hours).filter(k => k.startsWith(y + '|')).map(k => k.split('|')[1]); list.forEach(d => hoursArr(y, d).forEach(v => t += (+v || 0))); return t; }
const inYear = (y) => S.incidents.filter(i => i.date && i.date.startsWith(String(y)));
function rates(div, y = YEAR) { const inc = inYear(y).filter(i => !div || i.division === div); const rec = inc.filter(recordable).length; const dart = inc.filter(i => ['away', 'restricted', 'death'].includes(cls(i))).length; const h = hoursTotal(y, div); return { rec, dart, h, trir: h ? rec * 2e5 / h : NaN, dartR: h ? dart * 2e5 / h : NaN }; }
function status(due, win = 45) { if (!due) return { p: 'p-grey', t: 'No date', lvl: 0 }; const d = days(TODAY, due); if (d < 0) return { p: 'p-red', t: 'Expired ' + (-d) + 'd ago', lvl: 2, d }; if (d <= win) return { p: 'p-amber', t: 'Due in ' + d + 'd', lvl: 1, d }; return { p: 'p-green', t: 'Current', lvl: 0, d }; }
function actStatus(a) { if (a.done) return { p: 'p-green', t: 'Done' }; const d = days(TODAY, a.due); if (d < 0) return { p: 'p-red', t: 'Overdue ' + (-d) + 'd' }; if (d <= 7) return { p: 'p-amber', t: 'Due in ' + d + 'd' }; return { p: 'p-grey', t: 'Open' }; }
function lastHoursMonth(y = YEAR) { let last = -1; Object.keys(S.hours).filter(k => k.startsWith(y + '|')).forEach(k => S.hours[k].forEach((v, i) => { if (v) last = Math.max(last, i); })); return last; }

function navCfg() { const n = (C && C.nav) || {}; const order = (n.order || []).filter(k => VIEWS.some(v => v[0] === k)); VIEWS.forEach(([k]) => { if (!order.includes(k)) order.push(k); }); return { hidden: (n.hidden || []).filter(k => !LOCKED.has(k)), order, labels: n.labels || {} }; }
const viewLabel = k => navCfg().labels[k] || Object.fromEntries(VIEWS)[k];
const isHidden = k => navCfg().hidden.includes(k);

function watchList() {
  const out = [];
  S.actions.filter(a => !a.done && days(TODAY, a.due) < 0).forEach(a => out.push({ lvl: 'red', t: 'Overdue action: ' + a.title, m: a.owner + ' · was due ' + fmt(a.due), go: 'actions' }));
  S.drivers.forEach(d => [['med', 'Medical card'], ['cdl', 'CDL'], ['mvr', 'Annual MVR review']].forEach(([k, l]) => { const s = status(d[k]); if (s.lvl) out.push({ lvl: s.lvl === 2 ? 'red' : 'amber', t: l + ' · ' + d.name, m: (s.lvl === 2 ? 'Expired ' : 'Expires ') + fmt(d[k]) + (k === 'med' && s.lvl === 2 ? ' · driver cannot operate a CMV' : ''), go: 'people' }); }));
  S.operators.forEach(o => { const s = status(o.exp, CCO_WIN); if (s.lvl) out.push({ lvl: s.lvl === 2 ? 'red' : 'amber', t: 'CCO ' + o.cert + ' · ' + o.name, m: (s.lvl === 2 ? 'Expired ' : 'Expires ') + fmt(o.exp) + (s.lvl === 2 && /Operator/.test(o.cert) ? ' · cannot operate until recertified' : ''), go: 'cco' }); });
  S.units.forEach(u => { const s = status(u.due); if (s.lvl) out.push({ lvl: s.lvl === 2 ? 'red' : 'amber', t: u.what + ' · ' + u.unit, m: (u.kind ? u.kind + ' · ' : '') + 'due ' + fmt(u.due), go: 'people' }); });
  const r = rates(); if (r.trir > Number(C.trir_target)) out.push({ lvl: 'amber', t: 'Recordable rate ' + n2(r.trir) + ' is above your ' + n2(C.trir_target) + ' target', m: r.rec + ' recordable case' + (r.rec === 1 ? '' : 's') + ' in ' + num(r.h) + ' hours.', go: 'osha' });
  const byDiv = {}; S.incidents.filter(i => i.type === 'nearmiss' && days(i.date, TODAY) <= 120).forEach(i => byDiv[i.division] = (byDiv[i.division] || 0) + 1);
  Object.entries(byDiv).forEach(([dv, c]) => { if (c >= 2) out.push({ lvl: 'blue', t: c + ' near misses in ' + (dv || 'one division') + ' in the last 120 days', m: 'Worth a toolbox talk before it becomes an injury.', go: 'incidents' }); });
  const lm = lastHoursMonth(), nowM = new Date().getMonth();
  if (nowM > 0 && lm < nowM - 1) out.push({ lvl: 'amber', t: 'Hours for ' + MONTHS[Math.max(lm + 1, 0)] + ' not entered', m: 'Rates use hours worked. Enter them when payroll closes.', go: 'hours' });
  myGcs().forEach(gc => { const p = progress(gc.id, C.id, C.is_crane, S.subOut); const miss = p.st.filter(k => ['missing', 'rejected', 'expired'].includes(k)).length; if (miss) out.push({ lvl: 'amber', t: gc.name + ' is waiting on ' + miss + ' item' + (miss > 1 ? 's' : '') + ' from you', m: 'Open the sub portal. Some fill in from your own data.', go: 'portal' }); });
  S.awards.filter(a => a.deadline && ['planned', 'in_progress'].includes(a.status) && days(TODAY, a.deadline) >= 0 && days(TODAY, a.deadline) <= 30).forEach(a => out.push({ lvl: 'amber', t: 'Award deadline: ' + a.name, m: (a.organization ? a.organization + ' · ' : '') + 'due ' + fmt(a.deadline) + ' (' + days(TODAY, a.deadline) + ' days)', go: 'awards' }));
  const toReview = S.subIn.filter(x => x.status === 'submitted').length; if (toReview) out.push({ lvl: 'blue', t: toReview + ' subcontractor item' + (toReview > 1 ? 's' : '') + ' waiting for your review', m: 'Approve or reject them on the Subcontractors page.', go: 'subs' });
  const order = { red: 0, amber: 1, blue: 2 };
  return out.filter(x => !isHidden(x.go)).sort((a, b) => order[a.lvl] - order[b.lvl]);
}

/* GC/sub helpers */
const myGcs = () => S.links.filter(l => l.relation === 'gc');
const mySubs = () => S.links.filter(l => l.relation === 'sub');
function subSt(r, x, isCrane) {
  if (r.onlyCrane && !isCrane) return { k: 'na', p: 'p-grey', t: 'Not required' };
  if (!x) return { k: 'missing', p: 'p-grey', t: 'Missing' };
  if (x.status === 'rejected') return { k: 'rejected', p: 'p-red', t: 'Rejected' };
  if (r.expires && x.expires && x.expires < TODAY) return { k: 'expired', p: 'p-red', t: 'Expired ' + fmt(x.expires) };
  if (x.status === 'submitted') return { k: 'submitted', p: 'p-blue', t: 'Awaiting review' };
  if (r.expires && x.expires && days(TODAY, x.expires) <= 30) return { k: 'soon', p: 'p-amber', t: 'Expires ' + fmt(x.expires) };
  return { k: 'ok', p: 'p-green', t: 'Approved' };
}
function progress(gcId, subId, isCrane, subs) {
  const reqs = gcId === C.id ? S.reqs : S.gcReqs.filter(r => r.gc === gcId);
  const st = reqs.map(r => subSt(r, subs.find(x => x.requirement_id === r.id && x.sub_id === subId && x.gc_id === gcId), isCrane).k);
  const need = st.filter(k => k !== 'na').length; const done = st.filter(k => k === 'ok' || k === 'soon').length; return { need, done, st };
}
const progHTML = p => `<div class="prog"><div class="bar"><i style="width:${p.need ? Math.round(p.done / p.need * 100) : 0}%"></i></div><span>${p.done}/${p.need}</span></div>`;
const shown = x => x ? (x.value != null && x.value !== '' ? x.value : (x.file_name || '')) : '';

/* =====================================================================
   Shell
   ===================================================================== */
function renderShell() {
  root().innerHTML = `<div class="app"><aside>
    <div class="topline"><div class="brand">${markSVG()}<div><b>${esc(APP)}</b><small>${esc(TAG.toUpperCase())}</small></div></div><a class="btn-report" href="#report">+ Report</a></div>
    <div class="co" id="coBox"></div>
    <a class="btn-report desk-only" href="#report">+ Report incident or near miss</a>
    <nav id="nav"></nav>
    <div class="aside-foot">${esc(session.user.email)}<br><button class="linkbtn" id="signOut" type="button">Sign out</button></div>
  </aside><main id="main"></main></div>`;
  render();
}
function navHTML() {
  const red = watchList().filter(x => x.lvl === 'red').length; const over = S.actions.filter(a => !a.done && days(TODAY, a.due) < 0).length;
  const review = S.subIn.filter(x => x.status === 'submitted').length;
  const c = navCfg();
  return c.order.filter(k => !c.hidden.includes(k)).map(k => {
    let badge = ''; if (k === 'overview' && red) badge = red; if (k === 'actions' && over) badge = over; if (k === 'subs' && review) badge = review;
    const ic = k === 'awards' ? `<span class="nav-ic">${ribbonSVG('gold', '', 14)}</span>` : '';
    return `<a href="#${k}" class="${k === cur ? 'on ' : ''}${k === 'report' ? 'report-link' : ''}"><span class="nl">${ic}${esc(viewLabel(k))}</span>${badge ? '<span class="n">' + badge + '</span>' : ''}</a>`;
  }).join('') + (ROLE === 'admin' ? '<button type="button" class="nav-edit" id="navEdit">Customize menu</button>' : '');
}
function coBoxHTML() {
  const multi = memberships.length > 1;
  const won = isHidden('awards') ? [] : S.awards.filter(a => a.status === 'won').sort((a, b) => b.year - a.year);
  const ribs = won.length ? `<a class="co-ribbons" href="#awards" title="${won.length} safety award${won.length > 1 ? 's' : ''}">${won.slice(0, 6).map(a => `<span title="${esc(a.year + ' ' + a.name)}">${ribbonSVG(a.color, '', 20)}</span>`).join('')}${won.length > 6 ? `<span class="more">+${won.length - 6}</span>` : ''}</a>` : '';
  return `${esc(C.name)}${C.trade ? '<br>' + esc(C.trade) : ''}${ribs}${multi ? `<select id="coPick" aria-label="Switch company">${memberships.map(m => `<option value="${m.company.id}" ${m.company.id === C.id ? 'selected' : ''}>${esc(m.company.name)}</option>`).join('')}<option value="__add">+ Add another company</option></select>` : ''}`;
}
const R = { overview: vOverview, report: vReport, incidents: vIncidents, osha: vOsha, hours: vHours, inspections: vInspections, actions: vActions, cco: vCco, people: vPeople, portal: vPortal, subs: vSubs, awards: vAwards, settings: vSettings };
function render(keepScroll) {
  if (!C || !$('main')) return;
  const h = (location.hash || '').slice(1); cur = R[h] ? h : 'overview';
  $('nav').innerHTML = navHTML(); $('coBox').innerHTML = coBoxHTML();
  $('main').innerHTML = '<div class="view">' + R[cur]() + '</div>';
  if (cur === 'report') updateReport();
  document.title = viewLabel(cur) + ' · ' + APP;
  if (!keepScroll) window.scrollTo(0, 0);
}
function go(v) { if (location.hash === '#' + v) render(); else location.hash = v; }
window.addEventListener('hashchange', () => { if (C) render(); });
const empty = (title, body) => `<div class="empty"><b>${title}</b>${body || ''}</div>`;

/* =====================================================================
   Views
   ===================================================================== */
function vOverview() {
  const recs = S.incidents.filter(recordable).sort(byNewest);
  const since = recs.length ? days(recs[0].date, TODAY) : null; const r = rates();
  const nm = S.incidents.filter(i => i.type === 'nearmiss' && days(i.date, TODAY) <= 90).length;
  const openA = S.actions.filter(a => !a.done); const over = openA.filter(a => days(TODAY, a.due) < 0).length;
  const w = watchList(); const lm = lastHoursMonth();
  const fresh = !S.incidents.length && !S.actions.length && !S.drivers.length && !S.units.length && !S.operators.length;
  return `<div class="head"><div><h1>Safety overview</h1><p class="sub">${YEAR} year to date${lm >= 0 ? ' · hours through ' + MONTHS[lm] : ''}</p></div></div>
  ${fresh ? `<section class="card"><h2>Get started</h2><p class="sub" style="margin:-4px 0 12px">A few things to set up first. Everything else fills in as your team uses ${esc(APP)}.</p>
    <ul class="watch">
     <li><span class="dot blue"></span><div><div class="t">Enter hours worked by month</div><div class="m">Needed for TRIR and DART.</div></div><button class="linkbtn" data-go="hours">Open</button></li>
     <li><span class="dot blue"></span><div><div class="t">Add drivers, cranes and annual inspections</div><div class="m">${esc(APP)} warns you 45 days before anything expires.</div></div><button class="linkbtn" data-go="people">Open</button></li>
     ${!isHidden('cco') ? `<li><span class="dot blue"></span><div><div class="t">Add CCO cards</div><div class="m">Crane operators, riggers and signal persons.</div></div><button class="linkbtn" data-go="cco">Open</button></li>` : ''}
     <li><span class="dot blue"></span><div><div class="t">Invite your team</div><div class="m">Share your team code so crews can report from their phones.</div></div><button class="linkbtn" data-go="settings">Open</button></li>
    </ul></section>` : ''}
  <div class="stats">
   <div class="stat lead"><div class="k">Days since last recordable</div><div class="v">${since == null ? '—' : since}</div><div class="h">${recs.length ? 'Case ' + esc(recs[0].no) + ' · ' + fmt(recs[0].date) : 'No recordables logged'}</div></div>
   <div class="stat"><div class="k">TRIR</div><div class="v ${r.trir > Number(C.trir_target) ? 'warn' : ''}">${n2(r.trir)}</div><div class="h">Target ${n2(C.trir_target)}</div></div>
   <div class="stat"><div class="k">DART rate</div><div class="v">${n2(r.dartR)}</div><div class="h">${r.dart} case${r.dart === 1 ? '' : 's'}</div></div>
   <div class="stat"><div class="k">Near misses, 90 days</div><div class="v">${nm}</div><div class="h">More reports is good</div></div>
   <div class="stat"><div class="k">Open actions</div><div class="v ${over ? 'bad' : ''}">${openA.length}</div><div class="h">${over} overdue</div></div>
  </div>
  <div class="grid3">
   <section class="card"><h2>Things to watch</h2>${w.length ? '<ul class="watch">' + w.map(x => `<li><span class="dot ${x.lvl}"></span><div><div class="t">${esc(x.t)}</div><div class="m">${esc(x.m)}</div></div><button class="linkbtn" data-go="${x.go}">Open</button></li>`).join('') + '</ul>' : '<p class="sub">Nothing needs attention right now.</p>'}</section>
   <div style="display:flex;flex-direction:column;gap:20px;min-width:0">
    <section class="card chart"><h2>Reports by month</h2>${chart()}</section>
    <section class="card"><h2>Compliance calendar</h2><ul class="cal">
     <li><div class="when">Feb 1–Apr 30</div><div><div class="what">Post OSHA 300A summary</div><div class="ref">Signed by a company executive · 29 CFR 1904.32</div></div></li>
     <li><div class="when">By Mar 2</div><div><div class="what">Submit 300A electronically (ITA)</div><div class="ref">If your establishment size and industry are covered · 1904.41</div></div></li>
     <li><div class="when">Every 12 mo</div><div><div class="what">Annual crane inspection, each unit</div><div class="ref">1926.1412(f)</div></div></li>
     <li><div class="when">Every 12 mo</div><div><div class="what">Driver MVR review and DOT annual vehicle inspection</div><div class="ref">49 CFR 391.25, 396.17</div></div></li>
    </ul><p class="note" style="margin:14px 0 0">Dates are general guidance. Confirm against current OSHA and FMCSA rules for your company.</p></section>
   </div>
  </div>
  <section class="card"><div class="head" style="margin-bottom:10px"><h2>Latest reports</h2><button class="linkbtn" data-go="incidents">All incidents</button></div>${S.incidents.length ? incTable(S.incidents.slice(0, 5)) : empty('No reports yet', '<div>Use “Report” to log an incident or near miss.</div>')}</section>`;
}
function chart() {
  const W = 560, H = 190, L = 26, B = 24, T = 10, months = new Date().getMonth() + 1;
  const data = []; for (let m = 0; m < months; m++) { const row = {}; Object.keys(TYPES).forEach(t => row[t] = 0); inYear(YEAR).forEach(i => { if (D(i.date).getMonth() === m) row[i.type]++; }); data.push(row); }
  const max = Math.max(2, ...data.map(r => Object.values(r).reduce((a, b) => a + b, 0))); const top = Math.ceil(max / 2) * 2;
  const cw = (W - L) / months, bw = Math.min(28, cw * .6), y = v => H - B - (v / top) * (H - B - T);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Reports per month by type">`;
  for (let g = 0; g <= top; g += top / 2) s += `<line x1="${L}" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(g) + 4}" font-size="11" text-anchor="end" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${g}</text>`;
  data.forEach((r, m) => { let acc = 0; const x = L + cw * m + (cw - bw) / 2; Object.keys(TYPES).forEach(t => { if (r[t]) { s += `<rect x="${x}" y="${y(acc + r[t])}" width="${bw}" height="${y(acc) - y(acc + r[t]) - 1}" rx="2" fill="${TYPES[t].c}"><title>${MONTHS[m]}: ${r[t]} ${TYPES[t].l}</title></rect>`; acc += r[t]; } }); s += `<text x="${x + bw / 2}" y="${H - 6}" font-size="11" text-anchor="middle" fill="var(--muted)">${MONTHS[m]}</text>`; });
  return s + '</svg><div class="legend">' + Object.values(TYPES).map(t => `<span><i style="background:${t.c}"></i>${t.l}</span>`).join('') + '</div>';
}
function incTable(list) {
  if (!list.length) return '<p class="sub">No reports match.</p>';
  return `<div class="tbl-wrap"><table><thead><tr><th>No.</th><th>Date</th><th>Type</th><th>Division</th><th>What happened</th><th>OSHA</th></tr></thead><tbody>${list.map(i => { const c = cls(i); return `<tr class="click" data-inc="${i.id}"><td class="mono">${esc(i.no)}</td><td>${fmt(i.date)}</td><td><span class="pill ${TYPES[i.type].p}">${TYPES[i.type].l}</span></td><td>${esc(i.division)}</td><td class="desc">${esc(i.desc)}</td><td>${c ? '<span class="pill p-red">Recordable</span>' : (dotAcc(i) ? '<span class="pill p-violet">DOT accident</span>' : '<span class="pill p-grey">Not recordable</span>')}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function renderPhotoPicks() {
  const box = $('r_prev'); if (!box) return;
  box.innerHTML = pendingPhotos.map((p, ix) => `<div class="ph"><img src="${p.url}" alt="Photo ${ix + 1}"><button type="button" class="ph-x" data-phrm="${ix}" aria-label="Remove photo ${ix + 1}">×</button></div>`).join('') + (pendingPhotos.length ? `<span class="hint" style="align-self:center">${pendingPhotos.length} photo${pendingPhotos.length > 1 ? 's' : ''}. Tap “Choose files” again to add more.</span>` : '');
}
function addPicks(files) {
  let skipped = 0;
  [...files].forEach(f => { if (!/^image\//.test(f.type) && !/\.(heic|heif|jpe?g|png|webp)$/i.test(f.name)) { skipped++; return; } if (pendingPhotos.length >= 10) { skipped++; return; } pendingPhotos.push({ file: f, url: URL.createObjectURL(f) }); });
  renderPhotoPicks(); if (skipped) toast(skipped + ' file' + (skipped > 1 ? 's' : '') + ' skipped. Photos only, up to 10 per report.');
}
async function uploadPhotos(list, onStep) {
  const paths = [], failed = []; let reason = '';
  for (let k = 0; k < list.length; k++) { if (onStep) onStep(k + 1, list.length); const p = await upload(list[k], 'incidents', true); if (p) paths.push(p); else { failed.push(list[k].name); reason = reason || lastUploadError; } }
  return { paths, failed, reason };
}
async function savePhotoPaths(incId, paths) {
  let r = await sb.from('incidents').update({ photo_paths: paths }).eq('id', incId).select().single();
  if (r.error && /photo_paths/.test(r.error.message || '')) { r = await sb.from('incidents').update({ photo_path: paths[0] || null }).eq('id', incId).select().single(); if (!r.error) toast('Only the first photo was kept. Run supabase/add-photos.sql in Supabase to allow more.', true); }
  return r;
}
function vIncidents() {
  const list = S.incidents.filter(i => incFilter === 'all' || (incFilter === 'rec' ? recordable(i) : i.type === incFilter));
  const f = [['all', 'All'], ['rec', 'Recordable'], ['injury', 'Injuries'], ['nearmiss', 'Near misses'], ['damage', 'Property damage'], ['vehicle', 'Vehicle']];
  return `<div class="head"><div><h1>Incidents</h1><p class="sub">${S.incidents.length} report${S.incidents.length === 1 ? '' : 's'} on file. Tap a row for full detail.</p></div><a class="btn primary" href="#report" style="text-decoration:none">New report</a></div>
  <div class="filters">${f.map(([k, l]) => `<button class="chip ${incFilter === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div>
  <section class="card">${S.incidents.length ? incTable(list) : empty('No reports yet', '<div>Near misses are worth reporting too. They show where the next injury could come from.</div>')}</section>`;
}
function vReport() {
  return `<div class="head"><div><h1>Report an incident or near miss</h1><p class="sub">Takes about a minute from a phone. Fields change with the type.</p></div></div>
  <form class="card" id="rform" novalidate>
   <div class="f wide" style="margin-bottom:14px"><span class="lbl">What happened?</span>
    <div class="seg">${Object.entries({ injury: 'Someone was hurt', nearmiss: 'Could have hurt someone', damage: 'Equipment or property', vehicle: 'Truck or road incident' }).map(([k, s], ix) => `<label><input type="radio" name="type" id="t_${k}" value="${k}" ${ix === 1 ? 'checked' : ''}>${TYPES[k].l}<span>${s}</span></label>`).join('')}</div></div>
   <div class="fields">
    <div class="f"><label for="r_date">Date</label><input type="date" id="r_date" value="${TODAY}" max="${TODAY}"></div>
    <div class="f"><label for="r_div">Division</label><select id="r_div">${divs().map(d => `<option>${esc(d)}</option>`).join('')}</select></div>
    <div class="f wide"><label for="r_loc">Where</label><input id="r_loc" placeholder="Jobsite, yard, unit number"></div>
    <div class="f wide"><label for="r_desc">Describe it</label><textarea id="r_desc" placeholder="What was the task, what went wrong, what happened next"></textarea></div>
    <div class="f inj"><label for="r_emp">Employee</label><input id="r_emp" placeholder="Name"></div>
    <div class="f inj"><label for="r_job">Job title</label><input id="r_job" placeholder="Operator, rigger, driver"></div>
    <div class="f inj wide"><label for="r_nat">Injury and body part</label><input id="r_nat" placeholder="e.g. Laceration, left hand"></div>
    <div class="f inj wide"><label for="r_treat">Most serious outcome</label><select id="r_treat">${Object.entries(TREAT).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="f inj"><label for="r_away">Days away from work</label><input type="number" min="0" id="r_away" value="0"></div>
    <div class="f inj"><label for="r_rest">Days restricted or transferred</label><input type="number" min="0" id="r_rest" value="0"></div>
    <div class="f inj wide checks"><label><input type="checkbox" id="r_priv"> Privacy case (keep the name off the 300 log)</label></div>
    <div class="f veh wide"><span class="lbl">DOT accident check <span class="hint">· 49 CFR 390.5</span></span><div class="checks"><label><input type="checkbox" id="d_fatal"> Fatality</label><label><input type="checkbox" id="d_inj"> Injury treated away from the scene</label><label><input type="checkbox" id="d_tow"> Vehicle towed (disabling damage)</label></div></div>
    <div class="f wide"><label for="r_photo">Photos <span class="hint">· optional, up to 10</span></label><input type="file" id="r_photo" accept="image/*" multiple><div id="r_prev" class="photo-grid"></div></div>
    <div class="f wide"><label for="r_fix">Fix needed <span class="hint">· creates a corrective action</span></label><input id="r_fix" placeholder="e.g. Add spotter for lifts near power lines"></div>
    <div class="f wide" id="verdict"></div>
   </div>
   <p class="form-err" id="r_err" role="alert" hidden></p>
   <div class="row" style="margin-top:16px"><button class="btn primary" type="submit" id="r_submit">Submit report</button><a class="btn" href="#overview" style="text-decoration:none">Cancel</a></div>
  </form>`;
}
function reportType() { const r = document.querySelector('input[name=type]:checked'); return r ? r.value : 'nearmiss'; }
function updateReport() {
  const t = reportType(); document.querySelectorAll('#rform .inj').forEach(e => e.hidden = !(t === 'injury' || t === 'vehicle')); document.querySelectorAll('#rform .veh').forEach(e => e.hidden = t !== 'vehicle');
  const v = $('verdict'); if (!v) return; let h = '';
  if (t === 'injury' || t === 'vehicle') {
    const tmp = { treatment: $('r_treat').value, daysAway: +$('r_away').value, daysRestricted: +$('r_rest').value }; const c = cls(tmp);
    h += c ? `<div class="verdict"><span class="pill p-red">Likely recordable</span><div><b>Goes on the OSHA 300 log as ${({ death: 'a death', away: 'a days-away case', restricted: 'a restricted or transfer case', other: 'another recordable case' })[c]}.</b><span class="hint">Based on 29 CFR 1904.7. You make the final call.</span></div></div>` : `<div class="verdict"><span class="pill p-grey">Not recordable</span><div><b>${tmp.treatment === 'firstaid' ? 'First aid only stays off the 300 log.' : 'No injury recorded.'}</b><span class="hint">Still kept as an internal report.</span></div></div>`;
  }
  if (t === 'vehicle') { const a = $('d_fatal').checked || $('d_inj').checked || $('d_tow').checked; h += `<div class="verdict" style="margin-top:8px"><span class="pill ${a ? 'p-violet' : 'p-grey'}">${a ? 'DOT accident' : 'Not a DOT accident'}</span><div><b>${a ? 'Added to the DOT accident register.' : 'Kept as an internal vehicle incident.'}</b>${a ? '<span class="hint">Post-accident drug and alcohol testing may be required; check 49 CFR 382.303.</span>' : ''}</div></div>`; }
  v.innerHTML = h;
}
function yearChips(attr, sel) { return `<div class="filters">${[YEAR, YEAR - 1].map(y => `<button class="chip ${sel === y ? 'on' : ''}" data-${attr}="${y}">${y}</button>`).join('')}</div>`; }
function summary300(y) {
  const recs = inYear(y).filter(recordable); const cnt = k => recs.filter(i => cls(i) === k).length; const sumD = k => recs.reduce((a, i) => a + (+i[k] || 0), 0);
  return { recs, death: cnt('death'), away: cnt('away'), restricted: cnt('restricted'), other: cnt('other'), daysAway: sumD('daysAway'), daysRestricted: sumD('daysRestricted'), hours: hoursTotal(y) };
}
function vOsha() {
  const y = oshaYear, s = summary300(y); const recs = s.recs.slice().sort((a, b) => a.date < b.date ? -1 : 1); const admin = ROLE === 'admin';
  return `<div class="head"><div><h1>OSHA 300 and 300A</h1><p class="sub">These fill in from injury reports. Review before you sign, post or file.</p></div>${yearChips('oy', y)}</div>
  <section class="card"><h2>Form 300 · Log of work-related injuries and illnesses, ${y}</h2>
  ${recs.length ? `<div class="tbl-wrap"><table><thead><tr><th>Case</th><th>Employee</th><th>Job title</th><th>Date</th><th>Where</th><th>Injury</th><th>Class</th><th class="num">Days away</th><th class="num">Restricted</th></tr></thead><tbody>${recs.map(i => { const c = cls(i); return `<tr class="click" data-inc="${i.id}"><td class="mono">${esc(i.no)}</td><td>${i.privacy ? '<em>Privacy case</em>' : esc(i.employee)}</td><td>${esc(i.job)}</td><td>${fmt(i.date)}</td><td>${esc(i.location)}</td><td>${esc(i.nature)}</td><td><span class="pill ${c === 'other' ? 'p-amber' : 'p-red'}">${({ death: 'Death', away: 'Days away', restricted: 'Restricted', other: 'Other recordable' })[c]}</span></td><td class="num">${i.daysAway || 0}</td><td class="num">${i.daysRestricted || 0}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="sub">No recordable cases in ' + y + '.</p>'}
  </section>
  <section class="card"><h2>Form 300A · Summary, ${y}</h2>
   <div class="sum">
    <div><div class="k">Deaths</div><div class="v">${s.death}</div><div class="lt">Col G</div></div>
    <div><div class="k">Days-away cases</div><div class="v">${s.away}</div><div class="lt">Col H</div></div>
    <div><div class="k">Restricted cases</div><div class="v">${s.restricted}</div><div class="lt">Col I</div></div>
    <div><div class="k">Other recordable</div><div class="v">${s.other}</div><div class="lt">Col J</div></div>
    <div><div class="k">Total days away</div><div class="v">${s.daysAway}</div><div class="lt">Col K</div></div>
    <div><div class="k">Total days restricted</div><div class="v">${s.daysRestricted}</div><div class="lt">Col L</div></div>
    <div><div class="k">Hours worked</div><div class="v">${num(s.hours)}</div><div class="lt">From Hours tab</div></div>
    <div><div class="k">Avg. employees</div><div class="v">${admin ? `<input id="avgEmp" type="number" min="0" value="${C.avg_employees || 0}" style="width:90px;font-family:var(--f-mono);font-size:18px;padding:2px 6px">` : (C.avg_employees || 0)}</div><div class="lt">Annual average</div></div>
   </div>
   <p class="note" style="margin:14px 0 0">Post the signed 300A from February 1 to April 30. Copy these totals onto OSHA’s official form, or into OSHA’s Injury Tracking Application if you’re required to submit electronically.</p>
  </section>
  <section class="card"><h2>DOT accident register</h2>${(() => { const l = S.incidents.filter(dotAcc); return l.length ? incTable(l) : '<p class="sub">No DOT-recordable accidents. Vehicle incidents that meet 49 CFR 390.5 appear here automatically.</p>'; })()}</section>`;
}
function vHours() {
  const y = hoursYear; const months = y === YEAR ? new Date().getMonth() + 1 : 12;
  return `<div class="head"><div><h1>Hours and rates</h1><p class="sub">Enter hours worked each month from payroll. TRIR = recordable cases × 200,000 ÷ hours.</p></div>
   <div class="row">${yearChips('hy', y)}<label for="target" style="font-weight:400">TRIR target</label><input id="target" type="number" step="0.1" min="0" value="${C.trir_target}" style="width:80px" ${ROLE === 'admin' ? '' : 'disabled'}></div></div>
  <section class="card"><div class="tbl-wrap hours"><table><thead><tr><th>Division</th>${MONTHS.slice(0, months).map(m => `<th class="num">${m}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
   ${divs().map((dv, di) => `<tr><td style="white-space:nowrap">${esc(dv)}</td>${hoursArr(y, dv).slice(0, months).map((v, i) => `<td class="num"><input type="number" min="0" step="10" id="h_${di}_${i}" data-h="${di}|${i}" value="${v == null ? '' : v}" aria-label="${esc(dv)} ${MONTHS[i]} hours"></td>`).join('')}<td class="num" id="ytd_${di}">${num(hoursTotal(y, dv))}</td></tr>`).join('')}
  </tbody></table></div><p class="hint" style="margin:10px 0 0">Saves when you leave each box. Change divisions under Company &amp; team.</p></section>
  <section class="card" id="rateCard">${rateTable(y)}</section>`;
}
function rateTable(y) {
  return `<h2>Rates by division, ${y}</h2><div class="tbl-wrap"><table><thead><tr><th>Division</th><th class="num">Hours</th><th class="num">Recordable</th><th class="num">TRIR</th><th class="num">DART cases</th><th class="num">DART rate</th></tr></thead><tbody>
  ${[...divs(), null].map(dv => { const x = rates(dv, y); return `<tr${dv ? '' : ' style="font-weight:600"'}><td>${dv ? esc(dv) : 'Company'}</td><td class="num">${num(x.h)}</td><td class="num">${x.rec}</td><td class="num">${n2(x.trir)}</td><td class="num">${x.dart}</td><td class="num">${n2(x.dartR)}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}
function vInspections() {
  return `<div class="head"><div><h1>Inspections</h1><p class="sub">Pick a checklist. Any failed item creates a corrective action automatically.</p></div></div>
  <section class="card"><h2>Start an inspection</h2><div class="tmpl">${Object.entries(TEMPLATES).map(([k, t]) => `<button type="button" data-tmpl="${k}" class="${inspRun && inspRun.tmpl === k ? 'on' : ''}"><b>${t.name}</b><span>${t.items.length} items · ${t.ref}</span></button>`).join('')}</div>${inspRun ? inspForm() : ''}</section>
  <section class="card"><h2>Recent inspections</h2>${S.inspections.length ? `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Checklist</th><th>Unit or area</th><th>By</th><th>Result</th></tr></thead><tbody>
  ${S.inspections.map(x => `<tr><td>${fmt(x.date)}</td><td>${esc((TEMPLATES[x.tmpl] || { name: x.tmpl }).name)}</td><td>${esc(x.asset)}</td><td>${esc(x.by)}</td><td>${x.fails ? `<span class="pill p-red">${x.fails} failed</span>` : `<span class="pill p-green">All ${x.total} passed</span>`}</td></tr>`).join('')}</tbody></table></div>` : empty('No inspections yet', '<div>Pick a checklist above to record the first one.</div>')}</section>`;
}
function inspForm() {
  const t = TEMPLATES[inspRun.tmpl];
  return `<div style="margin-top:18px;border-top:1px solid var(--line);padding-top:16px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:10px">
  <div class="f"><label for="i_asset">Unit or area</label><input id="i_asset" value="${esc(inspRun.asset)}" placeholder="e.g. C-22 boom truck"></div>
  <div class="f"><label for="i_by">Inspected by</label><input id="i_by" value="${esc(inspRun.by)}" placeholder="Name"></div></div>
  <div class="insp-items">${t.items.map((it, ix) => `<div class="insp-item"><div>${esc(it)}</div><div class="pf">${['pass', 'fail', 'na'].map(v => `<button type="button" class="${v} ${inspRun.res[ix] === v ? 'on' : ''}" data-pf="${ix}|${v}">${({ pass: 'Pass', fail: 'Fail', na: 'N/A' })[v]}</button>`).join('')}</div></div>`).join('')}</div>
  <div class="row" style="margin-top:14px"><button class="btn primary" type="button" id="i_submit">Save inspection</button><span class="hint">${inspRun.res.filter(Boolean).length} of ${t.items.length} checked</span></div></div>`;
}
function vActions() {
  const list = S.actions.filter(a => actFilter === 'all' || !a.done).sort((a, b) => (a.done - b.done) || (a.due < b.due ? -1 : 1));
  return `<div class="head"><div><h1>Corrective actions</h1><p class="sub">Every fix from a report or failed inspection, with an owner and a due date.</p></div>
  <div class="filters"><button class="chip ${actFilter === 'open' ? 'on' : ''}" data-af="open">Open</button><button class="chip ${actFilter === 'all' ? 'on' : ''}" data-af="all">All</button></div></div>
  <section class="card"><form id="aform" class="addrow" novalidate><input id="a_title" placeholder="New action" aria-label="Action"><input id="a_owner" placeholder="Owner" aria-label="Owner"><input id="a_due" type="date" value="${addDays(TODAY, 14)}" aria-label="Due date"><button class="btn primary" type="submit">Add</button></form></section>
  <section class="card">${list.length ? `<div class="tbl-wrap"><table><thead><tr><th></th><th>Action</th><th>From</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>
  ${list.map(a => { const s = actStatus(a); return `<tr class="${a.done ? 'done' : ''}"><td><input type="checkbox" id="ac_${a.id}" data-act="${a.id}" ${a.done ? 'checked' : ''} aria-label="Mark done" style="width:auto"></td><td class="t">${esc(a.title)}</td><td class="mono">${esc(a.src)}</td><td>${esc(a.owner)}</td><td>${fmt(a.due)}</td><td><span class="pill ${s.p}">${s.t}</span></td></tr>`; }).join('')}
  </tbody></table></div>` : empty(actFilter === 'open' ? 'No open actions' : 'No actions yet', '<div>Actions come from incident reports and failed inspections, or add one above.</div>')}</section>`;
}
function vCco() {
  const ops = S.operators.slice().sort((a, b) => a.exp < b.exp ? -1 : 1); const st = o => status(o.exp, CCO_WIN);
  const exp = ops.filter(o => st(o).lvl === 2).length, soon = ops.filter(o => st(o).lvl === 1).length;
  const list = ops.filter(o => ccoFilter === 'all' || (ccoFilter === 'exp' ? st(o).lvl === 2 : st(o).lvl === 1)); const names = [...new Set(S.operators.map(o => o.name))];
  return `<div class="head"><div><h1>CCO cards</h1><p class="sub">NCCCO certifications with card numbers and expiration dates. Cards are good for five years; anything expiring within ${CCO_WIN} days shows on the overview.</p></div></div>
  <div class="stats" style="grid-template-columns:repeat(4,minmax(0,1fr))">
   <div class="stat"><div class="k">Certified people</div><div class="v">${names.length}</div><div class="h">${ops.length} cards on file</div></div>
   <div class="stat"><div class="k">Expired</div><div class="v ${exp ? 'bad' : ''}">${exp}</div><div class="h">Off the crane until renewed</div></div>
   <div class="stat"><div class="k">Expiring, ${CCO_WIN} days</div><div class="v ${soon ? 'warn' : ''}">${soon}</div><div class="h">Book exams now</div></div>
   <div class="stat"><div class="k">Missing evaluation</div><div class="v">${ops.filter(o => /Operator/.test(o.cert) && !o.evalDate).length}</div><div class="h">Operators only</div></div>
  </div>
  <section class="card"><h2>Add a card</h2><form id="oform" class="addrow" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))" novalidate>
    <input id="o_name" list="o_names" placeholder="Name" aria-label="Name"><datalist id="o_names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <select id="o_cert" aria-label="Certification">${CCO_CERTS.map(c => `<option>${c}</option>`).join('')}</select>
    <input id="o_spec" placeholder="Specialty, e.g. TLL, TSS" aria-label="Specialty"><input id="o_card" placeholder="Card number" aria-label="Card number">
    <label class="f" style="font-weight:400"><span class="hint">Expires</span><input id="o_exp" type="date" value="${addYears(TODAY, 5)}"></label>
    <label class="f" style="font-weight:400"><span class="hint">Employer evaluation</span><input id="o_eval" type="date"></label>
    <button class="btn primary" type="submit" style="align-self:end">Add card</button></form></section>
  <div class="filters">${[['all', 'All cards'], ['exp', 'Expired'], ['soon', 'Expiring soon']].map(([k, l]) => `<button class="chip ${ccoFilter === k ? 'on' : ''}" data-cf="${k}">${l}</button>`).join('')}</div>
  <section class="card">${list.length ? `<div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Certification</th><th>Card</th><th>Expires</th><th>Status</th><th>Employer evaluation</th><th></th></tr></thead><tbody>
  ${list.map(o => { const s = st(o); const isOp = /Operator/.test(o.cert); return `<tr><td><b>${esc(o.name)}</b></td><td>${esc(o.cert)}${o.spec ? `<div class="hint">${esc(o.spec)}</div>` : ''}</td><td class="mono">${esc(o.card)}</td><td>${fmt(o.exp)}</td><td><span class="pill ${s.p}">${s.t}</span></td><td>${o.evalDate ? fmt(o.evalDate) : (isOp ? '<span class="pill p-amber">Not on file</span>' : '<span class="hint">n/a</span>')}</td><td style="white-space:nowrap"><button class="btn sm" type="button" data-orenew="${o.id}">Renewed</button> <button class="linkbtn" type="button" data-odel="${o.id}" style="color:var(--muted);margin-left:6px">Remove</button></td></tr>`; }).join('')}
  </tbody></table></div>` : (S.operators.length ? '<p class="sub">No cards match.</p>' : empty('No cards yet', '<div>Add each person’s certifications from their NCCCO card.</div>'))}</section>
  <p class="note" style="margin:0">OSHA requires crane operators in construction to be certified and to have a documented employer evaluation (29 CFR 1926.1427). “Renewed” moves the expiration five years out.</p>`;
}
function vPeople() {
  const pill = d => { const s = status(d); return `<span class="pill ${s.p}">${s.t}</span>`; };
  const dt = (id, field, v) => `<input type="date" class="inline-date" data-drv="${id}|${field}" value="${v || ''}" aria-label="${field}">`;
  return `<div class="head"><div><h1>Drivers and equipment</h1><p class="sub">DOT driver qualification and annual inspections. Anything within 45 days shows on the overview.</p></div></div>
  <section class="card"><h2>CDL drivers</h2>
   <form id="dform" class="addrow" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:14px" novalidate>
    <input id="d_name" placeholder="Driver name" aria-label="Driver name">
    <label class="f" style="font-weight:400"><span class="hint">Medical card expires</span><input id="d_med" type="date"></label>
    <label class="f" style="font-weight:400"><span class="hint">CDL expires</span><input id="d_cdl" type="date"></label>
    <label class="f" style="font-weight:400"><span class="hint">Next MVR review</span><input id="d_mvr" type="date"></label>
    <button class="btn primary" type="submit" style="align-self:end">Add driver</button></form>
   ${S.drivers.length ? `<div class="tbl-wrap"><table><thead><tr><th>Driver</th><th>Medical card</th><th></th><th>CDL</th><th></th><th>MVR review</th><th></th><th></th></tr></thead><tbody>
   ${S.drivers.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${dt(d.id, 'med', d.med)}</td><td>${pill(d.med)}</td><td>${dt(d.id, 'cdl', d.cdl)}</td><td>${pill(d.cdl)}</td><td>${dt(d.id, 'mvr', d.mvr)}</td><td>${pill(d.mvr)}</td><td><button class="linkbtn" type="button" data-ddel="${d.id}" style="color:var(--muted)">Remove</button></td></tr>`).join('')}</tbody></table></div><p class="hint" style="margin:8px 0 0">Change a date and it saves right away.</p>` : empty('No drivers yet', '<div>Add CDL drivers to track medical cards, licenses and annual MVR reviews.</div>')}
  </section>
  <section class="card"><div class="head" style="margin-bottom:12px"><div><h2>Annual inspections</h2><p class="sub" style="margin-top:2px">Cranes, trucks, man baskets, fuel tank alarms, anything on a yearly cycle. “Mark inspected” sets the next due date one year out.</p></div></div>
   <form id="uform" class="addrow u5" style="margin-bottom:14px" novalidate>
    <input id="u_unit" placeholder="Unit or ID, e.g. MB-2" aria-label="Unit or ID"><input id="u_kind" placeholder="What it is, e.g. 4-person man basket" aria-label="Description">
    <select id="u_what" aria-label="Inspection type">${INSP_TYPES.map(x => `<option>${x}</option>`).join('')}</select>
    <input id="u_due" type="date" value="${addYears(TODAY, 1)}" aria-label="Next due date"><button class="btn primary" type="submit">Add</button>
    <input id="u_other" placeholder="Name the inspection" aria-label="Inspection name" hidden style="grid-column:1/-1"></form>
   ${S.units.length ? `<div class="tbl-wrap"><table><thead><tr><th>Unit</th><th>Inspection</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>
   ${S.units.slice().sort((a, b) => a.due < b.due ? -1 : 1).map(u => `<tr><td><b class="mono">${esc(u.unit)}</b><div class="hint">${esc(u.kind)}</div></td><td>${esc(u.what)}</td><td>${fmt(u.due)}</td><td>${pill(u.due)}</td><td style="white-space:nowrap"><button class="btn sm" type="button" data-udone="${u.id}">Mark inspected</button> <button class="linkbtn" type="button" data-udel="${u.id}" style="color:var(--muted);margin-left:6px">Remove</button></td></tr>`).join('')}</tbody></table></div>` : empty('Nothing tracked yet', '<div>Add cranes, trucks, man baskets, fuel tanks or anything else with a yearly inspection.</div>')}
  </section>`;
}
function autoVal(r) {
  if (r.auto === 'trir') { const x = rates(); return isFinite(x.trir) ? { value: n2(x.trir) } : null; }
  if (r.auto === 'dart') { const x = rates(); return isFinite(x.dartR) ? { value: n2(x.dartR) } : null; }
  if (r.auto === '300a') { const s = summary300(YEAR - 1); return { value: `${YEAR - 1} OSHA 300A: ${s.death} deaths, ${s.away} days-away cases, ${s.restricted} restricted cases, ${s.other} other recordable; ${s.daysAway} days away, ${s.daysRestricted} days restricted; ${num(s.hours)} hours worked` }; }
  if (r.auto === 'cco') { const curr = S.operators.filter(o => o.exp >= TODAY); if (!curr.length) return null; return { value: curr.length + ' current CCO cards: ' + curr.map(o => o.name + ' (' + o.cert + ', exp ' + fmt(o.exp) + ')').join('; '), expires: curr.map(o => o.exp).sort()[0] }; }
  return null;
}
function vPortal() {
  const gcs = myGcs(); if (!portalGc || !gcs.some(g => g.id === portalGc)) portalGc = gcs[0] && gcs[0].id;
  const gc = gcs.find(g => g.id === portalGc); const reqs = gc ? S.gcReqs.filter(r => r.gc === gc.id) : [];
  const mine = r => S.subOut.find(x => x.requirement_id === r.id && x.gc_id === gc.id);
  const autos = gc ? reqs.filter(r => r.auto && !(r.onlyCrane && !C.is_crane) && ['missing', 'expired', 'rejected'].includes(subSt(r, mine(r), C.is_crane).k)).length : 0;
  return `<div class="head"><div><h1>Sub portal</h1><p class="sub">Your side as a subcontractor. Every general contractor you work for, what each one requires, and what you’ve sent.</p></div></div>
  <section class="card"><div class="head"><div><h2>Your general contractors</h2></div>
   <form id="linkform" class="row" novalidate><input id="link_code" placeholder="Contractor code" aria-label="Contractor code" style="width:220px"><button class="btn" type="submit">Link a GC</button></form></div>
   ${gcs.length ? `<div class="filters" style="margin-top:12px">${gcs.map(g => { const p = progress(g.id, C.id, C.is_crane, S.subOut); return `<button class="chip ${g.id === portalGc ? 'on' : ''}" data-pgc="${g.id}">${esc(g.name)} · ${p.done}/${p.need}</button>`; }).join('')}</div>` : '<p class="sub" style="margin:10px 0 0">When a general contractor gives you their code, enter it here to see what they need from you.</p>'}</section>
  ${gc ? `<section class="card"><div class="head" style="margin-bottom:14px"><div><h2>${esc(gc.name)} requirements</h2><div style="max-width:260px;margin-top:6px">${progHTML(progress(gc.id, C.id, C.is_crane, S.subOut))}</div></div>${autos ? `<button class="btn hi" type="button" id="autoAll">Fill ${autos} from my ${esc(APP)} data</button>` : ''}</div>
   ${reqs.length ? `<div>${reqs.map(r => { const x = mine(r), st = subSt(r, x, C.is_crane); if (st.k === 'na') return ''; const id = r.id; const locked = st.k === 'ok' || st.k === 'submitted';
    return `<div class="req"><div><div class="row" style="gap:8px"><b>${esc(r.name)}</b><span class="pill ${st.p}">${st.t}</span></div>${r.help ? `<div class="hint">${esc(r.help)}</div>` : ''}${r.max != null ? `<div class="hint">Must be ${n2(r.max)} or lower</div>` : ''}${x ? `<div class="hint" style="margin-top:4px">On file: ${esc(shown(x))}${x.expires ? ' · expires ' + fmt(x.expires) : ''}${x.file_path ? ` · <button class="linkbtn" type="button" data-open="${esc(x.file_path)}">Open</button>` : ''}</div>` : ''}${x && x.note ? `<div class="hint" style="color:var(--red);margin-top:4px">${esc(x.note)}</div>` : ''}</div>
     <div class="ctl">${r.kind === 'number' ? `<input type="number" step="0.01" id="pv_${id}" placeholder="${r.max != null ? '≤ ' + n2(r.max) : 'Value'}" aria-label="${esc(r.name)}">` : `<input type="file" id="pf_${id}" aria-label="${esc(r.name)} file" accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx,.xls,.xlsx">`}${r.expires ? `<label class="hint" style="display:flex;gap:6px;align-items:center">Expires <input type="date" id="pe_${id}" value="${x && x.expires ? x.expires : ''}"></label>` : ''}
     <button class="btn sm ${locked ? '' : 'primary'}" type="button" data-psub="${r.id}">${locked ? 'Replace' : 'Submit'}</button>${r.auto ? `<button class="btn sm hi" type="button" data-pauto="${r.id}">Use my data</button>` : ''}</div></div>`; }).join('')}</div>` : '<p class="sub">This contractor hasn’t listed any requirements yet.</p>'}
   <div class="row" style="margin-top:12px"><button class="linkbtn" type="button" data-unlink="${gc.id}" style="color:var(--muted)">Unlink ${esc(gc.name)}</button></div></section>` : ''}`;
}
function vSubs() {
  const subs = mySubs(); const P = subs.map(sbx => ({ sb: sbx, p: progress(C.id, sbx.id, sbx.is_crane, S.subIn) }));
  const full = P.filter(x => x.p.need && x.p.done === x.p.need).length; const review = S.subIn.filter(x => x.status === 'submitted').length; const prob = P.reduce((a, x) => a + x.p.st.filter(k => ['missing', 'rejected', 'expired'].includes(k)).length, 0);
  return `<div class="head"><div><h1>Subcontractors</h1><p class="sub">Your side as a general contractor. Set requirements once; every sub you invite sees them and sends documents and numbers here.</p></div></div>
  <section class="card"><div class="head"><div><h2>Invite subcontractors</h2><p class="sub" style="margin-top:2px">Subs create a free ${esc(APP)} account, then enter this code on their Sub portal page.</p></div><div class="row"><span class="code" id="gcCode">${esc(C.gc_code)}</span><button class="btn sm" type="button" id="copyGc">Copy code</button></div></div></section>
  <div class="stats" style="grid-template-columns:repeat(4,minmax(0,1fr))">
   <div class="stat"><div class="k">Linked subs</div><div class="v">${subs.length}</div><div class="h">Using your code</div></div>
   <div class="stat"><div class="k">Fully compliant</div><div class="v">${full}</div><div class="h">Cleared to work</div></div>
   <div class="stat"><div class="k">Awaiting your review</div><div class="v ${review ? 'warn' : ''}">${review}</div><div class="h">Items submitted</div></div>
   <div class="stat"><div class="k">Missing or expired</div><div class="v ${prob ? 'bad' : ''}">${prob}</div><div class="h">Across all subs</div></div>
  </div>
  <section class="card"><h2>Subcontractor status</h2>${subs.length ? `<div class="tbl-wrap"><table><thead><tr><th>Company</th><th>Trade</th><th>Progress</th><th>Needs attention</th><th></th></tr></thead><tbody>
  ${P.map(({ sb: s, p }) => { const c = k => p.st.filter(x => x === k).length; const flags = []; if (c('submitted')) flags.push(`<span class="pill p-blue">${c('submitted')} to review</span>`); if (c('rejected')) flags.push(`<span class="pill p-red">${c('rejected')} rejected</span>`); if (c('expired')) flags.push(`<span class="pill p-red">${c('expired')} expired</span>`); if (c('missing')) flags.push(`<span class="pill p-grey">${c('missing')} missing</span>`); if (c('soon')) flags.push(`<span class="pill p-amber">${c('soon')} expiring</span>`);
   return `<tr class="click" data-review="${s.id}"><td><b>${esc(s.name)}</b></td><td>${esc(s.trade)}</td><td>${progHTML(p)}</td><td><div class="row" style="gap:4px">${flags.join('') || (p.need ? '<span class="pill p-green">Cleared</span>' : '<span class="hint">No requirements yet</span>')}</div></td><td><button class="btn sm" type="button">Review</button></td></tr>`; }).join('')}
  </tbody></table></div>` : empty('No subcontractors linked yet', '<div>Send subs your code above. They’ll appear here as soon as they link.</div>')}</section>
  <section class="card"><h2>Your requirements</h2><p class="sub" style="margin:-6px 0 12px">What every sub must provide. Changes show in their portal right away.</p>
   ${S.reqs.length ? `<div class="tbl-wrap"><table><thead><tr><th>Requirement</th><th>Type</th><th>Rule</th><th></th></tr></thead><tbody>
   ${S.reqs.map(r => `<tr><td><b>${esc(r.name)}</b>${r.help ? `<div class="hint">${esc(r.help)}</div>` : ''}</td><td>${r.kind === 'doc' ? 'Document' : 'Number'}</td><td>${[r.expires ? 'Tracks expiration' : '', r.max != null ? 'Max ' + n2(r.max) : '', r.onlyCrane ? 'Crane subs only' : '', r.auto ? 'Subs can auto-fill' : ''].filter(Boolean).join(' · ') || '<span class="hint">—</span>'}</td><td><button class="linkbtn" type="button" data-rdel="${r.id}" style="color:var(--muted)">Remove</button></td></tr>`).join('')}
   </tbody></table></div>` : `<div class="empty"><b>No requirements yet</b><div style="margin-bottom:10px">Start with a common set (insurance, EMR, TRIR, 300A, safety program, W-9) and adjust it.</div><button class="btn primary" type="button" id="starterReqs">Add the common set</button></div>`}
   <form id="rqform" class="addrow" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-top:14px" novalidate>
    <input id="rq_name" placeholder="New requirement, e.g. Fall protection plan" aria-label="Requirement" style="grid-column:span 2">
    <select id="rq_kind" aria-label="Type"><option value="doc">Document</option><option value="number">Number</option></select>
    <input id="rq_max" type="number" step="0.01" placeholder="Max value (optional)" aria-label="Maximum value">
    <label class="checks" style="align-self:center"><span style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" id="rq_exp" style="width:auto"> Expires</span></label>
    <button class="btn primary" type="submit">Add requirement</button></form></section>`;
}
function showReview(subId) {
  const s = mySubs().find(x => x.id === subId); if (!s) return;
  document.getElementById('layer').innerHTML = `<div class="overlay" id="ov"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt" style="max-width:780px"><div class="head"><div><h2 id="mt">${esc(s.name)}</h2><p class="sub" style="margin-top:2px">${esc(s.trade)} · linked ${fmt((s.linked_at || '').slice(0, 10))}</p></div><button class="btn sm" id="mclose" type="button">Close</button></div>
  ${S.reqs.length ? `<div class="tbl-wrap" style="margin-top:12px"><table><tbody>${S.reqs.map(r => { const x = S.subIn.find(y => y.sub_id === s.id && y.requirement_id === r.id); const st = subSt(r, x, s.is_crane); const over = r.max != null && x && x.value && +x.value > r.max;
   return `<tr><td><b>${esc(r.name)}</b><div class="hint">${esc(shown(x))}${x && x.expires ? ' · expires ' + fmt(x.expires) : ''}${over ? ' · <span style="color:var(--red)">above ' + n2(r.max) + ' limit</span>' : ''}${x && x.note ? '<br>Your note: ' + esc(x.note) : ''}</div>${x && x.file_path ? `<button class="linkbtn" type="button" data-open="${esc(x.file_path)}">Open document</button>` : ''}</td><td><span class="pill ${st.p}">${st.t}</span></td>
   <td style="min-width:200px">${x && st.k !== 'na' ? `<div style="display:flex;flex-direction:column;gap:6px">${x.status !== 'approved' ? `<button class="btn sm" type="button" data-rv="${x.id}|a">Approve</button>` : ''}${x.status !== 'rejected' ? `<div class="row" style="gap:4px;flex-wrap:nowrap"><input id="note_${x.id}" placeholder="Reason (sub will see it)" style="padding:5px 7px;font-size:12.5px"><button class="btn sm" type="button" data-rv="${x.id}|r">Reject</button></div>` : ''}</div>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="sub">Add requirements first.</p>'}
  <div class="row" style="margin-top:14px;justify-content:space-between"><button class="linkbtn" type="button" data-unlink="${s.id}" style="color:var(--muted)">Remove this subcontractor</button></div></div></div>`;
}
function vAwards() {
  if (S.awardsMissing) return `<div class="head"><div><h1>Safety awards</h1></div></div><section class="card">${empty('One quick setup step', `<div>${ROLE === 'admin' ? 'Run <b>supabase/add-awards.sql</b> in the Supabase SQL Editor, then refresh this page.' : 'Ask your Eyebolt admin to finish the awards setup.'}</div>`)}</section>`;
  const won = S.awards.filter(a => a.status === 'won').sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));
  const thisYear = S.awards.filter(a => a.year === awardYear).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const upcoming = S.awards.filter(a => a.deadline && a.deadline >= TODAY && ['planned', 'in_progress'].includes(a.status)).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const years = [...new Set([YEAR + 1, YEAR, YEAR - 1, ...S.awards.map(a => a.year)])].sort((a, b) => b - a);
  const prevYear = S.awards.filter(a => a.year === awardYear - 1);
  const dr = awardDraft || {};
  return `<div class="head"><div><h1>Safety awards</h1><p class="sub">Track every award you apply for, year after year. Awards you win go on your ribbon wall and in the menu.</p></div></div>
  <div class="stats" style="grid-template-columns:repeat(3,minmax(0,1fr))">
   <div class="stat"><div class="k">Awards won</div><div class="v">${won.length}</div><div class="h">All years</div></div>
   <div class="stat"><div class="k">Applications, ${YEAR}</div><div class="v">${S.awards.filter(a => a.year === YEAR).length}</div><div class="h">${S.awards.filter(a => a.year === YEAR && a.status === 'submitted').length} submitted</div></div>
   <div class="stat"><div class="k">Next deadline</div><div class="v" style="font-size:28px;padding-top:6px">${upcoming ? fmt(upcoming.deadline) : '—'}</div><div class="h">${upcoming ? esc(upcoming.name) : 'None coming up'}</div></div>
  </div>
  <section class="card"><h2>Ribbon wall</h2>${won.length ? `<div class="ribbon-wall">${won.map(a => `<button type="button" class="rib-card" data-award="${a.id}">${ribbonSVG(a.color, a.year)}<b>${esc(a.name)}</b><span>${esc(a.level || a.organization)}</span></button>`).join('')}</div>` : empty('No ribbons yet', '<div>When you mark an application as won, it shows up here as a ribbon.</div>')}</section>
  <section class="card"><div class="head" style="margin-bottom:12px"><h2>Applications</h2><div class="filters">${years.map(y => `<button class="chip ${y === awardYear ? 'on' : ''}" data-ay="${y}">${y}</button>`).join('')}</div></div>
   ${thisYear.length ? `<div class="tbl-wrap"><table><thead><tr><th>Award</th><th>Organization</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>
   ${thisYear.map(a => { const st = AWARD_STATUS[a.status]; const dl = a.deadline ? days(TODAY, a.deadline) : null; const dlPill = a.deadline && ['planned', 'in_progress'].includes(a.status) ? (dl < 0 ? '<span class="pill p-grey">Passed</span>' : dl <= 30 ? `<span class="pill p-amber">${dl} days</span>` : '') : '';
    return `<tr class="click" data-award="${a.id}"><td><div class="row" style="gap:8px;flex-wrap:nowrap">${a.status === 'won' ? ribbonSVG(a.color, '', 18) : ''}<b>${esc(a.name)}</b></div>${a.category ? `<div class="hint">${esc(a.category)}</div>` : ''}</td><td>${esc(a.organization)}</td><td>${a.deadline ? fmt(a.deadline) : '<span class="hint">Not set</span>'} ${dlPill}</td><td><span class="pill ${st.p}">${st.l}</span>${a.level ? `<div class="hint">${esc(a.level)}</div>` : ''}</td><td><button class="btn sm" type="button">Edit</button></td></tr>`; }).join('')}
   </tbody></table></div>` : `<p class="sub">No applications for ${awardYear} yet.${prevYear.length ? '' : ' Add one below, or pick a program to start from.'}</p>`}
   ${prevYear.length && !thisYear.length ? `<div class="row" style="margin-top:8px"><button class="btn" type="button" id="copyAwards">Copy ${prevYear.length} from ${awardYear - 1} into ${awardYear}</button><span class="hint">Same awards, new year, status reset to planning.</span></div>` : ''}
  </section>
  <section class="card" id="awardAdd"><h2>Add an application for ${awardYear}</h2>
   <p class="hint" style="margin:-4px 0 10px">Common programs for crane, rigging and trucking companies. Tap one to fill the form, then add this year’s deadline from the organization’s website.</p>
   <div class="filters" style="margin-bottom:14px">${AWARD_PROGRAMS.map((p, i) => `<button type="button" class="chip" data-aprog="${i}">${esc(p.name)}</button>`).join('')}</div>
   <form id="awform" class="addrow" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))" novalidate>
    <input id="aw_name" placeholder="Award name" aria-label="Award name" value="${esc(dr.name || '')}">
    <input id="aw_org" placeholder="Organization" aria-label="Organization" value="${esc(dr.organization || '')}">
    <input id="aw_cat" placeholder="Category, e.g. Crane & rigging" aria-label="Category" value="${esc(dr.category || '')}">
    <label class="f" style="font-weight:400"><span class="hint">Application deadline</span><input id="aw_due" type="date"></label>
    <input id="aw_link" placeholder="Link to application (optional)" aria-label="Link">
    <button class="btn primary" type="submit" style="align-self:end">Add application</button>
   </form></section>`;
}
function showAward(id) {
  const a = S.awards.find(x => x.id === id); if (!a) return;
  $('layer').innerHTML = `<div class="overlay" id="ov"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="head"><div class="row" style="gap:12px;flex-wrap:nowrap"><span id="awPreview">${ribbonSVG(a.color, a.year, 46)}</span><div><h2 id="mt">${esc(a.name)}</h2><p class="sub" style="margin-top:2px">${esc(a.organization)}</p></div></div><button class="btn sm" id="mclose" type="button">Close</button></div>
  <form id="aweform" data-id="${a.id}" novalidate style="margin-top:14px"><div class="fields">
   <div class="f wide"><label for="ae_name">Award</label><input id="ae_name" value="${esc(a.name)}"></div>
   <div class="f"><label for="ae_org">Organization</label><input id="ae_org" value="${esc(a.organization)}"></div>
   <div class="f"><label for="ae_cat">Category</label><input id="ae_cat" value="${esc(a.category)}"></div>
   <div class="f"><label for="ae_year">Year</label><input id="ae_year" type="number" min="1990" max="2100" value="${a.year}"></div>
   <div class="f"><label for="ae_due">Application deadline</label><input id="ae_due" type="date" value="${a.deadline || ''}"></div>
   <div class="f"><label for="ae_status">Status</label><select id="ae_status">${Object.entries(AWARD_STATUS).map(([k, v]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${v.l}</option>`).join('')}</select></div>
   <div class="f"><label for="ae_level">Result or level <span class="hint">· e.g. 1st place, Gold</span></label><input id="ae_level" value="${esc(a.level)}"></div>
   <div class="f wide"><span class="lbl">Ribbon color</span><div class="rib-colors">${Object.keys(RIB).map(c => `<label title="${c}"><input type="radio" name="ae_color" value="${c}" ${a.color === c ? 'checked' : ''}>${ribbonSVG(c, '', 26)}</label>`).join('')}</div></div>
   <div class="f wide"><label for="ae_link">Link</label><input id="ae_link" value="${esc(a.link)}" placeholder="https://">${a.link && /^https?:\/\//.test(a.link) ? `<a href="${esc(a.link)}" target="_blank" rel="noopener" class="hint">Open application page</a>` : ''}</div>
   <div class="f wide"><label for="ae_notes">Notes</label><textarea id="ae_notes" placeholder="What you submitted, who wrote it, what to do better next year">${esc(a.notes)}</textarea></div>
  </div><div class="row" style="margin-top:14px;justify-content:space-between"><button class="btn primary" type="submit">Save</button><button class="linkbtn" type="button" data-awdel="${a.id}" style="color:var(--muted)">Delete</button></div></form></div></div>`;
}
function vSettings() {
  const admin = ROLE === 'admin'; const me = S.members.find(m => m.user_id === session.user.id);
  return `<div class="head"><div><h1>Company and team</h1><p class="sub">${admin ? 'You’re an admin.' : 'Only admins can change company settings.'}</p></div></div>
  <section class="card"><h2>Company</h2><form id="coform" novalidate><div class="fields">
   <div class="f"><label for="s_name">Company name</label><input id="s_name" value="${esc(C.name)}" ${admin ? '' : 'disabled'}></div>
   <div class="f"><label for="s_trade">Trade</label><input id="s_trade" value="${esc(C.trade)}" ${admin ? '' : 'disabled'}></div>
   <div class="f wide"><label for="s_divs">Divisions <span class="hint">· comma separated; used for reports and hours</span></label><input id="s_divs" value="${esc(divs().join(', '))}" ${admin ? '' : 'disabled'}></div>
   <div class="f"><label for="s_target">TRIR target</label><input id="s_target" type="number" step="0.1" min="0" value="${C.trir_target}" ${admin ? '' : 'disabled'}></div>
   <div class="f"><label for="s_avg">Average employees</label><input id="s_avg" type="number" min="0" value="${C.avg_employees}" ${admin ? '' : 'disabled'}></div>
   <div class="f wide checks"><label><input type="checkbox" id="s_crane" ${C.is_crane ? 'checked' : ''} ${admin ? '' : 'disabled'}> We run cranes or do rigging</label></div>
  </div>${admin ? '<div class="row" style="margin-top:14px"><button class="btn primary" type="submit">Save company</button></div>' : ''}</form></section>
  <section class="card"><h2>Codes</h2><div class="split">
   <div><div class="lbl">Team code</div><p class="hint" style="margin:2px 0 8px">Coworkers use this to join your company.</p><div class="row"><span class="code" id="teamCode">${esc(C.invite_code)}</span><button class="btn sm" type="button" id="copyTeam">Copy</button></div></div>
   <div><div class="lbl">Contractor code</div><p class="hint" style="margin:2px 0 8px">Your subcontractors use this to link to you.</p><div class="row"><span class="code" id="gcCode2">${esc(C.gc_code)}</span><button class="btn sm" type="button" id="copyGc2">Copy</button></div></div>
  </div>${admin ? '<p class="hint" style="margin:12px 0 0">If a code got shared with the wrong person, make new ones. Old codes stop working; people already in stay in. <button class="linkbtn" type="button" id="newCodes">Make new codes</button></p>' : ''}</section>
  <section class="card"><h2>Team</h2><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead><tbody>
   ${S.members.map(m => `<tr><td><b>${esc(m.full_name || '—')}</b>${m.user_id === session.user.id ? ' <span class="hint">(you)</span>' : ''}</td><td>${esc(m.email)}</td><td>${admin && m.user_id !== session.user.id ? `<select data-mrole="${m.user_id}" style="width:auto;padding:4px 6px"><option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option><option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option></select>` : `<span class="pill ${m.role === 'admin' ? 'p-blue' : 'p-grey'}">${m.role === 'admin' ? 'Admin' : 'Member'}</span>`}</td><td>${admin && m.user_id !== session.user.id ? `<button class="linkbtn" type="button" data-mdel="${m.user_id}" style="color:var(--muted)">Remove</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div><p class="hint" style="margin:10px 0 0">Admins can change settings, codes, the menu and the team. Members can report and update records.</p></section>
  <section class="card"><h2>Your account</h2><p class="sub" style="margin:0 0 12px">Signed in as ${esc(session.user.email)}${me ? ' · ' + (me.role === 'admin' ? 'Admin' : 'Member') : ''}.</p>
   <div class="row"><button class="btn" type="button" id="addCompany">Add or join another company</button><button class="btn" type="button" id="leaveCo">Leave ${esc(C.name)}</button><button class="btn" type="button" id="signOut2">Sign out</button></div></section>`;
}
function showInc(id) {
  const i = S.incidents.find(x => x.id === id); if (!i) return; const c = cls(i);
  const rows = [['Date', fmt(i.date)], ['Division', i.division], ['Where', i.location], ['What happened', i.desc]];
  if (i.type === 'injury' || i.type === 'vehicle') rows.push(['Employee', i.privacy ? 'Privacy case' : i.employee], ['Job title', i.job], ['Injury', i.nature], ['Outcome', TREAT[i.treatment] || ''], ['Days away / restricted', (i.daysAway || 0) + ' / ' + (i.daysRestricted || 0)]);
  if (i.type === 'vehicle') rows.push(['DOT accident', dotAcc(i) ? 'Yes' : 'No']);
  const acts = S.actions.filter(a => a.src === i.no);
  $('layer').innerHTML = `<div class="overlay" id="ov"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="head"><div><span class="pill ${TYPES[i.type].p}">${TYPES[i.type].l}</span> ${c ? '<span class="pill p-red">OSHA recordable</span>' : ''}<h2 id="mt" style="margin-top:8px">Report ${esc(i.no)}</h2></div><button class="btn sm" id="mclose" type="button">Close</button></div>
  <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}${acts.length ? `<dt>Corrective actions</dt><dd>${acts.map(a => esc(a.title) + ' · ' + actStatus(a).t).join('<br>')}</dd>` : ''}</dl>
  <div class="lbl" style="margin-top:14px">Photos</div><div id="incPhoto" class="photo-grid">${i.photos.length ? '<span class="hint">Loading photos…</span>' : '<span class="hint">No photos yet.</span>'}</div>
  <label class="btn sm" style="margin-top:8px;display:inline-flex;gap:6px;align-items:center;cursor:pointer">Add photos<input type="file" accept="image/*" multiple data-addph="${i.id}" style="position:absolute;opacity:0;width:1px;height:1px"></label>
  ${ROLE === 'admin' ? `<div class="row" style="margin-top:16px;justify-content:flex-end"><button class="linkbtn" type="button" data-idel="${i.id}" style="color:var(--muted)">Delete this report</button></div>` : ''}</div></div>`;
  $('mclose').focus();
  loadIncPhotos(i);
}
async function loadIncPhotos(i) {
  const box = $('incPhoto'); if (!box || !i.photos.length) return;
  const r = await sb.storage.from('docs').createSignedUrls(i.photos, 600);
  if (!$('incPhoto')) return;
  if (r.error || !r.data) { $('incPhoto').innerHTML = '<span class="hint">Couldn’t load photos. ' + esc(friendly(r.error)) + '</span>'; return; }
  $('incPhoto').innerHTML = r.data.map((x, ix) => x.signedUrl ? `<a class="ph" href="${esc(x.signedUrl)}" target="_blank" rel="noopener" title="Open full size"><img src="${esc(x.signedUrl)}" alt="Report photo ${ix + 1}"></a>` : '').join('');
}
function showNavEdit() {
  const c = navCfg();
  $('layer').innerHTML = `<div class="overlay" id="ov"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="head"><div><h2 id="mt">Customize menu</h2><p class="sub" style="margin-top:2px">Changes apply to everyone in ${esc(C.name)}. Hidden sections also stop showing alerts on the overview.</p></div><button class="btn sm" id="mclose" type="button">Done</button></div>
  <div class="navedit">${c.order.map((k, ix) => { const def = Object.fromEntries(VIEWS)[k], l = c.labels[k] || def, lock = LOCKED.has(k); return `<div class="ne-row ${c.hidden.includes(k) ? 'off' : ''}">
   <label class="sw" title="${lock ? 'Always shown' : 'Show or hide'}"><input type="checkbox" data-nvis="${k}" ${c.hidden.includes(k) ? '' : 'checked'} ${lock ? 'disabled' : ''} aria-label="Show ${esc(def)}"><span></span></label>
   <div class="ne-main"><input data-nlab="${k}" value="${esc(l)}" aria-label="Name for ${esc(def)}" maxlength="28"><div class="hint">${esc(NAV_DESC[k] || '')}${l !== def ? ' · was “' + esc(def) + '”' : ''}</div></div>
   <div class="ne-mv"><button type="button" class="btn sm" data-nmv="${k}|-1" ${ix === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button type="button" class="btn sm" data-nmv="${k}|1" ${ix === c.order.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></div></div>`; }).join('')}</div>
  <div class="row" style="margin-top:14px;justify-content:space-between"><button class="linkbtn" type="button" id="navReset">Reset to default</button></div></div></div>`;
}
async function saveNav(n) { const r = await q(sb.from('companies').update({ nav: n }).eq('id', C.id)); if (r) { C.nav = n; $('nav').innerHTML = navHTML(); showNavEdit(); } }
const closeModal = () => { $('layer').innerHTML = ''; };
async function openFile(path) {
  const w = window.open('', '_blank');
  const r = await sb.storage.from('docs').createSignedUrl(path, 600);
  if (r.error || !r.data) { if (w) w.close(); toast('Couldn’t open that file. ' + friendly(r.error), true); return; }
  if (w) w.location = r.data.signedUrl; else location.href = r.data.signedUrl;
}
let lastUploadError = '';
async function upload(file, folder, quiet) {
  lastUploadError = '';
  if (file.size > 20 * 1024 * 1024) { lastUploadError = file.name + ' is over 20 MB'; if (!quiet) toast('That file is over 20 MB. Try a smaller copy or a PDF.', true); return null; }
  const safe = (file.name || 'photo.jpg').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `${C.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`;
  try {
    const r = await sb.storage.from('docs').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (r.error) { lastUploadError = friendly(r.error); if (!quiet) toast('Upload failed. ' + lastUploadError, true); return null; }
    return path;
  } catch (e) { lastUploadError = friendly(e); if (!quiet) toast('Upload failed. ' + lastUploadError, true); return null; }
}

/* =====================================================================
   Events
   ===================================================================== */
document.addEventListener('click', async e => {
  const t = e.target;
  const gt = t.closest('[data-gtab]'); if (gt) { gateTab = gt.dataset.gtab; renderGate(); return; }
  const stb = t.closest('[data-stab]'); if (stb) { setupTab = stb.dataset.stab; renderSetup(memberships.length > 0); return; }
  if (t.id === 'signOut' || t.id === 'signOut2') { await sb.auth.signOut(); try { localStorage.removeItem('eb-company'); } catch (x) { } gateTab = 'signin'; renderGate(); return; }
  if (t.id === 'retry') { afterSignIn(); return; }
  if (t.id === 'setupBack') { openCompany(C ? C.id : memberships[0].company.id); return; }
  if (t.id === 'addCompany') { setupTab = 'create'; renderSetup(true); return; }
  if (!C) return;
  if (t.id === 'ov' || t.id === 'mclose') { const wasNav = !!document.querySelector('.navedit'); closeModal(); if (wasNav) render(true); return; }
  const g = t.closest('[data-go]'); if (g) { go(g.dataset.go); return; }
  const op = t.closest('[data-open]'); if (op) { openFile(op.dataset.open); return; }
  const tr = t.closest('[data-inc]'); if (tr) { showInc(tr.dataset.inc); return; }
  const fl = t.closest('[data-filter]'); if (fl) { incFilter = fl.dataset.filter; render(true); return; }
  const af = t.closest('[data-af]'); if (af) { actFilter = af.dataset.af; render(true); return; }
  const cf = t.closest('[data-cf]'); if (cf) { ccoFilter = cf.dataset.cf; render(true); return; }
  const hy = t.closest('[data-hy]'); if (hy) { hoursYear = +hy.dataset.hy; render(true); return; }
  const oy = t.closest('[data-oy]'); if (oy) { oshaYear = +oy.dataset.oy; render(true); return; }
  const tm = t.closest('[data-tmpl]'); if (tm) { inspRun = { tmpl: tm.dataset.tmpl, asset: '', by: '', res: [] }; render(true); return; }
  const pf = t.closest('[data-pf]'); if (pf) { const [ix, v] = pf.dataset.pf.split('|'); inspRun.asset = val('i_asset'); inspRun.by = val('i_by'); inspRun.res[+ix] = v; render(true); return; }
  const pg = t.closest('[data-pgc]'); if (pg) { portalGc = pg.dataset.pgc; render(true); return; }
  const phr = t.closest('[data-phrm]'); if (phr) { const ix = +phr.dataset.phrm; URL.revokeObjectURL(pendingPhotos[ix].url); pendingPhotos.splice(ix, 1); renderPhotoPicks(); return; }
  if (t.id === 'navEdit') { showNavEdit(); return; }
  if (t.id === 'navReset') { await saveNav({}); toast('Menu reset.'); return; }
  const nm = t.closest('[data-nmv]'); if (nm) { const [k, d] = nm.dataset.nmv.split('|'); const c = navCfg(); const o = c.order, i = o.indexOf(k), j = i + (+d); if (j >= 0 && j < o.length) { [o[i], o[j]] = [o[j], o[i]]; await saveNav(c); } return; }
  if (t.id === 'copyGc' || t.id === 'copyGc2') { copyText(C.gc_code, $(t.id === 'copyGc' ? 'gcCode' : 'gcCode2')); return; }
  if (t.id === 'copyTeam') { copyText(C.invite_code, $('teamCode')); return; }

  if (t.id === 'i_submit') {
    const tp = TEMPLATES[inspRun.tmpl]; inspRun.asset = val('i_asset') || 'Unspecified'; inspRun.by = val('i_by') || 'Unspecified';
    if (inspRun.res.filter(Boolean).length < tp.items.length) { toast('Mark every item Pass, Fail or N/A first.'); return; }
    const fails = []; inspRun.res.forEach((v, ix) => { if (v === 'fail') fails.push(tp.items[ix]); });
    busy(t, true);
    const row = await q(sb.from('inspections').insert({ company_id: C.id, template: inspRun.tmpl, asset: inspRun.asset, inspected_by: inspRun.by, results: tp.items.map((it, ix) => ({ item: it, result: inspRun.res[ix] })), fails: fails.length, total: tp.items.length }).select().single());
    if (!row) { busy(t, false); return; }
    S.inspections.unshift(mapInsp(row));
    if (fails.length) { const acts = await q(sb.from('actions').insert(fails.map(it => ({ company_id: C.id, title: 'Fix: ' + it + ' (' + inspRun.asset + ')', source: 'Inspection', owner: 'Unassigned', due: addDays(TODAY, 7) }))).select()); if (acts) acts.forEach(a => S.actions.push(mapAct(a))); }
    inspRun = null; render(true); toast(fails.length ? 'Saved. ' + fails.length + ' corrective action' + (fails.length > 1 ? 's' : '') + ' created.' : 'Saved. All items passed.'); return;
  }
  const ud = t.closest('[data-udone]'); if (ud) { const u = S.units.find(x => x.id === ud.dataset.udone); const due = addYears(TODAY, 1); if (await q(sb.from('units').update({ due }).eq('id', u.id))) { u.due = due; render(true); toast(u.unit + ' inspected. Next due ' + fmt(due) + '.'); } return; }
  const ux = t.closest('[data-udel]'); if (ux) { if (!armed(ux, 'Tap again to remove')) return; if (await q(sb.from('units').delete().eq('id', ux.dataset.udel))) { S.units = S.units.filter(x => x.id !== ux.dataset.udel); render(true); toast('Removed.'); } return; }
  const dd = t.closest('[data-ddel]'); if (dd) { if (!armed(dd, 'Tap again to remove')) return; if (await q(sb.from('drivers').delete().eq('id', dd.dataset.ddel))) { S.drivers = S.drivers.filter(x => x.id !== dd.dataset.ddel); render(true); toast('Driver removed.'); } return; }
  const orn = t.closest('[data-orenew]'); if (orn) { const o = S.operators.find(x => x.id === orn.dataset.orenew); const exp = addYears(o.exp > TODAY ? o.exp : TODAY, 5); if (await q(sb.from('certs').update({ expires: exp }).eq('id', o.id))) { o.exp = exp; render(true); toast(o.name + ' · ' + o.cert + ' renewed through ' + fmt(exp) + '.'); } return; }
  const od = t.closest('[data-odel]'); if (od) { if (!armed(od, 'Tap again to remove')) return; if (await q(sb.from('certs').delete().eq('id', od.dataset.odel))) { S.operators = S.operators.filter(x => x.id !== od.dataset.odel); render(true); toast('Card removed.'); } return; }
  const idl = t.closest('[data-idel]'); if (idl) { if (!armed(idl, 'Tap again to delete for good')) return; const i = S.incidents.find(x => x.id === idl.dataset.idel); if (await q(sb.from('incidents').delete().eq('id', i.id))) { if (i.photos.length) sb.storage.from('docs').remove(i.photos); S.incidents = S.incidents.filter(x => x.id !== i.id); closeModal(); render(true); toast('Report deleted.'); } return; }

  // Awards
  const ay = t.closest('[data-ay]'); if (ay) { awardYear = +ay.dataset.ay; render(true); return; }
  const ap = t.closest('[data-aprog]'); if (ap) { awardDraft = Object.assign({}, AWARD_PROGRAMS[+ap.dataset.aprog]); render(true); const d = $('aw_due'); if (d) { d.focus(); $('awardAdd').scrollIntoView({ block: 'center' }); } return; }
  const aw = t.closest('[data-award]'); if (aw) { showAward(aw.dataset.award); return; }
  const awd = t.closest('[data-awdel]'); if (awd) { if (!armed(awd, 'Tap again to delete')) return; if (await q(sb.from('awards').delete().eq('id', awd.dataset.awdel))) { S.awards = S.awards.filter(x => x.id !== awd.dataset.awdel); closeModal(); render(true); toast('Deleted.'); } return; }
  if (t.id === 'copyAwards') { busy(t, true); const prev = S.awards.filter(a => a.year === awardYear - 1); const rows = await q(sb.from('awards').insert(prev.map(a => ({ company_id: C.id, name: a.name, organization: a.organization, category: a.category, year: awardYear, deadline: a.deadline ? addYears(a.deadline, 1) : null, status: 'planned', level: '', color: a.color, link: a.link, notes: '' }))).select()); if (rows) { S.awards = S.awards.concat(rows); render(true); toast(rows.length + ' applications copied. Check each deadline against this year’s rules.'); } else busy(t, false); return; }
  // GC side
  const rvw = t.closest('[data-review]'); if (rvw) { showReview(rvw.dataset.review); return; }
  const rv = t.closest('[data-rv]'); if (rv) {
    const [id, a] = rv.dataset.rv.split('|'); const note = a === 'r' ? val('note_' + id) : null;
    if (a === 'r' && !note) { toast('Add a short reason so the sub knows what to fix.'); const n = $('note_' + id); if (n) n.focus(); return; }
    busy(rv, true);
    if (await q(sb.rpc('review_submission', { p_id: id, p_approve: a === 'a', p_note: note }))) { const x = S.subIn.find(y => y.id === id); x.status = a === 'a' ? 'approved' : 'rejected'; x.note = note; const sid = x.sub_id; render(true); showReview(sid); toast(a === 'a' ? 'Approved.' : 'Rejected. The sub will see your reason.'); } else busy(rv, false);
    return;
  }
  const rd = t.closest('[data-rdel]'); if (rd) { if (!armed(rd, 'Tap again; removes sub answers too')) return; if (await q(sb.from('requirements').delete().eq('id', rd.dataset.rdel))) { S.reqs = S.reqs.filter(r => r.id !== rd.dataset.rdel); S.subIn = S.subIn.filter(x => x.requirement_id !== rd.dataset.rdel); render(true); toast('Requirement removed.'); } return; }
  if (t.id === 'starterReqs') { busy(t, true); const rows = await q(sb.from('requirements').insert(STARTER_REQS.map((r, i) => Object.assign({ gc_id: C.id, sort: i, help: '', kind: 'doc', expires: false, max_value: null, crane_only: false, auto: null }, r))).select()); if (rows) { S.reqs = rows.map(mapReq).sort((a, b) => a.sort - b.sort); render(true); toast('Common requirements added. Edit or remove any of them.'); } else busy(t, false); return; }
  const ul = t.closest('[data-unlink]'); if (ul) {
    if (!armed(ul, 'Tap again to unlink')) return; const other = ul.dataset.unlink; const isSub = mySubs().some(s => s.id === other);
    const p = isSub ? sb.from('gc_links').delete().eq('gc_id', C.id).eq('sub_id', other) : sb.from('gc_links').delete().eq('gc_id', other).eq('sub_id', C.id);
    if (await q(p)) { closeModal(); await loadAll(); render(true); toast('Unlinked.'); } return;
  }
  // Sub side
  const ps = t.closest('[data-psub]'); if (ps) {
    const gc = myGcs().find(g => g.id === portalGc); const r = S.gcReqs.find(x => x.id === ps.dataset.psub); const rec = { gc_id: gc.id, sub_id: C.id, requirement_id: r.id };
    if (r.kind === 'number') { const v = val('pv_' + r.id); if (v === '' || isNaN(+v)) { toast('Enter the number first.'); return; } rec.value = (+v).toFixed(2); rec.file_path = null; rec.file_name = null; }
    else { const f = $('pf_' + r.id); if (!f.files[0]) { toast('Choose a file first.'); return; } }
    if (r.expires) { const ex = val('pe_' + r.id); if (!ex) { toast('Add the expiration date from the document.'); return; } rec.expires = ex; }
    busy(ps, true);
    if (r.kind !== 'number') { const f = $('pf_' + r.id).files[0]; const path = await upload(f, 'submissions'); if (!path) { busy(ps, false); return; } rec.file_path = path; rec.file_name = f.name; rec.value = null; }
    const row = await q(sb.from('submissions').upsert(rec, { onConflict: 'gc_id,sub_id,requirement_id' }).select().single());
    if (row) { S.subOut = S.subOut.filter(x => x.id !== row.id).concat(row); render(true); toast('Sent to ' + gc.name + ' for review.'); } else busy(ps, false);
    return;
  }
  const pa = t.closest('[data-pauto]'); if (pa) { const r = S.gcReqs.find(x => x.id === pa.dataset.pauto); await autoFill([r]); return; }
  if (t.id === 'autoAll') { const reqs = S.gcReqs.filter(r => r.gc === portalGc && r.auto && !(r.onlyCrane && !C.is_crane) && ['missing', 'expired', 'rejected'].includes(subSt(r, S.subOut.find(x => x.requirement_id === r.id), C.is_crane).k)); busy(t, true); await autoFill(reqs); return; }
  // Settings
  if (t.id === 'newCodes') { if (!armed(t, 'Tap again: old codes stop working')) return; if (await q(sb.rpc('new_codes', { p_company: C.id }))) { await loadAll(); render(true); toast('New codes made.'); } return; }
  const md = t.closest('[data-mdel]'); if (md) { if (!armed(md, 'Tap again to remove')) return; if (await q(sb.from('members').delete().eq('company_id', C.id).eq('user_id', md.dataset.mdel))) { S.members = S.members.filter(m => m.user_id !== md.dataset.mdel); render(true); toast('Removed from the team.'); } return; }
  if (t.id === 'leaveCo') { if (!armed(t, 'Tap again to leave')) return; if (await q(sb.from('members').delete().eq('company_id', C.id).eq('user_id', session.user.id))) { try { localStorage.removeItem('eb-company'); } catch (x) { } C = null; await afterSignIn(); toast('You left the company.'); } return; }
});
async function autoFill(reqs) {
  const gc = myGcs().find(g => g.id === portalGc); let n = 0, skipped = 0;
  for (const r of reqs) { const v = autoVal(r); if (!v) { skipped++; continue; } const row = await q(sb.from('submissions').upsert(Object.assign({ gc_id: gc.id, sub_id: C.id, requirement_id: r.id, file_path: null, file_name: null, expires: null }, v), { onConflict: 'gc_id,sub_id,requirement_id' }).select().single()); if (row) { S.subOut = S.subOut.filter(x => x.id !== row.id).concat(row); n++; } }
  render(true);
  if (n) toast(n + ' item' + (n > 1 ? 's' : '') + ' filled from your data and sent to ' + gc.name + '.' + (skipped ? ' ' + skipped + ' need more data first.' : ''));
  else if (skipped) toast('Not enough data yet. Enter hours worked or CCO cards first.', true);
}

document.addEventListener('change', async e => {
  const t = e.target; if (!C) return;
  if (t.id === 'coPick') { if (t.value === '__add') { setupTab = 'create'; renderSetup(true); } else openCompany(t.value); return; }
  if (t.dataset.act) { const a = S.actions.find(x => x.id === t.dataset.act); if (await q(sb.from('actions').update({ done: t.checked }).eq('id', a.id))) { a.done = t.checked; render(true); toast(a.done ? 'Marked done.' : 'Reopened.'); } else t.checked = !t.checked; return; }
  if (t.dataset.h) {
    const [di, i] = t.dataset.h.split('|').map(Number); const dv = divs()[di]; const v = t.value === '' ? 0 : Math.max(0, +t.value);
    if (await q(sb.from('hours').upsert({ company_id: C.id, division: dv, year: hoursYear, month: i + 1, hours: v }, { onConflict: 'company_id,division,year,month' }))) {
      const k = hoursYear + '|' + dv; (S.hours[k] = S.hours[k] || Array(12).fill(null))[i] = t.value === '' ? null : v; $('ytd_' + di).textContent = num(hoursTotal(hoursYear, dv)); $('rateCard').innerHTML = rateTable(hoursYear); $('nav').innerHTML = navHTML();
    } return;
  }
  if (t.dataset.drv) { const [id, f] = t.dataset.drv.split('|'); const col = { med: 'med_exp', cdl: 'cdl_exp', mvr: 'mvr_due' }[f]; const d = S.drivers.find(x => x.id === id); if (await q(sb.from('drivers').update({ [col]: t.value || null }).eq('id', id), 'Saved.')) { d[f] = t.value || null; render(true); } return; }
  if (t.dataset.mrole) { if (await q(sb.from('members').update({ role: t.value }).eq('company_id', C.id).eq('user_id', t.dataset.mrole), 'Role updated.')) { S.members.find(m => m.user_id === t.dataset.mrole).role = t.value; } else render(true); return; }
  if (t.id === 'target') { const v = +t.value || 0; if (await q(sb.from('companies').update({ trir_target: v }).eq('id', C.id), 'Target saved.')) C.trir_target = v; return; }
  if (t.id === 'avgEmp') { const v = Math.max(0, parseInt(t.value) || 0); if (await q(sb.from('companies').update({ avg_employees: v }).eq('id', C.id), 'Saved.')) C.avg_employees = v; return; }
  if (t.name === 'ae_color') { const a = S.awards.find(x => x.id === $('aweform').dataset.id); $('awPreview').innerHTML = ribbonSVG(t.value, val('ae_year') || a.year, 46); return; }
  if (t.id === 'u_what') { $('u_other').hidden = t.value !== 'Other'; return; }
  if (t.dataset.nvis) { const c = navCfg(); const k = t.dataset.nvis; c.hidden = t.checked ? c.hidden.filter(x => x !== k) : [...c.hidden, k]; await saveNav(c); return; }
  if (t.dataset.nlab) { const c = navCfg(); const k = t.dataset.nlab; const def = Object.fromEntries(VIEWS)[k]; const v = t.value.trim(); if (!v || v === def) delete c.labels[k]; else c.labels[k] = v; await saveNav(c); return; }
  if (t.id === 'r_photo') { if (t.files.length) addPicks(t.files); t.value = ''; return; }
  if (t.dataset.addph) {
    const i = S.incidents.find(x => x.id === t.dataset.addph); const files = [...t.files].slice(0, Math.max(0, 10 - i.photos.length)); t.value = '';
    if (!files.length) { toast('This report already has 10 photos.'); return; }
    toast('Uploading ' + files.length + ' photo' + (files.length > 1 ? 's' : '') + '…');
    const up = await uploadPhotos(files);
    if (up.paths.length) { const r = await savePhotoPaths(i.id, i.photos.concat(up.paths)); if (r.error) { toast(friendly(r.error), true); return; } Object.assign(i, mapInc(r.data)); showInc(i.id); toast(up.paths.length + ' photo' + (up.paths.length > 1 ? 's' : '') + ' added.' + (up.failed.length ? ' ' + up.failed.length + ' didn’t upload: ' + (up.reason || 'upload error') : '')); }
    else toast('Photos didn’t upload. ' + (up.reason || ''), true);
    return;
  }
  if (t.closest && t.closest('#rform')) updateReport();
});
document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#rform') && ['r_away', 'r_rest'].includes(e.target.id)) updateReport(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('ov')) { const wasNav = !!document.querySelector('.navedit'); closeModal(); if (wasNav) render(true); } });

document.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; const btn = f.querySelector('button[type=submit]');
  // ---- sign-in screens
  if (f.id === 'f_signin') {
    const email = val('si_email'), password = $('si_pw').value; if (!email || !password) { gateMsg('Enter your email and password.'); return; }
    busy(btn, true); const r = await sb.auth.signInWithPassword({ email, password }); busy(btn, false);
    if (r.error) { gateMsg(friendly(r.error)); return; } session = r.data.session; await afterSignIn(); return;
  }
  if (f.id === 'f_signup') {
    const full_name = val('su_name'), email = val('su_email'), password = $('su_pw').value;
    if (!full_name || !email) { gateMsg('Enter your name and email.'); return; } if (password.length < 8) { gateMsg('Use a password with at least 8 characters.'); return; }
    busy(btn, true); const r = await sb.auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: redirectUrl() } }); busy(btn, false);
    if (r.error) { gateMsg(friendly(r.error)); return; }
    if (r.data.session) { session = r.data.session; await afterSignIn(); } else gateMsg(null, 'Check your email for a link to confirm your account, then sign in.');
    return;
  }
  if (f.id === 'f_forgot') { const email = val('fg_email'); if (!email) { gateMsg('Enter your email.'); return; } busy(btn, true); const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }); busy(btn, false); if (r.error) gateMsg(friendly(r.error)); else gateMsg(null, 'If that email has an account, a reset link is on its way.'); return; }
  if (f.id === 'f_newpw') { const pw = $('np_pw').value; if (pw.length < 8) { gateMsg('Use at least 8 characters.'); return; } busy(btn, true); const r = await sb.auth.updateUser({ password: pw }); busy(btn, false); if (r.error) { gateMsg(friendly(r.error)); return; } recovering = false; history.replaceState(null, '', location.pathname); toast('Password saved.'); await afterSignIn(); return; }
  // ---- setup
  if (f.id === 'f_create') {
    const name = val('cc_name'), you = val('cc_you'); if (!name || !you) { gateMsg('Enter the company name and your name.'); return; }
    const divsIn = val('cc_divs').split(',').map(s => s.trim()).filter(Boolean); const crane = $('cc_crane').checked;
    busy(btn, true);
    const r = await sb.rpc('create_company', { p_name: name, p_full_name: you, p_trade: val('cc_trade'), p_is_crane: crane, p_divisions: divsIn.length ? divsIn : ['Operations'] });
    if (r.error) { busy(btn, false); gateMsg(friendly(r.error)); return; }
    const cid = r.data;
    if (!crane) await sb.from('companies').update({ nav: { hidden: ['cco'] } }).eq('id', cid);
    const gcCode = val('cc_gc'); if (gcCode) { const l = await sb.rpc('link_gc', { p_code: gcCode, p_sub: cid }); if (l.error) toast('Company created, but the contractor code didn’t work: ' + friendly(l.error), true); else toast('Linked to ' + l.data + '.'); }
    try { localStorage.setItem('eb-company', cid); } catch (x) { }
    await afterSignIn(); if (location.hash !== '#overview') location.hash = 'overview'; return;
  }
  if (f.id === 'f_join') {
    const code = val('jn_code'), you = val('jn_you'); if (!code || !you) { gateMsg('Enter the team code and your name.'); return; }
    busy(btn, true); const r = await sb.rpc('join_company', { p_code: code, p_full_name: you }); if (r.error) { busy(btn, false); gateMsg(friendly(r.error)); return; }
    try { localStorage.setItem('eb-company', r.data); } catch (x) { } await afterSignIn(); toast('You joined the team.'); return;
  }
  if (!C) return;
  // ---- app forms
  if (f.id === 'rform') {
    const errBox = $('r_err'); const showErr = m => { errBox.textContent = m; errBox.hidden = !m; if (m) errBox.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    showErr('');
    const type = reportType(), desc = val('r_desc'); if (!desc) { showErr('Add a short description of what happened, then submit again.'); $('r_desc').focus(); return; }
    const inj = type === 'injury' || type === 'vehicle';
    const row = { company_id: C.id, occurred_on: $('r_date').value || TODAY, type, division: $('r_div').value, location: val('r_loc'), description: desc };
    if (inj) Object.assign(row, { employee: val('r_emp'), job_title: val('r_job'), nature: val('r_nat'), treatment: $('r_treat').value, days_away: +$('r_away').value || 0, days_restricted: +$('r_rest').value || 0, privacy_case: $('r_priv').checked });
    if (type === 'vehicle') row.dot = { fatal: $('d_fatal').checked, injured: $('d_inj').checked, towed: $('d_tow').checked };
    busy(btn, true);
    try {
      let up = { paths: [], failed: [] };
      if (pendingPhotos.length) up = await uploadPhotos(pendingPhotos.map(p => p.file), (k, n) => { btn.textContent = `Uploading photo ${k} of ${n}…`; });
      btn.textContent = 'Saving report…';
      let res = await sb.from('incidents').insert(Object.assign({}, row, up.paths.length ? { photo_paths: up.paths, photo_path: up.paths[0] } : {})).select().single();
      let photoNote = '';
      if (res.error && /photo_paths/.test(res.error.message || '')) { res = await sb.from('incidents').insert(Object.assign({}, row, up.paths.length ? { photo_path: up.paths[0] } : {})).select().single(); if (!res.error && up.paths.length > 1) photoNote = ' Only the first photo was kept; run supabase/add-photos.sql to allow more.'; }
      if (res.error) { showErr('The report didn’t save: ' + friendly(res.error) + ' Nothing was lost; your entries are still here. Try again, or send this message to your Eyebolt admin. Details: ' + [res.error.code, res.error.message].filter(Boolean).join(' · ')); return; }
      pendingPhotos.forEach(p => URL.revokeObjectURL(p.url)); pendingPhotos = [];
      const i = mapInc(res.data); S.incidents.unshift(i); S.incidents.sort(byNewest);
      const fix = val('r_fix'); if (fix) { const a = await q(sb.from('actions').insert({ company_id: C.id, title: fix, source: i.no, due: addDays(TODAY, 14) }).select().single()); if (a) S.actions.push(mapAct(a)); }
      let msg = 'Report ' + i.no + ' saved.'; if (i.photos.length) msg += ' ' + i.photos.length + ' photo' + (i.photos.length > 1 ? 's' : '') + '.'; if (recordable(i)) msg += ' Added to the OSHA 300 log.'; if (dotAcc(i)) msg += ' Added to the DOT accident register.'; if (fix) msg += ' Action created.';
      if (up.failed.length) msg += ' ' + up.failed.length + ' photo' + (up.failed.length > 1 ? 's' : '') + ' didn’t upload (' + (up.reason || 'upload error') + '). Open the report to add them again.';
      msg += photoNote;
      go('incidents'); toast(msg, !!(up.failed.length || photoNote));
    } catch (e) { showErr('The report didn’t save: ' + friendly(e) + ' Check your connection and submit again. Nothing was lost. Details: ' + ((e && e.message) || e)); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Submit report'; } }
    return;
  }
  if (f.id === 'aform') { const title = val('a_title'); if (!title) { toast('Name the action first.'); return; } const a = await q(sb.from('actions').insert({ company_id: C.id, title, source: 'Manual', owner: val('a_owner') || 'Unassigned', due: $('a_due').value || addDays(TODAY, 14) }).select().single()); if (a) { S.actions.push(mapAct(a)); render(true); toast('Action added.'); } return; }
  if (f.id === 'oform') {
    const name = val('o_name'); if (!name) { toast('Add the person’s name.'); $('o_name').focus(); return; } if (!$('o_exp').value) { toast('Add the expiration date from the card.'); return; }
    const r = await q(sb.from('certs').insert({ company_id: C.id, name, cert: $('o_cert').value, specialty: val('o_spec'), card_no: val('o_card'), expires: $('o_exp').value, eval_date: $('o_eval').value || null }).select().single());
    if (r) { S.operators.push(mapCert(r)); render(true); toast(name + ' · ' + r.cert + ' added.'); } return;
  }
  if (f.id === 'dform') { const name = val('d_name'); if (!name) { toast('Add the driver’s name.'); return; } const r = await q(sb.from('drivers').insert({ company_id: C.id, name, med_exp: $('d_med').value || null, cdl_exp: $('d_cdl').value || null, mvr_due: $('d_mvr').value || null }).select().single()); if (r) { S.drivers.push(mapDrv(r)); S.drivers.sort((a, b) => a.name.localeCompare(b.name)); render(true); toast(name + ' added.'); } return; }
  if (f.id === 'uform') {
    const unit = val('u_unit'); if (!unit) { toast('Add a unit or ID first.'); $('u_unit').focus(); return; }
    let what = $('u_what').value; if (what === 'Other') { what = val('u_other'); if (!what) { toast('Name the inspection.'); $('u_other').focus(); return; } }
    const r = await q(sb.from('units').insert({ company_id: C.id, unit, kind: val('u_kind'), inspection: what, due: $('u_due').value || addYears(TODAY, 1) }).select().single());
    if (r) { S.units.push(mapUnit(r)); render(true); toast(unit + ' added. It shows on the overview 45 days before it’s due.'); } return;
  }
  if (f.id === 'awform') {
    const name = val('aw_name'); if (!name) { toast('Name the award.'); $('aw_name').focus(); return; }
    const r = await q(sb.from('awards').insert({ company_id: C.id, name, organization: val('aw_org'), category: val('aw_cat'), year: awardYear, deadline: $('aw_due').value || null, link: val('aw_link') }).select().single());
    if (r) { S.awards.push(r); awardDraft = null; render(true); toast(name + ' added for ' + awardYear + '.' + (r.deadline ? ' You’ll get a reminder 30 days before the deadline.' : '')); } return;
  }
  if (f.id === 'aweform') {
    const id = f.dataset.id; const name = val('ae_name'); if (!name) { toast('Name the award.'); return; }
    const c = document.querySelector('input[name=ae_color]:checked');
    const patch = { name, organization: val('ae_org'), category: val('ae_cat'), year: parseInt(val('ae_year')) || YEAR, deadline: $('ae_due').value || null, status: $('ae_status').value, level: val('ae_level'), color: c ? c.value : 'gold', link: val('ae_link'), notes: $('ae_notes').value };
    busy(btn, true); const r = await q(sb.from('awards').update(patch).eq('id', id).select().single()); busy(btn, false);
    if (r) { S.awards = S.awards.map(x => x.id === id ? r : x); closeModal(); render(true); toast(r.status === 'won' ? 'Congratulations! ' + r.name + ' is on your ribbon wall.' : 'Saved.'); } return;
  }
  if (f.id === 'rqform') { const name = val('rq_name'); if (!name) { toast('Name the requirement.'); return; } const row = { gc_id: C.id, name, kind: $('rq_kind').value, expires: $('rq_exp').checked, sort: S.reqs.length }; if (val('rq_max') !== '') row.max_value = +val('rq_max'); const r = await q(sb.from('requirements').insert(row).select().single()); if (r) { S.reqs.push(mapReq(r)); render(true); toast('Requirement added. Linked subs see it now.'); } return; }
  if (f.id === 'linkform') { const code = val('link_code'); if (!code) { toast('Enter the contractor’s code.'); return; } busy(btn, true); const name = await q(sb.rpc('link_gc', { p_code: code, p_sub: C.id })); busy(btn, false); if (name) { await loadAll(); const g = myGcs().find(x => x.name === name); if (g) portalGc = g.id; render(true); toast('Linked to ' + name + '. Their requirements are below.'); } return; }
  if (f.id === 'coform') {
    const dv = val('s_divs').split(',').map(s => s.trim()).filter(Boolean); if (!val('s_name')) { toast('The company needs a name.'); return; } if (!dv.length) { toast('Keep at least one division.'); return; }
    const patch = { name: val('s_name'), trade: val('s_trade'), divisions: dv, trir_target: +val('s_target') || 0, avg_employees: parseInt(val('s_avg')) || 0, is_crane: $('s_crane').checked };
    busy(btn, true); const r = await q(sb.from('companies').update(patch).eq('id', C.id).select().single(), 'Company saved.'); busy(btn, false);
    if (r) { C = r; const m = memberships.find(x => x.company.id === C.id); if (m) m.company = r; render(true); } return;
  }
});

boot();
})();
