// All sounds are synthesised live with WebAudio (no audio files, nothing to license).
(function () {
  let ctx = null, master = null, musicGain = null, noiseBuf = null, enabled = true;
  let musicTimer = null, musicStep = 0, nextNoteTime = 0, musicOn = false, musicMood = 'menu';
  const last = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 0.5 : 0; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
  ['pointerdown', 'touchstart', 'keydown'].forEach(e => window.addEventListener(e, unlock, { passive: true }));

  function tone(type, f0, f1, dur, vol, delay, dest) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, filt, f, delay, dest) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = filt || 'lowpass'; fl.frequency.value = f || 1200;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || master); s.start(t); s.stop(t + dur + 0.02);
  }
  const R = (a, b) => a + Math.random() * (b - a);
  const SOUNDS = {
    shoot() { tone('square', R(820, 900), 300, 0.06, 0.06); },
    jump() { tone('square', 260, 620, 0.12, 0.09); },
    djump() { tone('square', 420, 900, 0.12, 0.08); },
    land() { noise(0.06, 0.12, 'lowpass', 600); },
    slam() { tone('sine', 120, 40, 0.3, 0.35); noise(0.25, 0.3, 'lowpass', 500); },
    stomp() { tone('square', 300, 120, 0.1, 0.12); },
    hit() { tone('square', R(200, 240), 120, 0.05, 0.08); },
    poof() { noise(0.22, 0.25, 'bandpass', 900); tone('triangle', 500, 160, 0.15, 0.08); },
    pickup() { tone('square', 988, 988, 0.05, 0.06); tone('square', 1319, 1319, 0.09, 0.06, 0.05); },
    kasten() { [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, f, 0.07, 0.06, i * 0.05)); },
    item() { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.12, 0.12, i * 0.07)); },
    heal() { [659, 880].forEach((f, i) => tone('triangle', f, f, 0.12, 0.12, i * 0.08)); },
    hurt() { tone('sawtooth', 300, 90, 0.3, 0.14); noise(0.12, 0.15, 'lowpass', 1500); },
    crate() { noise(0.15, 0.25, 'lowpass', 900); tone('square', 150, 90, 0.1, 0.1); },
    throw() { noise(0.2, 0.08, 'highpass', 2000); },
    wuff() { tone('triangle', 760, 540, 0.06, 0.07); tone('triangle', 820, 560, 0.06, 0.06, 0.1); },
    bark() { tone('square', 520, 380, 0.07, 0.1); tone('square', 560, 400, 0.07, 0.1, 0.12); },
    honk() { tone('sawtooth', 220, 210, 0.5, 0.12); tone('sawtooth', 277, 270, 0.5, 0.1); },
    stamp() { tone('sine', 90, 35, 0.35, 0.4); noise(0.2, 0.25, 'lowpass', 400); },
    warn() { tone('square', 880, 880, 0.08, 0.05); },
    knoedel() { tone('sine', 160, 60, 0.4, 0.3); noise(0.3, 0.2, 'lowpass', 700); tone('square', 600, 200, 0.2, 0.07); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, f, i === 5 ? 0.4 : 0.12, 0.08, i * 0.11)); },
    lose() { [392, 370, 349, 262].forEach((f, i) => tone('triangle', f, f * 0.98, i === 3 ? 0.5 : 0.18, 0.13, i * 0.2)); },
    click() { tone('square', 660, 660, 0.04, 0.05); },
    buy() { [660, 880, 1320].forEach((f, i) => tone('square', f, f, 0.08, 0.07, i * 0.06)); },
    nope() { tone('square', 200, 160, 0.16, 0.08); },
    pit() { tone('triangle', 600, 100, 0.5, 0.12); },
  };

  // ---- Tiny oompah ("Blasmusik") loop: tuba on 1, chord "pah" on 2 ----
  const SONGS = {
    menu: { bpm: 112, prog: [[98, 196, 247, 294], [147, 220, 262, 330], [147, 220, 262, 330], [98, 196, 247, 294]],
      mel: [392, 0, 440, 494, 587, 0, 494, 0, 440, 0, 392, 440, 494, 0, 392, 0] },
    play: { bpm: 138, prog: [[131, 262, 330, 392], [196, 247, 294, 392], [196, 247, 294, 349], [131, 262, 330, 392]],
      mel: [523, 0, 523, 587, 659, 0, 523, 0, 587, 0, 587, 494, 392, 0, 0, 0, 523, 0, 659, 0, 784, 0, 659, 523, 587, 0, 494, 0, 523, 0, 0, 0] },
    boss: { bpm: 150, prog: [[110, 220, 262, 330], [110, 220, 262, 330], [165, 208, 247, 330], [110, 220, 262, 330]],
      mel: [440, 0, 523, 0, 659, 0, 523, 0, 622, 0, 659, 0, 494, 0, 0, 0] },
  };
  function scheduleMusic() {
    if (!ctx || !musicOn) return;
    const song = SONGS[musicMood] || SONGS.play;
    const stepDur = 60 / song.bpm / 2; // eighth notes
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const s = musicStep, bar = Math.floor(s / 8) % song.prog.length, chord = song.prog[bar];
      const delay = Math.max(0, nextNoteTime - ctx.currentTime);
      if (enabled) {
        if (s % 4 === 0) tone('triangle', chord[0] * (s % 8 === 4 ? 1.5 : 1), null, stepDur * 1.6, 0.5, delay, musicGain);
        if (s % 4 === 2) chord.slice(1).forEach(f => tone('square', f, null, stepDur * 0.7, 0.07, delay, musicGain));
        const m = song.mel[s % song.mel.length];
        if (m) tone('square', m, null, stepDur * 0.9, 0.08, delay, musicGain);
      }
      nextNoteTime += stepDur; musicStep++;
    }
  }
  const SFX = {
    play(name) {
      if (!enabled || !ctx || ctx.state !== 'running') return;
      const now = performance.now();
      if (last[name] && now - last[name] < 35) return; // de-dupe spam
      last[name] = now;
      const f = SOUNDS[name]; if (f) f();
    },
    setEnabled(on) { enabled = !!on; if (master) master.gain.value = enabled ? 0.5 : 0; },
    music(mood) {
      ensure();
      if (!ctx) return;
      if (mood === null) { musicOn = false; return; }
      if (musicOn && musicMood === mood) return;
      musicMood = mood; musicOn = true; musicStep = 0; nextNoteTime = ctx.currentTime + 0.05;
      if (!musicTimer) musicTimer = setInterval(scheduleMusic, 60);
    },
    get ctx() { return ctx; },
  };
  window.SFX = SFX;
})();
