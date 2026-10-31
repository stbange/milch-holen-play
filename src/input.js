// Touch + keyboard input. Touch zones live on a full-screen #touch layer that is only
// active during play: left 40 % = brake (hold), right side = jump / double jump (tap) and
// slam (swipe down). Raw events are queued; the Play scene interprets them with the hero state.
(function () {
  const pointers = new Map(); // pointerId -> {zone, x0, y0, t0, swiped}
  const queue = [];
  let keyBrake = false;
  const SWIPE_PX = 18; // CSS px (≈ 13 logical px at the usual phone zoom); short so a slow swipe-down still slams
  const INPUT = {
    queue,
    enabled: false,
    get brake() { if (!INPUT.enabled) return false; if (keyBrake) return true; for (const p of pointers.values()) if (p.zone === 'L') return true; return false; },
    clear() { queue.length = 0; pointers.clear(); keyBrake = false; },
    push(type) { if (INPUT.enabled) queue.push({ type, t: performance.now() }); },
    onPause: null, onSpecial: null,
  };
  const layer = document.getElementById('touch');
  function zoneOf(x) { return x < window.innerWidth * 0.4 ? 'L' : 'R'; }
  layer.addEventListener('pointerdown', e => {
    e.preventDefault();
    const zone = zoneOf(e.clientX);
    pointers.set(e.pointerId, { zone, x0: e.clientX, y0: e.clientY, t0: performance.now(), swiped: false });
    try { layer.setPointerCapture(e.pointerId); } catch (_) {}
    if (zone === 'R') INPUT.push('press');
  });
  layer.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p || p.swiped || p.zone !== 'R') return;
    if (e.clientY - p.y0 >= SWIPE_PX && performance.now() - p.t0 <= 300) { p.swiped = true; INPUT.push('swipe'); }
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
    const k = e.code;
    if (k === 'Escape' || k === 'KeyP') { if (INPUT.onPause) INPUT.onPause(); return; }
    if (!INPUT.enabled) return;
    if (k === 'ArrowLeft' || k === 'KeyA') { keyBrake = true; e.preventDefault(); }
    else if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') { if (!e.repeat) { INPUT.push('press'); INPUT.push('release'); } e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 'KeyS') { if (!e.repeat) INPUT.push('slam'); e.preventDefault(); }
    else if (k === 'KeyX' || k === 'KeyE' || k === 'Enter') { if (!e.repeat && INPUT.onSpecial) INPUT.onSpecial(); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyBrake = false;
  });
  window.addEventListener('blur', () => { keyBrake = false; pointers.clear(); });
  window.INPUT = INPUT;
})();
