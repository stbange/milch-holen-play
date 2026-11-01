// Level data -> world (spec: missions-progression): bottle patterns, pickup and enemy placement, warning
// signs, world width, hurtboxes and the win check.
(function (root) {
  'use strict';
  // a mission item's own image (pickup_<id>) if the manifest has one, else its frame in 'pickups'
  function pickupFrame(assets, type) {
    const own = assets.find(x => x.key === 'pickup_' + type);
    if (own) return { key: own.key, frame: undefined };
    const a = (assets.find(x => x.key === 'pickups') || {}), fr = a.frames || {}, al = a.aliases || {};
    const v = fr[type] !== undefined ? fr[type] : fr[al[type]];
    return { key: 'pickups', frame: v === undefined ? 0 : (Array.isArray(v) ? v[0] : v) };
  }
  // pickup entry -> list of {type, x, y} in px. Bottles: 'line' (1 tile apart) or 'arc' (parabola over y tiles)
  function pickupPositions(p, TILE, GY) {
    const n = p.count || 1, y0 = p.y || 0, out = [];
    if (p.type !== 'bottle') return [{ type: p.type, x: p.x * TILE + 8, y: GY - y0 * TILE - 10 }];
    for (let i = 0; i < n; i++) {
      let x, yT;
      if (p.pattern === 'arc') {
        const mid = (n - 1) / 2, u = n > 1 ? (i - mid) / (mid + 0.75) : 0;
        x = (p.x + (i - mid) * 1.5) * TILE + 8; yT = 1 + (y0 - 1) * (1 - u * u);
      } else { x = (p.x + i) * TILE + 8; yT = y0; }
      out.push({ type: 'bottle', x, y: GY - yT * TILE - 9 });
    }
    return out;
  }
  // enemy entry -> spawns; groups are spaced by the enemy's group_spacing_px
  function enemySpawns(e, EN, TILE, GY) {
    const count = e.count || 1, spacing = (EN[e.type] && EN[e.type].group_spacing_px) || 0, out = [];
    for (let i = 0; i < count; i++) out.push({ type: e.type, x: e.x * TILE + 8 + i * spacing, y: GY - (e.y || 0) * TILE, idx: i, onBalcony: (e.y || 0) > 0 });
    return out;
  }
  const WARN = /baustelle|dackel|sperrmuell|brake|bremsen|backoff|slam|double|jump|a2_(duck|hecht|weir|lock|gap|slam)/;
  const isWarnSign = key => WARN.test(key);
  // world width in tiles
  const worldTiles = (L, BB) => L.mode === 'boss' ? L.arena_start_x + (BB.arena_length_tiles || 2000) : L.length_screens * 24 + 30;
  // hero hurtbox (ducking shrinks it on the water / bike)
  const heroBox = (h, HB, duckH) => { const hh = h.duck > 0 ? duckH : HB.h; return { x0: h.x - HB.w / 2, x1: h.x + HB.w / 2, y0: h.y - HB.off - hh, y1: h.y - HB.off }; };
  // 'none' (no reach goal), 'before' (not there yet), 'items' (missing items), 'trolley' (no healthy trolley), 'win'
  function winCheck(w, heroX, TILE, items, trolley) {
    if (!w || w.type === 'defeat_boss' || w.type === 'none') return 'none';
    if (heroX < w.x * TILE) return 'before';
    if (w.type === 'reach_x_with_items' && items.some(v => !v)) return 'items';
    if (w.type === 'reach_x_with_trolley' && !(trolley && trolley.hitched && trolley.hp > 0)) return 'trolley';
    return 'win';
  }
  // number of bottles the level data places (for the clear bonus total)
  const placedBottles = L => (L.pickups || []).filter(p => p.type === 'bottle').reduce((s, p) => s + (p.count || 1), 0);
  const api = { pickupFrame, pickupPositions, enemySpawns, isWarnSign, worldTiles, heroBox, winCheck, placedBottles };
  const MH = root.MH || (root.MH = {}); MH.levels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
