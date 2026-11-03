// Playtest cheat (openspec playtest-cheat): the secret title gesture, turning the cheat on/off while
// keeping the real save under its own key, and the ?mission / ?cheat URL parameters. Pure rules only;
// src/save.js, src/ui.js and src/main.js do the storage and DOM work.
(function (root) {
  const TAPS = 7, WINDOW_MS = 3000, GAP_MS = 600, BONUS = 500;
  const REAL_KEY = 'milchholen.save.real.v1';
  // tap(state, now) -> true when this tap completes 7 quick taps (then the counter starts over)
  function tap(st, now) {
    if (!st.times || (st.times.length && now - st.times[st.times.length - 1] > GAP_MS)) st.times = [];
    st.times.push(now);
    while (now - st.times[0] > WINDOW_MS) st.times.shift();
    if (st.times.length < TAPS) return false;
    st.times = [];
    return true;
  }
  // enable(S, n) -> { data, backup }: data is a cheated copy (all n missions open, +500 Pfand),
  // backup the real save as JSON for REAL_KEY
  function enable(S, n) {
    const backup = JSON.stringify(Object.assign({}, S, { cheat: false }));
    const data = JSON.parse(backup);
    data.cheat = true; data.unlocked = n; data.bank += BONUS;
    return { data, backup };
  }
  // disable(backupRaw, parse, cur) -> the restored real save; without a backup, the cheated save with
  // the cheat flag cleared. Language and sound follow the current settings.
  function disable(backupRaw, parse, cur) {
    const d = backupRaw ? parse(backupRaw) : JSON.parse(JSON.stringify(cur));
    d.cheat = false; d.lang = cur.lang; d.sound = cur.sound;
    return d;
  }
  // parseUrl('?mission=13&cheat=1&tier=hard', 15) -> { mission: 13, cheat: true, tier: 'hard' }; bad values -> null
  function parseUrl(search, n) {
    const q = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(kv => {
      const i = kv.indexOf('='); if (i > 0) q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    const m = /^\d+$/.test(q.mission || '') ? +q.mission : 0;
    const tier = ['easy', 'medium', 'hard'].indexOf(q.tier) >= 0 ? q.tier : null;
    return { mission: m >= 1 && m <= n ? m : null, cheat: q.cheat === '1', tier };
  }
  const api = { TAPS, WINDOW_MS, GAP_MS, BONUS, REAL_KEY, tap, enable, disable, parseUrl };
  const MH = root.MH || (root.MH = {}); MH.cheat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
