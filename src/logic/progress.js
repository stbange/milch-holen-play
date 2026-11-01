// Map / progression (spec: missions-progression): which missions show, which node is selected, which page.
(function (root) {
  'use strict';
  // S: save, nLevels, hasArc2Art, sel: previous selection or null. Returns {unlocked, has2, sel, page, n0, n1}
  function mapView(S, nLevels, hasArc2Art, sel) {
    const unlocked = Math.min(nLevels, S.unlocked), has2 = !!hasArc2Art && nLevels >= 6 && unlocked >= 6;
    if (!sel || sel > unlocked) { const firstOpen = S.cleared.findIndex((c, i) => i < nLevels && i < unlocked && !c); sel = firstOpen >= 0 ? firstOpen + 1 : unlocked; }
    if (!has2 && sel > 5) sel = Math.min(5, unlocked);
    const page = has2 && sel > 5 ? 2 : 1, n0 = page === 2 ? 6 : 1, n1 = page === 2 ? 10 : Math.min(5, nLevels);
    return { unlocked, has2, sel, page, n0, n1 };
  }
  // 'locked' | 'current' | 'cleared' | 'open' for a map node
  const nodeState = (n, unlocked, cleared, sel) => n > unlocked ? 'locked' : n === sel ? 'current' : cleared[n - 1] ? 'cleared' : 'open';
  // a path segment "lA-lB" / "lA-kiosk" is lit when the mission at its end is unlocked
  function dotLit(seg, unlocked) { const end = seg.split('-')[1], n = /^l(\d+)$/.test(end) ? +end.slice(1) : 0; return end === 'kiosk' || n <= unlocked; }
  const api = { mapView, nodeState, dotLit };
  const MH = root.MH || (root.MH = {}); MH.progress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
