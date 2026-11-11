// Data layer. LiveBackend talks to Supabase; DemoBackend keeps everything on this device.
(function () {
  const MAP = {
    name: 'name', group: 'category', objective: 'objective', comments: 'comments', next: 'next_step', owners: 'owners',
    stage: 'stage', prevStage: 'prev_stage', waiting: 'waiting_on', due: 'due_date', dueKind: 'due_kind', sponsor: 'sponsor',
    irb: 'irb_number', irbRenewBy: 'irb_renew_by', irbExpires: 'irb_expires', start: 'start_date', src: 'source_tab', flags: 'flags'
  };
  const DATE_FIELDS = ['due', 'irbRenewBy', 'irbExpires'];
  const toApp = p => ({
    id: p.id, name: p.name, group: p.category, objective: p.objective || '', comments: p.comments || '', next: p.next_step || '',
    owners: p.owners || [], stage: p.stage, prevStage: p.prev_stage || '', waiting: p.waiting_on || '', due: p.due_date || '',
    dueKind: p.due_kind || '', sponsor: p.sponsor || '', irb: p.irb_number || '', irbRenewBy: p.irb_renew_by || '',
    irbExpires: p.irb_expires || '', start: p.start_date || '', src: p.source_tab || '', flags: p.flags || [],
    updatedAt: p.updated_at || '', updatedBy: p.updated_by || ''
  });
  const toDb = patch => {
    const o = {};
    for (const k in patch) if (MAP[k]) o[MAP[k]] = (patch[k] === '' && DATE_FIELDS.includes(k)) ? null : patch[k];
    return o;
  };
  const updToApp = u => ({ id: u.id, projectId: u.project_id, author: u.author, body: u.body, kind: u.kind, at: u.created_at });
  const memToApp = m => ({
    email: m.email, name: m.name, fullName: m.full_name || '', role: m.role, active: m.active,
    notifyPush: m.notify_push, notifyEmail: m.notify_email, joined: !!m.user_id
  });

  function friendly(err) {
    const msg = (err && (err.message || err.error_description)) || String(err);
    if (/database error saving new user|not been invited|signups not allowed/i.test(msg)) return new Error('Could not sign in with this email. Check the spelling; if it is right, ask an admin to add it under Team → Members.');
    if (/sending|smtp|email/i.test(msg) && /error|fail/i.test(msg)) return new Error('The sign-in email could not be sent. Check the email settings in Supabase (SMTP).');
    if (/rate limit|too many|security purposes/i.test(msg)) return new Error('Too many codes were requested. Wait a few minutes and try again.');
    if (/expired|invalid|otp/i.test(msg)) return new Error('That code is wrong or has expired. Request a new code.');
    if (/failed to fetch|network/i.test(msg)) return new Error('No internet connection. Try again when you are back online.');
    if (/row-level security|permission denied/i.test(msg)) return new Error('Your role does not allow this change.');
    return new Error(msg);
  }

  // Every request gives up after 15 s instead of hanging on a bad connection.
  const TIMEOUT_MS = 15000;
  function fetchWithTimeout(url, opts) {
    opts = opts || {};
    if (opts.signal || typeof AbortController === 'undefined') return fetch(url, opts);
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    return fetch(url, Object.assign({}, opts, { signal: ctl.signal }))
      .catch(e => { throw e && e.name === 'AbortError' ? new Error('The server took too long to answer. Check your connection and try again.') : e; })
      .finally(() => clearTimeout(timer));
  }
  // Only the columns the app uses (#24).
  const COLS = {
    projects: 'id,name,category,objective,comments,next_step,owners,stage,prev_stage,waiting_on,due_date,due_kind,sponsor,irb_number,irb_renew_by,irb_expires,start_date,source_tab,flags,updated_at,updated_by',
    updates: 'id,project_id,author,body,kind,created_at',
    members: 'email,name,full_name,role,active,notify_push,notify_email,user_id'
  };

  // ---------------- Supabase ----------------
  class LiveBackend {
    constructor(cfg) {
      this.mode = 'live';
      this.cfg = cfg;
      this.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        global: { fetch: fetchWithTimeout }
      });
    }
    async currentEmail() {
      const { data } = await this.sb.auth.getSession();
      return data.session ? data.session.user.email.toLowerCase() : null;
    }
    async sendCode(email) {
      const { error } = await this.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw friendly(error);
    }
    async verifyCode(email, token) {
      const { error } = await this.sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw friendly(error);
    }
    async signOut() { await this.sb.auth.signOut(); }
    async fetchAll(table, order) {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await this.sb.from(table).select(COLS[table]).order(order).range(from, from + 999);
        if (error) throw friendly(error);
        out.push(...data);
        if (data.length < 1000) return out;
      }
    }
    async loadAll() {
      const [p, u, m] = await Promise.all([this.fetchAll('projects', 'id'), this.fetchAll('updates', 'created_at'), this.fetchAll('members', 'name')]);
      return { projects: p.map(toApp), updates: u.map(updToApp), members: m.map(memToApp) };
    }
    async updateProject(id, patch) {
      const { data, error } = await this.sb.from('projects').update(toDb(patch)).eq('id', id).select(COLS.projects).single();
      if (error) throw friendly(error);
      return toApp(data);
    }
    async addProject(obj) {
      const { data, error } = await this.sb.from('projects').insert(toDb(obj)).select(COLS.projects).single();
      if (error) throw friendly(error);
      return toApp(data);
    }
    async deleteProject(id) {
      const { error } = await this.sb.from('projects').delete().eq('id', id);
      if (error) throw friendly(error);
    }
    async addUpdate(projectId, body, kind, author) {
      const { data, error } = await this.sb.from('updates').insert({ project_id: projectId, body, kind: kind || 'note', author }).select(COLS.updates).single();
      if (error) throw friendly(error);
      return updToApp(data);
    }
    async saveMember(m, isNew) {
      const row = { email: m.email.toLowerCase().trim(), name: m.name.trim(), full_name: (m.fullName || '').trim(), role: m.role, active: m.active !== false };
      const q = isNew ? this.sb.from('members').insert(row) : this.sb.from('members').update(row).eq('email', row.email);
      const { data, error } = await q.select(COLS.members).single();
      if (error) throw friendly(/duplicate key/i.test(error.message) ? new Error('That email or short name is already on the team list.') : error);
      return memToApp(data);
    }
    async setMyPrefs(email, prefs) {
      const row = {};
      if ('notifyPush' in prefs) row.notify_push = prefs.notifyPush;
      if ('notifyEmail' in prefs) row.notify_email = prefs.notifyEmail;
      const { error } = await this.sb.from('members').update(row).eq('email', email);
      if (error) throw friendly(error);
    }
    async savePush(email, s) {
      const { error } = await this.sb.from('push_subscriptions').upsert({ email, ...s }, { onConflict: 'endpoint' });
      if (error) throw friendly(error);
    }
    async removePush(endpoint) {
      const { error } = await this.sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
      if (error) throw friendly(error);
    }
    async testPush() {
      const { data, error } = await this.sb.functions.invoke('send-reminders', { body: { test: true } });
      if (error) throw friendly(error);
      return data;
    }
    subscribe(cb) {
      const ch = this.sb.channel('tracker-changes');
      ch.on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, p => cb('projects', p.eventType, p.eventType === 'DELETE' ? { id: p.old.id } : toApp(p.new)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'updates' }, p => cb('updates', p.eventType, p.eventType === 'DELETE' ? { id: p.old.id } : updToApp(p.new)))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, p => cb('members', p.eventType, p.eventType === 'DELETE' ? { email: p.old.email } : memToApp(p.new)))
        .subscribe();
    }
  }

  // ---------------- Demo (this device only) ----------------
  const DEMO_KEY = 'lyerly-demo-v1';
  // Demo people are taken from the owners in the local demo data, so no real names or emails live in this code.
  function demoMembers(raw) {
    const count = {};
    raw.forEach(r => (r.owners || []).forEach(o => { if (!/research|bhri|^dr\b/i.test(o)) count[o] = (count[o] || 0) + 1; }));
    const names = Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 3);
    if (!names.length) names.push('Demo');
    return names.map((n, i) => ({ email: n.toLowerCase().replace(/[^a-z0-9]/g, '') + '@demo.test', name: n, fullName: n, role: i === 0 ? 'admin' : 'editor',
      active: true, notifyPush: true, notifyEmail: true, joined: true }));
  }
  class DemoBackend {
    constructor(cfg) { this.mode = 'demo'; this.cfg = cfg; this.db = null; }
    async ensure() {
      if (this.db) return;
      try { this.db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch (e) { this.db = null; }
      if (!this.db) {
        let raw = [];
        try { raw = await (await fetch(this.cfg.demoData)).json(); } catch (e) { raw = []; }
        const now = new Date().toISOString();
        this.db = {
          me: null, nextUpd: 1,
          members: demoMembers(raw),
          projects: raw.map(r => ({
            id: r.id, name: r.name, group: r.group, objective: r.objective || '', comments: r.comments || '', next: r.next || '', owners: r.owners || [],
            stage: r.stage, prevStage: '', waiting: r.waiting || '', due: r.due || '', dueKind: r.dueKind || '', sponsor: r.sponsor || '', irb: r.irb || '',
            irbRenewBy: r.irbRenewBy || '', irbExpires: r.irbExpires || '', start: r.start || '', src: r.src || '', flags: r.flags || [], updatedAt: now, updatedBy: 'Import'
          })),
          updates: []
        };
        this.db.projects.forEach(p => this.db.updates.push({ id: this.db.nextUpd++, projectId: p.id, author: 'Import', body: 'Imported from the spreadsheet tab “' + p.src + '”', kind: 'system', at: now }));
        this.save();
      }
    }
    save() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(this.db)); } catch (e) {} }
    meName() { const m = this.db.members.find(x => x.email === this.db.me); return m ? m.name : ''; }
    async currentEmail() { await this.ensure(); return this.db.me; }
    async sendCode(email) {
      await this.ensure();
      if (!this.db.members.some(m => m.email === email && m.active)) throw new Error('This email is not on the team list yet. Ask an admin to add you.');
    }
    async verifyCode(email, token) {
      if (token !== '123456') throw new Error('That code is wrong or has expired. Request a new code.');
      this.db.me = email; this.save();
    }
    async signOut() { this.db.me = null; this.save(); }
    async loadAll() { await this.ensure(); return JSON.parse(JSON.stringify({ projects: this.db.projects, updates: this.db.updates, members: this.db.members })); }
    async updateProject(id, patch) {
      const p = this.db.projects.find(x => x.id === id);
      Object.assign(p, patch, { updatedAt: new Date().toISOString(), updatedBy: this.meName() });
      this.save(); return JSON.parse(JSON.stringify(p));
    }
    async addProject(obj) {
      const id = Math.max(0, ...this.db.projects.map(p => p.id)) + 1;
      const p = Object.assign({ objective: '', comments: '', next: '', owners: [], prevStage: '', waiting: '', due: '', dueKind: '', sponsor: '', irb: '', irbRenewBy: '', irbExpires: '', start: '', src: '', flags: [] }, obj, { id, updatedAt: new Date().toISOString(), updatedBy: this.meName() });
      this.db.projects.push(p); this.save(); return JSON.parse(JSON.stringify(p));
    }
    async deleteProject(id) { this.db.projects = this.db.projects.filter(p => p.id !== id); this.db.updates = this.db.updates.filter(u => u.projectId !== id); this.save(); }
    async addUpdate(projectId, body, kind, author) {
      const u = { id: this.db.nextUpd++, projectId, body, kind: kind || 'note', author, at: new Date().toISOString() };
      this.db.updates.push(u); this.save(); return Object.assign({}, u);
    }
    async saveMember(m, isNew) {
      const email = m.email.toLowerCase().trim();
      if (isNew && this.db.members.some(x => x.email === email || x.name === m.name.trim())) throw new Error('That email or short name is already on the team list.');
      const row = { email, name: m.name.trim(), fullName: (m.fullName || '').trim(), role: m.role, active: m.active !== false };
      const ex = this.db.members.find(x => x.email === email);
      if (ex) Object.assign(ex, row); else this.db.members.push(Object.assign({ notifyPush: true, notifyEmail: true, joined: false }, row));
      this.save(); return Object.assign({}, ex || this.db.members[this.db.members.length - 1]);
    }
    async setMyPrefs(email, prefs) { Object.assign(this.db.members.find(x => x.email === email), prefs); this.save(); }
    async savePush() { throw new Error('Notifications work once the app is connected to Supabase.'); }
    async removePush() {}
    async testPush() { throw new Error('Notifications work once the app is connected to Supabase.'); }
    subscribe() {}
  }

  window.Backend = {
    async create(cfg) {
      const forceDemo = /[?&]demo=1\b/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
      if (!forceDemo && cfg.supabaseUrl && cfg.supabaseKey && window.supabase) return new LiveBackend(cfg);
      return new DemoBackend(cfg);
    }
  };
})();
