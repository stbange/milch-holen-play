// Touch + keyboard input. Touch zones live on a full-screen #touch layer that is only
// active during play: left 40 % = brake (hold), right side = jump / double jump (tap) and
// slam (swipe down). Raw events are queued; the Play scene interprets them with the hero state.
(function () {
  const pointers = new Map(); // pointerId -> {zone, x0, y0, t0, swiped}
  const queue = [];
  let keyBrake = false;
  const IL = window.MH.input;   // SWIPE_PX = 18 CSS px (≈ 13 logical px at the usual phone zoom): short so a slow swipe-down still slams
  const INPUT = {
    queue,
    enabled: false,
    get brake() { if (!INPUT.enabled) return false; if (keyBrake) return true; for (const p of pointers.values()) if (p.zone === 'L') return true; return false; },
    clear() { queue.length = 0; pointers.clear(); keyBrake = false; },
    push(type) { if (INPUT.enabled) queue.push({ type, t: performance.now() }); },
    onPause: null, onSpecial: null,
  };
  const layer = document.getElementById('touch');
  function zoneOf(x) { return IL.zoneOf(x, window.innerWidth); }
  layer.addEventListener('pointerdown', e => {
    e.preventDefault();
    const zone = zoneOf(e.clientX);
    pointers.set(e.pointerId, { zone, x0: e.clientX, y0: e.clientY, t0: performance.now(), swiped: false });
    try { layer.setPointerCapture(e.pointerId); } catch (_) {}
    if (zone === 'R') INPUT.push('press');
  });
  layer.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (IL.isSwipe(p, e.clientY, performance.now())) { p.swiped = true; INPUT.push('swipe'); }
  });
  function up(e) {
    const p = pointers.get(e.pointerId);
    if (p && p.zone === 'R') INPUT.push('release');
    pointers.delete(e.pointerId);
  }
  layer.addEventListener('pointerup', up);
  layer.addEventListener('pointercancel', up);
  layer.addEventListener('contextmenu', e => e.preventDefault());

  window.addEventListener('keydown', e => {
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
  });
  window.addEventListener('blur', () => { keyBrake = false; pointers.clear(); });
  window.INPUT = INPUT;
})();
