// Input interpretation (spec: controls-input): touch zones, swipe detection, key mapping, and how the
// queued events become jump / double jump / slam (land), hop / duck (SUP) and duck (bike).
(function (root) {
  'use strict';
  const SWIPE_PX = 18, SWIPE_MS = 300;
  const zoneOf = (x, width) => x < width * 0.4 ? 'L' : 'R';        // left 40 % brakes, the rest jumps
  // a right-zone pointer that moved down SWIPE_PX within SWIPE_MS of touching is a swipe (once)
  const isSwipe = (p, y, now) => !!p && !p.swiped && p.zone === 'R' && y - p.y0 >= SWIPE_PX && now - p.t0 <= SWIPE_MS;
  const KEYS = { Escape: 'pause', KeyP: 'pause', ArrowLeft: 'brake', KeyA: 'brake', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
    ArrowDown: 'slam', KeyS: 'slam', KeyX: 'special', KeyE: 'special', Enter: 'special' };
  const keyAction = code => KEYS[code] || null;
  // land (board / bike): act = { jump(), doubleJump(), slam() }; mutates h.pending / h.buffer
  function landInput(h, q, dt, now, M, act) {
    for (const ev of q) {
      if (ev.type === 'press') {
        if (h.grounded || h.coyote > 0) act.jump();
        else if (!h.pending) h.pending = { t: M.air_tap_slam_window_s || 0.1 };
      } else if (ev.type === 'swipe' || ev.type === 'slam') {
        if (!h.grounded || (now - h.lastJumpT) < 0.2) { h.pending = null; act.slam(); }
      }
    }
    if (h.pending) {
      h.pending.t -= dt;
      if (h.pending.t <= 0) {
        h.pending = null;
        if (h.grounded) act.jump();
        else if (h.airJumps > 0) act.doubleJump();
        else h.buffer = M.jump_buffer_s;
      }
    }
  }
  // bike: a swipe on the ground ducks (removed from the queue); everything else stays for landInput
  function bikeInput(h, q, now, duckS) {
    for (let i = 0; i < q.length; i++) {
      const ev = q[i];
      if ((ev.type === 'swipe' || ev.type === 'slam') && h.grounded && (now - h.lastJumpT) >= 0.2) { h.duck = duckS; q.splice(i, 1); i--; }
    }
  }
  // SUP: tap = hop (or buffer it in the air), swipe = duck (or buffer + drop faster); act = { hop(), duck() }
  function waterInput(h, q, W, act) {
    for (const ev of q) {
      if (h.sunk > 0) continue;
      if (ev.type === 'press') { if (h.grounded) act.hop(); else h.hopBuf = W.hop_buffer_s; }
      else if (ev.type === 'swipe' || ev.type === 'slam') {
        if (h.grounded) act.duck();
        else { h.duckBuf = 0.3; h.vy = Math.max(h.vy, 140); }
      }
    }
  }
  // flight (arc 3): arrows / WASD steer, Space loops, Shift / F dives, left arrow throttles back
  const FKEYS = { Escape: 'pause', KeyP: 'pause', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'brake', KeyA: 'brake',
    Space: 'loop', ShiftLeft: 'dive', ShiftRight: 'dive', KeyF: 'dive', KeyX: 'special', KeyE: 'special', Enter: 'special' };
  const flightKey = code => FKEYS[code] || null;
  // a right-zone tap is short and barely moves; two taps within double_tap_s start a Looping.
  // st: {last} kept per input layer; returns 'loop' | 'tap' | null
  function flightTap(st, now, dur, moved, FL) {
    if (dur > FL.tap_max_s || moved > FL.tap_slop_px) return null;
    if (st.last !== null && st.last !== undefined && now - st.last <= FL.double_tap_s) { st.last = null; return 'loop'; }
    st.last = now; return 'tap';
  }
  // a quick downward flick (flick_px within flick_ms) starts a Sturzflug, once per touch
  const isFlick = (p, y, now, FL) => !!p && !p.flicked && p.zone === 'R' && y - p.yk >= FL.flick_px && now - p.tk <= FL.flick_ms;
  const api = { flightKey, flightTap, isFlick, SWIPE_PX, SWIPE_MS, zoneOf, isSwipe, keyAction, landInput, bikeInput, waterInput };
  const MH = root.MH || (root.MH = {}); MH.input = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
