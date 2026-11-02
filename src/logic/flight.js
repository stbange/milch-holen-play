// Arc 3 "Hoch hinaus" flight rules (spec: movement-plane, enemies-bosses): the auto-scroll, steering by a
// relative drag, soft walls, the throttle back, Looping and Sturzflug, terrain boxes and crashes, gust zones,
// bottle layouts, the Knoedel-Bombe, monster telegraph timing, aiming helpers and the zeppelin's attack
// scheduler. Pure functions; the Phaser side (src/arc3.js) only draws what these return.
(function (root) {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const DEG = Math.PI / 180;

  // ---------------------------------------------------------------- scrolling + plane stats
  const scrollSpeed = (L, FL, arena, BB) => Math.min(FL.max_scroll_px_s, arena ? BB.arena_scroll_speed : (L.scroll || FL.max_scroll_px_s));
  // what the kiosk items and the boon change for the plane. owned: SAVE upgrades, stats: computeStats(), boon: pool entry | null
  function planeMods(FL, owned, stats, boon) {
    const b = boon || {}, prop = Math.min((owned && owned.tracks) || 0, FL.propeller_return_mult.length);
    return {
      vyMax: FL.max_vy_px_s * (stats && stats.rudder ? FL.rudder_vy_mult : 1) * (b.fly_speed_mult || 1),
      smooth: stats && stats.rudder ? FL.rudder_smooth_s : FL.smooth_s,
      returnMult: prop ? FL.propeller_return_mult[prop - 1] : 1,
      loopCdMult: b.loop_cooldown_mult || 1,
      parachute: stats && stats.parachute ? 1 : 0,
      cushion: b.crash_shield || 0,
    };
  }
  const newPlane = FL => ({ y: FL.y_start, ty: FL.y_start, sx: FL.hero_screen_x, loopT: 0, loopCd: 0, diveT: 0, diveCd: 0, bounce: null });

  // one frame of steering. keyDir -1 (up) / 0 / +1 (down); braking: the left zone is held
  function steer(p, dt, FL, mods, keyDir, braking) {
    p.loopCd = Math.max(0, p.loopCd - dt); p.diveCd = Math.max(0, p.diveCd - dt);
    if (p.loopT > 0) p.loopT = Math.max(0, p.loopT - dt);
    if (p.bounce) {                      // after a crash: glide to the free height, steering ignored
      const b = p.bounce; b.t += dt;
      const u = Math.min(1, b.t / b.d), e = 1 - (1 - u) * (1 - u);
      p.y = b.from + (b.to - b.from) * e; p.ty = p.y;
      if (u >= 1) p.bounce = null;
    } else {
      if (keyDir) p.ty += keyDir * FL.key_speed_px_s * dt;
      p.ty = clamp(p.ty, FL.y_min, FL.y_max);
      if (p.diveT > 0) {
        p.diveT = Math.max(0, p.diveT - dt);
        p.y += FL.dive_vy_px_s * dt; p.ty = Math.min(FL.y_max, p.y);
      } else {
        const k = 1 - Math.exp(-dt / mods.smooth), cap = mods.vyMax * dt;
        p.y += clamp((p.ty - p.y) * k, -cap, cap);
      }
      p.y = clamp(p.y, FL.y_min, FL.y_max);
    }
    p.sx = braking ? Math.max(FL.min_screen_x, p.sx - FL.brake_drift_px_s * dt) : Math.min(FL.hero_screen_x, p.sx + FL.return_px_s * mods.returnMult * dt);
    return p;
  }
  // the drag is relative: the target moves 1:1 with the thumb from where the touch started.
  // d: {sid, last} kept by the game; f: INPUT.flight {sid, dy, down}. Returns the target change this frame.
  function dragDelta(d, f) {
    if (!f || !f.down) { d.sid = -1; d.last = 0; return 0; }
    if (d.sid !== f.sid) { d.sid = f.sid; d.last = 0; }
    const v = f.dy - d.last; d.last = f.dy; return v;
  }

  // ---------------------------------------------------------------- Looping + Sturzflug
  function tryLoop(p, FL, mods) {
    if (p.loopT > 0 || p.loopCd > 0 || p.bounce) return false;
    p.loopT = FL.loop_s; p.loopCd = FL.loop_s + FL.loop_cooldown_s * ((mods && mods.loopCdMult) || 1); p.diveT = 0;
    return true;
  }
  // invulnerable in the middle loop_invuln_s of the loop
  function loopInvuln(p, FL) {
    if (p.loopT <= 0) return false;
    const e = FL.loop_s - p.loopT, pad = (FL.loop_s - FL.loop_invuln_s) / 2;
    return e >= pad - 1e-9 && e <= FL.loop_s - pad + 1e-9;
  }
  // drawing pose of the loop: rotation (radians, a full turn) and the lift above the flight line
  function loopPose(p, FL) {
    if (p.loopT <= 0) return { angle: 0, lift: 0 };
    const u = (FL.loop_s - p.loopT) / FL.loop_s;
    return { angle: -u * 2 * Math.PI, lift: FL.loop_rise_px * Math.sin(u * Math.PI) };
  }
  function tryDive(p, FL) {
    if (p.diveT > 0 || p.diveCd > 0 || p.loopT > 0 || p.bounce || p.y >= FL.y_max - 4) return false;
    p.diveT = FL.dive_s; p.diveCd = FL.dive_s + FL.dive_cooldown_s;
    return true;
  }
  // while diving, stompable monsters and crates take the hit instead of the plane
  const diveStomps = (p, def) => p.diveT > 0 && !!(def && def.stompable);

  // ---------------------------------------------------------------- terrain
  function terrainBoxes(hazards, TER, TILE) {
    const out = [];
    for (const h of hazards || []) {
      if (h.type !== 'terrain' || !TER[h.kind]) continue;
      for (const b of TER[h.kind].boxes) out.push({ x0: h.x * TILE + b[0], x1: h.x * TILE + b[1], y0: b[2] + (h.dy || 0), y1: b[3] + (h.dy || 0), kind: h.kind, top: !!TER[h.kind].top });
    }
    return out.sort((a, b) => a.x0 - b.x0);
  }
  const hitBox = (boxes, x, y, hw, hh) => boxes.find(b => x + hw > b.x0 && x - hw < b.x1 && y + hh > b.y0 && y - hh < b.y1) || null;
  // where a crash bounces the plane: mid-screen, or the nearest free height around it
  function bounceTarget(boxes, x, FL) {
    const hw = FL.hurtbox[0] / 2 + 4, hh = FL.hurtbox[1] / 2 + 6, near = boxes.filter(b => x + hw + 40 > b.x0 && x - hw - 40 < b.x1);
    const free = y => !near.some(b => x + hw + 30 > b.x0 && x - hw - 10 < b.x1 && y + hh > b.y0 && y - hh < b.y1);
    const y0 = FL.crash_bounce_y;
    for (let d = 0; d <= FL.y_max - FL.y_min; d += 4) {
      if (y0 - d >= FL.y_min && free(y0 - d)) return y0 - d;
      if (y0 + d <= FL.y_max && free(y0 + d)) return y0 + d;
    }
    return y0;
  }
  // a terrain crash: Fallschirm first, then the Wolkenkissen, else one heart. Mutates the shields in mods.
  function crash(p, mods, boxes, x, FL) {
    let cost = 'heart';
    if (mods.parachute > 0) { mods.parachute--; cost = 'parachute'; }
    else if (mods.cushion > 0) { mods.cushion--; cost = 'cushion'; }
    p.loopT = 0; p.diveT = 0;
    p.bounce = { from: p.y, to: bounceTarget(boxes, x, FL), t: 0, d: FL.crash_bounce_s };
    return cost;
  }

  // ---------------------------------------------------------------- gusts (M13)
  const boeZones = (hazards, TILE) => (hazards || []).filter(h => h.type === 'boe').map(h => ({ x0: h.x * TILE, x1: (h.x + h.w) * TILE, dir: h.dir === 'up' ? -1 : 1 }));
  // vertical push at world x (px/s), and whether the zone is close enough to show its wind lines
  function boeAt(zones, x, BOE, scroll) {
    let push = 0, tell = null;
    for (const z of zones) {
      if (x >= z.x0 && x <= z.x1) push += z.dir * BOE.push_px_s;
      else if (x < z.x0 && (z.x0 - x) / Math.max(1, scroll) <= BOE.tell_s) tell = z;
    }
    return { push, tell };
  }

  // ---------------------------------------------------------------- bottles (absolute px heights)
  function bottleLayout(pk, TILE) {
    const n = pk.count || 1, out = [];
    for (let i = 0; i < n; i++) {
      if (pk.pattern === 'arc') { const mid = (n - 1) / 2, u = (i - mid) / (mid + 0.75); out.push([(pk.x + (i - mid) * 1.5) * TILE + 8, pk.y + 16 * u * u]); }
      else if (pk.pattern === 'wave') out.push([(pk.x + i) * TILE + 8, pk.y + 12 * Math.sin(0.9 * i)]);
      else out.push([(pk.x + i) * TILE + 8, pk.y]);
    }
    return out;
  }

  // ---------------------------------------------------------------- Knoedel-Bombe
  const newBomb = (x, y, FL, scroll) => ({ x, y, vx: FL.bomb_vx + scroll, vy: FL.bomb_vy, alive: true });
  function bombStep(b, dt, FL) {
    b.vy += FL.bomb_gravity * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.y >= FL.ground_y) { b.y = FL.ground_y; b.alive = false; return true; }   // landed
    return false;
  }
  // who the explosion hits: monsters within bomb_radius_px, plus every ground monster on screen
  function bombTargets(enemies, b, FL, camX, viewW) {
    const r2 = FL.bomb_radius_px * FL.bomb_radius_px;
    return enemies.filter(e => e.alive && ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 <= r2 || (e.ground && e.x >= camX && e.x <= camX + viewW)));
  }

  // ---------------------------------------------------------------- monster timing + aim
  const tellTime = (def, A3) => Math.max(def.tell_s || 0, A3.tell_min_s);
  // Wurst barks bark_lead_s before the attack (never before the telegraph starts)
  const barkAt = (def, A3) => Math.max(0, tellTime(def, A3) - A3.bark_lead_s);
  // world enemies wake when they come trigger_ahead_px in front of the plane; edge monsters when their x reaches the screen edge
  function triggered(e, def, camX, viewW, planeSX, TILE) {
    const wx = e.x * TILE;
    return def.spawn === 'edge' ? camX + viewW >= wx : wx - (camX + planeSX) <= (def.trigger_ahead_px || viewW);
  }
  const aim = (fx, fy, tx, ty) => Math.atan2(ty - fy, tx - fx);
  // n directions spread evenly over +-spread degrees around angle a
  const fan = (a, n, spreadDeg) => Array.from({ length: n }, (_, i) => a + (n > 1 ? (i / (n - 1) * 2 - 1) * spreadDeg * DEG : 0));
  // the Jodel fan: angles measured with y up (180 = straight left)
  const fanDeg = list => list.map(d => ({ cx: Math.cos(d * DEG), cy: -Math.sin(d * DEG) }));
  // a lob from (sx,sy) that lands on (tx,ty) after T s under gravity g
  const lob = (sx, sy, tx, ty, T, g) => ({ vx: (tx - sx) / T, vy: (ty - sy - 0.5 * g * T * T) / T });
  // future position of a moving thing (world coords, gravity optional)
  const predict = (o, t) => ({ x: o.x + (o.vx || 0) * t, y: o.y + (o.vy || 0) * t + 0.5 * (o.g || 0) * t * t });

  // ---------------------------------------------------------------- zeppelin
  const bossAnchor = (viewW, BB) => Math.min(viewW, BB.screen_x_view_cap) - (384 - BB.screen_x);
  // the foam wave fills the half the plane is in when the telegraph starts; the other half (minus the overlap) is safe
  function schaumBand(planeY, A, FL) {
    const top = planeY < A.split_y;
    return top ? { y0: FL.y_min - 30, y1: A.split_y + A.overlap_px, top } : { y0: A.split_y - A.overlap_px, y1: FL.ground_y + 12, top };
  }
  // barrel columns (screen x) just ahead of the plane; they drift left with the arena scroll while they fall
  const fassColumns = (planeSX, A) => Array.from({ length: A.count }, (_, i) => planeSX + 40 + i * A.gap_px);
  // attack scheduler: one attack at a time. timers from boss.phaseAttacks(); returns the attack to start or null
  function nextAttack(st, dt) {
    st.busy = Math.max(0, (st.busy || 0) - dt);
    for (const tm of st.timers) tm.t -= dt;
    if (st.busy > 0) return null;
    const due = st.timers.filter(tm => tm.t <= 0).sort((a, b) => a.t - b.t)[0];
    if (!due) return null;
    due.t = due.a.interval_s; due.n++; st.busy = due.a.busy_s + (due.a.telegraph_s || 0);
    for (const tm of st.timers) if (tm !== due && tm.t < 1.0) tm.t = 1.0;   // never two attacks back to back
    return due.a;
  }

  const api = { scrollSpeed, planeMods, newPlane, steer, dragDelta, tryLoop, loopInvuln, loopPose, tryDive, diveStomps,
    terrainBoxes, hitBox, bounceTarget, crash, boeZones, boeAt, bottleLayout, newBomb, bombStep, bombTargets,
    tellTime, barkAt, triggered, aim, fan, fanDeg, lob, predict, bossAnchor, schaumBand, fassColumns, nextAttack };
  const MH = root.MH || (root.MH = {}); MH.flight = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
