'use strict';
/* Extra features: SMS counter, templates, scheduled and disappearing messages, starred messages, block list,
   auto-reply, backup and restore, phone shortcuts, contact editing, duplicates, birthdays, favorites, call notes
   and pictures (MMS). Loaded before app.js; it uses app.js's globals (prefs, msgs, go, toast ...) when called. */

/* ================= SMS length counter ================= */
const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = '^{}\\[~]|€';
function smsInfo(text) {
  let units = 0, ucs = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (GSM7.indexOf(ch) >= 0) units += 1;
    else if (GSM7_EXT.indexOf(ch) >= 0) units += 2;
    else { ucs = true; break; }
  }
  if (ucs) units = text.length;                       // UTF-16 units: an emoji counts as two
  const single = ucs ? 70 : 160, multi = ucs ? 67 : 153;
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  return { units: units, ucs: ucs, segments: segments, perSegment: segments > 1 ? multi : single };
}
function counterText(text) {
  if (!text) return '';
  const i = smsInfo(text);
  return i.units + ' · ' + i.segments + ' SMS' + (i.ucs ? ' · emoji or accents: ' + i.perSegment + ' per SMS' : '');
}

/* ================= templates (quick replies with fill-ins) ================= */
const DEFAULT_TEMPLATES = ['On my way', 'Call you later', 'OK', 'Thanks', 'Can’t talk now, will call back', 'Running {minutes} late', 'Be there at {time}'];

function fillTemplate(t, info, done) {
  const now = new Date();
  const known = {
    name: info && info.title && !info.group ? info.title.split(' ')[0] : '',
    time: p2(now.getHours()) + ':' + p2(now.getMinutes()),
    date: now.getDate() + '/' + (now.getMonth() + 1)
  };
  const text = t.replace(/\{(\w+)\}/g, (m, k) => known[k] ? known[k] : m);
  const left = [];
  text.replace(/\{(\w+)\}/g, (m, k) => { if (left.indexOf(k) < 0) left.push(k); return m; });
  if (!left.length) { done(text); return; }
  go(formView({
    title: 'Fill in', done: 'Insert', fields: left.map(k => ({ ph: k })),
    onDone: vals => { let out = text; left.forEach((k, i) => { out = out.split('{' + k + '}').join(vals[i] || k); }); done(out); }
  }));
}

function templatePicker(chat, info) {
  go(menuView('Templates', prefs.templates.map(t => ({ t: t, fn: () => fillTemplate(t, info, text => {
    chat.draft = chat.draft ? chat.draft + ' ' + text : text;
    backTo(chat);
  }) }))));
}

function templatesView() {
  const v = makeList({
    title: 'Templates',
    items: () => [{ title: 'Add a template', sub: 'Use {name}, {time}, {date} or your own {words}', add: true }]
      .concat(prefs.templates.map((t, i) => ({ title: t, i: i, tpl: true }))),
    sk: () => ['', 'Select', ''],
    act: (k, it) => {
      if (k !== 'Enter' || !it) return false;
      const edit = idx => go(formView({
        title: idx == null ? 'New template' : 'Edit template', fields: [{ ph: 'Text', val: idx == null ? '' : prefs.templates[idx] }],
        onDone: vals => {
          if (!vals[0]) { toast('Type some text'); return; }
          if (idx == null) prefs.templates.push(vals[0]); else prefs.templates[idx] = vals[0];
          savePrefs(); back(); v.redraw();
        }
      }));
      if (it.add) edit(null);
      else go(menuView(snippet(it.title, 24), [
        { t: 'Edit', fn: () => { back(); edit(it.i); } },
        { t: 'Delete', fn: () => { prefs.templates.splice(it.i, 1); savePrefs(); back(); v.redraw(); } }
      ]));
      return true;
    }
  });
  return v;
}

/* ================= scheduled messages ================= */
function parseWhen(minsText, clockText) {
  const m = parseInt(minsText, 10);
  if (m > 0) return Date.now() + m * 60000;
  const c = (clockText || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!c) return 0;
  const d = new Date(); d.setHours(+c[1], +c[2], 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function addScheduled(info, text, t) {
  const item = { id: uid(), t: t, conv: info.id, num: info.number || '', text: text };
  prefs.scheduled.push(item); savePrefs();
  try { if (navigator.mozAlarms) navigator.mozAlarms.add(new Date(t), 'ignoreTimezone', { sid: item.id }); } catch (e) { /* the timer below still runs while the app is open */ }
  toast('Scheduled for ' + p2(new Date(t).getHours()) + ':' + p2(new Date(t).getMinutes()));
}
function scheduleForm(info, chat) {
  go(formView({
    title: 'Schedule message', done: 'Schedule',
    fields: [{ ph: 'Message', val: chat.draft || '' }, { ph: 'In how many minutes', type: 'tel' }, { ph: 'Or at time, like 18:30' }],
    onDone: vals => {
      const t = parseWhen(vals[1], vals[2]);
      if (!vals[0]) { toast('Type the message'); return; }
      if (!t) { toast('Enter minutes or a time like 18:30'); return; }
      addScheduled(info, vals[0], t);
      chat.draft = chat.draft === vals[0] ? '' : chat.draft;
      backTo(chat);
    }
  }));
}
function checkScheduled() {
  const due = prefs.scheduled.filter(s => s.t <= Date.now());
  if (!due.length) return;
  if (NO_SMS) { return; }                                  // would only open the composer; wait for SMS access
  prefs.scheduled = prefs.scheduled.filter(s => s.t > Date.now());
  savePrefs();
  due.forEach(s => { sendText(convInfo(s.conv, s.num), s.text); toast('Sent scheduled message to ' + convInfo(s.conv, s.num).title); });
}
function scheduledView() {
  const v = makeList({
    title: 'Scheduled messages',
    items: () => prefs.scheduled.slice().sort((a, b) => a.t - b.t).map(s => ({ title: convInfo(s.conv, s.num).title, sub: p2(new Date(s.t).getHours()) + ':' + p2(new Date(s.t).getMinutes()) + ' · ' + snippet(s.text, 30), av: convInfo(s.conv, s.num).title, s: s })),
    empty: () => 'Nothing scheduled. Use a chat\'s Options, Schedule message.',
    sk: () => ['', 'Cancel it', ''],
    act: (k, it) => {
      if (k === 'Enter' && it) { prefs.scheduled = prefs.scheduled.filter(x => x !== it.s); savePrefs(); v.redraw(); toast('Cancelled'); return true; }
      return false;
    }
  });
  return v;
}

/* ================= disappearing chats ================= */
const DISAPPEAR = [['Off', 0], ['1 day', 86400000], ['7 days', 7 * 86400000]];
function disappearLabel(conv) { const ms = prefs.disappear[conv] || 0; return (DISAPPEAR.find(d => d[1] === ms) || DISAPPEAR[0])[0]; }
function sweepDisappearing() {
  const now = Date.now();
  let doomed = [];
  Object.keys(prefs.disappear).forEach(conv => {
    const ms = prefs.disappear[conv];
    if (ms) doomed = doomed.concat(msgs.filter(m => m.conv === conv && !m.star && now - m.t > ms));
  });
  if (doomed.length) { removeMsgs(doomed); refreshView(); }
}
function disappearMenu(info) {
  go(menuView('Disappearing messages', DISAPPEAR.map(d => ({
    t: d[0], sub: d[1] ? 'Deletes older messages from Buoy only (not from the phone). Starred ones stay.' : '',
    fn: () => { if (d[1]) prefs.disappear[info.id] = d[1]; else delete prefs.disappear[info.id]; savePrefs(); sweepDisappearing(); back(); toast('Disappearing: ' + d[0]); }
  }))));
}

/* ================= starred messages ================= */
function starredView() {
  return makeList({
    title: 'Starred messages',
    items: () => msgs.filter(m => m.star).sort((a, b) => b.t - a.t).map(m => ({ title: convInfo(m.conv, m.num).title, sub: snippet(splitQuote(m.text).body || (m.mms ? '[Picture]' : ''), 40), time: fmtTime(m.t), av: convInfo(m.conv, m.num).title, conv: m.conv })),
    empty: () => 'No starred messages. Select a message and choose Star.',
    sk: () => ['', 'Open chat', ''],
    act: (k, it) => { if (k === 'Enter' && it) { openChat(it.conv); return true; } return false; }
  });
}

/* ================= block list ================= */
function isBlocked(num) { const k = key(num); return !!k && prefs.blocked.some(b => key(b) === k); }
function convBlocked(id) { return id.charAt(0) === 'p' && prefs.blocked.some(b => 'p:' + key(b) === id); }
function blockNumber(num) { if (num && !isBlocked(num)) { prefs.blocked.push(num); savePrefs(); } }
function unblockNumber(num) { const k = key(num); prefs.blocked = prefs.blocked.filter(b => key(b) !== k); savePrefs(); }
function blockedView() {
  const v = makeList({
    title: 'Blocked numbers',
    items: () => [{ title: 'Add a number', sub: prefs.blockCalls ? 'Texts are hidden, calls are declined while Buoy is open' : 'Texts are hidden', add: true }]
      .concat(prefs.blocked.map(n => ({ title: nameFor(n), sub: n, av: nameFor(n), n: n }))),
    sk: () => ['', 'Select', ''],
    act: (k, it) => {
      if (k !== 'Enter' || !it) return false;
      if (it.add) go(formView({ title: 'Block a number', done: 'Block', fields: [{ ph: 'Phone number', type: 'tel' }],
        onDone: vals => { if (!digits(vals[0])) { toast('Enter a number'); return; } blockNumber(digits(vals[0])); back(); v.redraw(); } }));
      else go(menuView(nameFor(it.n), [{ t: 'Unblock', fn: () => { unblockNumber(it.n); back(); v.redraw(); } }]));
      return true;
    }
  });
  return v;
}

/* ================= auto-reply ================= */
// A real phone number: no letters (sender names) and at least 7 digits (not a short code).
function isDialable(num) { return !!num && !/[^\d+\s()\-]/.test(num) && digits(num).replace(/\D/g, '').length >= 7; }

const hmToMin = s => { const m = (s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : -1; };
function inAutoSchedule(ar) {
  const f = hmToMin(ar.from), t = hmToMin(ar.to);
  if (f < 0 || t < 0 || f === t) return true;             // no valid schedule: always
  const n = new Date(), c = n.getHours() * 60 + n.getMinutes();
  return f < t ? (c >= f && c < t) : (c >= f || c < t);
}
// why: 'text' or 'call'. Only runs while Buoy is open, and at most once per number every 6 hours.
function autoReplyTo(num, why, incomingText) {
  const ar = prefs.autoReply;
  if (!ar.on || NO_SMS || (why === 'text' ? !ar.texts : !ar.calls)) return;
  const k = key(num);
  if (!k || !isDialable(num)) return;                      // skip names and short codes
  if (isBlocked(num) || !inAutoSchedule(ar)) return;
  if (incomingText && incomingText.trim() === ar.msg.trim()) return;                        // never answer an echo of ourselves
  if (Date.now() - (ar.cool[k] || 0) < 6 * 3600000) return;
  ar.cool[k] = Date.now(); savePrefs();
  sendText(convInfo('p:' + k, num), ar.msg, { auto: true });
}
function autoReplyView() {
  const v = makeList({
    title: 'Auto-reply',
    items: () => {
      const a = prefs.autoReply;
      return [
        { title: 'Auto-reply', sub: a.on ? 'On' : 'Off', k: 'on' },
        { title: 'Message', sub: a.msg, k: 'msg' },
        { title: 'Schedule', sub: a.from === a.to ? 'Always' : a.from + ' to ' + a.to, k: 'sched' },
        { title: 'Reply to texts', sub: a.texts ? 'On' : 'Off', k: 'texts' },
        { title: 'Reply to missed calls', sub: a.calls ? 'On' : 'Off', k: 'calls' },
        { title: 'Only while Buoy is open', sub: 'Once per number every 6 hours. Not sent to names or short codes.', k: 'info' }
      ];
    },
    sk: () => ['', 'Change', ''],
    act: (k, it) => {
      if (k !== 'Enter' || !it) return false;
      const a = prefs.autoReply;
      if (it.k === 'on') a.on = !a.on;
      else if (it.k === 'texts') a.texts = !a.texts;
      else if (it.k === 'calls') a.calls = !a.calls;
      else if (it.k === 'msg') { go(formView({ title: 'Auto-reply message', fields: [{ ph: 'Message', val: a.msg }], onDone: vals => { if (vals[0]) { a.msg = vals[0]; savePrefs(); back(); v.redraw(); } } })); return true; }
      else if (it.k === 'sched') { go(formView({ title: 'Schedule', done: 'Save', fields: [{ ph: 'From, like 22:00', val: a.from }, { ph: 'To, like 07:00', val: a.to }],
        onDone: vals => { if (hmToMin(vals[0]) < 0 || hmToMin(vals[1]) < 0) { toast('Use times like 22:00'); return; } a.from = vals[0]; a.to = vals[1]; savePrefs(); back(); v.redraw(); } })); return true; }
      else return true;
      savePrefs(); v.redraw();
      return true;
    }
  });
  return v;
}

/* ================= backup and restore ================= */
function backupData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('fb2.') === 0) data[k] = localStorage.getItem(k); }
  return { app: 'buoy', version: 1, t: Date.now(), data: data };
}
function backupFileName() {
  const d = new Date();
  return 'Buoy/buoy-backup-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + '.json';
}
function doBackup(silent) {
  const blob = new Blob([JSON.stringify(backupData())], { type: 'application/json' });
  const ds = navigator.getDeviceStorage && navigator.getDeviceStorage('sdcard');
  if (ds) {
    const r = ds.addNamed(blob, backupFileName());
    r.onsuccess = () => { prefs.lastBackup = Date.now(); savePrefs(); if (!silent) toast('Backed up'); };
    r.onerror = () => { if (!silent) toast('Backup failed: ' + ((r.error && r.error.name) || 'storage error')); };
  } else if (DEMO) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = backupFileName().replace('Buoy/', ''); document.body.appendChild(a); a.click(); document.body.removeChild(a);
    prefs.lastBackup = Date.now(); savePrefs();
  } else if (!silent) toast('Buoy has no storage access for backups');
}
function listBackups(cb) {
  const ds = navigator.getDeviceStorage && navigator.getDeviceStorage('sdcard');
  if (!ds) { cb([]); return; }
  const out = [], c = ds.enumerate('Buoy');
  c.onsuccess = function () {
    const f = this.result;
    if (f) { if (/buoy-backup-[\d-]+\.json$/.test(f.name)) out.push(f); this.continue(); }
    else cb(out.sort((a, b) => a.name < b.name ? 1 : -1));
  };
  c.onerror = () => cb(out);
}
function restoreFromText(text) {
  let b;
  try { b = JSON.parse(text); } catch (e) { toast('That file is not a Buoy backup'); return; }
  if (!b || b.app !== 'buoy' || !b.data || typeof b.data !== 'object') { toast('That file is not a Buoy backup'); return; }
  go(menuView('Replace all current data?', [
    { t: 'Yes, restore it', sub: 'Backup from ' + new Date(b.t).toLocaleString(), fn: () => {
      const gone = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.indexOf('fb2.') === 0) gone.push(k); }
      gone.forEach(k => localStorage.removeItem(k));
      Object.keys(b.data).forEach(k => { if (k.indexOf('fb2.') === 0 && typeof b.data[k] === 'string') localStorage.setItem(k, b.data[k]); });
      location.reload();
    } },
    { t: 'No, keep what I have', fn: back }
  ]));
}
function restorePicker() {
  const ds = navigator.getDeviceStorage && navigator.getDeviceStorage('sdcard');
  if (!ds) {
    if (DEMO) { const i = document.createElement('input'); i.type = 'file'; i.onchange = () => { const r = new FileReader(); r.onload = () => restoreFromText(r.result); if (i.files[0]) r.readAsText(i.files[0]); }; i.click(); }
    else toast('Buoy has no storage access for backups');
    return;
  }
  listBackups(files => {
    if (!files.length) { toast('No backups found in the Buoy folder'); return; }
    go(menuView('Restore which backup?', files.slice(0, 8).map(f => ({ t: f.name.replace(/^.*buoy-backup-/, '').replace('.json', ''), sub: Math.max(1, Math.round(f.size / 1024)) + ' KB',
      fn: () => { const r = new FileReader(); r.onload = () => restoreFromText(r.result); r.readAsText(f); } }))));
  });
}
function backupView() {
  const v = makeList({
    title: 'Backup and restore',
    items: () => [
      { title: 'Back up now', sub: prefs.lastBackup ? 'Last: ' + new Date(prefs.lastBackup).toLocaleString() : 'Saves chats, groups and settings to the SD card', k: 'now' },
      { title: 'Restore from a backup', sub: 'Replaces what is in Buoy now', k: 'restore' },
      { title: 'Back up every week', sub: prefs.autoBackup ? 'On, when Buoy opens' : 'Off', k: 'auto' }
    ],
    sk: () => ['', 'Select', ''],
    act: (k, it) => {
      if (k !== 'Enter' || !it) return false;
      if (it.k === 'now') { doBackup(false); setTimeout(() => v.redraw(), 700); }
      else if (it.k === 'restore') restorePicker();
      else { prefs.autoBackup = !prefs.autoBackup; savePrefs(); v.redraw(); }
      return true;
    }
  });
  return v;
}
function autoBackupIfDue() { if (prefs.autoBackup && Date.now() - prefs.lastBackup > 7 * 86400000) doBackup(true); }

/* ================= phone settings shortcuts ================= */
function phoneSetting(name) {
  return new Promise((resolve, reject) => {
    try { const r = navigator.mozSettings.createLock().get(name); r.onsuccess = () => resolve(r.result[name]); r.onerror = () => reject(r.error); }
    catch (e) { reject(e); }
  });
}
function setPhoneSetting(name, value) {
  return new Promise((resolve, reject) => {
    try { const o = {}; o[name] = value; const r = navigator.mozSettings.createLock().set(o); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); }
    catch (e) { reject(e); }
  });
}
function phoneShortcutsView() {
  const st = { airplane: null, volume: null };
  const v = makeList({
    title: 'Phone shortcuts',
    items: () => navigator.mozSettings ? [
      { title: 'Airplane mode', sub: st.airplane === null ? 'Reading…' : st.airplane ? 'On, no calls or texts' : 'Off', k: 'air' },
      { title: 'Silent mode', sub: st.volume === null ? 'Reading…' : st.volume === 0 ? 'On, alerts are silent' : 'Off, alert volume ' + st.volume, k: 'silent' }
    ] : [{ title: 'Not available', sub: 'Buoy was not given the settings permission', k: 'none' }],
    sk: () => ['', 'Toggle', ''],
    act: (k, it) => {
      if (k !== 'Enter' || !it || it.k === 'none') return false;
      if (it.k === 'air') {
        go(menuView(st.airplane ? 'Turn airplane mode off?' : 'Turn airplane mode on?', [
          { t: 'Yes', sub: st.airplane ? '' : 'You cannot send texts or make calls while it is on', fn: () => { setPhoneSetting('airplaneMode.enabled', !st.airplane).then(() => { st.airplane = !st.airplane; back(); v.redraw(); }, () => { back(); toast('The phone refused'); }); } },
          { t: 'No', fn: back }
        ]));
      } else {
        const to = st.volume === 0 ? (prefs.prevVolume || 7) : 0;
        if (st.volume > 0) { prefs.prevVolume = st.volume; savePrefs(); }
        setPhoneSetting('audio.volume.notification', to).then(() => { st.volume = to; v.redraw(); }, () => toast('The phone refused'));
      }
      return true;
    }
  });
  if (navigator.mozSettings) {
    phoneSetting('airplaneMode.enabled').then(a => { st.airplane = !!a; v.redraw(); }, () => { st.airplane = false; v.redraw(); });
    phoneSetting('audio.volume.notification').then(a => { st.volume = +a || 0; v.redraw(); }, () => { st.volume = 0; v.redraw(); });
  }
  return v;
}
// Ask the phone for delivery reports (needs the settings permission).
function applyDeliveryReports() {
  if (navigator.mozSettings) setPhoneSetting('ril.sms.requestStatusReport.enabled', !!prefs.deliveryReports).catch(() => {});
}

/* ================= contacts: edit, delete, duplicates, birthdays, favorites ================= */
function findContact(id) {
  return new Promise((resolve, reject) => {
    const r = navigator.mozContacts.find({ filterBy: ['id'], filterOp: 'equals', filterValue: id });
    r.onsuccess = () => resolve(r.result && r.result[0]);
    r.onerror = () => reject(r.error);
  });
}
const saveContact = c => new Promise((resolve, reject) => { const r = navigator.mozContacts.save(c); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); });
function bdayDate(text) { const m = (text || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; }
function bdayText(ts) { if (!ts) return ''; const d = new Date(ts); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }

function contactUpdate(e, name, tel, bday) {
  if (!navigator.mozContacts) {
    if (!DEMO) return Promise.reject(new Error('No contacts permission'));
    const l = DB.get('mockContacts', SEED).slice(), m = l.find(x => x.id === e.id && x.tel === e.tel);
    if (m) { m.name = name; m.tel = tel; m.bday = bday ? +bday : null; }
    DB.set('mockContacts', l);
    return Contacts.load();
  }
  return findContact(e.id).then(c => {
    if (!c) throw new Error('Contact not found');
    c.name = [name]; c.givenName = [name];
    if (c.tel && c.tel[e.ti]) c.tel[e.ti].value = tel; else c.tel = [{ type: ['mobile'], value: tel }];
    c.bday = bday || null;
    return saveContact(c);
  }).then(() => Contacts.load());
}
function contactRemove(e) {
  if (!navigator.mozContacts) {
    if (!DEMO) return Promise.reject(new Error('No contacts permission'));
    DB.set('mockContacts', DB.get('mockContacts', SEED).filter(x => x.id !== e.id));
    return Contacts.load();
  }
  return findContact(e.id).then(c => new Promise((resolve, reject) => { const r = navigator.mozContacts.remove(c); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); })).then(() => Contacts.load());
}
function editContactForm(e) {
  go(formView({
    title: 'Edit contact', done: 'Save',
    fields: [{ ph: 'Name', val: e.name }, { ph: 'Phone number', type: 'tel', val: e.tel }, { ph: 'Birthday, like 1990-04-27', val: bdayText(e.bday) }],
    onDone: vals => {
      if (!vals[0] || !digits(vals[1])) { toast('Name and number needed'); return; }
      if (vals[2] && !bdayDate(vals[2])) { toast('Birthday must look like 1990-04-27'); return; }
      contactUpdate(e, vals[0], digits(vals[1]) || vals[1], bdayDate(vals[2])).then(() => { toast('Contact saved'); goHome(); }, err => toast('Could not save: ' + err.message));
    }
  }));
}
function deleteContactMenu(e) {
  go(menuView('Delete ' + snippet(e.name, 18) + '?', [
    { t: 'Yes, delete the contact', sub: 'Removes it from the phone, with all its numbers', fn: () => contactRemove(e).then(() => { toast('Deleted'); goHome(); }, err => { back(); toast('Could not delete: ' + err.message); }) },
    { t: 'No', fn: back }
  ]));
}

function findDuplicateGroups() {
  const groups2 = {}, seen = {};
  Contacts.list.forEach(c => {
    [['t:' + key(c.tel), key(c.tel)], ['n:' + c.name.trim().toLowerCase(), c.name.trim()]].forEach(p => { if (p[1]) (groups2[p[0]] = groups2[p[0]] || []).push(c); });
  });
  const out = [];
  Object.keys(groups2).forEach(k => {
    const ids = {}, uniq = [];
    groups2[k].forEach(c => { if (!ids[c.id]) { ids[c.id] = 1; uniq.push(c); } });
    if (uniq.length < 2) return;
    const sig = uniq.map(c => c.id).sort().join('|');
    if (seen[sig]) return;
    seen[sig] = 1; out.push(uniq);
  });
  return out;
}
function mergeContacts(group) {
  const keep = group[0], others = group.slice(1);
  if (!navigator.mozContacts) {
    if (!DEMO) return Promise.reject(new Error('No contacts permission'));
    let l = DB.get('mockContacts', SEED).slice();
    others.forEach(o => { if (!l.some(x => x.id === keep.id && key(x.tel) === key(o.tel))) l.push({ id: keep.id, name: keep.name, tel: o.tel }); });
    const gone = others.map(o => o.id);
    l = l.filter(x => gone.indexOf(x.id) < 0);
    DB.set('mockContacts', l);
    return Contacts.load();
  }
  return findContact(keep.id).then(kc => Promise.all(others.map(o => findContact(o.id))).then(ocs => {
    ocs.forEach(oc => (oc && oc.tel || []).forEach(t => { if (!(kc.tel || []).some(x => key(x.value) === key(t.value))) (kc.tel = kc.tel || []).push(t); }));
    return saveContact(kc).then(() => Promise.all(ocs.map(oc => oc ? new Promise((res, rej) => { const r = navigator.mozContacts.remove(oc); r.onsuccess = () => res(); r.onerror = () => rej(r.error); }) : null)));
  })).then(() => Contacts.load());
}
function duplicatesView() {
  const v = makeList({
    title: 'Duplicate contacts',
    items: () => findDuplicateGroups().map(g => ({ title: g[0].name, sub: g.map(c => c.tel).join(', '), av: g[0].name, g: g })),
    empty: () => 'No duplicates found.',
    sk: () => ['', 'Merge', ''],
    act: (k, it) => {
      if (k === 'Enter' && it) {
        go(menuView('Merge ' + it.g.length + ' contacts?', [
          { t: 'Yes, merge', sub: 'Keeps "' + snippet(it.g[0].name, 20) + '" and adds the other numbers to it', fn: () => mergeContacts(it.g).then(() => { back(); v.redraw(); toast('Merged'); }, err => { back(); toast('Could not merge: ' + err.message); }) },
          { t: 'No', fn: back }
        ]));
        return true;
      }
      return false;
    }
  });
  return v;
}

function daysUntilBirthday(ts) {
  const b = new Date(ts), n = new Date(), today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  let next = Date.UTC(n.getFullYear(), b.getUTCMonth(), b.getUTCDate());
  if (next < today) next = Date.UTC(n.getFullYear() + 1, b.getUTCMonth(), b.getUTCDate());
  return Math.round((next - today) / 86400000);
}
function birthdaysWithin(days) {
  const seen = {};
  return Contacts.list.filter(c => { if (!c.bday || seen[c.id]) return false; seen[c.id] = 1; return true; })
    .map(c => ({ c: c, d: daysUntilBirthday(c.bday) })).filter(x => x.d <= days).sort((a, b) => a.d - b.d);
}
function birthdaysView() {
  return makeList({
    title: 'Birthdays this week',
    items: () => birthdaysWithin(7).map(x => ({ title: x.c.name, sub: (x.d === 0 ? 'Today' : x.d === 1 ? 'Tomorrow' : 'In ' + x.d + ' days') + ' · ' + bdayText(x.c.bday).slice(5), av: x.c.name, contact: x.c })),
    empty: () => 'No birthdays in the next 7 days. Add them when you edit a contact.',
    sk: () => ['', 'Open', ''],
    act: (k, it) => { if (k === 'Enter' && it) { contactMenu(it.contact); return true; } return false; }
  });
}
function announceBirthdays() {
  const today = birthdaysWithin(0);
  if (today.length) toast('🎂 Birthday today: ' + today.map(x => x.c.name).join(', '));
}

// Favorites: the people you chose, then the people you contact most, up to six.
function favoriteList() {
  const out = [], have = {};
  const add = (tel, name) => { const k = key(tel); if (k && isDialable(tel) && !have[k] && out.length < 6) { have[k] = 1; out.push({ tel: tel, name: name || nameFor(tel) }); } };
  prefs.favs.forEach(t => add(t));
  const score = {}, tels = {};
  msgs.forEach(m => { if (m.conv.charAt(0) === 'p' && m.num) { const k = key(m.num); score[k] = (score[k] || 0) + 1; tels[k] = m.num; } });
  calls.forEach(c => c.nums.forEach(n => { const k = key(n); if (k) { score[k] = (score[k] || 0) + 2; tels[k] = n; } }));
  Object.keys(score).sort((a, b) => score[b] - score[a]).forEach(k => { if (!isBlocked(tels[k])) add(tels[k]); });
  return out;
}
function toggleFavorite(tel) {
  const k = key(tel);
  if (prefs.favs.some(t => key(t) === k)) prefs.favs = prefs.favs.filter(t => key(t) !== k); else prefs.favs.push(tel);
  savePrefs();
}

/* ================= call notes ================= */
function addCallNote(call) {
  go(formView({
    title: 'Call note', done: 'Save', fields: [{ ph: 'Note', val: call.note || '' }],
    onDone: vals => { call.note = vals[0]; saveCalls(); goHome(); toast(vals[0] ? 'Note saved' : 'Note removed'); }
  }));
}
function callNotesView(nums, title) {
  const ks = nums.map(key);
  return makeList({
    title: title || 'Call notes',
    items: () => calls.filter(c => c.note && c.nums.some(n => ks.indexOf(key(n)) >= 0)).slice().reverse().map(c => ({ title: c.note, sub: fmtTime(c.t), call: c })),
    empty: () => 'No notes. Open the Calls tab, select a call and choose Add note.',
    sk: () => ['', '', '']
  });
}

/* ================= pictures (MMS) ================= */
function mmsSupported() { return !!(navigator.mozMobileMessage && navigator.mozMobileMessage.sendMMS); }

function pickImage(cb) {
  if (window.MozActivity) {
    const a = new MozActivity({ name: 'pick', data: { type: ['image/jpeg', 'image/png'], nocrop: true } });
    a.onsuccess = () => { const b = a.result && a.result.blob; if (b) cb(b); };
    a.onerror = () => toast('No picture chosen');
  } else if (DEMO) {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = () => { if (i.files[0]) cb(i.files[0]); }; i.click();
  }
}
// Shrinks a picture to fit an MMS (about 300 KB) and makes a tiny thumbnail for the chat.
function prepareImage(blob, done) {
  const img = new Image(), url = URL.createObjectURL(blob);
  img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that picture'); };
  img.onload = () => {
    const draw = (maxSide, q, cb) => {
      const s = Math.min(1, maxSide / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(cb, 'image/jpeg', q);
    };
    const tries = [[640, 0.7], [640, 0.5], [480, 0.5], [400, 0.4], [320, 0.35]];
    const next = i => draw(tries[i][0], tries[i][1], out => {
      if (out.size > 300 * 1024 && i < tries.length - 1) { next(i + 1); return; }
      const c = document.createElement('canvas'), s = Math.min(1, 96 / Math.max(img.width, img.height));
      c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      done(out, c.toDataURL('image/jpeg', 0.5));
    });
    next(0);
  };
  img.src = url;
}
function sendPictureFlow(info, caption) {
  if (info.group) { toast('Pictures go to one person at a time'); return; }
  if (!info.number) { toast('No number for this chat'); return; }
  if (!DEMO && !mmsSupported()) { toast('Pictures need SMS access (Buoy C)'); return; }
  pickImage(blob => prepareImage(blob, (out, thumb) => {
    go(menuView('Send picture?', [
      { t: 'Send to ' + snippet(info.title, 16), sub: Math.max(1, Math.round(out.size / 1024)) + ' KB' + (caption ? ' with your text' : ''), fn: () => { sendPicture(info, out, thumb, caption); goHome(); openChat(info.id, info.number); } },
      { t: 'Cancel', fn: back }
    ]));
  }));
}
function sendPicture(info, blob, thumb, caption) {
  const rec = { id: uid(), conv: info.id, num: info.number, from: null, dir: 'out', text: caption || '', t: Date.now(), st: 'sending', local: true, mms: true, thumb: thumb };
  msgs.push(rec); persist();
  const finish = ok => { rec.st = ok ? 'sent' : 'fail'; persist(); refreshView(); };
  if (!mmsSupported()) { setTimeout(() => finish(true), 600); return; }          // demo mode
  const attachments = [{ location: 'photo.jpg', content: blob }];
  if (caption) attachments.push({ location: 'caption.txt', content: new Blob([caption], { type: 'text/plain' }) });
  const smil = '<smil xmlns="http://www.w3.org/2001/SMIL20/Language"><head><layout><root-layout width="240px" height="320px"/>' +
    '<region id="Image" left="0px" top="0px" width="240px" height="240px" fit="meet"/><region id="Text" left="0px" top="240px" width="240px" height="80px" fit="meet"/></layout></head>' +
    '<body><par dur="5000ms"><img src="photo.jpg" region="Image"/>' + (caption ? '<text src="caption.txt" region="Text"/>' : '') + '</par></body></smil>';
  const sid = simServiceId(info.id);
  try {
    const mm = navigator.mozMobileMessage, args = { receivers: [info.number], subject: '', smil: smil, attachments: attachments };
    const r = sid === null ? mm.sendMMS(args) : mm.sendMMS(args, { serviceId: sid });
    r.onsuccess = () => { const m = r.result; if (m && m.id != null) rec.devId = m.id; finish(true); };
    r.onerror = () => finish(false);
  } catch (e) { finish(false); }
}
// Finds a picture in a message kept by the phone; calls back with an object URL (or null).
function loadPicture(rec, cb) {
  const mm = navigator.mozMobileMessage;
  if (!mm || rec.devId == null || !mm.getMessage) { cb(null); return; }
  const r = mm.getMessage(rec.devId);
  r.onsuccess = () => {
    const a = (r.result && r.result.attachments || []).filter(x => x.content && /^image\//.test(x.content.type))[0];
    cb(a ? URL.createObjectURL(a.content) : null);
  };
  r.onerror = () => cb(null);
}
function pictureView(rec) {
  const v = {
    title: 'Picture', url: null,
    sk: () => ['', '', ''],
    draw(b) {
      v.box = el('div', 'note'); b.appendChild(v.box);
      const show = url => { v.box.innerHTML = ''; if (!url) { v.box.appendChild(el('p', null, 'The picture is not on this phone any more.')); return; } const i = el('img'); i.src = url; i.style.cssText = 'width:100%;height:auto;display:block'; v.box.appendChild(i); };
      if (rec.thumb && rec.devId == null) show(rec.thumb); else loadPicture(rec, url => show(url || rec.thumb));
    },
    key(k) { if (k === 'ArrowDown') { v.box.scrollTop += 40; return true; } if (k === 'ArrowUp') { v.box.scrollTop -= 40; return true; } return false; }
  };
  return v;
}
// Puts a picture into a bubble: our own thumbnail, or the phone's copy of a received one.
function fillPicture(holder, rec) {
  const set = url => { if (!url) { holder.textContent = '[Picture]'; return; } holder.innerHTML = ''; const i = el('img'); i.src = url; i.style.cssText = 'display:block;max-width:100%;max-height:110px;border-radius:3px'; holder.appendChild(i); };
  if (rec.thumb) set(rec.thumb); else loadPicture(rec, set);
}
