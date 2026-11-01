// Land movement (skateboard and bike): speed profile, horizontal speed, tile collision, landing timers, camera.
// D = { TILE, ROW0, HB_W, HB_H, HB_OFF }, cell(c, r) -> tile value, isSolid(v) / oneway(v) -> bool.
(function (root) {
  'use strict';
  const core = root.MH && root.MH.core ? root.MH.core : require('./core.js');
  const { clamp, approach } = core;
  // ctx: { vehicle, mode, trolleyHitched, truckOn }
  function speedProfile(ctx, T) {
    const M = T.movement;
    if (ctx.vehicle === 'bike') { const BK = T.arc2.bike; return { run: BK.run_speed, brake: BK.brake_speed, back: BK.back_off_speed }; }
    if (ctx.mode === 'escort' && ctx.trolleyHitched) { const E = T.escort; return { run: E.run_speed, brake: E.brake_speed, back: E.back_off_speed }; }
    if (ctx.mode === 'chase' && ctx.truckOn) return { run: T.chase.hero_run_speed, brake: M.brake_speed, back: M.back_off_speed };
    return { run: M.run_speed, brake: M.brake_speed, back: M.back_off_speed };
  }
  // knockback countdown, braking (hold -> back off), accelerating to run speed; mutates h.vx / h.kb / h.holdT
  function stepVx(h, dt, sp, M, brake, ended) {
    if (h.kb > 0) { h.kb -= dt; return; }
    if (ended) { h.vx = approach(h.vx, 0, M.brake_decel * dt); return; }
    let target, rate;
    if (brake) {
      h.holdT += dt;
      target = h.holdT >= M.back_off_hold_s ? sp.back : sp.brake;
      rate = h.grounded ? M.brake_decel : M.air_brake_decel;
    } else { h.holdT = 0; target = sp.run; rate = h.vx < target ? M.accel_to_run : M.brake_decel; }
    if (h.slamming) target = Math.min(target, sp.run * M.slam_x_speed_factor);
    h.vx = approach(h.vx, target, rate * dt);
  }
  // horizontal move against solid tiles; returns the new x (and zeroes h.vx on a wall)
  function moveX(h, nx, D, cell, isSolid) {
    const half = D.HB_W / 2, yTop = h.y - D.HB_H - D.HB_OFF + 1, yBot = h.y - 1;
    const rowOf = y => Math.floor((y - D.ROW0) / D.TILE);
    if (h.vx > 0) {
      const c = Math.floor((nx + half) / D.TILE);
      for (let r = rowOf(yTop); r <= rowOf(yBot); r++) if (isSolid(cell(c, r))) { nx = c * D.TILE - half - 0.01; h.vx = 0; break; }
    } else if (h.vx < 0) {
      const c = Math.floor((nx - half) / D.TILE);
      for (let r = rowOf(yTop); r <= rowOf(yBot); r++) if (isSolid(cell(c, r))) { nx = (c + 1) * D.TILE + half + 0.01; h.vx = 0; break; }
    }
    return nx;
  }
  // gravity / slam, then land on solid or one-way tops, or bump the head; mutates h.y / h.vy / h.grounded
  function moveY(h, dt, M, D, cell, isSolid, oneway) {
    const half = D.HB_W / 2, TILE = D.TILE;
    const rowOf = y => Math.floor((y - D.ROW0) / TILE), rowTop = r => D.ROW0 + r * TILE;
    const prevY = h.y;
    if (h.slamming) h.vy = M.slam_speed; else h.vy = Math.min(h.vy + M.gravity * dt, M.max_fall_speed);
    let ny = h.y + h.vy * dt;
    h.grounded = false;
    const cL = Math.floor((h.x - half + 1) / TILE), cR = Math.floor((h.x + half - 1) / TILE);
    if (h.vy >= 0) {
      for (let r = rowOf(prevY - 0.01); r <= rowOf(ny); r++) {
        const ty = rowTop(r); if (ty < prevY - 0.01 || ty > ny) continue;
        let hit = false;
        for (let c = cL; c <= cR; c++) { const v = cell(c, r); if (isSolid(v) || (oneway(v) && prevY <= ty + 0.01)) hit = true; }
        if (hit) { ny = ty; h.vy = 0; h.grounded = true; break; }
      }
    } else {
      const headOld = prevY - D.HB_H - D.HB_OFF, headNew = ny - D.HB_H - D.HB_OFF;
      for (let r = rowOf(headOld); r >= rowOf(headNew); r--) {
        let hit = false;
        for (let c = cL; c <= cR; c++) if (isSolid(cell(c, r))) hit = true;
        if (hit && rowTop(r + 1) <= headOld + 0.01) { ny = rowTop(r + 1) + D.HB_H + D.HB_OFF; h.vy = 0; break; }
      }
    }
    h.y = ny;
  }
  // coyote time, air jumps and the jump buffer after the vertical step; true = fire the buffered jump now
  function groundTimers(h, dt, M) {
    if (h.grounded) {
      h.coyote = M.coyote_time_s; h.airJumps = M.air_jumps; h.lastGround = h.x;
      if (h.buffer > 0) { h.buffer = 0; return true; }
    } else { h.coyote -= dt; if (h.buffer > 0) h.buffer -= dt; }
    return false;
  }
  const jumpVy = (M, mult) => -M.jump_velocity * (mult || 1);
  const doubleJumpVy = (M, mult) => -M.double_jump_velocity * (mult || 1);
  // camera follow (lerp toward the hero) and forced scroll (chase, boss arena, river)
  function cameraFollow(camX, heroX, maxX, CAM, dt) {
    const target = clamp(heroX - CAM.follow_screen_x, 0, maxX);
    return camX + (target - camX) * Math.min(1, CAM.lerp_per_s * dt);
  }
  const cameraScroll = (camX, speed, dt, maxX) => Math.min(maxX, camX + speed * dt);
  const api = { speedProfile, stepVx, moveX, moveY, groundTimers, jumpVy, doubleJumpVy, cameraFollow, cameraScroll };
  const MH = root.MH || (root.MH = {}); MH.physics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
