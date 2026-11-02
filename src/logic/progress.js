// Map / progression (spec: missions-progression): which missions show, which node is selected, which page.
(function (root) {
  'use strict';
  // S: save, nLevels, hasArc2Art, sel: previous selection or null, hasArc3Art.
  // Returns {unlocked, has2, has3, pages, sel, page, n0, n1}; page 1 = 1-5, page 2 = 6-10, page 3 = 11-15
  function mapView(S, nLevels, hasArc2Art, sel, hasArc3Art) {
    const unlocked = Math.min(nLevels, S.unlocked), has2 = !!hasArc2Art && nLevels >= 6 && unlocked >= 6;
    const has3 = has2 && !!hasArc3Art && nLevels >= 11 && unlocked >= 11;
    if (!sel || sel > unlocked) { const firstOpen = S.cleared.findIndex((c, i) => i < nLevels && i < unlocked && !c); sel = firstOpen >= 0 ? firstOpen + 1 : unlocked; }
    const maxSel = has3 ? 15 : has2 ? 10 : 5;
    if (sel > maxSel) sel = Math.min(maxSel, unlocked);
    const page = Math.ceil(sel / 5), n0 = page * 5 - 4, n1 = Math.min(page * 5, nLevels);
    return { unlocked, has2, has3, pages: has3 ? 3 : has2 ? 2 : 1, sel, page, n0, n1 };
  }
  // the page button cycles 1 -> 2 (-> 3) -> 1 and selects the first open mission of the new page (else its last unlocked)
  function nextPageSel(S, unlocked, page, pages) {
    const np = page % pages + 1, a = np * 5 - 5, b = Math.min(np * 5, unlocked);
    for (let i = a; i < b; i++) if (!S.cleared[i]) return i + 1;
    return Math.max(a + 1, b);
  }
  // 'locked' | 'current' | 'cleared' | 'open' for a map node
  const nodeState = (n, unlocked, cleared, sel) => n > unlocked ? 'locked' : n === sel ? 'current' : cleared[n - 1] ? 'cleared' : 'open';
  // a path segment "lA-lB" / "lA-kiosk" is lit when the mission at its end is unlocked
  function dotLit(seg, unlocked) { const end = seg.split('-')[1], n = /^l(\d+)$/.test(end) ? +end.slice(1) : 0; return end === 'kiosk' || n <= unlocked; }
  const api = { mapView, nextPageSel, nodeState, dotLit };
  const MH = root.MH || (root.MH = {}); MH.progress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
