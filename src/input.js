// Touch + keyboard input. Touch zones live on a full-screen #touch layer that is only
// active during play: left 40 % = brake (hold), right side = jump / double jump (tap) and
// slam (swipe down). Raw events are queued; the Play scene interprets them with the hero state.
// Flight mode (arc 3, INPUT.mode = 'flight'): the right zone is a relative vertical drag (INPUT.flight),
// a double tap queues 'loop', a quick flick down queues 'dive'; the arrow keys steer (INPUT.keyDir).
(function () {
  const pointers = new Map(); // pointerId -> {zone, x0, y0, t0, swiped}
  const queue = [];
  let keyBrake = false, keyUp = false, keyDown = false, sidN = 0;
  const tapSt = { last: null };
  const FL = window.GAME_DATA.tuning.arc3.flight;
  const toGame = () => 216 / Math.max(1, (document.getElementById('touch') || {}).clientHeight || window.innerHeight);
  const IL = window.MH.input;   // SWIPE_PX = 18 CSS px (≈ 13 logical px at the usual phone zoom): short so a slow swipe-down still slams
  const INPUT = {
    queue,
    enabled: false,
    get brake() { if (!INPUT.enabled) return false; if (keyBrake) return true; for (const p of pointers.values()) if (p.zone === 'L') return true; return false; },
    clear() { queue.length = 0; pointers.clear(); keyBrake = false; keyUp = false; keyDown = false; INPUT.flight.down = false; tapSt.last = null; },
    mode: 'land',
    flight: { sid: 0, dy: 0, down: false },        // the active right-zone drag, in game px since its touch started
    get keyDir() { return INPUT.enabled ? (keyDown ? 1 : 0) - (keyUp ? 1 : 0) : 0; },
    push(type) { if (INPUT.enabled) queue.push({ type, t: performance.now() }); },
    onPause: null, onSpecial: null,
  };
  const layer = document.getElementById('touch');
  function zoneOf(x) { return IL.zoneOf(x, window.innerWidth); }
  layer.addEventListener('pointerdown', e => {
    e.preventDefault();
    const zone = zoneOf(e.clientX);
    const now = performance.now(), k = toGame();
    pointers.set(e.pointerId, { zone, x0: e.clientX, y0: e.clientY, t0: now, swiped: false, yk: e.clientY * k, tk: now, flicked: false, moved: 0, sid: ++sidN });
    try { layer.setPointerCapture(e.pointerId); } catch (_) {}
    if (INPUT.mode === 'flight') { if (zone === 'R') Object.assign(INPUT.flight, { sid: sidN, dy: 0, down: true }); return; }
    if (zone === 'R') INPUT.push('press');
  });
  layer.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (p && INPUT.mode === 'flight') {
      if (p.zone !== 'R') return;
      const now = performance.now(), k = toGame(), y = e.clientY * k;
      p.moved = Math.max(p.moved, Math.abs(e.clientY - p.y0) * k);
      if (INPUT.flight.sid === p.sid) INPUT.flight.dy = (e.clientY - p.y0) * k;
      if (now - p.tk > FL.flick_ms || y < p.yk) { p.yk = y; p.tk = now; }    // rolling window, restarts when the thumb goes up
      if (IL.isFlick(p, y, now, FL)) { p.flicked = true; INPUT.push('dive'); }
      return;
    }
    if (IL.isSwipe(p, e.clientY, performance.now())) { p.swiped = true; INPUT.push('swipe'); }
  });
  function up(e) {
    const p = pointers.get(e.pointerId);
    if (p && INPUT.mode === 'flight') {
      pointers.delete(e.pointerId);
      if (p.zone !== 'R') return;
      if (INPUT.flight.sid === p.sid) INPUT.flight.down = false;
      const now = performance.now();
      if (!p.flicked && IL.flightTap(tapSt, now / 1000, (now - p.t0) / 1000, p.moved, FL) === 'loop') INPUT.push('loop');
      return;
    }
    if (p && p.zone === 'R') INPUT.push('release');
    pointers.delete(e.pointerId);
  }
  layer.addEventListener('pointerup', up);
  layer.addEventListener('pointercancel', up);
  layer.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
    if (INPUT.mode === 'flight') {
      const a = IL.flightKey(e.code);
      if (a === 'pause') { if (INPUT.onPause) INPUT.onPause(); return; }
      if (!INPUT.enabled || !a) return;
      e.preventDefault();
      if (a === 'up') keyUp = true; else if (a === 'down') keyDown = true; else if (a === 'brake') keyBrake = true;
      else if (!e.repeat) { if (a === 'special') { if (INPUT.onSpecial) INPUT.onSpecial(); } else INPUT.push(a); }
      return;
    }
    const a = IL.keyAction(e.code);
    if (a === 'pause') { if (INPUT.onPause) INPUT.onPause(); return; }
    if (!INPUT.enabled) return;
    if (a === 'brake') { keyBrake = true; e.preventDefault(); }
    else if (a === 'jump') { if (!e.repeat) { INPUT.push('press'); INPUT.push('release'); } e.preventDefault(); }
    else if (a === 'slam') { if (!e.repeat) INPUT.push('slam'); e.preventDefault(); }
    else if (a === 'special') { if (!e.repeat && INPUT.onSpecial) INPUT.onSpecial(); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (IL.keyAction(e.code) === 'brake') keyBrake = false;
    const a = IL.flightKey(e.code);
    if (a === 'up') keyUp = false; else if (a === 'down') keyDown = false; else if (a === 'brake') keyBrake = false;
  });
  window.addEventListener('blur', () => { keyBrake = false; keyUp = false; keyDown = false; INPUT.flight.down = false; pointers.clear(); });
  window.INPUT = INPUT;
})();
