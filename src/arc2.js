// ARC 2 "Ab nach Soest" (missions 6-10): the SUP water layer, the folding bike, the arc-2 monsters and
// the Kirmes-Kuh boss. Everything here is mixed into the Play scene (src/play.js calls these hooks only
// when the level has arc: 2), so arc 1 runs exactly as before. Numbers come from tuning.arc2 /
// tuning.enemies (a2: true) / tuning.boss_kuh in the design data; arc-2 sprites face LEFT (never flipX).
(function () {
  const P = window.PlayScene.prototype, G = window.GAME_DATA, T = G.tuning;
  const { TILE, GY, ROWS, GROUND_ROW, EMPTY, SOLID, ONEWAY, CRATE, HB_W, HB_OFF, rng, clamp, approach } = window.PlayScene.consts();
  const A2 = T.arc2, W = A2.water, BK = A2.bike, UF = A2.unfold, M = T.movement, PL = T.player, EN = T.enemies, HZ = T.hazards, TL = T.tells;
  const t = (k, v) => I18N.t(k, v);
  const G_W = M.gravity * W.gravity_mult;
  const HOP_V = Math.sqrt(2 * G_W * (M.jump_velocity * M.jump_velocity / (2 * M.gravity)) * W.hop_height_ratio);
  const OVER_Y = GY - W.overhead_bottom_above_water_px;     // underside of bridges / branches / nets
  const ORANGE = 0xff7a1a, INK = 0x1a1426;
  const FONT = { fontFamily: '"Pixelify Sans", Pixelify, sans-serif', fontSize: '10px', color: '#ff7a1a', stroke: '#1a1426', strokeThickness: 3 };
  const SCENERY = {
    ahse: { layers: [['arc2_px_ahse_sky', 0.05], ['arc2_px_ahse_far', 0.2]], front: 'arc2_px_reeds' },
    boerde: { layers: [['arc2_px_ahse_sky', 0.05], ['arc2_px_boerde', 0.2]], front: 'arc2_px_reeds' },
    soest: { layers: [['arc2_px_soest_sky', 0.1], ['arc2_px_wall', 0.35], ['arc2_px_altstadt', 0.5]], town: true },
    markt: { layers: [['arc2_px_soest_sky', 0.1], ['arc2_px_markt', 0.3]], town: true },
  };

  // ------------------------------------------------------------------ setup
  P.a2Init = function () {
    const L = this.L;
    this.water = L.mode === 'water' || L.mode === 'mixed';
    this.vehicle = this.water ? 'sup' : 'bike';
    this.currents = (L.hazards || []).filter(h => h.type === 'current').map(h => ({ x: h.x * TILE, s: h.speed })).sort((a, b) => a.x - b.x);
    this.a2o = { obst: [], overs: [], weirs: [], locks: [], threats: [] };
    this.heroSX = W.hero_screen_x; this.lockOn = null; this.cutscene = null;
    this.dockX = L.dock_x ? L.dock_x * TILE : null;
    this.barkCd = 0; this.dogCd = 4; this.grp = null;
  };
  P.currentAt = function (x) { let s = W.current_base; for (const c of this.currents) if (x >= c.x) s = c.s; return s; };

  P.a2Background = function () {
    const sc = SCENERY[this.L.scenery] || SCENERY.ahse;
    this.parallax = [];
    this.parallax.push({ spr: this.add.tileSprite(0, 0, this.viewW, 216, 'arc2_px_day_sky').setOrigin(0).setScrollFactor(0).setDepth(0), f: 0 });
    sc.layers.forEach(([k, f], i) => this.parallax.push({ spr: this.add.tileSprite(0, 0, this.viewW, 216, k).setOrigin(0).setScrollFactor(0).setDepth(1 + i), f }));
    if (this.water) {
      const far = { spr: this.add.tileSprite(0, 138, this.viewW, 48, 'arc2_water_far').setOrigin(0).setScrollFactor(0).setDepth(4), f: 0.5, h: 48 };
      const surf = { spr: this.add.tileSprite(0, GY - 2, this.viewW, 34, 'arc2_water').setOrigin(0).setScrollFactor(0).setDepth(9), f: 1, h: 34 };
      const band = { spr: this.add.tileSprite(0, GY + 1, this.viewW, 6, 'arc2_water_band').setOrigin(0).setScrollFactor(0).setDepth(26), f: 1, h: 6 };
      this.waterStrips = [far, surf, band];
      this.parallax.push(far, surf, band);
    }
    if (sc.front) this.parallax.push({ spr: this.add.tileSprite(0, 0, this.viewW, 216, sc.front).setOrigin(0).setScrollFactor(0).setDepth(60), f: 1.25 });
  };

  P.a2Tiles = function () {
    const Wd = this.W, sc = SCENERY[this.L.scenery] || {}, town = !!sc.town;
    const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: Wd, height: ROWS });
    const ts = map.addTilesetImage('arc2', 'tiles_arc2', TILE, TILE, 0, 0);
    const lay = map.createBlankLayer('ground', ts, 0, GY % TILE).setDepth(10);
    const R = rng(this.levelNum * 31 + 7);
    const c0 = this.water ? (this.dockX ? Math.floor(this.dockX / TILE) + 1 : Wd) : 0;
    for (let c = c0; c < Wd; c++) for (let r = 0; r < ROWS; r++) {
      const v = this.cell(c, r); let f = -1;
      if (v === SOLID) {
        if (r === GROUND_ROW) f = town ? 4 + (R() < 0.5 ? 0 : 1) : (R() < 0.5 ? 0 : 1);
        else if (r > GROUND_ROW) f = town ? 6 : (R() < 0.6 ? 2 : 3);
        else f = 7;
      } else if (v === ONEWAY) f = town ? 8 : 9;
      if (f >= 0) lay.putTileAt(f, c, r);
    }
    this.gLayer = lay;
    if (this.dockX) this.add.image(this.dockX + 8, GY + 20, 'arc2_jetty').setOrigin(0.5, 1).setDepth(11);
    if (this.L.gate_x) this.add.image(this.L.gate_x * TILE, GY + 4, 'arc2_stonebridge').setOrigin(0.5, 1).setDepth(8);
  };

  P.a2Hazard = function (h) {
    const O = this.a2o, x = h.x * TILE;
    if (h.type === 'log' || h.type === 'rock') {
      const d = HZ[h.type], cx = x + 8;
      const spr = this.add.image(cx, GY + 3, 'arc2_' + h.type).setOrigin(0.5, 1).setDepth(12);
      O.obst.push({ x: cx, w: d.w_px, h: d.h_px, fw: d.feet_w_px, spr, kind: h.type });
      O.threats.push({ x: cx, kind: h.type });
    } else if (h.type === 'duck') {
      const D = HZ.duck, k = D.kinds[h.kind] || D.kinds.branch, w = k.w_px, cx = x + w / 2;
      const spr = this.add.image(cx, h.kind === 'footbridge' ? GY : GY - 2, k.sprite).setOrigin(0.5, 1).setDepth(27);
      const band = this.add.rectangle(cx, GY + 1, w, 5, INK, 0.35).setDepth(9.5);
      const mark = this.add.triangle(x - 6, OVER_Y - 4, 0, 0, 10, 0, 5, 8, ORANGE).setOrigin(0.5, 0.5).setDepth(46).setVisible(false);
      O.overs.push({ x0: x, x1: x + w, kind: h.kind, spr, band, mark, warned: false });
      O.threats.push({ x, kind: 'duck' });
    } else if (h.type === 'weir') {
      this.add.image(x + 32, GY + 20, 'arc2_weir').setOrigin(0.5, 1).setDepth(11);
      O.weirs.push({ x: x + 16, done: false });
    } else if (h.type === 'lock') {
      const spr = this.add.sprite(x, GY + 8, 'arc2_lock_gate', 0).setOrigin(0.5, 1).setDepth(27);
      O.locks.push({ x, hold: h.hold_s || W.lock_hold_s, t: 0, state: 'closed', spr });
    } else if (h.type === 'blumenkasten') {
      const y = GY - (h.y || 5) * TILE, cx = x + 8, P2 = HZ.blumenkasten;
      this.add.sprite(cx, y - 2, 'z_fenster', 0).setOrigin(0.5, 1).setDepth(8).play('fenster_peek');
      const spr = this.add.sprite(cx, y + 2, P2.sprite || 'hz_blumenkasten', 0).setOrigin(0.5, 1).setDepth(21);
      const sh = this.add.sprite(cx, GY + 1, 'hz_shadow_16', 0).setOrigin(0.5, 1).setDepth(11).setAlpha(0);
      this.objs.pots.push({ x: cx, y: y + 2, y0: y + 2, spr, sh, state: 'idle', t: 0, wob: 'blumenkasten_wobble' });
    }
  };

  P.a2Spawn = function (e, d, opt) {
    e.a2 = true; e.spr.setFlipX(false); e.spr.setDepth(20);
    const idx = (opt && opt.idx) || 0;
    switch (e.type) {
      case 'schnorchel': e.y = GY + 2; e.spr.setOrigin(0.5, 36 / 44); e.spr.play('schnorchel_swim'); e.t = 0.4; break;
      case 'kanugans': e.y = GY + 2; e.spr.setOrigin(0.5, 30 / 36); e.state = 'wait'; e.spr.setVisible(false); break;
      case 'hecht': e.y = GY + 2; e.spr.setOrigin(0.5, 30 / 36); e.state = 'wait'; e.spr.setVisible(false); e.lunges = 0; break;
      case 'treibgut': e.y = GY + 3; e.spr.setOrigin(0.5, 46 / 48); e.spr.play('treibgut_bob'); break;
      case 'schlamm': e.y = GY; e.spr.setOrigin(0.5, 46 / 48); e.state = 'hidden'; e.spr.setVisible(false); break;
      case 'marktschreier': e.y = GY; e.ak = 'markt'; e.spr.play('markt_idle'); e.fixed = true; e.spr.setDepth(13); break;
      case 'kraehe': {
        if (idx === 0 || !this.grp) this.grp = { state: 'wait', t: 0, lead: e, n: 0 };
        e.grp = this.grp; e.gi = this.grp.n++;
        const dy = [0, -3, 3, -6, 6][e.gi % 5];
        e.cy0 = GY - d.fly_above_ground_px + dy; e.y = e.cy0 + d.hitbox[1] / 2;
        e.spr.setOrigin(0.5, 0.5); e.spr.play('kraehe_fly'); e.state = 'wait'; break;
      }
    }
    e.spr.setPosition(Math.round(e.x), Math.round(e.type === 'kraehe' ? e.cy0 : e.y));
  };

  P.a2Hero = function () {
    const h = this.hero;
    if (this.vehicle === 'sup') { h.x = W.hero_screen_x; h.spr.setTexture('hero_sup', 0).setOrigin(0.5, 43 / 48); h.spr.play('sup_paddle'); h.anim = 'sup_paddle'; }
    else { h.spr.setTexture('hero_bike', 0).setOrigin(0.5, 47 / 48); h.spr.play('bike_ride'); h.anim = 'bike_ride'; }
    h.duck = 0; h.sunk = 0;
    if (this.stats.duckling) { this.duckling = this.add.sprite(h.x - 30, GY + 1, 'npc_duckling', 0).setOrigin(0.5, 1).setDepth(24); this.duckling.play('duckling_swim'); }
  };

  // ------------------------------------------------------------------ input
  P.a2Input = function (dt) {
    const h = this.hero, q = INPUT.queue;
    if (this.cutscene) { for (const ev of q.splice(0)) if (ev.type === 'press') this.unfoldTap(); return true; }
    if (!this.water) {   // bike: a swipe on the ground ducks (crows); in the air it is the usual slam
      for (let i = 0; i < q.length; i++) {
        const ev = q[i];
        if ((ev.type === 'swipe' || ev.type === 'slam') && h.grounded && (this.time0 - h.lastJumpT) >= 0.2) { h.duck = BK.duck_s; q.splice(i, 1); i--; }
      }
      return false;
    }
    for (const ev of q.splice(0)) {
      if (h.sunk > 0) continue;
      if (ev.type === 'press') { if (h.grounded) this.a2Hop(); else h.hopBuf = 0.12; }
      else if (ev.type === 'swipe' || ev.type === 'slam') {
        if (h.grounded) { h.duck = W.duck_s; SFX.play('throw'); }
        else { h.duckBuf = 0.3; h.vy = Math.max(h.vy, 140); }
      }
    }
    return true;
  };
  P.a2Hop = function (mult) {
    const h = this.hero;
    h.vy = -HOP_V * (mult || 1) * (this.stats.jump_mult || 1); h.grounded = false; h.duck = 0; h.lastJumpT = this.time0;
    SFX.play(mult ? 'djump' : 'jump'); this.a2Splash(h.x, GY + 2, 0.5);
  };

  // ------------------------------------------------------------------ hero on the water
  P.a2MoveWater = function (dt) {
    const h = this.hero;
    if (h.inv > 0) h.inv -= dt;
    if (h.kb > 0) h.kb -= dt;
    if (this.cutscene) { this.updateUnfold(dt); return; }
    if (h.sunk > 0) {
      h.sunk -= dt; h.x = this.camX + W.respawn_screen_x; h.y = GY;
      if (h.sunk <= 0) this.a2Resurface();
      return;
    }
    const brake = INPUT.brake && !this.ended;
    if (this.lockOn) this.heroSX += (brake ? -W.backpaddle_px_s : W.lock_push_px_s) * dt;
    else if (brake) this.heroSX -= W.backpaddle_px_s * dt;
    else this.heroSX = approach(this.heroSX, W.hero_screen_x, W.return_px_s * dt);
    this.heroSX = Math.max(W.hero_screen_x_min, this.heroSX);
    h.x = this.camX + this.heroSX;
    h.vx = this.lockOn ? 0 : this.currentAt(h.x) - (brake ? W.backpaddle_px_s : 0);
    // vertical: floaty hop, no double jump
    if (!h.grounded) {
      h.vy += G_W * dt; h.y += h.vy * dt;
      if (h.y >= GY) {
        h.y = GY; h.vy = 0; h.grounded = true; this.a2Splash(h.x, GY + 2, 0.5); SFX.play('land');
        if (h.hopBuf > 0) { h.hopBuf = 0; this.a2Hop(); }
        else if (h.duckBuf > 0) { h.duckBuf = 0; h.duck = W.duck_s; }
      }
    }
    if (h.hopBuf > 0) h.hopBuf -= dt;
    if (h.duckBuf > 0) h.duckBuf -= dt;
    // duck: lasts duck_s, held while still under something
    const under = this.a2o.overs.some(o => h.x + HB_W / 2 > o.x0 - 2 && h.x - HB_W / 2 < o.x1 + 2);
    if (h.duck > 0) h.duck = under && h.grounded ? Math.max(h.duck - dt, 0.05) : h.duck - dt;
    if (this.ended || this.dead) return;
    // weirs: automatic surf-hop off the lip
    for (const w of this.a2o.weirs) if (!w.done && h.x >= w.x) { w.done = true; if (h.grounded) this.a2Hop(W.surf_hop_mult); this.a2Splash(w.x + 10, GY + 4, 1.2); }
    if (h.inv > 0) return;
    // logs / rocks: the board's feet must clear them
    for (const o of this.a2o.obst) if (Math.abs(h.x - o.x) < (o.w + o.fw) / 2 && h.y > GY - o.h) { this.a2FallIn(o.kind); return; }
    // overhead: the standing (or hopping) hurtbox top hits the underside
    const top = h.y - HB_OFF - (h.duck > 0 ? W.duck_hurtbox_h : PL.hurtbox_h);
    for (const o of this.a2o.overs) if (h.x + HB_W / 2 > o.x0 && h.x - HB_W / 2 < o.x1 && top < OVER_Y) { this.a2FallIn(o.kind); return; }
    // closed lock gate
    if (this.lockOn && h.x + HB_W / 2 >= this.lockOn.x - 8) this.a2FallIn('gate');
  };
  P.a2FallIn = function (why) {
    const h = this.hero;
    if (h.sunk > 0 || this.dead || this.ended) return;
    this.lastFall = why; this.falls = (this.falls || 0) + 1;
    this.a2Splash(h.x, GY + 4, 1.6); SFX.play('splash'); this.shake(3, 160);
    this.a2Label(h.x, h.y - 40, t('a2_splash'));
    if (this.stats.swim_vest && !this.vestUsed) { this.vestUsed = true; UI.hud.toast(t('a2_vest'), 1800); }
    else if (this.shield > 0) { this.shield--; SFX.play('clang'); UI.hud.boonUsed(); this.time.delayedCall(450, () => { this.boonHud = null; }); this.a2LoseDuckling(); }
    else if (this.loseHeart(W.fall_in_damage)) return;
    h.sunk = W.respawn_s; h.duck = 0; h.vy = 0; h.grounded = true; h.hopBuf = 0; h.duckBuf = 0; h.kb = 0;
    h.spr.setVisible(false);
    if (Math.random() < 0.6) DOG.say(this, 'dog_a2_water', 1500, true);
  };
  P.a2Resurface = function () {
    const h = this.hero;
    this.heroSX = W.respawn_screen_x; h.x = this.camX + this.heroSX; h.y = GY; h.sunk = 0;
    h.inv = W.respawn_invuln_s; h.spr.setVisible(true); this.a2Splash(h.x, GY + 2, 1); SFX.play('djump');
  };
  P.a2LoseDuckling = function () {
    if (!this.duckling) return; const d = this.duckling; this.duckling = null;
    SFX.play('quack'); this.tweens.add({ targets: d, y: d.y - 30, alpha: 0, duration: 700, onComplete: () => d.destroy() });
  };
  P.a2ClampX = function (x) {
    const bs = this.boss;
    if (bs && bs.alive && !bs.entering && bs.state !== 'charge' && bs.state !== 'spin_tell') x = Math.min(x, bs.x - this.BB.hitbox[0] / 2 - 10);
    return x;
  };

  // ------------------------------------------------------------------ camera: the river carries you
  P.a2Camera = function (dt, maxX) {
    if (!this.water) return false;
    if (!this.dead && !this.ended && !this.cutscene && !this.lockOn) this.camX = Math.min(maxX, this.camX + this.currentAt(this.camX + this.heroSX) * dt);
    if (this.dockX) {   // the river ends at the jetty
      const ex = clamp(this.dockX + 72 - this.camX, 0, this.viewW);
      this.waterStrips.forEach(p => p.spr.setSize(ex, p.h));
    }
    return true;
  };

  // ------------------------------------------------------------------ per-frame extras (tells, lock, unfold, duckling)
  P.a2Update = function (dt) {
    const h = this.hero, cam = this.cameras.main, O = this.a2o;
    this.barkCd -= dt; this.dogCd -= dt;
    if (this.waterStrips) this.waterStrips[1].off = -this.time0 * 14;
    if (h.duck > 0 && !this.water) h.duck -= dt;
    // overhead warn band: dark shadow on the water; hazard orange from overhead_warn_s ahead
    const sp = Math.max(30, this.water ? this.currentAt(h.x) : Math.abs(h.vx));
    for (const o of O.overs) {
      const ts = (o.x0 - (h.x + HB_W / 2)) / sp, on = ts > 0 && ts < W.overhead_warn_s;
      if (on && !o.warned) { o.warned = true; SFX.play('warn'); }
      o.mark.setVisible(on && Math.floor(this.time0 * 6) % 2 === 0);
      o.band.setFillStyle(on ? ORANGE : INK, on ? 0.55 : 0.35);
    }
    // Wurst barks bark_lead_s before every threat (cosmetic)
    for (const th of O.threats) {
      if (th.barked) continue;
      const ts = (th.x - h.x) / sp;
      if (ts < W.bark_lead_s && ts > 0) { th.barked = true; this.a2Bark(th.kind === 'duck' ? 'duck' : null); }
    }
    // lock: the gate stops the camera; hold back until it opens
    if (this.water && !this.lockOn) {
      const L = O.locks.find(l => l.state === 'closed' && l.x - this.camX <= Math.min(this.viewW - 40, W.lock_gate_screen_x));
      if (L) { this.lockOn = L; L.state = 'hold'; L.t = L.hold; this.camX = L.x - Math.min(this.viewW - 40, W.lock_gate_screen_x); UI.hud.toast(t('sign_a2_lock'), 2200); SFX.play('warn'); this.a2Bark(); }
    }
    if (this.lockOn) {
      const L = this.lockOn;
      if (h.sunk <= 0 && !this.dead) L.t -= dt;
      if (L.t <= 0) { L.state = 'open'; L.spr.play('lock_open'); this.lockOn = null; UI.hud.toast(t('a2_lock_open'), 1800); SFX.play('item'); this.a2Splash(L.x, GY + 4, 1.4); }
    }
    // jetty -> unfold the bike (mixed missions)
    if (this.dockX && this.water && !this.cutscene && !this.dead && h.sunk <= 0 && h.x >= this.dockX - 24) this.startUnfold();
    // duckling (Entenkueken boon) paddles behind
    if (this.duckling) { this.duckling.x = Math.round(h.x - 30 + Math.sin(this.time0 * 4) * 2); this.duckling.y = Math.round((this.water ? GY + 1 : this.floorBelow(h.x - 30, h.y - 4)) || GY); this.duckling.setVisible(!(h.sunk > 0)); }
    // arc-2 projectiles leave the screen
    this.objs.lids.forEach(l => { if (l.alive && l.kind && (l.x < cam.scrollX - 24 || l.x > cam.scrollX + this.viewW + 60)) { l.alive = false; l.spr.destroy(); } });
  };
  P.a2Bark = function (kind) {
    if (this.barkCd > 0) return; this.barkCd = 0.8;
    SFX.play('bark');
    if (this.dogCd <= 0) { this.dogCd = 7; DOG.say(this, kind === 'duck' ? 'dog_a2_water' : 'dog_a2_bark', 900); }
  };

  // ------------------------------------------------------------------ unfold cutscene (3 taps or auto)
  P.startUnfold = function () {
    const h = this.hero;
    this.cutscene = { t: 0, taps: 0, done: false };
    h.duck = 0; h.vy = 0; h.y = GY; h.grounded = true; h.spr.setVisible(false); this.objs.bullets.forEach(b => b.spr.destroy()); this.objs.bullets = [];
    this.uf = this.add.sprite(this.dockX + 20, GY, 'fx_unfold', 0).setOrigin(0.5, 47 / 48).setDepth(25);
    this.ufBoard = this.add.image(this.dockX - 30, GY + 3, 'hero_sup', 0).setOrigin(0.5, 43 / 48).setDepth(12).setVisible(false);
    UI.hud.toast(t('a2_unfold'), 2600); SFX.play('item');
  };
  P.unfoldTap = function () {
    const c = this.cutscene; if (!c || c.done) return;
    c.taps++; SFX.play('clang'); this.shake(1, 60);
    this.uf.setFrame(Math.min(5, c.taps * 2 - 1)); this.spark(this.uf.x + 6, GY - 14);
    if (c.taps >= UF.taps && c.t >= UF.min_s) this.finishUnfold();
  };
  P.updateUnfold = function (dt) {
    const c = this.cutscene; if (!c || c.done) return;
    c.t += dt;
    const want = Math.min(5, Math.floor(c.t / UF.auto_s * 6));
    if (want > this.uf.frame.name && c.taps === 0) this.uf.setFrame(want);
    if ((c.taps >= UF.taps && c.t >= UF.min_s) || c.t >= UF.auto_s) this.finishUnfold();
  };
  P.finishUnfold = function () {
    const c = this.cutscene; c.done = true;
    const h = this.hero;
    this.uf.setFrame(5); SFX.play('wuff');
    DOG.say(this, 'dog_a2_bike', 1600, true);
    this.time.delayedCall(350, () => {
      this.uf.destroy(); this.cutscene = null;
      this.water = false; this.vehicle = 'bike';
      h.x = this.dockX + 20; h.y = GY; h.vx = 40; h.grounded = true; h.spr.setVisible(true);
      h.spr.setTexture('hero_bike', 0).setOrigin(0.5, 47 / 48); h.anim = ''; h.lastGround = h.x;
      this.camX = this.cameras.main.scrollX;
      UI.hud.toast(t('a2_unfold_done'), 1600);
    });
  };

  // ------------------------------------------------------------------ monsters
  P.a2Tell = function (e, ms) { if (!e.alert) e.alert = this.alertFx(e.x, e.y - e.h - 6); e.spr.setTint(ORANGE); this.time.delayedCall(ms || 120, () => e.alive && e.spr.clearTint()); };
  P.a2Enemy = function (e, d, dt, cam) {
    const h = this.hero, right = cam.scrollX + this.viewW + 24, tg = this.enemyTarget(e), dist = e.x - h.x;
    if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) e.spr.clearTint(); }
    e.t -= dt;
    const onScreen = e.x < cam.scrollX + this.viewW - 8;
    switch (e.type) {
      case 'schnorchel': {
        if (!e.active) { if (e.x < right) e.active = true; else return; }
        if (e.state === 'idle' && dist > 30 && dist < d.spit_range_px && onScreen && e.t <= 0) {
          e.state = 'tele'; e.t = Math.max(d.spit_telegraph_s, TL.min_s); e.spr.play('schnorchel_tell'); SFX.play('alert'); e.alert = this.alertFx(e.x, e.y - 24); e.spr.setTint(ORANGE);
        } else if (e.state === 'tele' && e.t <= 0) {
          e.state = 'idle'; e.t = d.spit_interval_s; e.spr.clearTint(); this.dropAlert(e);
          e.spr.play('schnorchel_spit'); e.spr.once('animationcomplete', () => e.alive && e.spr.play('schnorchel_swim'));
          this.a2Lob('spit', e.x - 6, e.y - 18, tg.x + tg.vx * d.spit_flight_s, h.y - 14, d.spit_flight_s, 400);
        }
        e.spr.y = Math.round(e.y + Math.sin(this.time0 * 3 + e.phase * 9) * 1);
        break;
      }
      case 'kanugans': {
        if (e.state === 'wait') {
          if (e.x - cam.scrollX < this.viewW + d.speed * d.tell_s + 60) {
            if (this.a2BellScare(e)) return;
            e.state = 'tell'; e.t = d.tell_s; SFX.play('honk'); this.a2Bark();
            e.alert = this.alertFx(cam.scrollX + this.viewW - 10, GY - 30); e.alertScreen = true;
            this.a2Label(cam.scrollX + this.viewW - 30, GY - 46, t('a2_honk'));
          }
          return;
        }
        if (e.state === 'tell') {
          if (e.alert) e.alert.setPosition(Math.round(cam.scrollX + this.viewW - 10), GY - 30);
          if (e.t <= 0) { this.dropAlert(e); e.state = 'swim'; e.active = true; e.x = Math.max(e.x, cam.scrollX + this.viewW + 26); e.spr.setVisible(true); e.spr.play('kanugans_paddle'); }
          return;
        }
        e.x -= d.speed * dt;
        e.spr.y = Math.round(e.y + Math.sin(this.time0 * 5 + e.phase * 7));
        break;
      }
      case 'hecht': {
        if (e.state === 'wait') {
          if (dist < d.trigger_ahead_px + 40 && !this.lockOn) {
            const lead = Math.max(d.tell_s, TL.min_s);
            e.x = h.x + Math.max(40, (this.water ? this.currentAt(h.x) : 80) * lead);
            e.state = 'fin'; e.t = lead; e.spr.setVisible(true); e.spr.play('hecht_fin'); e.spr.setTint(ORANGE);
            e.alert = this.alertFx(e.x, GY - 18); SFX.play('alert'); this.a2Bark();
          }
          return;
        }
        if (e.state === 'fin' && e.t <= 0) {
          e.state = 'lunge'; e.t = d.lunge_s; e.active = true; e.spr.clearTint(); this.dropAlert(e); e.spr.play('hecht_lunge'); SFX.play('splash'); this.a2Splash(e.x, GY + 2, 1);
          e.box = { x0: e.x - d.lunge_w_px / 2, x1: e.x + d.lunge_w_px / 2, y0: GY - d.lunge_h_px, y1: GY };
        } else if (e.state === 'lunge') {
          const u = 1 - e.t / d.lunge_s;
          e.spr.y = Math.round(GY + 2 - Math.sin(Math.PI * clamp(u, 0, 1)) * d.lunge_h_px * 0.8);
          if (e.t <= 0) {
            e.box = null; e.active = false; e.lunges++; this.a2Splash(e.x, GY + 2, 1);
            if (e.lunges < (d.lunges || 1)) { e.state = 'wait'; e.spr.setVisible(false); e.x = h.x + d.trigger_ahead_px + 120; }
            else { e.alive = false; e.spr.destroy(); return; }
          }
        }
        break;
      }
      case 'treibgut': {
        if (!e.active) { if (e.x < right) e.active = true; else return; }
        e.x += (d.drift_px_s || 20) * dt;
        if (!e.sang && dist < 200 && dist > 0) { e.sang = true; e.spr.play('treibgut_sing'); SFX.play('creak'); this.a2Tell(e, d.sing_tell_s * 1000); this.time.delayedCall(d.sing_tell_s * 1000, () => { if (e.alive) { this.dropAlert(e); e.spr.play('treibgut_bob'); } }); }
        e.spr.y = Math.round(e.y + Math.sin(this.time0 * 2 + e.phase * 5));
        break;
      }
      case 'schlamm': {
        if (e.state === 'hidden') {
          if (dist > 0 && dist < d.trigger_ahead_px) { e.state = 'bubble'; e.t = Math.max(d.bubble_s, TL.min_s); e.spr.setVisible(true); e.spr.play('schlamm_bubble'); e.alert = this.alertFx(e.x, GY - 22); SFX.play('growl'); e.spr.setTint(ORANGE); }
          return;
        }
        if (e.state === 'bubble' && e.t <= 0) { e.state = 'rise'; e.t = d.rise_s; e.spr.clearTint(); this.dropAlert(e); e.spr.play('schlamm_rise'); e.active = true; }
        else if (e.state === 'rise' && e.t <= 0) { e.state = 'up'; e.t = 0.3; }
        else if (e.state === 'up' && e.t <= 0 && dist > 20 && onScreen) { e.state = 'aim'; e.t = TL.min_s; this.a2Tell(e, 500); SFX.play('warn'); }
        else if (e.state === 'aim' && e.t <= 0) {
          e.state = 'up'; e.t = d.throw_interval_s; this.dropAlert(e);
          e.spr.play('schlamm_throw');
          // flat throw at chest height: duck under it or hop over it
          const f = d.mud_flight_s, sx = e.x - 6, sy = GY - 28, tx = tg.x + tg.vx * f;
          this.a2Lob('mud', sx, sy, tx, sy, f, 60);
        }
        break;
      }
      case 'kraehe': {
        const g = e.grp;
        if (g.state === 'wait') {
          if (e === g.lead && e.x < cam.scrollX + this.viewW + 40) {
            if (this.a2BellScare(e)) { g.state = 'flee'; return; }
            g.state = 'tell'; g.t = Math.max(d.tell_s, TL.min_s); SFX.play('caw'); this.a2Bark(); g.alertX = 0;
            g.alert = this.alertFx(cam.scrollX + this.viewW - 10, e.cy0 - 6);
            this.a2Label(cam.scrollX + this.viewW - 34, e.cy0 - 18, t('a2_caw'));
          }
          return;
        }
        if (g.state === 'tell') {
          if (e === g.lead) { g.t -= dt; if (g.alert) g.alert.setPosition(Math.round(cam.scrollX + this.viewW - 10), Math.round(e.cy0 - 6)); if (g.t <= 0) { g.state = 'fly'; if (g.alert) { g.alert.destroy(); g.alert = null; } } }
          return;
        }
        if (g.state === 'flee') { e.cy0 -= 90 * dt; e.x += 40 * dt; e.spr.setPosition(Math.round(e.x), Math.round(e.cy0)); if (e.cy0 < -20) { e.alive = false; e.spr.destroy(); } return; }
        e.active = true;
        if (e.x > cam.scrollX + this.viewW + 20 && e.gi > 0 && !e.entered) e.x = Math.min(e.x, cam.scrollX + this.viewW + 20 + e.gi * d.group_spacing_px);
        e.entered = true;
        e.x -= d.speed * dt;
        const cy = e.cy0 + Math.sin(this.time0 * d.sine_hz * Math.PI * 2 + e.gi) * d.sine_amp_px;
        e.y = cy + e.h / 2; e.spr.setPosition(Math.round(e.x), Math.round(cy));
        break;
      }
      case 'marktschreier': {
        if (!e.active) { if (e.x < right) e.active = true; else return; }
        if (e.state === 'idle' && dist > 40 && dist < d.trigger_ahead_px && onScreen && e.t <= 0) {
          e.state = 'tele'; e.t = Math.max(d.shout_tell_s, TL.min_s); e.spr.play('markt_shout'); SFX.play('honk'); e.alert = this.alertFx(e.x - 10, e.y - e.h - 4); e.spr.setTint(ORANGE);
          this.a2Label(e.x - 8, e.y - e.h - 14, t('a2_frisch'));
        } else if (e.state === 'tele' && e.t <= 0) {
          e.state = 'idle'; e.t = d.throw_interval_s; e.spr.clearTint(); this.dropAlert(e);
          e.spr.play('markt_throw'); e.spr.once('animationcomplete', () => e.alive && e.spr.play('markt_idle'));
          const f = d.cabbage_flight_s, px = tg.x + tg.vx * f;
          [-1, 0, 1].forEach(k => this.a2Lob('cabbage', e.x - 18, e.y - 34, px + k * d.cabbage_spread_px, h.y - 14, f, 400));
          SFX.play('throw');
        }
        break;
      }
    }
    if (e.type !== 'kraehe' && e.type !== 'hecht') e.spr.x = Math.round(e.x);
    if (e.type === 'hecht' && e.spr.active) e.spr.x = Math.round(e.x);
    if (e.alert && !e.alertScreen && e.type !== 'hecht') e.alert.setPosition(Math.round(e.x), Math.round(e.y - e.h - 6));
    if (e.alive && (e.x < cam.scrollX - 80)) { e.alive = false; e.spr.destroy(); this.dropFx(e); }
  };
  // Klingel (kiosk): once per mission, the next crow swarm or Kanugans gets rung away
  P.a2BellScare = function (e) {
    if (!this.stats.bell || this.bellUsed) return false;
    this.bellUsed = true; SFX.play('bell'); UI.hud.toast(t('a2_bell'), 1600);
    if (e.type === 'kanugans') { e.alive = false; e.spr.destroy(); }
    return true;
  };
  // contact rules per monster; returning false skips the generic stomp / hurt check
  P.a2Contact = function (e, hb) {
    const h = this.hero, d = EN[e.type];
    if (d.contact_damage === 0) return false;
    if (e.type === 'kanugans' && e.state !== 'swim') return false;
    if (e.type === 'hecht') { if (e.state !== 'lunge' || !e.box) return false; if (this.overlap(hb, e.box)) this.hurtHero(); return false; }
    if (e.type === 'schlamm' && (e.state === 'hidden' || e.state === 'bubble')) return false;
    if (e.type === 'kraehe') {
      const eb = { x0: e.x - e.w / 2, x1: e.x + e.w / 2, y0: e.y - e.h, y1: e.y };
      if (!this.overlap(hb, eb)) return false;
      if (h.slamming || (h.vy > 0 && !h.grounded)) { this.killEnemy(e); SFX.play('stomp'); return false; }
    }
    if (h.sunk > 0) return false;
    return true;
  };
  P.a2Lob = function (kind, sx, sy, tx, ty, f, g) {
    const frame = { mud: 0, cabbage: 2, can: 4, spit: 6, stone: 8 }[kind] || 0;
    const l = { x: sx, y: sy, vx: (tx - sx) / f, vy: (ty - sy - 0.5 * g * f * f) / f, g, alive: true, hp: 1, kind, spr: this.add.sprite(sx, sy, 'proj_arc2', frame).setDepth(30) };
    l.spr.play('proj_' + kind); SFX.play('throw');
    this.objs.lids.push(l);
    return l;
  };
  P.a2KillProj = function (l) {
    if (this.water && l.y >= GY - 6) this.a2Splash(l.x, GY + 2, 0.5); else this.poof(l.x, l.y - 4);
    l.spr.destroy(); SFX.play(l.kind === 'cabbage' ? 'crate' : 'land');
  };
  P.a2KillCan = function (f, shot) {
    if (f.spr) {
      if (shot) { for (let i = 0; i < (f.a.pfand || 1); i++) this.addPickup('bottle', f.x, f.y - 10, true); this.sparkle(f.x, f.y - 8, 0xf6f2e8); SFX.play('pickup'); }
      else { this.poof(f.x, f.y - 4); SFX.play('crate'); }
      f.spr.destroy();
    }
  };
  P.a2Muzzles = function () {
    const h = this.hero, low = h.duck > 0 ? 6 : 0;
    if (this.vehicle === 'sup') return [[h.x + 28, h.y - 11 + low], [h.x + 28, h.y - 8 + low]];
    return [[h.x + 19, h.y - 26 + low], [h.x + 19, h.y - 22 + low]];
  };

  // ------------------------------------------------------------------ hero drawing
  P.a2DrawHero = function (dt) {
    const h = this.hero, s = h.spr, sup = this.vehicle === 'sup';
    if (this.cutscene) return;
    let anim;
    if (sup) {
      if (this.dead || h.kb > 0) anim = 'sup_hurt';
      else if (this.ended) anim = 'sup_celebrate';
      else if (h.duck > 0) anim = 'sup_duck';
      else if (!h.grounded) anim = 'sup_hop';
      else if (INPUT.brake) anim = 'sup_back';
      else anim = 'sup_paddle';
    } else {
      if (this.dead || h.kb > 0) anim = 'bike_hurt';
      else if (this.ended && h.grounded) anim = 'bike_celebrate';
      else if (h.slamming) anim = 'bike_slam';
      else if (!h.grounded) anim = 'bike_jump';
      else if (INPUT.brake && h.vx < BK.run_speed * 0.8) anim = 'bike_brake';
      else anim = 'bike_ride';
    }
    if (h.anim !== anim) { h.anim = anim; s.play(anim); }
    if (h.recoil > 0) h.recoil -= dt;
    const bob = sup && h.grounded && !this.dead ? Math.round(Math.sin(this.time0 * 3)) : 0;
    s.x = Math.round(h.x - (h.recoil > 0 ? 1 : 0)); s.y = Math.round(h.y + bob);
    s.setScale(1, !sup && h.duck > 0 ? 0.8 : 1);
    s.setVisible(!(h.sunk > 0));
    s.setAlpha(h.inv > 0 && !this.dead ? (Math.floor(h.inv * PL.blink_hz * 2) % 2 ? 0.35 : 1) : 1);
  };

  // ------------------------------------------------------------------ juice
  P.a2Splash = function (x, y, sc) {
    const s = this.add.sprite(Math.round(x), Math.round(y), 'fx_splash', 0).setOrigin(0.5, 1).setDepth(34).setScale(sc || 1);
    s.play('splash'); s.once('animationcomplete', () => s.destroy());
  };
  P.a2Label = function (x, y, txt) {
    const l = this.add.text(Math.round(x), Math.round(y), txt, FONT).setOrigin(0.5).setDepth(50).setAngle(-6);
    this.tweens.add({ targets: l, y: l.y - 14, alpha: 0, duration: 800, delay: 300, onComplete: () => l.destroy() });
  };
  P.a2Win = function () { if (this.duckling) SFX.play('quack'); };
})();
