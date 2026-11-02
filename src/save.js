// localStorage save, format per design/spec.md §10. Written on win, purchase, settings change,
// the Kiosk-Tuete pick, binding a boon to the level it is used in, and the one-time brake hint.
// Playtest cheat (openspec playtest-cheat): the real save waits under MH.cheat.REAL_KEY while the
// cheat is on; `temp` (a ?mission link without the cheat) makes every write a no-op for the session.
(function () {
  const L = window.MH.save, C = window.MH.cheat, KEY = L.KEY, defaults = L.defaults;
  const G = window.GAME_DATA, NL = G.levels.levels.length;
  const parse = raw => L.parse(raw, NL, ((G.tuning.boons || {}).pool || []).map(b => b.id));
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const SAVE = {
    data: parse(get(KEY)),
    temp: false,
    write() { if (!this.temp) set(KEY, JSON.stringify(this.data)); },
    reset() { set(KEY, null); set(C.REAL_KEY, null); this.data = defaults(); },
    // toggles the cheat; returns true when it is on afterwards
    toggleCheat() {
      this.temp = false;
      if (this.data.cheat) { this.data = C.disable(get(C.REAL_KEY), parse, this.data); set(C.REAL_KEY, null); }
      else { const r = C.enable(this.data, NL); set(C.REAL_KEY, r.backup); this.data = r.data; }
      this.write();
      return this.data.cheat;
    },
    KEY,
  };
  window.SAVE = SAVE;
})();
