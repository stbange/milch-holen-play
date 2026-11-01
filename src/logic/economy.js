// Economy and progression rules (spec: economy, progression): clear bonus, Kiosk-Tuete offers and binding,
// winning a mission, the kiosk pages / slot states / buying.
(function (root) {
  'use strict';
  const core = root.MH && root.MH.core ? root.MH.core : require('./core.js');
  // +no_hit when no heart was lost, +collect at >= collect_ratio of the level's bottles
  function clearBonus(CB, L, st) {
    const total = (L.bottles && L.bottles.total) || 1, got = st ? st.collected : 0, hits = st ? st.hits : 0;
    const noHit = hits === 0 ? CB.no_hit : 0, collect = got >= Math.ceil(total * CB.collect_ratio) ? CB.collect : 0;
    return { noHit, collect, total: noHit + collect, hits, got, of: total };
  }
  const boonAllowed = (b, U) => b.requires === 'magnet_below_2' ? (U.magnet || 0) < 2 : b.requires === 'knoedel_owned' ? (U.knoedel || 0) >= 1 : true;
  // offer_count random boons whose requirements hold
  function tueteOffer(BN, U, rand) {
    const pool = BN.pool.filter(b => boonAllowed(b, U)).slice();
    core.shuffle(pool, rand);
    return pool.slice(0, BN.offer_count);
  }
  // a boon binds to the next level started, survives retries, and is dropped when another level starts.
  // Returns true when the save changed.
  function bindBoon(S, n) {
    if (!S.boon) return false;
    if (!S.boon.level) { S.boon.level = n; return true; }
    if (S.boon.level !== n) { S.boon = null; return true; }
    return false;
  }
  // book a won mission into the save; returns what the win screen needs
  function applyWin(S, n, bottles, bonus, BN, nLevels) {
    const wasUnlocked = S.unlocked;
    if (S.boon && S.boon.level === n) S.boon = null;               // used up: it lasted exactly this level
    const tuete = !S.tuete[n - 1] && BN.offer_on_levels.indexOf(n) >= 0;
    S.bank += bottles + bonus.total; S.cleared[n - 1] = true; S.tuete[n - 1] = true;
    S.unlocked = Math.max(S.unlocked, Math.min(10, nLevels, n + 1));
    const next = n === 5 ? 'ending' : n === 10 ? 'ending2' : tuete ? 'tuete' : 'map';
    return { tuete, newUnlock: S.unlocked > wasUnlocked, next };
  }
  const takeBoon = (S, id) => { S.boon = { id, level: 0 }; };
  // kiosk: page 2 (river items) only once arc 2 is open
  const kioskPages = (unlocked, nItems, per) => unlocked >= 6 && nItems > per ? Math.ceil(nItems / per) : 1;
  const nextLevel = (u, owned) => u.levels[owned[u.id] || 0] || null;
  function slotState(u, i, S, sel) {
    const nxt = nextLevel(u, S.upgrades);
    return !nxt ? 'owned' : i === sel ? 'selected' : S.bank < nxt.price ? 'locked' : 'available';
  }
  // default selection: the first visible item that is not sold out (0 if none)
  function defaultSel(UPG, owned, pages, per) {
    return Math.max(0, UPG.findIndex((u, i) => (pages > 1 || i < per) && nextLevel(u, owned)));
  }
  // 'maxed' | 'short' | 'bought' (bank and level updated)
  function buy(S, u) {
    const lv = S.upgrades[u.id] || 0, nxt = u.levels[lv];
    if (!nxt) return 'maxed';
    if (S.bank < nxt.price) return 'short';
    S.bank -= nxt.price; S.upgrades[u.id] = lv + 1;
    return 'bought';
  }
  const api = { clearBonus, boonAllowed, tueteOffer, bindBoon, applyWin, takeBoon, kioskPages, nextLevel, slotState, defaultSel, buy };
  const MH = root.MH || (root.MH = {}); MH.economy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
