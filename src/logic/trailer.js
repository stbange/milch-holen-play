// Bike trailer with Wurst (spec: trailer): tail-wheel height and tilt, Wurst's seat on the tilted deck,
// his hop physics relative to the deck, the flat-floor check for the hop-off gag.
(function (root) {
  'use strict';
  const { clamp, approach } = root.MH && root.MH.core ? root.MH.core : require('./core.js');
  const TR = { LEN: 54, DOG_LX: -35, DOG_LY: -3, DOG_G: 900, MAX: 0.35 };
  // tail wheels follow the floor behind the bike (<= 14 px step) when grounded; tilt is clamped, tiny tilts snap to 0
  function tilt(wy, heroY, floorBehind, grounded, dt) {
    let want = heroY;
    if (grounded && isFinite(floorBehind) && Math.abs(floorBehind - heroY) <= 14) want = floorBehind;
    wy = clamp(approach(wy, want, 240 * dt), heroY - TR.MAX * TR.LEN, heroY + TR.MAX * TR.LEN);
    let rot = -(wy - heroY) / TR.LEN; if (Math.abs(rot) < 0.04) rot = 0;
    return { wy, rot };
  }
  // world position of Wurst's seat for the coupler at (hx, hy) and deck rotation rot
  function seat(hx, hy, rot) {
    const c = Math.cos(rot), sn = Math.sin(rot);
    return { x: hx + TR.DOG_LX * c - TR.DOG_LY * sn, y: hy + TR.DOG_LX * sn + TR.DOG_LY * c };
  }
  // hop relative to the deck (dy <= 0 is above it); landing resets dy / dvy / spin
  function deckHop(T2, dt) {
    if (T2.dvy !== 0 || T2.dy < 0) { T2.dvy += TR.DOG_G * dt; T2.dy += T2.dvy * dt; if (T2.dy >= 0) { T2.dy = 0; T2.dvy = 0; T2.spin = 0; } }
  }
  // landing bump when the bike lands: Wurst bounces up by 30 % of the fall speed (40..170)
  const landBump = airVy => -clamp(airVy * 0.3, 40, 170);
  // plain floor at hero height every 8 px from x0 to x1 (no pits, steps or crates)
  function flat(x0, x1, y, floorBelow) {
    for (let x = x0; x <= x1; x += 8) { const f = floorBelow(x, y - 10); if (!isFinite(f) || Math.abs(f - y) > 1) return false; }
    return true;
  }
  const api = { TR, tilt, seat, deckHop, landBump, flat };
  const MH = root.MH || (root.MH = {}); MH.trailer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
