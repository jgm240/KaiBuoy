'use strict';

/* ================= helpers ================= */
const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};
const digits = n => (n || '').replace(/[^\d+]/g, '').replace(/^00/, '+');
const key = n => digits(n).replace(/\D/g, '').slice(-8);        // matches one number across formats
const hue = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const p2 = x => (x < 10 ? '0' : '') + x;
function fmtTime(t) {
  const d = new Date(t), n = new Date();
  return d.toDateString() === n.toDateString() ? p2(d.getHours()) + ':' + p2(d.getMinutes()) : d.getDate() + '/' + (d.getMonth() + 1);
}
function initial(s) { const m = (s || '?').trim().match(/[^\s+]/); return (m ? m[0] : '?').toUpperCase(); }
function snippet(s, n) { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

let toastTimer = 0;
function toast(text) {
  const t = document.getElementById('toast');
  t.textContent = text; t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2500);
}

const DB = {
  get(k, d) { try { const v = localStorage.getItem('fb2.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('fb2.' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ================= data ================= */
let groups = DB.get('groups', []);   // { id, name, members: [tel], bc?: true }  (bc = broadcast list)
let msgs = DB.get('msgs', []);       // { id, conv, num, from, dir: in|out, text, t, st, local }
let calls = DB.get('calls', []);     // { t, nums: [tel], label, type?: 'missed' }
let reads = DB.get('reads', {});     // conv -> time last opened
let reminders = DB.get('rem', []);   // { id, t, nums, label, shown }
let prefs = Object.assign({
  theme: 'light', accent: 0, size: 0, wp: 0, sim: 'auto', pinned: {}, muted: {}, speed: {}, tombs: [],
  chatSim: {}, blocked: [], blockCalls: true, templates: DEFAULT_TEMPLATES.slice(), scheduled: [], disappear: {}, favs: [],
  chatLook: {}, bigBubbles: false, sk: { left: 'default', right: 'default', chatLeft: 'emoji' }, deliveryReports: true,
  autoBackup: false, lastBackup: 0, prevVolume: 0,
  autoReply: { on: false, msg: 'I can\u2019t talk right now. I\u2019ll get back to you soon.', from: '22:00', to: '07:00', texts: true, calls: true, cool: {} }
}, DB.get('prefs', {}));

const persist = () => { if (msgs.length > 2000) msgs = msgs.slice(-2000); DB.set('msgs', msgs); };
const saveGroups = () => DB.set('groups', groups);
const saveCalls = () => { if (calls.length > 200) calls = calls.slice(-200); DB.set('calls', calls); };
const saveRem = () => DB.set('rem', reminders);
const savePrefs = () => DB.set('prefs', prefs);
function markRead(conv) { reads[conv] = Date.now(); DB.set('reads', reads); }

/* ================= theme ================= */
const ACCENTS = [
  { n: 'Blue', hl: '#00caf2', hd: '#20407b' }, { n: 'Cyan', hl: '#1cc1c4', hd: '#045463' }, { n: 'Lime', hl: '#82c51b', hd: '#2a400c' },
  { n: 'Orange', hl: '#ff9500', hd: '#381e0d' }, { n: 'Pink', hl: '#f6529b', hd: '#48132c' }, { n: 'Purple', hl: '#873eff', hd: '#320374' },
  { n: 'Red', hl: '#f3203d', hd: '#5b0700' }
];
const THEMES = ['light', 'dark', 'auto'];
const THEME_LABEL = { light: 'Light', dark: 'Dark', auto: 'Auto (dark 7pm to 7am)' };
const SIZES = ['Normal', 'Large', 'Extra large'], SIZE_PX = [[17, 14, 12], [22, 18, 16], [26, 21, 19]];   // primary, secondary, small text
const WALLPAPERS = ['Default', 'Tint', 'Dots', 'Plain'];

function isDark() {
  if (prefs.theme === 'dark') return true;
  if (prefs.theme === 'light') return false;
  const h = new Date().getHours();
  return h >= 19 || h < 7;
}
function accentColor(i) { return (ACCENTS[i] || ACCENTS[0]).hl; }
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function applyTheme(over) {
  const ai = over && over.accent != null ? over.accent : prefs.accent, wpi = over && over.wp != null ? over.wp : prefs.wp;
  const a = ACCENTS[ai] || ACCENTS[0], d = isDark(), c = hexRgb(a.hl);
  const light = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 > 0.6;   // dark text on bright accents
  const v = {
    '--hdr': a.hd, '--acc': a.hl, '--focus': a.hl, '--focusfg': light ? '#000000' : '#ffffff',
    '--bg': d ? '#121212' : '#ffffff', '--fg': d ? '#e8e8e8' : '#333333', '--muted': d ? '#9a9a9a' : '#6a6a6a',
    '--line': d ? '#2a2a2a' : '#e7e7e7', '--sub': d ? '#222222' : '#e6e6e6', '--subfg': d ? '#a0a0a0' : '#6a6a6a',
    '--bar': d ? '#1c1c1c' : '#ffffff', '--barfg': d ? '#dddddd' : '#333333', '--sc': d ? '#ffffff' : '#000000',
    '--out': a.hd, '--outfg': '#ffffff', '--in': d ? '#2a2a2a' : '#e6e6e6', '--infg': d ? '#e8e8e8' : '#333333',
    '--input': d ? '#2a2a2a' : '#ffffff', '--menubg': d ? '#1e1e1e' : '#ffffff', '--menuhd': d ? '#333333' : '#cccccc', '--menuhdfg': d ? '#eeeeee' : '#323232'
  };
  let chat = d ? '#121212' : '#ffffff', img = 'none', size = 'auto';
  if (wpi === 1) chat = 'rgba(' + c.join(',') + ',' + (d ? '.14' : '.12') + ')';
  else if (wpi === 2) { img = 'radial-gradient(rgba(128,128,128,.25) 1.5px, transparent 1.5px)'; size = '14px 14px'; }
  else if (wpi === 3) chat = d ? '#000000' : '#f2f2f2';
  v['--chat'] = chat; v['--wpimg'] = img; v['--wpsize'] = size;
  const sz = SIZE_PX[prefs.size] || SIZE_PX[0];
  v['--pri'] = sz[0] + 'px'; v['--sec'] = sz[1] + 'px'; v['--thi'] = sz[2] + 'px';
  const root = document.documentElement;
  Object.keys(v).forEach(k => root.style.setProperty(k, v[k]));
  document.body.classList.toggle('big-bubbles', !!prefs.bigBubbles);
}

/* ================= platform: contacts ================= */
// Demo mode is for a desktop browser only: no phone APIs at all. On a phone it never fakes anything.
const DEMO = !window.MozActivity && !navigator.mozMobileMessage;
const SEED = [
  { id: 's1', name: 'Alice Baker', tel: '+15550101' }, { id: 's2', name: 'Ben Carter', tel: '+15550102' },
  { id: 's3', name: 'Chloe Diaz', tel: '+15550103' }, { id: 's4', name: 'Dan Evans', tel: '+15550104' }
];
const Contacts = {
  list: [],
  load() {
    return new Promise(resolve => {
      const done = out => { out.sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1); Contacts.list = out; resolve(out); };
      if (!navigator.mozContacts) return done(DEMO ? DB.get('mockContacts', SEED).slice() : []);
      const out = [];
      const req = navigator.mozContacts.getAll({ sortBy: 'givenName', sortOrder: 'ascending' });
      req.onsuccess = function () {
        const c = this.result;
        if (!c) return done(out);
        const name = (c.name && c.name[0]) || (c.givenName && c.givenName[0]) || '';
        (c.tel || []).forEach((t, ti) => { if (t.value) out.push({ id: c.id, name: name || t.value, tel: t.value, ti: ti, bday: c.bday ? +new Date(c.bday) : null }); });
        this.continue();
      };
      req.onerror = () => done(out);
    });
  },
  add(name, tel) {
    return new Promise((resolve, reject) => {
      if (navigator.mozContacts && window.mozContact) {
        const c = new mozContact();
        c.init({ name: [name], givenName: [name], tel: [{ type: ['mobile'], value: tel }] });
        const r = navigator.mozContacts.save(c);
        r.onsuccess = () => Contacts.load().then(resolve);
        r.onerror = () => reject(r.error);
      } else if (DEMO) {
        const l = DB.get('mockContacts', SEED).slice();
        l.push({ id: uid(), name: name, tel: tel });
        DB.set('mockContacts', l);
        Contacts.load().then(resolve);
      } else {
        reject(new Error('No contacts permission'));
      }
    });
  }
};
function nameFor(num) {
  const k = key(num);
  const c = k && Contacts.list.find(x => key(x.tel) === k);
  return c ? c.name : num;
}

/* ================= platform: sms and calls ================= */
const NO_SMS = !navigator.mozMobileMessage && !DEMO;   // phone, but the app wasn't given SMS access

// Which SIM slot to use. Some phones report two slots with the card in only one, and a text or call
// sent without naming the slot can go to the empty one. Needs the mobileconnection permission to see.
const SIM_CHOICES = ['auto', 0, 1];
function simStatus() {
  const c = navigator.mozMobileConnections;
  if (!c) return null;
  return Array.prototype.map.call(c, (x, i) => ({
    i: i, has: !!x.iccId,
    name: (x.voice && x.voice.network && (x.voice.network.shortName || x.voice.network.longName)) || ''
  }));
}
// Returns a slot number, or null to let the phone decide.
function simServiceId(conv) {
  if (conv && prefs.chatSim[conv] != null) return +prefs.chatSim[conv];
  if (prefs.sim !== 'auto') return +prefs.sim;
  const s = simStatus(), withCard = s ? s.filter(x => x.has) : [];
  return withCard.length ? withCard[0].i : null;
}
function simLabel() {
  const s = simStatus(), sid = simServiceId();
  const slot = i => 'SIM ' + (i + 1) + (s && s[i] ? (s[i].has ? (s[i].name ? ' (' + s[i].name + ')' : '') : ' (no card)') : '');
  if (prefs.sim === 'auto') return 'Auto: ' + (sid === null ? (s ? 'phone default' : 'phone default, SIM info not allowed') : slot(sid));
  return slot(sid);
}

function chatSimLabel(conv) {
  if (prefs.chatSim[conv] == null) return 'Same as app: ' + simLabel();
  const s = simStatus(), i = +prefs.chatSim[conv];
  return 'SIM ' + (i + 1) + (s && s[i] ? (s[i].has ? (s[i].name ? ' (' + s[i].name + ')' : '') : ' (no card)') : '');
}
function chatSimMenu(info) {
  const set = v => { if (v == null) delete prefs.chatSim[info.id]; else prefs.chatSim[info.id] = v; savePrefs(); back(); toast('SIM for this chat: ' + chatSimLabel(info.id)); };
  go(menuView('SIM for this chat', [
    { t: 'Same as app', sub: simLabel(), fn: () => set(null) },
    { t: 'SIM 1', fn: () => set(0) },
    { t: 'SIM 2', fn: () => set(1) }
  ]));
}

const Sms = {
  // Resolves 'sent', or 'handoff' when the text was opened in the Messages app for the user to send.
  send(num, text, onId, conv) {
    const mm = navigator.mozMobileMessage;
    if (mm) {
      return new Promise((resolve, reject) => {
        const sid = simServiceId(conv);
        const r = sid === null ? mm.send(num, text) : mm.send(num, text, { serviceId: sid });
        r.onsuccess = () => { try { if (onId && r.result && r.result.id != null) onId(r.result.id); } catch (e) { /* tracking only */ } resolve('sent'); };
        r.onerror = () => reject(r.error);
      });
    }
    if (!DEMO) {
      new MozActivity({ name: 'new', data: { type: 'websms/sms', number: num, body: text } });
      return Promise.resolve('handoff');
    }
    // Demo mode (desktop browser only): pretend to send, and fake a reply so the UI can be tried.
    return new Promise(resolve => {
      setTimeout(() => resolve('sent'), 400);
      setTimeout(() => {
        const g = text.match(/^\[([^\]]{1,24})\] /);
        const rec = ingest({ id: uid(), num: num, dir: 'in', text: (g ? g[0] : '') + 'Got it 👍', t: Date.now() });
        if (rec) { persist(); announce(rec); refreshView(); }
      }, 1800);
    });
  }
};

function logCall(nums, label, type) { calls.push({ t: Date.now(), nums: nums, label: label || '', type: type || '' }); saveCalls(); }

function dialViaActivity(number) {
  if (window.MozActivity) new MozActivity({ name: 'dial', data: { type: 'webtelephony/number', number: number } });
  else toast('Demo: calling ' + number);
}
// With telephony access the call is placed on the chosen SIM; otherwise the built-in dialer picks one.
function dial(number) {
  logCall([number]);
  const tel = navigator.mozTelephony, sid = simServiceId('p:' + key(number));
  if (tel && tel.dial && sid !== null) {
    try { tel.dial(number, sid).then(null, () => { toast('Call failed on SIM ' + (sid + 1) + ', trying the dialer'); dialViaActivity(number); }); return; }
    catch (e) { /* fall through to the dialer */ }
  }
  dialViaActivity(number);
}

// Group call = a normal phone conference call. Needs the telephony permission; without it
// we start the first call and tell the user to add the others from the call screen.
function groupCall(nums, label) {
  logCall(nums, label);
  const tel = navigator.mozTelephony;
  if (!(tel && tel.dial && tel.conferenceGroup)) {
    if (!window.MozActivity) { toast('Demo: group call with ' + nums.length + ' people'); return; }
    toast('Calling ' + nameFor(nums[0]) + ' first. Add the others from the call screen.');
    new MozActivity({ name: 'dial', data: { type: 'webtelephony/number', number: nums[0] } });
    return;
  }
  const live = [];
  const next = i => {
    if (i >= nums.length) { toast('Group call connected'); return; }
    const sid = simServiceId();
    (sid === null ? tel.dial(nums[i]) : tel.dial(nums[i], sid)).then(call => {
      call.onconnected = () => {
        try {
          if (i === 1) tel.conferenceGroup.add(live[0], call);
          else if (i > 1) tel.conferenceGroup.add(call);
        } catch (e) { toast('Could not merge ' + nameFor(nums[i])); }
        live.push(call);
        next(i + 1);
      };
      call.onerror = () => { toast('Could not reach ' + nameFor(nums[i])); next(i + 1); };
    }, () => toast('Call failed'));
  };
  next(0);
}

// Best effort: calls are only seen while Buoy is open (the phone's own call log is not open to apps).
function watchIncoming() {
  const tel = navigator.mozTelephony;
  if (!tel || !tel.addEventListener) return;
  tel.addEventListener('incoming', e => {
    const c = e.call, num = (c.id && c.id.number) || '';
    if (num && prefs.blockCalls && isBlocked(num)) {
      try { c.hangUp(); } catch (err) { /* the call may already be over */ }
      logCall([num], '', 'blocked'); toast('Declined a call from a blocked number'); refreshView();
      return;
    }
    let answered = false;
    c.addEventListener('connected', () => { answered = true; if (num) { logCall([num], '', 'in'); refreshView(); } });
    c.addEventListener('disconnected', () => {
      if (answered || !num) return;
      logCall([num], '', 'missed');
      toast('Missed call: ' + nameFor(num));
      autoReplyTo(num, 'call');
      refreshView();
    });
  });
  // outgoing calls started outside Buoy (the phone's dialer, a headset key)
  tel.addEventListener('callschanged', () => {
    Array.prototype.forEach.call(tel.calls || [], c => {
      if (c.__seen) return;
      c.__seen = true;
      if (c.state !== 'dialing' && c.state !== 'alerting') return;       // incoming calls are handled above
      const num = (c.id && c.id.number) || '';
      if (num && !calls.some(x => x.type !== 'in' && x.type !== 'missed' && x.nums.some(n => key(n) === key(num)) && Date.now() - x.t < 15000)) { logCall([num]); refreshView(); }
    });
  });
}

/* ================= reminders and speed dial ================= */
function notify(text) {
  toast('⏰ ' + text);
  try { if (window.Notification && Notification.permission === 'granted') new Notification('Buoy', { body: text }); } catch (e) {}
}
function addReminder(nums, label, t) {
  const r = { id: uid(), t: t, nums: nums, label: label || '', shown: false };
  reminders.push(r); saveRem();
  try { if (navigator.mozAlarms) navigator.mozAlarms.add(new Date(t), 'ignoreTimezone', { rid: r.id }); } catch (e) {}
  try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  toast('Reminder set for ' + fmtTime(t) + (new Date(t).toDateString() === new Date().toDateString() ? '' : ' ' + p2(new Date(t).getHours()) + ':' + p2(new Date(t).getMinutes())));
}
function removeReminder(r) { reminders = reminders.filter(x => x !== r); saveRem(); }
const dueReminders = () => reminders.filter(r => r.t <= Date.now()).sort((a, b) => a.t - b.t);
function checkReminders() {
  let fresh = false;
  reminders.forEach(r => {
    if (r.t <= Date.now() && !r.shown) { r.shown = true; fresh = true; notify('Call back ' + (r.label || nameFor(r.nums[0]))); }
  });
  if (fresh) { saveRem(); refreshView(); }
}
function reminderTitle(r) { return r.label || nameFor(r.nums[0]) + (r.nums.length > 1 ? ' +' + (r.nums.length - 1) : ''); }

function remindMenu(nums, label) {
  const inMin = m => Date.now() + m * 60000;
  const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };
  const set = t => { addReminder(nums, label, t); goHome(); };
  go(menuView('Remind me to call', [
    { t: 'In 15 minutes', fn: () => set(inMin(15)) },
    { t: 'In 1 hour', fn: () => set(inMin(60)) },
    { t: 'In 3 hours', fn: () => set(inMin(180)) },
    { t: 'Tomorrow at 9:00', fn: () => set(tomorrow()) }
  ]));
}

function speedKeyFor(tel) {
  for (let d = 2; d <= 9; d++) if (prefs.speed[d] && key(prefs.speed[d]) === key(tel)) return d;
  return 0;
}
function speedDial(d) {
  if (d === '0') return;
  const t = prefs.speed[d];
  if (!t) { toast('Nothing on ' + d + '. Set speed dial from a contact.'); return; }
  dial(t);
}
function speedMenu(c) {
  const opts = [];
  for (let d = 2; d <= 9; d++) {
    opts.push({ t: d + (prefs.speed[d] ? '  ' + nameFor(prefs.speed[d]) : '  (empty)'), fn: () => {
      const old = speedKeyFor(c.tel); if (old) delete prefs.speed[old];
      prefs.speed[d] = c.tel; savePrefs(); goHome(); toast('Hold ' + d + ' to call ' + c.name);
    } });
  }
  if (speedKeyFor(c.tel)) opts.push({ t: 'Remove speed dial', fn: () => { delete prefs.speed[speedKeyFor(c.tel)]; savePrefs(); goHome(); } });
  go(menuView('Speed dial', opts));
}

/* ================= conversations ================= */
const SHORT = { ':)': '🙂', ':-)': '🙂', ':D': '😄', ';)': '😉', ':(': '🙁', ':P': '😛', ':p': '😛', ':O': '😮', ":'(": '😢', 'xD': '😆', ':*': '😘', 'B)': '😎', ':|': '😐', ':/': '😕', '<3': '❤️', '</3': '💔' };
const CODES = { smile: '😄', heart: '❤️', fire: '🔥', ok: '👌', thumbsup: '👍', thumbsdown: '👎', clap: '👏', pray: '🙏', cry: '😢', laugh: '😂', love: '😍', cool: '😎', party: '🎉', sad: '😢', wink: '😉', kiss: '😘', think: '🤔', star: '⭐', sleep: '😴', hug: '🤗', wave: '👋', phone: '📞', cake: '🎂', pizza: '🍕', beer: '🍺', coffee: '☕', sun: '☀️', moon: '🌙', yes: '✅', no: '❌', eyes: '👀', '100': '💯' };
// Turns ":fire:" and emoticons like ":)" into emoji. T9 predictions can commit a word and a space
// in one go, so this works anywhere in the text; emoticons must stand alone between spaces.
const EMOTICON_RE = new RegExp('(^|\\s)(' + Object.keys(SHORT)
  .sort((a, b) => b.length - a.length)
  .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=\\s|$)', 'g');
function emojify(val) {
  return val
    .replace(/:([a-z0-9]+):/g, (m, c) => CODES[c] || m)
    .replace(EMOTICON_RE, (m, pre, tok) => pre + SHORT[tok]);
}

// Replies are plain text on the wire: a first line of  ↩ "quoted text"  then the reply.
function splitQuote(t) { const m = (t || '').match(/^↩ "([^"\n]*)"\n([\s\S]*)$/); return m ? { q: m[1], body: m[2] } : { q: '', body: t || '' }; }
function makeQuote(m) { return '↩ "' + snippet(splitQuote(m.text).body, 40).replace(/"/g, "'") + '"\n'; }

// Deleted messages are remembered so they don't come back when the phone's SMS history is re-read.
function entomb(m) {
  prefs.tombs.push(/^d\d+$/.test(m.id) ? { k: 'id:' + m.id, t: 0 } : { k: 'tx:' + m.conv + '|' + m.dir + '|' + m.text, t: m.t });
  if (prefs.tombs.length > 400) prefs.tombs.shift();
}
function removeMsgs(list) {
  list.forEach(entomb);
  msgs = msgs.filter(x => list.indexOf(x) < 0);
  persist(); savePrefs();
}
function isTombed(m, conv, text) {
  return prefs.tombs.some(x => x.k === 'id:' + m.id || (m.device && x.k === 'tx:' + conv + '|' + m.dir + '|' + text && Math.abs(x.t - m.t) < 120000));
}

// Returns the stored message, or false if it was a duplicate.
function ingest(m) {
  if (m.id && msgs.some(x => x.id === m.id)) return false;
  let conv = 'p:' + key(m.num), text = m.text || '', from = null;
  const g = text.match(/^\[([^\]]{1,24})\] ([\s\S]*)$/);
  if (g) {
    const grp = groups.find(x => !x.bc && x.name === g[1] && (m.dir === 'out' || x.members.some(t => key(t) === key(m.num))));
    if (grp) { conv = 'g:' + grp.id; text = g[2]; if (m.dir === 'in') from = m.num; }
  }
  if (m.dir === 'in' && isBlocked(m.num)) return false;       // hidden in Buoy; the phone still keeps the text
  if (isTombed(m, conv, text)) return false;
  // Texts we sent ourselves also come back when the phone's SMS history is read; skip those.
  if (m.device && m.dir === 'out') {
    const mine = msgs.find(x => x.local && x.conv === conv && x.text === text && Math.abs(x.t - m.t) < 120000);
    if (mine) {       // the same text, read back from the phone: take its delivery state
      if (m.devId != null && mine.devId == null) mine.devId = m.devId;
      if (m.st && (mine.st === 'sent' || mine.st === 'sending')) mine.st = m.st;
      return false;
    }
  }
  const rec = { id: m.id || uid(), conv: conv, num: m.num, from: from, dir: m.dir, text: text, t: m.t || Date.now(), st: m.st || 'sent' };
  if (m.devId != null) rec.devId = m.devId;
  if (m.mms) rec.mms = true;
  msgs.push(rec);
  return rec;
}

// Tell the user about a new message unless that chat is open or muted.
function announce(rec) {
  if (rec.dir !== 'in' || prefs.muted[rec.conv]) return;
  if (cur && cur.info && cur.info.id === rec.conv) return;
  toast(nameFor(rec.from || rec.num) + ': ' + snippet(splitQuote(rec.text).body, 40));
}

function dayGroup(t) {
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(new Date(t))) / 86400000);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This week' : 'Older';
}

function convs() {
  const map = {};
  msgs.forEach(x => {
    if (convBlocked(x.conv)) return;
    const c = map[x.conv] || (map[x.conv] = { id: x.conv, last: x, unread: 0 });
    if (x.t >= c.last.t) c.last = x;
    if (x.dir === 'in' && x.t > (reads[x.conv] || 0)) c.unread++;
  });
  groups.forEach(g => { if (!map['g:' + g.id]) map['g:' + g.id] = { id: 'g:' + g.id, last: null, unread: 0 }; });
  return Object.keys(map).map(k => map[k]).sort((a, b) => {
    const pa = prefs.pinned[a.id] ? 1 : 0, pb = prefs.pinned[b.id] ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (b.last ? b.last.t : 0) - (a.last ? a.last.t : 0);
  });
}

function convInfo(id, hint) {
  if (id.charAt(0) === 'g') {
    const g = groups.find(x => 'g:' + x.id === id);
    return { id: id, group: g, title: g ? g.name : 'Group' };
  }
  let num = hint || '';
  if (!num) { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].conv === id && msgs[i].num) { num = msgs[i].num; break; } }
  return { id: id, number: num, title: num ? nameFor(num) : 'New chat' };
}

function recordOut(conv, num, text) {
  const r = { id: uid(), conv: conv, num: num, from: null, dir: 'out', text: text, t: Date.now(), st: 'sending', local: true };
  msgs.push(r);
  return r;
}
function sendText(info, text, opts) {
  if (NO_SMS && info.group) { toast('Group and broadcast texts need SMS permission'); return; }
  const auto = !!(opts && opts.auto);
  const done = () => { persist(); refreshView(); };
  const track = (rec, job) => job.then(r => { rec.st = r === 'handoff' ? 'draft' : 'sent'; }, () => { rec.st = 'fail'; });
  const idOf = rec => id => { rec.devId = id; };
  const main = recordOut(info.id, info.number || '', text);
  if (auto) main.auto = true;
  let jobs;
  if (info.group && info.group.bc) {
    // Broadcast: an ordinary text to each person, which also shows in their own chat.
    jobs = info.group.members.map(m => { const r = recordOut('p:' + key(m), m, text); if (auto) r.auto = true; return track(r, Sms.send(m, text, idOf(r), info.id)); });
    Promise.all(jobs).then(() => { main.st = 'sent'; done(); });
  } else if (info.group) {
    jobs = info.group.members.map(m => Sms.send(m, '[' + info.group.name + '] ' + text, null, info.id));
    track(main, Promise.all(jobs)).then(done);
  } else {
    track(main, Sms.send(info.number, text, idOf(main), info.id)).then(done);
  }
  persist();
}

/* ================= view framework ================= */
const BODY = document.getElementById('body');
const stack = [];
let cur = null, MAIN = null;

function setView(v) { cur = v; v.built = false; render(); }
function go(v) { if (cur) stack.push(cur); setView(v); }
function back() { if (stack.length) setView(stack.pop()); else window.close(); }
function goHome() { stack.length = 0; setView(MAIN); }
function backTo(v) { while (stack.length && stack[stack.length - 1] !== v) stack.pop(); if (stack.length) setView(stack.pop()); }
function setKeys(v) {
  const s = v.sk ? v.sk() : ['', '', ''];
  document.getElementById('sl').textContent = s[0];
  document.getElementById('sc').textContent = s[1];
  document.getElementById('sr').textContent = s[2];
}
const OVERLAY = document.getElementById('overlay');
function render() {
  const v = cur;
  if (v.overlay) {          // pop-up: keep the screen underneath, only the soft keys change
    setKeys(v);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    OVERLAY.style.display = 'block'; OVERLAY.innerHTML = ''; v.draw(OVERLAY); v.built = true;
    return;
  }
  OVERLAY.style.display = 'none'; OVERLAY.innerHTML = '';
  applyTheme(v.info ? prefs.chatLook[v.info.id] : null);
  document.getElementById('hdr').textContent = typeof v.title === 'function' ? v.title() : v.title;
  setKeys(v);
  if (v.built && v.update) v.update();
  else { BODY.innerHTML = ''; v.draw(BODY); v.built = true; }
}
function refreshView() {
  if (!cur) return;
  if (cur.update) cur.update(); else if (cur.redraw) cur.redraw();
}

function scrollTo(box, node) {
  if (!node) return;
  if (node.offsetTop < box.scrollTop) box.scrollTop = node.offsetTop;
  else if (node.offsetTop + node.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = node.offsetTop + node.offsetHeight - box.clientHeight;
}

function rowsFor(wrap, items) {
  let lastGroup = null;
  return items.map(it => {
    if (it.group && it.group !== lastGroup) wrap.appendChild(el('div', 'subhdr', it.group));
    lastGroup = it.group || null;
    const r = el('div', 'row');
    if (it.check != null) r.appendChild(el('span', 'chk', it.check ? '☑' : '☐'));
    if (it.swatch) { const s = el('div', 'av'); s.style.background = it.swatch; r.appendChild(s); }
    else if (it.av) { const a = el('div', 'av', initial(it.av)); a.style.background = 'hsl(' + hue(it.av) + ',45%,42%)'; r.appendChild(a); }
    const m = el('div', 'mid'); m.appendChild(el('b', null, it.title));
    if (it.sub) m.appendChild(el('small', null, it.sub));
    r.appendChild(m);
    if (it.time) r.appendChild(el('span', 'tm' + (it.badge && !it.muted ? ' u' : ''), it.time));
    if (it.badge) r.appendChild(el('span', 'badge' + (it.muted ? ' m' : ''), String(it.badge)));
    wrap.appendChild(r);
    return r;
  });
}

const T9 = { 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ' };
// Jump to the next item whose title starts with one of the letters on that phone key.
function t9jump(v, d) {
  const letters = T9[d], n = v.items ? v.items.length : 0;
  if (!letters || !n) return;
  for (let s = 1; s <= n; s++) {
    const k = (v.i + s) % n, c = (v.items[k].title || '').trim().charAt(0).toUpperCase();
    if (letters.indexOf(c) >= 0) { v.i = k; v.focus(); return; }
  }
}

// Generic list: o.items(v) -> [{title, sub, time, badge, av, check}], o.act(key, item, v) -> handled?
function makeList(o) {
  const v = {
    i: 0, tab: 0, title: o.title, overlay: !!o.overlay,
    sk: () => o.sk ? o.sk(v) : ['', 'Select', ''],
    draw(b) {
      v.host = b;
      if (o.head) b.appendChild(o.head(v));
      v.wrap = el('div', 'list');
      if (o.overlay) {      // a pop-up menu over the dimmed screen
        const panel = el('div', 'menu');
        panel.appendChild(el('div', 'mh', typeof o.title === 'function' ? o.title() : o.title));
        panel.appendChild(v.wrap);
        b.appendChild(el('div', 'dim')); b.appendChild(panel);
      } else b.appendChild(v.wrap);
      const items = v.items = o.items(v);
      if (v.i >= items.length) v.i = Math.max(0, items.length - 1);
      v.rows = rowsFor(v.wrap, items);
      if (!items.length) v.wrap.appendChild(el('div', 'empty', o.empty ? o.empty(v) : 'Nothing here'));
      v.focus();
    },
    focus() {
      v.rows.forEach((r, k) => r.classList.toggle('f', k === v.i));
      scrollTo(v.wrap, v.rows[v.i]);
    },
    redraw() {
      const s = v.wrap ? v.wrap.scrollTop : 0;
      v.host.innerHTML = ''; v.draw(v.host); v.wrap.scrollTop = s; v.focus();
      setKeys(v);
    },
    key(k) {
      const n = v.rows.length;
      if (k === 'ArrowDown' && n) { v.i = (v.i + 1) % n; v.focus(); return true; }
      if (k === 'ArrowUp' && n) { v.i = (v.i - 1 + n) % n; v.focus(); return true; }
      if (o.jump && /^[2-9]$/.test(k)) { t9jump(v, k); return true; }
      return o.act ? !!o.act(k, v.items[v.i], v) : false;
    }
  };
  return v;
}

function menuView(title, opts) {
  return makeList({
    title: title, overlay: true,
    items: () => opts.map(o => ({ title: o.t, sub: o.sub, fn: o.fn })),
    act: (k, it) => { if (k === 'Enter' && it) { it.fn(); return true; } return false; }
  });
}

function formView(o) {
  const v = {
    title: o.title, inputs: [],
    sk: () => ['', o.done || 'Save', ''],
    draw(b) {
      v.inputs = [];
      const w = el('div', 'form'); b.appendChild(w);
      o.fields.forEach(f => {
        const i = el('input'); i.type = f.type || 'text'; i.placeholder = f.ph; i.value = f.val || '';
        w.appendChild(i); v.inputs.push(i);
      });
      v.inputs[0].focus();
    },
    key(k) {
      const idx = v.inputs.indexOf(document.activeElement);
      if (k === 'ArrowDown' && idx < v.inputs.length - 1) { v.inputs[idx + 1].focus(); return true; }
      if (k === 'ArrowUp' && idx > 0) { v.inputs[idx - 1].focus(); return true; }
      if (k === 'Enter') { o.onDone(v.inputs.map(i => i.value.trim())); return true; }
      return false;
    }
  };
  return v;
}

/* ================= screens ================= */
const EMOJI = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🎉',
  '🔥', '❤️', '💔', '🌹', '☀️', '🌙', '⭐', '🍕', '🍔', '🍺', '☕', '🎂', '🎁', '📞', '💬', '✅', '❌', '👋',
  '🙌', '😴', '🤗', '😜', '😅', '😇', '🥳', '😱', '🤝', '👀', '✨', '💯'];

function emojiView(onPick) {
  const COLS = 6;
  const v = {
    i: 0, title: 'Emoji', sk: () => ['', 'Insert', ''],
    draw(b) {
      v.grid = el('div', 'grid'); b.appendChild(v.grid);
      v.cells = EMOJI.map(e => v.grid.appendChild(el('div', null, e)));
      v.mark();
    },
    mark() { v.cells.forEach((c, k) => c.classList.toggle('f', k === v.i)); scrollTo(v.grid, v.cells[v.i]); },
    key(k) {
      const n = EMOJI.length;
      if (k === 'ArrowRight') v.i = (v.i + 1) % n;
      else if (k === 'ArrowLeft') v.i = (v.i - 1 + n) % n;
      else if (k === 'ArrowDown') v.i = Math.min(n - 1, v.i + COLS);
      else if (k === 'ArrowUp') v.i = Math.max(0, v.i - COLS);
      else if (k === 'Enter') { onPick(EMOJI[v.i]); back(); return true; }
      else return false;
      v.mark(); return true;
    }
  };
  return v;
}

function copyText(text) {
  try {
    const t = document.createElement('textarea');
    t.value = text; document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(t);
    return ok;
  } catch (e) { return false; }
}

function chatView(info) {
  const v = {
    info: info, draft: '', sel: -1, reply: null, shown: [], nodes: [],
    title: () => info.group ? (info.group.bc ? '📢 ' : '') + info.title + ' (' + info.group.members.length + ')' : info.title,
    sk: () => [{ emoji: 'Emoji', templates: 'Quick', schedule: 'Later' }[prefs.sk.chatLeft] || 'Emoji', v.sel >= 0 ? 'Menu' : 'Send', 'Options'],
    draw(b) {
      v.box = el('div', 'msgs');
      const c = el('div', 'compose');
      v.rb = el('div', 'replybar');
      v.cnt = el('div', 'counter');
      v.inp = el('input'); v.inp.placeholder = 'Type a message'; v.inp.value = v.draft;
      v.inp.oninput = () => {
        const t = emojify(v.inp.value);
        if (t !== v.inp.value && v.inp.selectionStart === v.inp.value.length) { v.inp.value = t; v.inp.setSelectionRange(t.length, t.length); }
        v.draft = v.inp.value;
        v.count();
      };
      c.appendChild(v.rb); c.appendChild(v.cnt); c.appendChild(v.inp); b.appendChild(v.box); b.appendChild(c);
      v.update();
      if (v.sel < 0) v.inp.focus(); else v.inp.blur();
    },
    count() {
      const t = (v.reply ? makeQuote(v.reply) : '') + v.inp.value;
      v.cnt.textContent = v.inp.value ? counterText(t) : '';
      v.cnt.style.display = v.inp.value ? 'block' : 'none';
    },
    update() {
      v.rb.style.display = v.reply ? 'block' : 'none';
      v.rb.textContent = v.reply ? '↩ ' + snippet(splitQuote(v.reply.text).body, 60) : '';
      v.box.innerHTML = '';
      v.shown = msgs.filter(x => x.conv === info.id).sort((a, b) => a.t - b.t);
      v.nodes = v.shown.map(m => {
        const b = el('div', 'b ' + m.dir), q = splitQuote(m.text);
        if (info.group && m.dir === 'in' && m.from) {
          const w = el('div', 'who', nameFor(m.from)); w.style.color = 'hsl(' + hue(m.from) + ',60%,45%)'; b.appendChild(w);
        }
        if (q.q) b.appendChild(el('div', 'q', q.q));
        if (m.mms) { const pic = el('div', 'pic', '[Picture]'); fillPicture(pic, m); b.appendChild(pic); }
        if (q.body) b.appendChild(el('div', null, q.body));
        b.appendChild(el('div', 'ts', fmtTime(m.t) + (m.star ? ' ⭐' : '') + (m.auto ? ' · auto' : '') + (m.dir === 'out' ? ' ' + ({ sending: '…', fail: '✗', draft: '↗', delivered: '✓✓', read: '✓✓' }[m.st] || '✓') : '')));
        v.box.appendChild(b);
        return b;
      });
      if (v.sel >= v.shown.length) v.sel = -1;
      v.box.scrollTop = v.box.scrollHeight;
      v.count();
      v.paint();
      markRead(info.id);
    },
    paint() {
      v.nodes.forEach((n, k) => n.classList.toggle('sel', k === v.sel));
      if (v.sel >= 0) scrollTo(v.box, v.nodes[v.sel]);
      setKeys(v);
    },
    compose() { v.sel = -1; v.inp.focus(); v.box.scrollTop = v.box.scrollHeight; v.paint(); },
    key(k) {
      if (k === 'ArrowUp') {
        if (v.sel < 0) { if (v.shown.length) { v.sel = v.shown.length - 1; v.inp.blur(); } }
        else v.sel = Math.max(0, v.sel - 1);
        v.paint(); return true;
      }
      if (k === 'ArrowDown') {
        if (v.sel >= 0) { v.sel++; if (v.sel >= v.shown.length) { v.compose(); return true; } v.paint(); }
        else v.box.scrollTop += 48;
        return true;
      }
      if (k === 'Enter') {
        if (v.sel >= 0) { go(messageMenu(info, v.shown[v.sel], v)); return true; }
        const t = v.inp.value.trim();
        if (!t) return true;
        if (!info.group && !info.number) { toast('No number for this chat'); return true; }
        sendText(info, (v.reply ? makeQuote(v.reply) : '') + t);
        v.reply = null; v.draft = ''; v.inp.value = ''; v.update();
        return true;
      }
      if (k === 'Backspace') {
        if (v.sel >= 0) { v.compose(); return true; }
        if (v.reply && !v.inp.value) { v.reply = null; v.update(); return true; }
        return false;
      }
      if (k === 'SoftLeft') {
        const a = prefs.sk.chatLeft;
        if (a === 'templates') templatePicker(v, info); else if (a === 'schedule') scheduleForm(info, v); else go(emojiView(e => { v.draft += e; }));
        return true;
      }
      if (k === 'SoftRight') { go(chatMenu(info, v)); return true; }
      if (v.sel >= 0) v.compose();     // typing while a message is selected goes back to the text field
      return false;
    }
  };
  return v;
}

function messageMenu(info, m, chat) {
  const body = splitQuote(m.text).body, opts = [];
  if (m.mms) opts.push({ t: 'View picture', fn: () => go(pictureView(m)) });
  opts.push({ t: 'Reply', fn: () => { chat.reply = m; chat.sel = -1; back(); } });
  opts.push({ t: m.star ? 'Unstar' : 'Star', fn: () => { const on = !m.star; if (on) m.star = true; else delete m.star; persist(); backTo(chat); toast(on ? 'Starred' : 'Unstarred'); } });
  if (body) {
    opts.push({ t: 'Copy text', fn: () => { backTo(chat); toast(copyText(body) ? 'Copied' : 'Copy not available'); } });
    opts.push({ t: 'Forward', fn: () => go(pickContacts('Forward to', true, chosen => {
      chosen.forEach(c => sendText(convInfo('p:' + key(c.tel), c.tel), body));
      backTo(chat); toast('Forwarded to ' + chosen.length);
    })) });
  }
  opts.push({ t: 'Delete', sub: 'From Buoy only', fn: () => { removeMsgs([m]); chat.sel = -1; backTo(chat); toast('Deleted'); } });
  return menuView('Message', opts);
}

function flagOpts(id, after) {
  return [
    { t: prefs.pinned[id] ? 'Unpin chat' : 'Pin chat', fn: () => { prefs.pinned[id] = !prefs.pinned[id]; if (!prefs.pinned[id]) delete prefs.pinned[id]; savePrefs(); after(); } },
    { t: prefs.muted[id] ? 'Unmute chat' : 'Mute chat', fn: () => { prefs.muted[id] = !prefs.muted[id]; if (!prefs.muted[id]) delete prefs.muted[id]; savePrefs(); after(); } }
  ];
}

function chatLookMenu(info) {
  const look = () => prefs.chatLook[info.id] || {};
  const set = (field, val) => {
    const l = Object.assign({}, look());
    if (val == null) delete l[field]; else l[field] = val;
    if (Object.keys(l).length) prefs.chatLook[info.id] = l; else delete prefs.chatLook[info.id];
    savePrefs(); applyTheme(prefs.chatLook[info.id]);
  };
  const cycle = (field, count, d) => { const cur = look()[field]; const idx = (cur == null ? -1 : cur) + d; set(field, idx < 0 ? (d < 0 ? count - 1 : null) : idx >= count ? null : idx); };
  const v = makeList({
    title: 'Chat look', overlay: true,
    items: () => [
      { title: 'Accent color', sub: look().accent == null ? 'Same as app' : ACCENTS[look().accent].n, k: 'accent' },
      { title: 'Wallpaper', sub: look().wp == null ? 'Same as app' : WALLPAPERS[look().wp], k: 'wp' }
    ],
    sk: () => ['', 'Change', ''],
    act: (k, it) => {
      const d = k === 'ArrowLeft' ? -1 : (k === 'ArrowRight' || k === 'Enter') ? 1 : 0;
      if (!d || !it) return false;
      if (it.k === 'accent') cycle('accent', ACCENTS.length, d); else cycle('wp', WALLPAPERS.length, d);
      v.redraw(); return true;
    }
  });
  go(v);
}

function chatMenu(info, chat) {
  const opts = flagOpts(info.id, back);
  opts.push({ t: 'Quick replies', fn: () => templatePicker(chat, info) });
  opts.push({ t: 'Emoji', fn: () => go(emojiView(e => { chat.draft += e; stack.pop(); })) });
  opts.push({ t: 'Schedule message', fn: () => scheduleForm(info, chat) });
  if (!info.group) opts.push({ t: 'Send picture', sub: 'MMS', fn: () => sendPictureFlow(info, (chat.draft || '').trim()) });
  opts.push({ t: 'SIM for this chat', sub: chatSimLabel(info.id), fn: () => chatSimMenu(info) });
  opts.push({ t: 'Disappearing messages', sub: disappearLabel(info.id), fn: () => disappearMenu(info) });
  opts.push({ t: 'Chat look', fn: () => chatLookMenu(info) });
  if (info.group && !info.group.bc) {
    opts.push({ t: 'Group call', fn: () => { back(); groupCall(info.group.members, info.group.name); } });
  }
  if (info.group) {
    opts.push({ t: 'Members', fn: () => go(membersView(info.group)) });
    opts.push({ t: info.group.bc ? 'Delete list' : 'Delete group', fn: () => {
      groups = groups.filter(g => g !== info.group); saveGroups();
      removeMsgs(msgs.filter(m => m.conv === info.id)); goHome();
    } });
  } else {
    opts.push({ t: 'Call', sub: info.number, fn: () => { back(); dial(info.number); } });
    opts.push({ t: 'Remind me to call', fn: () => remindMenu([info.number], '') });
    opts.push({ t: 'Call notes', fn: () => go(callNotesView([info.number], info.title)) });
    if (info.number) opts.push({ t: 'Block number', fn: () => { blockNumber(info.number); goHome(); toast('Blocked ' + info.title); } });
    if (info.number && !Contacts.list.some(c => key(c.tel) === key(info.number))) opts.push({ t: 'Save contact', fn: () => newContact(info.number) });
  }
  opts.push({ t: 'Clear chat', fn: () => { removeMsgs(msgs.filter(m => m.conv === info.id)); back(); } });
  return menuView('Options', opts);
}

function membersView(g) {
  return makeList({ title: g.name, items: () => g.members.map(t => ({ title: nameFor(t), sub: t, av: nameFor(t) })), sk: () => ['', '', ''] });
}

function openChat(id, hint) { sweepDisappearing(); go(chatView(convInfo(id, hint))); }

function pickContacts(title, multi, onDone) {
  const sel = {};
  const v = makeList({
    title: title, jump: true,
    items: () => Contacts.list.map(c => ({ title: c.name, sub: c.tel, av: c.name, check: multi ? !!sel[key(c.tel)] : null, c: c })),
    empty: () => 'No contacts yet',
    sk: () => multi ? ['', 'Toggle', 'Done'] : ['', 'Select', ''],
    act: (k, it) => {
      if (k === 'Enter' && it) {
        if (multi) { sel[key(it.c.tel)] = !sel[key(it.c.tel)]; v.redraw(); } else onDone([it.c]);
        return true;
      }
      if (multi && k === 'SoftRight') {
        const chosen = Contacts.list.filter(c => sel[key(c.tel)]);
        if (chosen.length) onDone(chosen); else toast('Select at least one contact');
        return true;
      }
      return false;
    }
  });
  return v;
}

function newChat() {
  go(menuView('New chat', [
    { t: 'Enter number', fn: () => go(dialerView('', true)) },
    { t: 'From contacts', fn: () => go(pickContacts('Contacts', false, c => { goHome(); openChat('p:' + key(c[0].tel), c[0].tel); })) }
  ]));
}

function newList(bc) {
  go(formView({
    title: bc ? 'New broadcast list' : 'New group', done: 'Next', fields: [{ ph: bc ? 'List name' : 'Group name' }],
    onDone: vals => {
      const name = vals[0].replace(/[\[\]]/g, '');
      if (!name) { toast('Enter a name'); return; }
      if (groups.some(g => g.name === name)) { toast('That name is taken'); return; }
      go(pickContacts('Add members', true, chosen => {
        const g = { id: uid(), name: name, members: chosen.map(c => c.tel) };
        if (bc) g.bc = true;
        groups.push(g); saveGroups(); goHome(); openChat('g:' + g.id);
      }));
    }
  }));
}
const newGroup = () => newList(false);

function newContact(num) {
  go(formView({
    title: 'New contact', fields: [{ ph: 'Name' }, { ph: 'Phone number', type: 'tel', val: num || '' }],
    onDone: vals => {
      if (!vals[0] || !digits(vals[1])) { toast('Name and number needed'); return; }
      Contacts.add(vals[0], digits(vals[1])).then(() => { toast('Contact saved'); back(); }, () => toast('Could not save contact'));
    }
  }));
}

function contactMenu(c) {
  const fav = prefs.favs.some(t => key(t) === key(c.tel));
  go(menuView(c.name, [
    { t: 'Message', sub: c.tel, fn: () => { goHome(); openChat('p:' + key(c.tel), c.tel); } },
    { t: 'Call', sub: c.tel, fn: () => { back(); dial(c.tel); } },
    { t: 'Speed dial', sub: speedKeyFor(c.tel) ? 'Key ' + speedKeyFor(c.tel) : 'Hold a number key to call', fn: () => speedMenu(c) },
    { t: fav ? 'Remove from favorites' : 'Add to favorites', fn: () => { toggleFavorite(c.tel); back(); refreshView(); } },
    { t: 'Remind me to call', fn: () => remindMenu([c.tel], c.name) },
    { t: 'Call notes', fn: () => go(callNotesView([c.tel], c.name)) },
    { t: 'Edit', fn: () => editContactForm(c) },
    { t: isBlocked(c.tel) ? 'Unblock number' : 'Block number', fn: () => { if (isBlocked(c.tel)) unblockNumber(c.tel); else blockNumber(c.tel); back(); refreshView(); } },
    { t: 'Delete', fn: () => deleteContactMenu(c) }
  ]));
}

function groupCallPicker() {
  go(pickContacts('Group call', true, chosen => { goHome(); groupCall(chosen.map(c => c.tel), ''); }));
}

function remindersView() {
  const v = makeList({
    title: 'Reminders',
    items: () => reminders.slice().sort((a, b) => a.t - b.t).map(r => ({ title: reminderTitle(r), sub: (r.t <= Date.now() ? '⏰ Due ' : 'At ') + fmtTime(r.t) + ' ' + p2(new Date(r.t).getHours()) + ':' + p2(new Date(r.t).getMinutes()), av: reminderTitle(r), r: r })),
    empty: () => 'No reminders. Set one from a call or contact.',
    sk: () => ['', 'Open', ''],
    act: (k, it) => {
      if (k === 'Enter' && it) {
        go(menuView(reminderTitle(it.r), [
          { t: 'Call now', fn: () => { removeReminder(it.r); goHome(); if (it.r.nums.length > 1) groupCall(it.r.nums, it.r.label); else dial(it.r.nums[0]); } },
          { t: 'Dismiss', fn: () => { removeReminder(it.r); back(); v.redraw(); } }
        ]));
        return true;
      }
      return false;
    }
  });
  return v;
}

function dialerView(initialNum, textMode) {
  const v = {
    num: initialNum || '', title: textMode ? 'Enter number' : 'Dial',
    sk: () => textMode ? ['', 'Chat', ''] : ['Save', 'Call', 'SMS'],
    draw(b) { v.d = el('div', 'big', v.num || ' '); b.appendChild(v.d); },
    key(k) {
      if (/^[0-9*#]$/.test(k)) { v.num += k; v.d.textContent = v.num; return true; }
      if (k === 'Backspace' && v.num) { v.num = v.num.slice(0, -1); v.d.textContent = v.num || ' '; return true; }
      if (!v.num) return false;
      if (k === 'Enter') { if (textMode) { goHome(); openChat('p:' + key(v.num), v.num); } else dial(v.num); return true; }
      if (!textMode && k === 'SoftRight') { goHome(); openChat('p:' + key(v.num), v.num); return true; }
      if (!textMode && k === 'SoftLeft') { newContact(v.num); return true; }
      return false;
    }
  };
  return v;
}

// Search chats (by name and message text) or contacts (by name and number).
function searchView(mode) {
  const v = {
    i: 0, q: '', items: [], rows: [],
    title: mode === 'chats' ? 'Search chats' : 'Search contacts',
    sk: () => ['', 'Open', ''],
    draw(b) {
      const c = el('div', 'searchbox');
      v.inp = el('input'); v.inp.placeholder = 'Type to search'; v.inp.value = v.q;
      v.inp.oninput = () => { v.q = v.inp.value; v.i = 0; v.fill(); };
      c.appendChild(v.inp); b.appendChild(c);
      v.wrap = el('div', 'list'); b.appendChild(v.wrap);
      v.fill(); v.inp.focus();
    },
    results() {
      const q = v.q.trim().toLowerCase();
      if (!q) return [];
      if (mode === 'contacts') {
        return Contacts.list.filter(c => c.name.toLowerCase().indexOf(q) >= 0 || c.tel.replace(/\D/g, '').indexOf(q.replace(/\D/g, '') || '\u0000') >= 0)
          .map(c => ({ title: c.name, sub: c.tel, av: c.name, contact: c }));
      }
      return convs().map(c => {
        const info = convInfo(c.id);
        if (info.title.toLowerCase().indexOf(q) >= 0) return { title: info.title, sub: c.last ? snippet(splitQuote(c.last.text).body, 40) : '', av: info.title, conv: c.id };
        const hit = msgs.filter(m => m.conv === c.id && splitQuote(m.text).body.toLowerCase().indexOf(q) >= 0).pop();
        return hit ? { title: info.title, sub: snippet(splitQuote(hit.text).body, 40), av: info.title, conv: c.id } : null;
      }).filter(x => x);
    },
    fill() {
      v.items = v.results();
      v.wrap.innerHTML = '';
      v.rows = rowsFor(v.wrap, v.items);
      if (!v.items.length) v.wrap.appendChild(el('div', 'empty', v.q.trim() ? 'No results' : 'Type a name or word'));
      if (v.i >= v.items.length) v.i = Math.max(0, v.items.length - 1);
      v.focus();
    },
    update() { v.fill(); },
    focus() { v.rows.forEach((r, k) => r.classList.toggle('f', k === v.i)); scrollTo(v.wrap, v.rows[v.i]); },
    key(k) {
      const n = v.rows.length;
      if (k === 'ArrowDown' && n) { v.i = (v.i + 1) % n; v.focus(); return true; }
      if (k === 'ArrowUp' && n) { v.i = (v.i - 1 + n) % n; v.focus(); return true; }
      if (k === 'Enter' && n) {
        const it = v.items[v.i];
        if (it.conv) openChat(it.conv); else contactMenu(it.contact);
        return true;
      }
      return false;
    }
  };
  return v;
}

// What the app needs. Only Notifications can show a system prompt; the rest are decided when the
// app is installed, so "asking" just touches the API (in case the phone prompts) and re-checks.
const PERMS = [
  { name: 'SMS', why: 'Send and read texts', has: () => !!navigator.mozMobileMessage, ask: () => navigator.mozMobileMessage && navigator.mozMobileMessage.getThreads() },
  { name: 'Contacts', why: 'Show and add contacts', has: () => !!navigator.mozContacts, ask: () => navigator.mozContacts && navigator.mozContacts.getCount() },
  { name: 'Calls', why: 'Group (conference) calls and missed calls', has: () => !!navigator.mozTelephony, ask: () => navigator.mozTelephony && navigator.mozTelephony.calls },
  { name: 'SIM info', why: 'See which SIM slot has a card', has: () => !!navigator.mozMobileConnections, ask: () => navigator.mozMobileConnections && navigator.mozMobileConnections.length },
  { name: 'Phone settings', why: 'Airplane and silent shortcuts, delivery reports', has: () => !!navigator.mozSettings, ask: () => navigator.mozSettings && navigator.mozSettings.createLock() },
  { name: 'Storage', why: 'Back up chats to the SD card', has: () => !!navigator.getDeviceStorage, ask: () => navigator.getDeviceStorage && navigator.getDeviceStorage('sdcard') },
  { name: 'Alarms', why: 'Call-back reminders when the app is closed', has: () => !!navigator.mozAlarms, ask: () => navigator.mozAlarms && navigator.mozAlarms.getAll() },
  { name: 'Notifications', why: 'Show reminders', has: () => !!window.Notification && Notification.permission === 'granted',
    ask: () => { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); },
    state: () => !window.Notification ? 'Not available' : Notification.permission === 'granted' ? 'Allowed' : Notification.permission === 'denied' ? 'Denied' : 'Not asked yet' }
];
function permState(p) { return DEMO ? 'Not available in demo' : p.state ? p.state() : p.has() ? 'Allowed' : 'Not granted'; }
function askPerm(p) { try { p.ask(); } catch (e) {} }

function infoView(title, lines, noRestart) {
  const v = {
    title: title, sk: () => ['', '', noRestart ? '' : 'Restart'],
    draw(b) { v.n = el('div', 'note'); lines.forEach(l => v.n.appendChild(el('p', null, l))); b.appendChild(v.n); },
    key(k) {
      if (k === 'ArrowDown') { v.n.scrollTop += 40; return true; }
      if (k === 'ArrowUp') { v.n.scrollTop -= 40; return true; }
      if (k === 'SoftRight' && !noRestart) { location.reload(); return true; }
      return false;
    }
  };
  return v;
}

function permissionsView() {
  const v = makeList({
    title: 'Permissions',
    items: () => [{ title: 'Request all permissions', sub: 'Ask for everything below', all: true }]
      .concat(PERMS.map(p => ({ title: p.name, sub: permState(p) + ' · ' + p.why, p: p, check: DEMO ? null : p.has() }))),
    sk: () => ['', 'Request', 'Restart'],
    act: (k, it) => {
      if (k === 'SoftRight') { location.reload(); return true; }
      if (k !== 'Enter' || !it) return false;
      if (it.all) PERMS.forEach(askPerm); else askPerm(it.p);
      setTimeout(() => {
        v.redraw();
        const missing = PERMS.filter(p => !p.has());
        if (DEMO) toast('Permissions only apply on a phone');
        else if (it.all) toast(missing.length ? 'Still missing: ' + missing.map(p => p.name).join(', ') : 'All permissions granted');
        else if (it.p.has()) toast(it.p.name + ': allowed');
        else {
          toast(it.p.name + ' is not granted');
          go(infoView(it.p.name + ' not granted', [
            'The phone has not given Buoy this permission, and an app cannot open a dialog for it.',
            'Reinstall the app (gdeploy install), or look in Settings, Privacy & Security, App permissions on the phone if it lists Buoy.',
            'After changing it, press the right key here to restart Buoy.'
          ]));
        }
      }, 600);
      return true;
    }
  });
  return v;
}

/* ================= updates ================= */
// The phone can't safely install an app over itself, so this only checks GitHub and says what to run.
const UPDATE_REPO = 'jgm240/KaiBuoy';
function getJson(url, system) {
  return new Promise((resolve, reject) => {
    let x;
    try { x = system ? new XMLHttpRequest({ mozSystem: true, mozAnon: true }) : new XMLHttpRequest(); } catch (e) { x = new XMLHttpRequest(); }
    x.open('GET', url);
    x.timeout = 15000;
    x.onload = () => { try { resolve(JSON.parse(x.responseText)); } catch (e) { reject(new Error('Unreadable reply')); } };
    x.onerror = () => reject(new Error('No connection'));
    x.ontimeout = () => reject(new Error('Timed out'));
    x.send();
  });
}
function versionNewer(a, b) {
  const x = String(a).replace(/^v/, '').split('.'), y = String(b).replace(/^v/, '').split('.');
  for (let i = 0; i < 3; i++) { const p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0; if (p !== q) return p > q; }
  return false;
}
function checkForUpdates() {
  toast('Checking GitHub…');
  getJson('manifest.webapp', false).then(own => {
    const dir = own.type === 'certified' ? 'buoy-certified' : 'buoy';
    return getJson('https://raw.githubusercontent.com/' + UPDATE_REPO + '/main/' + dir + '/manifest.webapp', true).then(latest => ({ own: own, latest: latest, dir: dir }));
  }).then(r => {
    if (!versionNewer(r.latest.version, r.own.version)) {
      go(infoView('Up to date', ['You have ' + r.own.name + ' ' + r.own.version + ', the latest version on GitHub.'], true));
    } else {
      go(infoView('Update available', [
        'Installed: ' + r.own.version + '. Latest on GitHub: ' + r.latest.version + '.',
        'Connect the phone to your computer with USB debugging on, then run in the Buoy folder:',
        'node tools/update-phone.js' + (r.own.type === 'certified' ? '' : ' --build privileged'),
        'It downloads the latest version from GitHub and installs it over this one.'
      ], true));
    }
  }).catch(err => toast('Could not check: ' + err.message));
}

function skSettingsView() {
  const L = ['default', 'search', 'dial', 'group', 'chat', 'starred', 'settings'], R = ['default', 'search', 'dial', 'settings', 'starred'], C = ['emoji', 'templates', 'schedule'];
  const CN = { emoji: 'Emoji', templates: 'Quick replies', schedule: 'Schedule a message' };
  const nm = val => SK_ACTIONS[val] ? SK_ACTIONS[val][0] : val;
  const v = makeList({
    title: 'Soft keys',
    items: () => [
      { title: 'Main screen, left key', sub: prefs.sk.left === 'default' ? 'New or Dial, by tab' : nm(prefs.sk.left), k: 'left' },
      { title: 'Main screen, right key', sub: prefs.sk.right === 'default' ? 'Options' : nm(prefs.sk.right) + '. Press 0 for Options', k: 'right' },
      { title: 'Chat, left key', sub: CN[prefs.sk.chatLeft], k: 'chat' }
    ],
    sk: () => ['', 'Change', ''],
    act: (k, it) => {
      const d = k === 'ArrowLeft' ? -1 : (k === 'ArrowRight' || k === 'Enter') ? 1 : 0;
      if (!d || !it) return false;
      const cyc = (list, cur) => list[(list.indexOf(cur) + d + list.length) % list.length];
      if (it.k === 'left') prefs.sk.left = cyc(L, prefs.sk.left);
      else if (it.k === 'right') prefs.sk.right = cyc(R, prefs.sk.right);
      else prefs.sk.chatLeft = cyc(C, prefs.sk.chatLeft);
      savePrefs(); v.redraw();
      return true;
    }
  });
  return v;
}

function settingsView() {
  const cyc = (len, cur, d) => (cur + d + len) % len;
  const v = makeList({
    title: 'Settings',
    items: () => [
      { title: 'Theme', sub: THEME_LABEL[prefs.theme], k: 'theme', group: 'Look' },
      { title: 'Accent color', sub: ACCENTS[prefs.accent].n, swatch: accentColor(prefs.accent), k: 'accent', group: 'Look' },
      { title: 'Text size', sub: SIZES[prefs.size], k: 'size', group: 'Look' },
      { title: 'Chat wallpaper', sub: WALLPAPERS[prefs.wp], k: 'wp', group: 'Look' },
      { title: 'Bigger bubbles', sub: prefs.bigBubbles ? 'On: larger text and spacing in chats' : 'Off', k: 'bubbles', group: 'Look' },
      { title: 'Soft keys', sub: 'Choose what the keys do', k: 'sk', group: 'Look' },
      { title: 'Reset appearance', sub: 'Light, blue, normal size', k: 'reset', group: 'Look' },
      { title: 'SIM select', sub: simLabel(), k: 'sim', group: 'Messages' },
      { title: 'Delivery reports', sub: prefs.deliveryReports ? 'On: ✓✓ when a text is delivered' : 'Off', k: 'dr', group: 'Messages' },
      { title: 'Quick replies', sub: prefs.templates.length + ' saved, with {fill-ins}', k: 'tpl', group: 'Messages' },
      { title: 'Auto-reply', sub: prefs.autoReply.on ? 'On' : 'Off', k: 'ar', group: 'Messages' },
      { title: 'Blocked numbers', sub: prefs.blocked.length + ' blocked', k: 'blk', group: 'Messages' },
      { title: 'Decline blocked calls', sub: prefs.blockCalls ? 'On, while Buoy is open' : 'Off', k: 'blkcalls', group: 'Messages' },
      { title: 'Backup and restore', sub: prefs.lastBackup ? 'Last: ' + new Date(prefs.lastBackup).toLocaleDateString() : 'Save chats to the SD card', k: 'bak', group: 'Phone' },
      { title: 'Phone shortcuts', sub: 'Airplane mode and silent mode', k: 'short', group: 'Phone' },
      { title: 'Request permissions', sub: 'Check and ask for SMS, contacts, calls', k: 'perms', group: 'Phone' },
      { title: 'Check for updates', sub: 'Compare with the latest on GitHub', k: 'update', group: 'App' },
      { title: 'Reset app data', sub: 'Clear chats, groups, calls, reminders', k: 'wipe', group: 'App' }
    ],
    sk: () => ['', 'Change', ''],
    act: (k, it) => {
      const d = k === 'ArrowLeft' ? -1 : (k === 'ArrowRight' || k === 'Enter') ? 1 : 0;
      if (!d || !it) return false;
      const open = fn => { if (k === 'Enter') fn(); return k === 'Enter'; };
      if (it.k === 'update') return open(checkForUpdates);
      if (it.k === 'perms') return open(() => go(permissionsView()));
      if (it.k === 'sk') return open(() => go(skSettingsView()));
      if (it.k === 'tpl') return open(() => go(templatesView()));
      if (it.k === 'ar') return open(() => go(autoReplyView()));
      if (it.k === 'blk') return open(() => go(blockedView()));
      if (it.k === 'bak') return open(() => go(backupView()));
      if (it.k === 'short') return open(() => go(phoneShortcutsView()));
      if (it.k === 'wipe') {
        return open(() => go(menuView('Clear all app data?', [
          { t: 'Yes, clear it', sub: 'Texts on the phone are not deleted', fn: () => {
            groups = []; msgs = []; calls = []; reads = {}; reminders = [];
            prefs.pinned = {}; prefs.muted = {}; prefs.speed = {}; prefs.tombs = []; prefs.scheduled = []; prefs.disappear = {}; prefs.chatLook = {}; prefs.chatSim = {};
            saveGroups(); persist(); saveCalls(); saveRem(); savePrefs(); DB.set('reads', {});
            goHome(); toast('Cleared');
          } },
          { t: 'No, keep it', fn: back }
        ])));
      }
      if (it.k === 'theme') prefs.theme = THEMES[cyc(THEMES.length, THEMES.indexOf(prefs.theme), d)];
      else if (it.k === 'accent') prefs.accent = cyc(ACCENTS.length, prefs.accent, d);
      else if (it.k === 'size') prefs.size = cyc(SIZES.length, prefs.size, d);
      else if (it.k === 'wp') prefs.wp = cyc(WALLPAPERS.length, prefs.wp, d);
      else if (it.k === 'bubbles') prefs.bigBubbles = !prefs.bigBubbles;
      else if (it.k === 'sim') prefs.sim = SIM_CHOICES[cyc(SIM_CHOICES.length, SIM_CHOICES.indexOf(prefs.sim), d)];
      else if (it.k === 'dr') { prefs.deliveryReports = !prefs.deliveryReports; applyDeliveryReports(); }
      else if (it.k === 'blkcalls') prefs.blockCalls = !prefs.blockCalls;
      else { prefs.theme = 'light'; prefs.accent = 0; prefs.size = 0; prefs.wp = 0; prefs.bigBubbles = false; }
      savePrefs(); applyTheme(); v.redraw();
      return true;
    }
  });
  return v;
}

function openNthChat(d) {
  const list = convs();
  if (list[d - 1]) openChat(list[d - 1].id); else toast('No chat in position ' + d);
}

// What each soft key can be set to do on the main screen (Settings, Soft keys).
const SK_ACTIONS = {
  search: ['Search', s => go(searchView(s.tab === 2 ? 'contacts' : 'chats'))],
  dial: ['Dial', () => go(dialerView(''))],
  group: ['New group', () => newGroup()],
  chat: ['New chat', () => newChat()],
  starred: ['Starred', () => go(starredView())],
  settings: ['Settings', () => go(settingsView())]
};
const CALL_LABEL = { in: '↙ Incoming', missed: '↙ Missed call', blocked: '⛔ Blocked' };

function favMenu(f) {
  const manual = prefs.favs.some(t => key(t) === key(f.tel));
  go(menuView(f.name, [
    { t: 'Message', sub: f.tel, fn: () => { goHome(); openChat('p:' + key(f.tel), f.tel); } },
    { t: 'Call', sub: f.tel, fn: () => { back(); dial(f.tel); } },
    { t: manual ? 'Remove from favorites' : 'Keep in favorites', fn: () => { toggleFavorite(f.tel); back(); refreshView(); } }
  ]));
}

function optionsMenu(s, it) {
  const o = [];
  if (s.tab === 0) {
    if (it) o.push.apply(o, flagOpts(it.conv, () => { back(); s.redraw(); }));
    o.push({ t: 'Search', fn: () => go(searchView('chats')) }, { t: 'Starred messages', fn: () => go(starredView()) }, { t: 'Scheduled messages', fn: () => go(scheduledView()) },
      { t: 'New group', fn: newGroup }, { t: 'New broadcast list', fn: () => newList(true) }, { t: 'New chat', fn: newChat }, { t: 'Group call', fn: groupCallPicker },
      { t: 'Blocked numbers', fn: () => go(blockedView()) });
  } else if (s.tab === 1) {
    if (it && it.call) {
      o.push({ t: 'Remind me to call back', fn: () => remindMenu(it.call.nums, it.call.label) });
      o.push({ t: it.call.note ? 'Edit note' : 'Add note', fn: () => addCallNote(it.call) });
    }
    if (it && it.rem) o.push({ t: 'Dismiss reminder', fn: () => { removeReminder(it.rem); back(); s.redraw(); } });
    o.push({ t: 'Dial pad', fn: () => go(dialerView('')) }, { t: 'Group call', fn: groupCallPicker }, { t: 'Reminders', fn: () => go(remindersView()) },
      { t: 'Clear call log', fn: () => { calls = []; saveCalls(); back(); s.redraw(); } });
  } else if (s.tab === 2) {
    o.push({ t: 'Search', fn: () => go(searchView('contacts')) }, { t: 'New contact', fn: () => newContact('') }, { t: 'Birthdays', fn: () => go(birthdaysView()) },
      { t: 'Find duplicates', fn: () => go(duplicatesView()) }, { t: 'New group', fn: newGroup },
      { t: 'Reload contacts', fn: () => Contacts.load().then(() => { back(); s.redraw(); toast('Contacts reloaded'); }) });
  } else {
    o.push({ t: 'Add a favorite', fn: () => go(pickContacts('Add a favorite', false, c => {
      if (!prefs.favs.some(t => key(t) === key(c[0].tel))) { prefs.favs.push(c[0].tel); savePrefs(); }
      goHome();
    })) });
  }
  o.push({ t: 'Settings', fn: () => go(settingsView()) });
  go(menuView('Options', o));
}

function mainView() {
  const TABS = ['CHATS', 'CALLS', 'CONTACTS', 'FAVS'];
  const v = makeList({
    title: DEMO ? 'Buoy (demo)' : 'Buoy', jump: false,
    head: s => { const t = el('div', 'tabs'); TABS.forEach((n, k) => t.appendChild(el('div', k === s.tab ? 'on' : '', n))); return t; },
    items: s => {
      if (s.tab === 0) {
        return convs().map(c => {
          const info = convInfo(c.id), l = c.last;
          let sub = info.group && info.group.bc ? 'Broadcast list' : 'No messages yet';
          if (l) sub = (l.dir === 'out' ? 'You: ' : info.group && l.from ? nameFor(l.from).split(' ')[0] + ': ' : '') + (snippet(splitQuote(l.text).body, 60) || (l.mms ? '📷 Picture' : ''));
          sub = (prefs.pinned[c.id] ? '📌 ' : '') + (prefs.muted[c.id] ? '🔇 ' : '') + sub;
          return { title: (info.group && info.group.bc ? '📢 ' : '') + info.title, sub: sub, time: l ? fmtTime(l.t) : '', badge: c.unread, muted: !!prefs.muted[c.id], av: info.title, conv: c.id, group: prefs.pinned[c.id] ? 'Pinned' : (l ? dayGroup(l.t) : 'Today') };
        });
      }
      if (s.tab === 1) {
        const due = dueReminders().map(r => ({ title: reminderTitle(r), sub: '⏰ Call back', time: fmtTime(r.t), av: reminderTitle(r), rem: r, group: 'Call back' }));
        const log = calls.slice().reverse().map(c => {
          const title = c.label || nameFor(c.nums[0]) + (c.nums.length > 1 ? ' +' + (c.nums.length - 1) : '');
          const kind = CALL_LABEL[c.type] || '↗ ' + (c.nums.length > 1 ? 'Group call' : 'Outgoing');
          return { title: title, sub: kind + (c.note ? ' · ' + snippet(c.note, 24) : ''), time: fmtTime(c.t), av: title, call: c, group: dayGroup(c.t) };
        });
        return due.concat(log);
      }
      if (s.tab === 3) return favoriteList().map((f, i) => ({ title: f.name, sub: 'Key ' + (i + 1) + ' · ' + f.tel, av: f.name, fav: f }));
      return Contacts.list.map(c => ({ title: c.name, sub: c.tel + (speedKeyFor(c.tel) ? '  ⚡' + speedKeyFor(c.tel) : '') + (c.bday && daysUntilBirthday(c.bday) === 0 ? '  🎂' : ''), av: c.name, contact: c, group: /[A-Za-z]/.test(c.name.charAt(0)) ? c.name.charAt(0).toUpperCase() : '#' }));
    },
    empty: s => ['No chats yet. Press the left key for a new chat.', 'No calls yet. Calls placed or seen while Buoy is open show here.', 'No contacts yet.', 'No favorites yet. People you message or call most appear here.'][s.tab],
    sk: s => {
      const b = [['New', 'Open', 'Options'], ['Dial', 'Call', 'Options'], ['New', 'Open', 'Options'], ['Dial', 'Open', 'Options']][s.tab].slice();
      if (SK_ACTIONS[prefs.sk.left]) b[0] = SK_ACTIONS[prefs.sk.left][0];
      if (SK_ACTIONS[prefs.sk.right]) b[2] = SK_ACTIONS[prefs.sk.right][0];
      return b;
    },
    act: (k, it, s) => {
      if (k === 'ArrowLeft' || k === 'ArrowRight') { s.tab = (s.tab + (k === 'ArrowRight' ? 1 : 3)) % 4; s.i = 0; s.redraw(); return true; }
      if (k === '*') { go(dialerView('')); return true; }
      if (k === '#' && (s.tab === 0 || s.tab === 2)) { go(searchView(s.tab === 0 ? 'chats' : 'contacts')); return true; }
      if (k === 'SoftLeft' && SK_ACTIONS[prefs.sk.left]) { SK_ACTIONS[prefs.sk.left][1](s); return true; }
      if (k === 'SoftRight') { if (SK_ACTIONS[prefs.sk.right]) SK_ACTIONS[prefs.sk.right][1](s); else optionsMenu(s, it); return true; }
      if (s.tab === 0) {
        if (k === 'SoftLeft') { newChat(); return true; }
        if (k === 'Enter' && it) { openChat(it.conv); return true; }
      } else if (s.tab === 1) {
        if (k === 'SoftLeft') { go(dialerView('')); return true; }
        if (k === 'Enter' && it) {
          const nums = it.rem ? it.rem.nums : it.call.nums, label = it.rem ? it.rem.label : it.call.label;
          if (it.rem) removeReminder(it.rem);
          if (nums.length > 1) groupCall(nums, label); else dial(nums[0]);
          s.redraw(); return true;
        }
      } else if (s.tab === 2) {
        if (k === 'SoftLeft') { newContact(''); return true; }
        if (k === 'Enter' && it) { contactMenu(it.contact); return true; }
      } else {
        if (k === 'SoftLeft') { go(dialerView('')); return true; }
        if (k === 'Enter' && it) { favMenu(it.fav); return true; }
      }
      return false;
    }
  });
  v.holdDigits = true;
  // Short press of a number key: 0 = Options, Chats = open that chat, Contacts = jump by letter, Favs = message that favorite.
  v.digit = d => {
    if (d === '0') { optionsMenu(v, v.items[v.i]); return; }
    if (v.tab === 0) openNthChat(+d);
    else if (v.tab === 2) t9jump(v, d);
    else if (v.tab === 3) { const f = favoriteList()[+d - 1]; if (f) openChat('p:' + key(f.tel), f.tel); else toast('No favorite on ' + d); }
  };
  return v;
}

/* ================= device hooks ================= */
function initDevice() {
  watchIncoming();
  try { if (navigator.mozSetMessageHandler) navigator.mozSetMessageHandler('alarm', () => { checkReminders(); checkScheduled(); }); } catch (e) {}
  const mm = navigator.mozMobileMessage;
  if (!mm) return;
  applyDeliveryReports();
  // delivery reports from the phone: ✗ failed, ✓✓ delivered
  const mark = (e, st) => {
    const id = e.message && e.message.id, r = msgs.find(x => x.devId === id && x.dir === 'out');
    if (r) { r.st = st; persist(); refreshView(); }
  };
  mm.addEventListener('failed', e => mark(e, 'fail'));
  mm.addEventListener('deliverysuccess', e => mark(e, 'delivered'));
  mm.addEventListener('deliveryerror', e => mark(e, 'fail'));
  mm.addEventListener('readsuccess', e => mark(e, 'read'));
  mm.addEventListener('received', e => {
    const m = e.message;
    if (m.type === 'mms') {
      if (m.delivery === 'not-downloaded' && mm.retrieveMMS) { try { mm.retrieveMMS(m.id); } catch (err) { /* will stay a notification */ } }
      const had = msgs.find(x => x.id === 'd' + m.id);
      if (had) { had.mms = true; persist(); refreshView(); return; }
      const rec = ingest({ id: 'd' + m.id, num: m.sender, dir: 'in', text: m.subject || '', t: m.timestamp, mms: true, devId: m.id });
      if (rec) { persist(); announce(rec); refreshView(); }
      return;
    }
    const rec = ingest({ id: 'd' + m.id, num: m.sender, dir: 'in', text: m.body || '', t: m.timestamp, devId: m.id });
    if (rec) { persist(); announce(rec); refreshView(); autoReplyTo(m.sender, 'text', m.body || ''); }
  });
  const c = mm.getMessages(null, true);
  let n = 0;
  c.onsuccess = function () {
    const m = this.result;
    if (m && n++ < 500) {
      const inbound = m.delivery === 'received', isMms = m.type === 'mms';
      const st = m.deliveryStatus === 'success' ? 'delivered' : (m.deliveryStatus === 'error' || m.delivery === 'error') ? 'fail' : 'sent';
      ingest({ id: 'd' + m.id, num: inbound ? m.sender : (m.receiver || (m.receivers && m.receivers[0])), dir: inbound ? 'in' : 'out', text: isMms ? (m.subject || '') : (m.body || ''),
        t: m.timestamp, device: true, st: inbound ? undefined : st, devId: m.id, mms: isMms });
      this.continue();
    } else { persist(); refreshView(); }
  };
}

/* ================= typing above the T9 prediction bar ================= */
// If the phone shrinks the screen when the keyboard opens, the flexible layout keeps the text field
// visible. If it doesn't, we lift the whole screen by the height of the prediction bar.
function isField(n) { return n && /INPUT|TEXTAREA/.test(n.tagName); }
document.addEventListener('focusin', e => {
  if (!isField(e.target)) return;
  const target = e.target, h = window.innerHeight;
  setTimeout(() => {
    if (document.activeElement !== target) return;
    if (window.innerHeight >= h) document.body.classList.add('kb');
    if (cur && cur.box) cur.box.scrollTop = cur.box.scrollHeight;
  }, 350);
});
document.addEventListener('focusout', e => { if (isField(e.target)) document.body.classList.remove('kb'); });
window.addEventListener('resize', () => {
  document.body.classList.remove('kb');
  if (cur && cur.box && cur.sel < 0) cur.box.scrollTop = cur.box.scrollHeight;
});

/* ================= keys ================= */
const KEYMAP = { F1: 'SoftLeft', F2: 'SoftRight' };   // desktop testing
let press = null;                                      // number key being held on the main screen

document.addEventListener('keydown', e => {
  const k = KEYMAP[e.key] || e.key;
  // Main screen: a short press does the tab's shortcut, holding a number key speed-dials.
  if (cur.holdDigits && /^[0-9]$/.test(k)) {
    e.preventDefault();
    if (e.repeat) return;
    if (press) clearTimeout(press.timer);
    const p = press = { k: k, long: false };
    p.timer = setTimeout(() => { p.long = true; speedDial(k); }, 600);
    return;
  }
  if (cur.key && cur.key(k, e)) { e.preventDefault(); return; }
  if (k === 'Backspace') {
    const a = document.activeElement;
    if (isField(a) && a.value) return;
    e.preventDefault(); back();
  }
});
document.addEventListener('keyup', e => {
  const k = KEYMAP[e.key] || e.key;
  if (!press || press.k !== k) return;
  clearTimeout(press.timer);
  const p = press; press = null;
  if (!p.long && cur.digit) cur.digit(k);
});

/* ================= start ================= */
applyTheme();
MAIN = mainView();
setView(MAIN);
Contacts.load().then(() => { initDevice(); refreshView(); announceBirthdays(); autoBackupIfDue(); });
sweepDisappearing();
checkScheduled();
setInterval(checkScheduled, 15000);
setInterval(sweepDisappearing, 300000);
if (NO_SMS) setTimeout(() => toast('No SMS permission: texts open in Messages and are not sent from here'), 700);
setInterval(checkReminders, 30000);
setInterval(applyTheme, 300000);   // keeps the Auto theme in step with the clock
