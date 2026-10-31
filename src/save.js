// localStorage save, format per design/spec.md §10. Written only on win, purchase and settings change.
(function () {
  const KEY = 'milchholen.save.v1';
  const IDS = ['gun_rate', 'spread', 'tracks', 'heart', 'magnet', 'knoedel'];
  function defaults() {
    const up = {}; IDS.forEach(i => up[i] = 0);
    return { version: 1, unlocked: 1, cleared: [false, false, false, false, false], bank: 0, upgrades: up, lang: 'de', sound: true, ending_seen: false };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const s = JSON.parse(raw);
      if (!s || s.version !== 1) return defaults();
      const d = defaults();
      d.unlocked = Math.max(1, Math.min(5, s.unlocked | 0));
      if (Array.isArray(s.cleared)) d.cleared = d.cleared.map((_, i) => !!s.cleared[i]);
      d.bank = Math.max(0, s.bank | 0);
      if (s.upgrades) IDS.forEach(i => d.upgrades[i] = Math.max(0, s.upgrades[i] | 0));
      d.lang = s.lang === 'en' ? 'en' : 'de';
      d.sound = s.sound !== false;
      d.ending_seen = !!s.ending_seen;
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
