// localStorage save, format per design/spec.md §10. Written on win, purchase, settings change,
// the Kiosk-Tuete pick, binding a boon to the level it is used in, and the one-time brake hint.
(function () {
  const L = window.MH.save, KEY = L.KEY, defaults = L.defaults;
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { return defaults(); }
    const G = window.GAME_DATA;
    return L.parse(raw, G.levels.levels.length, ((G.tuning.boons || {}).pool || []).map(b => b.id));
  }
  const SAVE = {
    data: load(),
    write() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ } },
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} this.data = defaults(); },
    KEY,
  };
  window.SAVE = SAVE;
})();
