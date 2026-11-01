// Auto-aim (spec: controls-input / weapons): targets inside the gun range and forward cone.
(function (root) {
  'use strict';
  // true when (x, y) is at least 4 px ahead of the muzzle, within range R and within +-cone radians
  function inCone(mx, my, x, y, R, cone) {
    const dx = x - mx, dy = y - my; if (dx < 4) return false;
    if (Math.hypot(dx, dy) > R) return false;
    return Math.abs(Math.atan2(dy, dx)) <= cone;
  }
  // nearest-target picker; priority targets (thrown lids, files) pass pr = 1000 so they always win
  function picker(mx, my, R, cone) {
    let best = null, bd = 1e9;
    return {
      consider(x, y, pr) { if (!inCone(mx, my, x, y, R, cone)) return; const d = Math.hypot(x - mx, y - my) - pr; if (d < bd) { bd = d; best = { x, y }; } },
      get best() { return best; },
    };
  }
  // where a falling milk can will be when a bullet reaches it (two refinement steps)
  function leadFalling(mx, my, f, bulletSpeed, scroll, GY) {
    let px = f.x, py = f.y - 9;
    for (let i = 0; i < 2; i++) { const tt = Math.hypot(px - mx, py - my) / bulletSpeed; px = f.x + scroll * tt; py = Math.min(GY - 4, f.y - 9 + f.a.fall_speed * tt); }
    return { x: px, y: py };
  }
  const api = { inCone, picker, leadFalling };
  const MH = root.MH || (root.MH = {}); MH.aim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
