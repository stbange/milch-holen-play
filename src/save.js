// localStorage save, format per design/spec.md §10. Written on win, purchase, settings change,
// the Kiosk-Tuete pick, binding a boon to the level it is used in, and the one-time brake hint.
(function () {
  const KEY = 'milchholen.save.v1';
  const IDS = ['gun_rate', 'spread', 'tracks', 'heart', 'magnet', 'knoedel', 'schwimmweste', 'klingel'];
  const NL = 10;   // missions across both arcs (arc 2 'Ab nach Soest' = 6..10)
  const arr = () => new Array(NL).fill(false);
  function defaults() {
    const up = {}; IDS.forEach(i => up[i] = 0);
    return { version: 1, unlocked: 1, cleared: arr(), bank: 0, upgrades: up, lang: 'de', sound: true, ending_seen: false,
      hints: { brake: false, a2intro: false }, tuete: arr(), boon: null, ending2_seen: false };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
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
      // round 5 fields; older saves don't have them. A missing tuete list is filled from cleared,
      // so missions cleared before the Kiosk-Tuete existed don't offer one again.
      d.hints.brake = !!(s.hints && s.hints.brake);
      d.hints.a2intro = !!(s.hints && s.hints.a2intro);
      d.ending2_seen = !!s.ending2_seen;
      d.tuete = Array.isArray(s.tuete) ? d.tuete.map((_, i) => !!s.tuete[i]) : d.cleared.slice();
      // arc 2: a save that already beat the Bürgermeister opens 'Ab nach Soest'
      if (d.cleared[4] && window.GAME_DATA.levels.levels.length >= 6) d.unlocked = Math.max(d.unlocked, 6);
      const ids = ((window.GAME_DATA.tuning.boons || {}).pool || []).map(b => b.id);
      if (s.boon && ids.indexOf(s.boon.id) >= 0) d.boon = { id: s.boon.id, level: Math.max(0, Math.min(NL, s.boon.level | 0)) };
      return d;
    } catch (e) { return defaults(); }
  }
  const SAVE = {
    data: load(),
    write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ } },
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} this.data = defaults(); },
    KEY,
  };
  window.SAVE = SAVE;
})();
