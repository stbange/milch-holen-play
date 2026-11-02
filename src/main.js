// Boot: loads the Tech Artist's asset pack (assets/art/manifest.json, bundled into src/data.js as ART_MANIFEST),
// builds the animations it lists, sets up integer pixel scaling, and owns the game flow (GAMEFLOW).
(function () {
  const BASE_W = 384, BASE_H = 216, MAX_W = 512;
  const MAN = window.ART_MANIFEST.assets;

  class Boot extends Phaser.Scene {
    constructor() { super('Boot'); }
    preload() {
      const L = this.load; L.setPath('assets/art/');
      MAN.forEach(a => {
        if (a.key === 'tiles_village') L.spritesheet(a.key, a.path, { frameWidth: 16, frameHeight: 16 });
        else if (a.type === 'spritesheet') L.spritesheet(a.key, a.path, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
        else if (a.type === 'image' || a.type === 'nineslice') L.image(a.key, a.path);
      });
      const bar = document.getElementById('loadbar');
      L.on('progress', v => { if (bar) bar.style.width = Math.round(v * 100) + '%'; });
    }
    create() {
      ART.build(this); // procedural extras (balcony, railing, goal flag, sparks) for things the art pack doesn't cover
      MAN.forEach(a => (a.animations || []).forEach(an => {
        if (this.anims.exists(an.key)) return;
        this.anims.create({ key: an.key, frames: this.anims.generateFrameNumbers(a.key, { frames: an.frames }), frameRate: an.frameRate, repeat: an.repeat === undefined ? 0 : an.repeat, repeatDelay: an.repeatDelay || 0 });
      }));
      const ld = document.getElementById('loading'); if (ld) ld.remove();
      I18N.setLang(SAVE.data.lang); SFX.setEnabled(SAVE.data.sound); UI.refreshRotate();
      GAMEFLOW.toTitle();
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: BASE_W, height: BASE_H, pixelArt: true, roundPixels: true,
    backgroundColor: '#1a1426',
    scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    audio: { noAudio: true },
    fps: { target: 60 },
    scene: [Boot, window.PlayScene],
  });
  window.__GAME = game;

  // integer zoom: the biggest whole-number scale (in device pixels) that fits 216 lines; the width
  // widens up to 512 logical px so wide phones are filled instead of letterboxed.
  function fit() {
    const W = window.innerWidth, H = window.innerHeight, dpr = window.devicePixelRatio || 1;
    const k = Math.max(1, Math.floor(Math.min(H * dpr / BASE_H, W * dpr / BASE_W)));
    const w = Math.max(BASE_W, Math.min(MAX_W, Math.floor(W * dpr / k)));
    if (game.scale.width !== w) game.scale.resize(w, BASE_H);
    game.scale.setZoom(k / dpr);
    if (window.UI && UI.layoutStage) UI.layoutStage();
    const portrait = H > W;
    document.getElementById('rotate').classList.toggle('hidden', !portrait);
    const play = game.scene.getScene('Play');
    if (portrait && play && play.scene.isActive() && play.pauseGame) play.pauseGame();
  }
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));
  game.events.once('ready', fit);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    const play = game.scene.getScene('Play');
    if (play && play.scene.isActive() && play.pauseGame) play.pauseGame();
  });

  window.GAMEFLOW = {
    toTitle() {
      game.scene.start('Play', { level: 0 });
      UI.title(); SFX.music('menu');
    },
    startLevel(n, restart) {
      // a Kiosk-Tuete boon binds to the next level started, survives retries of it, and is dropped
      // when a different level is started (spec §8b)
      if (window.MH.economy.bindBoon(SAVE.data, n)) SAVE.write();
      UI.clear();
      game.scene.stop('Play');
      game.scene.start('Play', { level: n });
      SFX.music(n === 4 ? null : 'play');
    },
    // clear bonus (spec §8b): +no_hit when no heart was lost, +collect at >= collect_ratio of the level's bottles
    clearBonus(n, st) {
      return window.MH.economy.clearBonus(window.GAME_DATA.tuning.clear_bonus, window.GAME_DATA.levels.levels[n - 1], st);
    },
    // a random Kiosk-Tuete offer of tuning.boons.offer_count boons, honouring each boon's `requires`
    // arc: the arc of the next mission, so only fitting boons are offered
    tueteOffer(arc) {
      return window.MH.economy.tueteOffer(window.GAME_DATA.tuning.boons, SAVE.data.upgrades, Math.random, arc);
    },
    win(n, bottles, stats) {
      GAMEFLOW.winSeq = (GAMEFLOW.winSeq || 0) + 1;   // the map jumps to the first open mission after a win
      const S = SAVE.data, BN = window.GAME_DATA.tuning.boons;
      const bonus = GAMEFLOW.clearBonus(n, stats);
      const res = window.MH.economy.applyWin(S, n, bottles, bonus, BN, window.GAME_DATA.levels.levels.length), tuete = res.tuete; SAVE.write();
      UI.hud.show(false);
      const next = () => {
        if (res.next === 'ending') { S.ending_seen = true; SAVE.write(); SFX.music('menu'); UI.ending(() => GAMEFLOW.toMap()); }
        else if (res.next === 'ending2') { S.ending2_seen = true; SAVE.write(); SFX.music('menu'); (UI.ending2 || UI.ending)(() => GAMEFLOW.toMap()); }
        else if (res.next === 'ending3') { S.ending3_seen = true; SAVE.write(); SFX.music('menu'); (UI.ending3 || UI.ending)(() => GAMEFLOW.toMap()); }
        else if (res.next === 'tuete') { const L2 = window.GAME_DATA.levels.levels[n] || {}; UI.tuete(n, GAMEFLOW.tueteOffer(L2.arc || 1)); }
        else GAMEFLOW.toMap();
      };
      UI.win(n, bottles, res.newUnlock, next, bonus, tuete);
    },
    toMap() {
      UI.hud.show(false);
      game.scene.stop('Play');
      game.scene.start('Play', { level: 0 });
      UI.map(); SFX.music('menu');
    },
  };
})();
