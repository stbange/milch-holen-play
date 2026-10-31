// Fullscreen on phones. Browsers only allow requestFullscreen() inside a user gesture, so while the
// phone is held sideways and the page is not fullscreen yet, the next tap anywhere goes fullscreen
// (and tries to lock landscape). The tap is not swallowed: it still reaches the game as normal input.
// Re-armed after a turn of the phone or after leaving fullscreen. iPhone Safari has no element
// fullscreen: then nothing is armed, the button is hidden and the rotate hint drops the "tap" part.
// "Add to home screen" (manifest.webmanifest, display: fullscreen) opens fullscreen without any of this.
(function () {
  const root = document.documentElement;
  const req = root.requestFullscreen || root.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const standalone = () => { try { return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const landscape = () => window.innerWidth >= window.innerHeight;
  let optedOut = false; // left fullscreen with our own button: don't jump back in until the phone turns again

  const FS = {
    supported: typeof req === 'function' && document.fullscreenEnabled !== false && !standalone(),
    get active() { return !!fsEl(); },
    get armed() { return FS.supported && !optedOut && !fsEl(); },
    stats: { requests: 0 },
    enter() {
      if (!FS.supported || fsEl()) return Promise.resolve(false);
      FS.stats.requests++;
      let p;
      try { p = req.call(root, { navigationUI: 'hide' }); } catch (e) { return Promise.resolve(false); }
      return Promise.resolve(p).then(() => {
        try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) {}
        return true;
      }, () => false);
    },
    exit() {
      if (!fsEl() || typeof exit !== 'function') return Promise.resolve();
      try { const o = screen.orientation; if (o && o.unlock) o.unlock(); } catch (e) {}
      try { return Promise.resolve(exit.call(document)).catch(() => {}); } catch (e) { return Promise.resolve(); }
    },
    toggle() {
      if (fsEl()) { optedOut = true; return FS.exit(); }
      optedOut = false; return FS.enter();
    },
    label() { return t(fsEl() ? 'ui_fs_off' : 'ui_fs_on'); },
    // markup for the menu button; hidden where fullscreen is impossible (iPhone, home-screen app)
    button() { return FS.supported ? `<button class="btn small" data-a="fs">${FS.label()}</button>` : ''; },
  };

  // Activation-triggering events: pointerup/touchend for touch, pointerdown for a mouse. Capture
  // phase, never preventDefault/stopPropagation, so the game sees the same tap.
  function onGesture(e) {
    if (!FS.armed) return;
    if (e.type === 'pointerdown' && e.pointerType !== 'mouse') return;
    if (e.target && e.target.closest && e.target.closest('[data-a=fs]')) return; // the button toggles itself
    // sideways: go fullscreen. Upright: only from the rotate hint (the landscape lock may turn the screen).
    if (!landscape() && !(e.target && e.target.closest && e.target.closest('#rotate'))) return;
    FS.enter();
  }
  ['pointerup', 'pointerdown', 'touchend'].forEach(ev => window.addEventListener(ev, onGesture, { capture: true, passive: true }));

  function refreshButtons() { document.querySelectorAll('[data-a=fs]').forEach(b => { b.textContent = FS.label(); }); }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => {
    refreshButtons();
    if (window.UI && UI.refreshRotate) UI.refreshRotate();
  }));
  const rearm = () => { optedOut = false; };
  window.addEventListener('orientationchange', rearm);
  try { if (screen.orientation) screen.orientation.addEventListener('change', rearm); } catch (e) {}

  window.FS = FS;
})();
