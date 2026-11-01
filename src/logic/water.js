// Arc-2 SUP on the river (spec: movement-sup, enemies): currents, hop height, logs / rocks with coyote grace,
// overhead obstacles and ducking, the hecht lunge box.
(function (root) {
  'use strict';
  const { approach } = root.MH && root.MH.core ? root.MH.core : require('./core.js');
  const currentAt = (currents, base, x) => { let s = base; for (const c of currents) if (x >= c.x) s = c.s; return s; };
  // currents from level hazards (tile x -> px), sorted
  const currentsOf = (hazards, TILE) => (hazards || []).filter(h => h.type === 'current').map(h => ({ x: h.x * TILE, s: h.speed })).sort((a, b) => a.x - b.x);
  const waterGravity = (M, W) => M.gravity * W.gravity_mult;
  // hop speed so the hop reaches hop_height_ratio of a land jump's apex under water gravity
  const hopVelocity = (M, W) => Math.sqrt(2 * waterGravity(M, W) * (M.jump_velocity * M.jump_velocity / (2 * M.gravity)) * W.hop_height_ratio);
  // logs / rocks: the board's feet must clear them. A hop that starts within coyote_s of first touching an
  // obstacle still clears it. Returns the obstacle the hero falls in at, or null. Mutates o.touchT / o.cleared.
  function obstacleStep(h, obst, now, GY, coyoteS) {
    for (const o of obst) {
      if (o.cleared) continue;
      const touch = Math.abs(h.x - o.x) < (o.w + o.fw) / 2 && h.y > GY - o.h;
      if (!touch) { if (o.touchT) o.touchT = 0; continue; }
      if (!o.touchT) o.touchT = now;
      if (h.lastJumpT >= o.touchT) { o.cleared = true; continue; }
      if (now - o.touchT >= coyoteS) { o.touchT = 0; return o; }
    }
    return null;
  }
  const underAny = (hx, overs, HB_W) => overs.some(o => hx + HB_W / 2 > o.x0 - 2 && hx - HB_W / 2 < o.x1 + 2);
  // duck lasts duck_s, but is held (at 0.05 s) while still under something on the water
  const duckStep = (duck, under, grounded, dt) => (duck > 0 ? (under && grounded ? Math.max(duck - dt, 0.05) : duck - dt) : duck);
  // the hurtbox top hits the underside of a bridge / branch / net
  const overheadHit = (hx, top, overs, HB_W, OVER_Y) => overs.find(o => hx + HB_W / 2 > o.x0 && hx - HB_W / 2 < o.x1 && top < OVER_Y) || null;
  const hechtBox = (x, d, GY) => ({ x0: x - d.lunge_w_px / 2, x1: x + d.lunge_w_px / 2, y0: GY - d.lunge_h_px, y1: GY });
  // where the hecht surfaces: ahead of the hero by the current's travel during the tell
  const hechtLead = (d, minTell) => Math.max(d.tell_s, minTell);
  const hechtX = (hx, speed, lead) => hx + Math.max(40, speed * lead);
  // hero screen x: back-paddle while braking, pushed by a closed lock, otherwise drift back to hero_screen_x
  function paddleX(sx, brake, lockOn, W, dt) {
    if (lockOn) sx += (brake ? -W.backpaddle_px_s : W.lock_push_px_s) * dt;
    else if (brake) sx -= W.backpaddle_px_s * dt;
    else sx = approach(sx, W.hero_screen_x, W.return_px_s * dt);
    return Math.max(W.hero_screen_x_min, sx);
  }
  const waterVx = (lockOn, current, brake, W) => lockOn ? 0 : current - (brake ? W.backpaddle_px_s : 0);
  // floaty fall back to the surface; returns null, 'land', 'hop' (buffered tap) or 'duck' (buffered swipe)
  function waterFall(h, dt, gW, GY, W) {
    let ev = null;
    if (!h.grounded) {
      h.vy += gW * dt; h.y += h.vy * dt;
      if (h.y >= GY) {
        h.y = GY; h.vy = 0; h.grounded = true; ev = 'land';
        if (h.hopBuf > 0) { h.hopBuf = 0; ev = 'hop'; }
        else if (h.duckBuf > 0) { h.duckBuf = 0; h.duck = W.duck_s; ev = 'duck'; }
      }
    }
    if (h.hopBuf > 0) h.hopBuf -= dt;
    if (h.duckBuf > 0) h.duckBuf -= dt;
    return ev;
  }
  const api = { paddleX, waterVx, waterFall, currentAt, currentsOf, waterGravity, hopVelocity, obstacleStep, underAny, duckStep, overheadHit, hechtBox, hechtLead, hechtX };
  const MH = root.MH || (root.MH = {}); MH.water = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
