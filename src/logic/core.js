// Pure helpers shared by the scenes (no Phaser, no DOM). Browser: window.MH.core. Node: module.exports.
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const approach = (v, target, step) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);
  // deterministic PRNG (level dressing, per-level seeds)
  function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
  }
  // axis-aligned boxes {x0, x1, y0, y1}; touching edges do not overlap
  const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  // in-place Fisher-Yates with an injectable random source
  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  // tile grid geometry: rows start at ROW0 (= ground y mod tile)
  const grid = (TILE, ROW0) => ({ rowOf: y => Math.floor((y - ROW0) / TILE), rowTop: r => ROW0 + r * TILE });
  const api = { clamp, approach, rng, overlap, shuffle, grid };
  const MH = root.MH || (root.MH = {}); MH.core = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
