// Save format and migration (spec: economy / save). Storage access stays in src/save.js.
(function (root) {
  'use strict';
  const KEY = 'milchholen.save.v1';
  const IDS = ['gun_rate', 'spread', 'tracks', 'heart', 'magnet', 'knoedel', 'schwimmweste', 'klingel', 'fallschirm', 'seitenruder'];
  const NL = 15;   // missions across the three arcs (arc 2 'Ab nach Soest' = 6..10, arc 3 'Hoch hinaus' = 11..15)
  const arr = () => new Array(NL).fill(false);
  function defaults() {
    const up = {}; IDS.forEach(i => up[i] = 0);
    return { version: 1, unlocked: 1, cleared: arr(), bank: 0, upgrades: up, lang: 'de', sound: true, ending_seen: false,
      hints: { brake: false, a2intro: false }, tuete: arr(), boon: null, ending2_seen: false, ending3_seen: false };
  }
  // parse + clamp a stored save string; anything broken falls back to a fresh save
  function parse(raw, nLevels, boonIds) {
    try {
      if (!raw) return defaults();
      const s = JSON.parse(raw);
      if (!s || s.version !== 1) return defaults();
      const d = defaults();
      d.unlocked = Math.max(1, Math.min(NL, s.unlocked | 0));
      if (Array.isArray(s.cleared)) d.cleared = d.cleared.map((_, i) => !!s.cleared[i]);
      d.bank = Math.max(0, s.bank | 0);
      if (s.upgrades) IDS.forEach(i => d.upgrades[i] = Math.max(0, s.upgrades[i] | 0));
      d.lang = s.lang === 'en' ? 'en' : 'de';
      d.sound = s.sound !== false;
      d.ending_seen = !!s.ending_seen;
      // older saves lack these. A missing tuete list is filled from cleared, so missions cleared before
      // the Kiosk-Tuete existed don't offer one again.
      d.hints.brake = !!(s.hints && s.hints.brake);
      d.hints.a2intro = !!(s.hints && s.hints.a2intro);
      d.ending2_seen = !!s.ending2_seen;
      d.ending3_seen = !!s.ending3_seen;
      d.tuete = Array.isArray(s.tuete) ? d.tuete.map((_, i) => !!s.tuete[i]) : d.cleared.slice();
      // arc 2: a save that already beat the Bürgermeister opens 'Ab nach Soest'
      if (d.cleared[4] && nLevels >= 6) d.unlocked = Math.max(d.unlocked, 6);
      // arc 3: a save that already beat the Kirmes-Kuh opens 'Hoch hinaus'
      if (d.cleared[9] && nLevels >= 11) d.unlocked = Math.max(d.unlocked, 11);
      if (s.boon && boonIds.indexOf(s.boon.id) >= 0) d.boon = { id: s.boon.id, level: Math.max(0, Math.min(NL, s.boon.level | 0)) };
      return d;
    } catch (e) { return defaults(); }
  }
  const api = { KEY, IDS, NL, defaults, parse };
  const MH = root.MH || (root.MH = {}); MH.save = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
