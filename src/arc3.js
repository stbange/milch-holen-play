// ARC 3 "Hoch hinaus" (missions 11-15): the Doppeldecker flight to Bavaria. Mixed into the Play scene
// (src/play.js calls a3Create / a3Update only when the level has arc: 3), so arcs 1 and 2 run as before.
// The rules live in src/logic/flight.js (MH.flight); this file only builds sprites and draws.
// Numbers come from tuning.arc3 / tuning.enemies (a3: true) / tuning.boss_zeppelin. Monster sprites face LEFT.
(function () {
  const P = window.PlayScene.prototype, G = window.GAME_DATA, T = G.tuning;
  const { TILE, clamp } = window.PlayScene.consts();
  const A3 = T.arc3, FL = A3.flight, EN = T.enemies, GUN = T.gun, SP = T.special, PK = T.pickups;
  const F = window.MH.flight, BL = window.MH.boss;
  const t = (k, v) => I18N.t(k, v);
  const ORANGE = 0xff7a1a, INK = 0x1a1426, BLINK_S = 1.2;
  const FONT = { fontFamily: '"Pixelify Sans", Pixelify, sans-serif', fontSize: '10px', color: '#ff7a1a', stroke: '#1a1426', strokeThickness: 3 };
  const HW = FL.hurtbox[0] / 2, HH = FL.hurtbox[1] / 2;
  const PROJ = { sandsack: ['p3_sandsack', 6], hagel: ['p3_hagel', 4], note: ['p3_note', 5], brezel: ['p3_brezel', 6], deckel: ['p3_deckel', 6], fass: ['p3_fass', 7] };
  const DOG_LINE = { l11_abflug: 'dog_a3_fly', l13_gewitter: 'dog_a3_storm', l14_alpen: 'dog_a3_alps' };

  // ------------------------------------------------------------------ setup
  P.a3Create = function () {
    const L = this.L;
    this.vehicle = 'plane'; this.W = 100000; this.camX = 0;
    this.scroll = F.scrollSpeed(L, FL, false, this.BB);
    this.plane = F.newPlane(FL);
    this.mods = F.planeMods(FL, SAVE.data.upgrades, this.stats, this.boon);
    this.drag = { sid: -1, last: 0 };
    this.a3o = { enemies: [], proj: [], zones: [], bombs: [], told: new Set() };
    this.objs = { enemies: this.a3o.enemies, bullets: [], pickups: [], lids: [], pots: [], drops: [], waves: [], files: [], knoedels: [], scherben: [], signs: [] };
    this.barkCd = 0; this.cow = null; this.items = null;
    // background: sky, far, mid (parallax) and the near ground strip
    const sc = L.scenery || 'sauerland', key = k => 'a3_px_' + sc + '_' + k;
    this.parallax = [];
    [['sky', 0.05], ['far', 0.2], ['mid', 0.45]].forEach(([k, f], i) => this.parallax.push({ spr: this.add.tileSprite(0, 0, this.viewW, 216, key(k)).setOrigin(0).setScrollFactor(0).setDepth(i), f }));
    this.parallax.push({ spr: this.add.tileSprite(0, 188, this.viewW, 28, key('near')).setOrigin(0).setScrollFactor(0).setDepth(20), f: 1, h: 28 });
    // terrain (drawn to the boxes of tuning.arc3.terrain)
    this.boxes = F.terrainBoxes(L.hazards, A3.terrain, TILE);
    for (const h of L.hazards || []) {
      if (h.type !== 'terrain' || !A3.terrain[h.kind]) continue;
      const top = !!A3.terrain[h.kind].top, k = 'a3_t_' + h.kind;
      const s = this.add.sprite(h.x * TILE, top ? (h.dy || 0) : 216 + (h.dy || 0), k, 0).setOrigin(0.5, top ? 0 : 1).setDepth(12);
      const an = { windrad: 'windrad_spin', riesenrad: 'riesenrad_spin', wolkenturm: 'wolkenturm_idle' }[h.kind];
      if (an) s.play(an);
    }
    this.boes = F.boeZones(L.hazards, TILE);
    // bottles and the Lebkuchenherz
    for (const pk of L.pickups || []) {
      for (const [x, y] of F.bottleLayout(pk, TILE)) {
        const fr = window.pickupFrame(pk.type);
        const spr = this.add.sprite(x, y, fr.key, fr.frame).setDepth(22);
        this.objs.pickups.push({ type: pk.type, x, y, spr, alive: true, mag: false });
      }
    }
    // monsters wait for their trigger
    for (const e of L.enemies || []) this.a3o.enemies.push({ type: e.type, def: EN[e.type], lx: e.x, ly: e.y, count: e.count || 1, state: 'wait', alive: true, active: false });
    for (const s of L.signs || []) this.objs.signs.push({ x: s.x * TILE, key: s.text_key });
    // the plane (Wurst sits in the back seat, drawn in the sheet)
    const spr = this.add.sprite(FL.hero_screen_x, FL.y_start, 'hero_plane', 0).setDepth(35);
    spr.play('plane_fly');
    this.hero = { x: FL.hero_screen_x, y: FL.y_start, vx: 0, vy: 0, inv: 0, fire: 0, spr, grounded: false };
    this.g3 = this.add.graphics().setDepth(45);
    this.tellTexts = [];
    INPUT.mode = 'flight';
    const dl = DOG_LINE[L.id];
    if (dl) this.time.delayedCall(1500, () => !this.dead && DOG.say(this, dl, 2400, true));
  };

  // ------------------------------------------------------------------ per frame
  P.a3Update = function (dt) {
    const p = this.plane, h = this.hero, O = this.a3o, alive = !this.dead && !this.ended;
    if (alive) this.a3Input();
    if (this.L.mode === 'flight_boss' && !this.arenaOn && h.x >= this.L.arena_start_x * TILE) this.a3Arena();
    const speed = this.scroll = F.scrollSpeed(this.L, FL, this.arenaOn, this.BB);
    if (!this.dead) this.camX += speed * dt;
    if (alive) {
      p.ty += F.dragDelta(this.drag, INPUT.flight);
      F.steer(p, dt, FL, this.mods, INPUT.keyDir, INPUT.brake);
      if (!p.bounce) { const g = F.boeAt(this.boes, h.x, A3.boe, speed); if (g.push) { p.y = clamp(p.y + g.push * dt, FL.y_min, FL.y_max); p.ty = clamp(p.ty + g.push * dt, FL.y_min, FL.y_max); } }
    } else if (this.dead) { p.y = Math.min(FL.ground_y, p.y + 110 * dt); }
    else { p.sx += FL.win_fly_px_s * dt; p.y += (Math.min(p.y, 90) - p.y) * Math.min(1, dt * 2); }
    h.x = this.camX + p.sx; h.y = p.y;
    h.inv = Math.max(0, h.inv - dt);
    this.barkCd -= dt;
    this.cameras.main.scrollX = this.camX;
    this.a3Enemies(dt);
    this.a3Boss(dt);
    this.a3Projectiles(dt);
    this.a3Gun(dt);
    this.updateBullets3(dt);
    this.a3Bombs(dt);
    this.a3Pickups(dt);
    this.updateSignsEvents();
    if (!this.dead && !this.ended) { this.a3Contacts(); this.a3Win(); }
    this.refreshHud();
    this.a3Draw(dt);
    DOG.update(this, dt);
    const sx = this.camX;
    this.parallax.forEach(q => { q.spr.tilePositionX = Math.round(sx * q.f); });
  };

  P.a3Input = function () {
    const p = this.plane;
    for (const ev of INPUT.queue.splice(0)) {
      if (ev.type === 'loop' && F.tryLoop(p, FL, this.mods)) { SFX.play('djump'); if (Math.random() < 0.3) DOG.say(this, 'dog_a3_loop', 1400); }
      if (ev.type === 'dive' && F.tryDive(p, FL)) SFX.play('slam');
    }
  };

  // ------------------------------------------------------------------ monsters
  const screenOf = (sc, x) => x - sc.camX;
  P.a3Spawn = function (e, x, y) {
    const d = e.def, an = d.sprite === 'a3_kiste' ? 'kiste' : e.type;
    e.x = x; e.y = y; e.hp = d.hp; e.w = d.hitbox[0]; e.h = d.hitbox[1]; e.vx = 0; e.vy = 0; e.t = 0; e.active = true; e.ground = !!d.ground;
    e.spr = this.add.sprite(x, y, d.sprite, 0).setDepth(25);
    e.anim = an; e.spr.play(an === 'kiste' ? 'kiste_fall' : an + '_fly');
    return e;
  };
  P.a3Tell = function (e, x, y) {
    const d = e.def;
    if (this.barkCd <= 0 && d.tell_text) {
      this.barkCd = 2.5;
      this.time.delayedCall(F.barkAt(d, A3) * 1000, () => !this.dead && DOG.say(this, 'dog_a3_bark', 1100));
    }
    if (d.tell_text && !this.a3o.told.has(e.type)) {
      this.a3o.told.add(e.type);
      const tx = this.add.text(x, y - 14, t(d.tell_text), FONT).setOrigin(0.5, 1).setDepth(46);
      this.tweens.add({ targets: tx, alpha: 0, delay: 1100, duration: 400, onComplete: () => tx.destroy() });
      this.tellTexts.push({ tx, e });
    }
    SFX.play('alert');
  };
  P.a3Enemies = function (dt) {
    const O = this.a3o, h = this.hero, p = this.plane, vw = this.viewW, cam = this.camX, sp = this.scroll;
    const list = O.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i], d = e.def; if (!e.alive || !d) continue;
      const tellS = F.tellTime(d, A3);
      if (e.state === 'wait') {
        if (this.dead || this.ended) continue;
        if (d.spawn !== 'edge') { if (e.lx * TILE < cam + vw + 60) this.a3Place(e); continue; }
        if (!F.triggered({ x: e.lx }, d, cam + sp * tellS, vw, p.sx, TILE)) continue;
        e.state = 'tell'; e.tt = tellS; e.t = 0;
        e.laneY = e.type === 'adler' ? clamp(p.y, FL.y_min + 8, FL.y_max - 8) : e.ly;
        // the edge group: one entry per bird, all pinned just off the right edge until the tell ends
        for (let k = 0; k < e.count; k++) {
          const m = this.a3Spawn({ type: e.type, def: d, alive: true, state: 'tell', k }, cam + vw + 14 + k * (d.group_spacing_px || 0), e.laneY);
          m.spr.setVisible(false); m.tt = tellS; m.off = 14 + k * (d.group_spacing_px || 0); list.push(m);
        }
        e.alive = false;    // the group record is done; the members live on
        this.a3Tell(e, cam + vw - A3.enemy_tell_screen_x, e.laneY);
        continue;
      }
      if (e.state === 'idle_wait' && e.active && !this.dead && !this.ended && F.triggered({ x: e.lx }, d, cam, vw, p.sx, TILE)) this.a3Begin(e, tellS);
      if (!e.active) continue;
      e.t += dt;
      const ex = screenOf(this, e.x);
      if (e.state === 'dying') continue;
      if (ex < -80 || e.y > 260 || e.y < -80) { this.a3Remove(e); continue; }
      switch (e.type) {
        case 'taube': case 'adler': case 'drohne': {
          if (e.state === 'tell') { e.x = cam + vw + e.off; e.tt -= dt; if (e.tt <= 0) { e.state = 'go'; e.spr.setVisible(true); e.y0 = e.y; e.vx = -(e.type === 'taube' ? d.speed : e.type === 'adler' ? d.swoop_px_s : d.dash_px_s); if (e.type === 'adler') e.spr.play('adler_swoop'); if (e.type === 'drohne') SFX.play('growl'); } break; }
          e.x += e.vx * dt;
          if (e.type === 'taube') e.y = e.y0 + d.sine_amp_px * Math.sin(e.t * d.sine_hz * 2 * Math.PI + e.k);
          break;
        }
        case 'ballon': {
          if (e.state === 'tell') { e.tt -= dt; if (e.tt <= 0) { this.a3Shot('sandsack', e.x, e.y + e.h / 2, 0, d.drop_speed, 0); e.drops = (e.drops || 0) + 1; e.state = e.drops < d.drops ? 'rest' : 'done'; e.rt = d.redrop_s; e.spr.play('ballon_fly'); } }
          else if (e.state === 'rest') { e.rt -= dt; if (e.rt <= 0 && ex > p.sx + 30) { e.state = 'tell'; e.tt = tellS; e.spr.play('ballon_tell'); } }
          e.y = e.ly + 2 * Math.sin(e.t * 2);
          break;
        }
        case 'fallschirm': case 'kiste': {
          if (e.state === 'tell') { e.tt -= dt; if (e.tt <= 0) { e.state = 'go'; e.spr.setVisible(true); e.spr.play(e.anim === 'kiste' ? 'kiste_fall' : 'fallschirm_fly'); } break; }
          if (e.state !== 'go') break;
          e.y += d.fall_px_s * dt; e.x = e.x0 + (d.sway_px || 3) * Math.sin(e.t * 1.6);
          break;
        }
        case 'lampion': {
          if (e.state === 'tell') { e.tt -= dt; if (e.tt <= 0) { e.state = 'go'; e.spr.play('lampion_fly'); } break; }
          if (e.state !== 'go') break;
          e.y -= d.rise_px_s * dt; e.x = e.x0 + 4 * Math.sin(e.t * 2);
          break;
        }
        case 'blitz': case 'hagelgeist': case 'jodler': case 'brezelwerfer': {
          e.y = e.ground ? e.y : e.ly + 3 * Math.sin(e.t * 1.5);
          if (ex < p.sx + 8 && e.state !== 'fire') { if (e.state === 'tell') { e.state = 'idle'; e.spr.play(e.anim + '_fly'); } break; }   // behind the plane: no more attacks
          if (e.state === 'idle_wait') break;
          if (e.state === 'idle') { e.it -= dt; if (e.it <= 0 && ex < vw - 10) { e.state = 'tell'; e.tt = tellS; e.spr.play(e.anim + '_tell'); this.a3Tell(e, e.x, e.y - e.h / 2); this.a3Aim(e); } break; }
          if (e.state === 'tell') { e.tt -= dt; if (e.type === 'hagelgeist') this.a3Aim(e); if (e.tt <= 0) this.a3Fire(e); break; }
          if (e.state === 'fire') { e.bt -= dt; if (e.bt <= 0) { e.state = 'idle'; e.it = d.interval_s - tellS; e.spr.play(e.anim + '_fly'); this.a3o.zones = this.a3o.zones.filter(z => z.src !== e); } }
          break;
        }
      }
      e.spr.setPosition(Math.round(e.x), Math.round(e.y));
    }
    O.enemies = list.filter(e => e.alive || e.state === 'dying');
    this.objs.enemies = O.enemies;
  };
  P.a3Begin = function (e, tellS) {
    e.state = 'tell'; e.tt = tellS;
    if (e.anim !== 'kiste' && e.type !== 'fallschirm') e.spr.play(e.anim + '_tell');
    if (e.type === 'blitz' || e.type === 'hagelgeist' || e.type === 'jodler' || e.type === 'brezelwerfer') this.a3Aim(e);
    if (e.def.tell_text) this.a3Tell(e, e.x, e.type === 'fallschirm' ? 26 : e.y - e.h / 2);
  };
  // world monsters appear in place (still idle) as they scroll in
  P.a3Place = function (e) {
    const d = e.def, x = e.lx * TILE + 8;
    let y = e.ly;
    if (d.ground) y = FL.ground_y - d.hitbox[1] / 2 + 2;
    if (e.type === 'fallschirm' || e.type === 'kiste') y = -24;
    if (e.type === 'lampion') y = FL.ground_y - 6;
    this.a3Spawn(e, x, y);
    e.x0 = x; e.state = 'idle_wait'; e.it = 0;
    if (e.type === 'fallschirm' || e.type === 'kiste') e.spr.setVisible(false);
  };
  P.a3Aim = function (e) {
    const p = this.plane, d = e.def;
    if (e.type === 'hagelgeist') e.aim = F.aim(e.x, e.y, this.hero.x + this.scroll * 0.3, p.y);
    if (e.type === 'brezelwerfer') e.target = { x: this.hero.x + this.scroll * (F.tellTime(d, A3) + d.flight_s), y: p.y };
    if (e.type === 'blitz') e.beamX = e.x;
  };
  P.a3Fire = function (e) {
    const d = e.def; e.state = 'fire'; e.bt = 0.3;
    if (e.type === 'blitz') {
      e.bt = d.beam_s; e.spr.play('blitz_fire'); SFX.play('stamp'); this.shake(2, 120);
      this.a3o.zones.push({ kind: 'beam', src: e, x0: e.x - d.beam_half_px, x1: e.x + d.beam_half_px, y0: e.y + e.h / 2, y1: FL.ground_y + 12, life: d.beam_s, world: true });
    } else if (e.type === 'hagelgeist') {
      F.fan(e.aim, d.pellets, d.spread_deg).forEach(a => this.a3Shot('hagel', e.x - 6, e.y, Math.cos(a) * d.pellet_px_s + this.scroll, Math.sin(a) * d.pellet_px_s, 0, d.pellet_hp));
      SFX.play('throw');
    } else if (e.type === 'jodler') {
      F.fanDeg(d.fan_deg).forEach(v => this.a3Shot('note', e.x - 6, e.y - 8, v.cx * d.note_px_s + this.scroll, v.cy * d.note_px_s, 0, d.note_hp));
      SFX.play('yap');
    } else if (e.type === 'brezelwerfer') {
      const v = F.lob(e.x - 6, e.y - 10, e.target.x, e.target.y, d.flight_s, d.gravity);
      this.a3Shot('brezel', e.x - 6, e.y - 10, v.vx, v.vy, d.gravity, d.brezel_hp, d.flight_s + 1.2);
      SFX.play('throw'); e.target = null;
    }
  };
  P.a3Shot = function (kind, x, y, vx, vy, g, hp, life) {
    const [anim, r] = PROJ[kind];
    const spr = this.add.sprite(x, y, 'proj_arc3', 0).setDepth(30); spr.play(anim);
    const s = { kind, x, y, vx, vy, g: g || 0, r, hp: hp || 0, life: life || 6, spr, alive: true };
    this.a3o.proj.push(s); return s;
  };
  P.a3Remove = function (e) { e.alive = false; e.active = false; if (e.spr) e.spr.destroy(); this.a3o.zones = this.a3o.zones.filter(z => z.src !== e); };
  P.a3Damage = function (e, dmg) {
    if (!e.alive || e.state === 'dying' || e.state === 'wait') return;
    e.hp -= dmg; this.flash(e.spr);
    if (e.hp > 0) { SFX.play('hit'); return; }
    this.a3Kill(e);
  };
  P.a3Kill = function (e) {
    const d = e.def; e.alive = false; e.state = 'dying'; e.active = false;
    this.a3o.zones = this.a3o.zones.filter(z => z.src !== e);
    this.charge += SP.charge_per_kill;
    SFX.play('poof'); this.cloud(e.x, e.y);
    for (let i = 0; i < (d.bottle_drop || 0); i++) this.a3Bottle(e.x + i * 6 - 3, e.y, true);
    const s = e.spr;
    if (e.anim === 'kiste') { s.destroy(); e.state = 'gone'; return; }
    s.play(e.anim + '_defeat');
    this.tweens.add({ targets: s, y: s.y + 40, alpha: 0, angle: 40, duration: 600, onComplete: () => { s.destroy(); e.state = 'gone'; } });
  };
  P.a3Bottle = function (x, y, mag) {
    const fr = window.pickupFrame('bottle');
    const spr = this.add.sprite(x, y, fr.key, fr.frame).setDepth(22);
    const pk = { type: 'bottle', x, y, spr, alive: true, mag: !!mag };
    this.objs.pickups.push(pk); return pk;
  };
  P.cloud = function (x, y) { const c = this.add.sprite(x, y, 'fx_cloudpuff', 0).setDepth(34); c.play('cloudpuff'); c.once('animationcomplete', () => c.destroy()); };

  // ------------------------------------------------------------------ projectiles + zones
  P.a3Projectiles = function (dt) {
    const O = this.a3o;
    for (const s of O.proj) {
      if (!s.alive) continue;
      s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      const sx = s.x - this.camX;
      if (s.life <= 0 || s.y > 230 || s.y < -60 || sx < -40 || sx > this.viewW + 80) { s.alive = false; s.spr.destroy(); continue; }
      s.spr.setPosition(Math.round(s.x), Math.round(s.y));
    }
    O.proj = O.proj.filter(s => s.alive);
    for (const z of O.zones) {
      z.life -= dt;
      if (z.kind === 'wave') { z.sx -= z.speed * dt; z.x0 = this.camX + z.sx - 24; z.x1 = this.camX + z.sx + 24; z.spr.setPosition(Math.round(this.camX + z.sx), (z.y0 + z.y1) / 2); if (z.sx < -60) z.life = 0; }
      if (z.life <= 0 && z.spr) z.spr.destroy();
    }
    O.zones = O.zones.filter(z => z.life > 0);
  };
  P.killShot = function (s) { s.alive = false; this.spark(s.x, s.y); s.spr.destroy(); };

  // ------------------------------------------------------------------ guns (auto-fire forward)
  P.a3Target = function (mx, my) {
    const cone = (GUN.auto_target_cone_deg / 2) * Math.PI / 180, R = FL.gun_range_px;
    const ok = (x, y, r) => { const dx = x - mx; if (dx < 6 || dx > R) return false; return Math.abs(Math.atan2(y - my, dx)) <= cone + Math.atan2(r || 0, dx); };
    let best = null, bd = 1e9;
    for (const s of this.a3o.proj) if (s.alive && s.hp > 0 && Math.hypot(s.x - mx, s.y - my) < GUN.projectile_priority_range && ok(s.x, s.y, s.r)) { const dd = Math.hypot(s.x - mx, s.y - my); if (dd < bd) { bd = dd; best = s; } }
    if (best) return best;
    for (const e of this.a3o.enemies) if (e.alive && e.active && e.spr && e.spr.visible && e.state !== 'dying' && ok(e.x, e.y, e.h / 2)) { const dd = e.x - mx + Math.abs(e.y - my) * 2; if (dd < bd) { bd = dd; best = e; } }
    const bs = this.boss;
    if (!best && bs && bs.alive && !bs.entering && ok(bs.x, bs.y, this.BB.hitbox[1] / 2)) best = { x: bs.x, y: clamp(my, bs.y - this.BB.hitbox[1] / 2 + 4, bs.y + this.BB.hitbox[1] / 2 - 4) };
    return best;
  };
  P.a3Gun = function (dt) {
    const h = this.hero, p = this.plane;
    h.fire -= dt;
    if (this.dead || this.ended || h.fire > 0 || p.loopT > 0) return;
    const lift = F.loopPose(p, FL).lift, mx = h.x + FL.muzzle[0], my = p.y - lift + FL.muzzle[1];
    const tg = this.a3Target(mx, my);
    if (!tg) { h.fire = 0.05; return; }
    h.fire = 1 / this.stats.fire_rate_per_s;
    const base = Math.atan2(tg.y - my, tg.x - mx), sp = GUN.bullet_speed;
    [0].concat(this.stats.extra_bullet_angles_deg).forEach(deg => {
      const a = base + deg * Math.PI / 180;
      const spr = this.add.sprite(mx, my, 'fx_bullet', 0).setDepth(32).setRotation(a); spr.play('bullet_fly');
      this.objs.bullets.push({ x: mx, y: my, vx: Math.cos(a) * sp + this.scroll, vy: Math.sin(a) * sp, life: FL.gun_range_px / sp, spr, alive: true });
    });
    h.spr.play('plane_shoot', true); h.spr.once('animationcomplete', () => h.spr.active && !this.dead && h.spr.play('plane_fly'));
    SFX.play('shoot');
  };
  P.updateBullets3 = function (dt) {
    const hb = GUN.bullet_hitbox_px / 2, bonus = GUN.enemy_hitbox_bonus_px, BB = this.BB;
    for (const b of this.objs.bullets) {
      if (!b.alive) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      b.spr.setPosition(Math.round(b.x), Math.round(b.y));
      const hit = () => { b.alive = false; b.spr.setRotation(0); b.spr.play('bullet_hit'); b.spr.once('animationcomplete', () => b.spr.destroy()); };
      if (b.life <= 0) { b.alive = false; b.spr.destroy(); continue; }
      if (F.hitBox(this.boxes, b.x, b.y, hb, hb)) { hit(); continue; }
      let done = false;
      for (const s of this.a3o.proj) if (s.alive && s.hp > 0 && Math.hypot(s.x - b.x, s.y - b.y) < s.r + hb + bonus) { if (--s.hp <= 0) this.killShot(s); hit(); done = true; break; }
      if (done) continue;
      for (const e of this.a3o.enemies) {
        if (!e.alive || !e.active || !e.spr || !e.spr.visible || e.state === 'dying') continue;
        if (Math.abs(e.x - b.x) < e.w / 2 + hb + bonus && Math.abs(e.y - b.y) < e.h / 2 + hb + bonus) { this.a3Damage(e, GUN.bullet_damage); this.spark(b.x, b.y); hit(); done = true; break; }
      }
      if (done) continue;
      const bs = this.boss;
      if (bs && bs.alive && !bs.entering && Math.abs(bs.x - b.x) < BB.hitbox[0] / 2 + hb && Math.abs(bs.y - b.y) < BB.hitbox[1] / 2 + hb) { if (this.a3BossHit(GUN.bullet_damage)) this.spark(b.x, b.y); hit(); }
    }
    this.objs.bullets = this.objs.bullets.filter(b => b.alive);
  };

  // ------------------------------------------------------------------ Knoedel-Bombe (the special)
  P.a3Bomb = function () {
    const h = this.hero, lvl = clamp(this.stats.special_level - 1, 0, SP.damage_per_enemy.length - 1);
    const b = F.newBomb(h.x + 6, this.plane.y + 8, FL, this.scroll);
    b.spr = this.add.sprite(b.x, b.y, 'proj_arc3', 12).setDepth(31); b.spr.play('p3_bomb');
    b.dmgE = SP.damage_per_enemy[lvl]; b.dmgB = SP.damage_vs_boss[lvl];
    this.a3o.bombs.push(b); SFX.play('knoedel');
  };
  P.a3Bombs = function (dt) {
    for (const b of this.a3o.bombs) {
      if (!b.alive) continue;
      const landed = F.bombStep(b, dt, FL);
      b.spr.setPosition(Math.round(b.x), Math.round(b.y)); b.spr.rotation += dt * 8;
      const bs = this.boss;
      const nearE = this.a3o.enemies.some(e => e.alive && e.active && e.state !== 'dying' && Math.hypot(e.x - b.x, e.y - b.y) < 14);
      const nearB = bs && bs.alive && !bs.entering && Math.abs(bs.x - b.x) < this.BB.hitbox[0] / 2 && Math.abs(bs.y - b.y) < this.BB.hitbox[1] / 2;
      if (landed || nearE || nearB || b.x - this.camX > this.viewW + 20) {
        b.alive = false; b.spr.destroy();
        const boom = this.add.sprite(b.x, b.y, 'fx_boom', 0).setDepth(36); boom.play('boom'); boom.once('animationcomplete', () => boom.destroy());
        SFX.play('poof'); this.shake(4, 220);
        F.bombTargets(this.a3o.enemies.filter(e => e.active && e.state !== 'dying'), b, FL, this.camX, this.viewW).forEach(e => this.a3Damage(e, b.dmgE));
        this.a3o.proj.forEach(s => { if (s.alive && Math.hypot(s.x - b.x, s.y - b.y) < FL.bomb_radius_px + FL.bomb_strip_px) this.killShot(s); });
        if (bs && bs.alive && (nearB || Math.abs(bs.x - b.x) < this.BB.hitbox[0] / 2 + FL.bomb_radius_px)) this.a3BossHit(b.dmgB);
      }
    }
    this.a3o.bombs = this.a3o.bombs.filter(b => b.alive);
  };

  // ------------------------------------------------------------------ pickups
  P.a3Pickups = function (dt) {
    const h = this.hero, py = this.plane.y, R = (PK.bottle.radius || 12) + HW, mr = this.stats.magnet_radius || 0;
    for (const p of this.objs.pickups) {
      if (!p.alive) continue;
      const dx = h.x - p.x, dy = py - p.y, d = Math.hypot(dx, dy);
      if ((p.mag || (mr && d < mr + R)) && d > 1 && !this.dead) { const v = Math.min(d, PK.magnet_pull_speed * dt * (p.mag ? 1.4 : 1)); p.x += dx / d * v + (p.mag ? this.scroll * dt : 0); p.y += dy / d * v; }
      p.spr.setPosition(Math.round(p.x), Math.round(p.y));
      if (!this.dead && Math.abs(dx) < R && Math.abs(dy) < R) this.collect(p);
      else if (p.x < this.camX - 30 && !p.mag) { p.alive = false; p.spr.destroy(); }
    }
    this.objs.pickups = this.objs.pickups.filter(p => p.alive);
  };

  // ------------------------------------------------------------------ hits
  P.a3Hit = function (cause) {
    const h = this.hero, p = this.plane;
    if (h.inv > 0 || this.dead || this.ended) return false;
    if (cause !== 'terrain' && F.loopInvuln(p, FL)) return false;
    h.inv = BLINK_S; this.hitstop = 0.05;
    if (this.shield > 0) { this.shield--; SFX.play('clang'); this.spark(h.x, p.y); UI.hud.boonUsed(); this.time.delayedCall(450, () => { this.boonHud = null; }); return true; }
    h.spr.play('plane_hurt'); h.spr.once('animationcomplete', () => h.spr.active && !this.dead && h.spr.play('plane_fly'));
    if (!this.loseHeart(1) && cause === 'terrain') DOG.say(this, 'dog_a3_crash', 1400, true);
    return true;
  };
  P.a3Contacts = function () {
    const h = this.hero, p = this.plane, O = this.a3o, lift = F.loopPose(p, FL).lift, y = p.y - lift;
    // terrain: bounce to a free height
    if (!p.bounce) {
      const tb = F.hitBox(this.boxes, h.x, y, HW, HH);
      if (tb) {
        const cost = F.crash(p, this.mods, this.boxes, h.x, FL);
        this.shake(4, 200); SFX.play('bonk'); this.cloud(h.x + 10, y);
        if (cost === 'heart') this.a3Hit('terrain');
        else { SFX.play('clang'); UI.hud.toast(t(cost === 'parachute' ? 'upg_fallschirm_name' : 'boon_wolkenkissen_name'), 1400); if (cost === 'cushion') UI.hud.boonUsed(); }
      }
    }
    const box = { x0: h.x - HW, x1: h.x + HW, y0: y - HH, y1: y + HH };
    for (const e of O.enemies) {
      if (!e.alive || !e.active || !e.spr || !e.spr.visible || e.state === 'dying' || e.state === 'wait') continue;
      if (!(box.x1 > e.x - e.w / 2 && box.x0 < e.x + e.w / 2 && box.y1 > e.y - e.h / 2 && box.y0 < e.y + e.h / 2)) continue;
      if (e.def.harmless) { this.a3Kill(e); continue; }
      if (F.diveStomps(p, e.def)) { this.a3Damage(e, FL.dive_damage); SFX.play('stomp'); continue; }
      if (this.a3Hit(e.type)) this.a3Damage(e, 1);
    }
    for (const s of O.proj) if (s.alive && box.x1 > s.x - s.r && box.x0 < s.x + s.r && box.y1 > s.y - s.r && box.y0 < s.y + s.r) { if (this.a3Hit(s.kind)) this.killShot(s); }
    for (const z of O.zones) if (box.x1 > z.x0 && box.x0 < z.x1 && box.y1 > z.y0 && box.y0 < z.y1) this.a3Hit(z.kind);
    const bs = this.boss;
    if (bs && bs.alive && !bs.entering && box.x1 > bs.x - this.BB.hitbox[0] / 2 && box.y0 < bs.y + this.BB.hitbox[1] / 2 && box.y1 > bs.y - this.BB.hitbox[1] / 2) this.a3Hit('boss');
  };

  // ------------------------------------------------------------------ win (reach_x)
  P.a3Win = function () {
    const w = this.L.win;
    if (w.type !== 'reach_x' || this.hero.x < w.x * TILE) return;
    this.a3End();
    this.time.delayedCall(1600, () => this.finishWin());
  };
  P.a3End = function () {
    this.ended = true; INPUT.enabled = false; UI.hud.warn(null);
    SFX.play('win'); SFX.music(null);
    this.hero.spr.play('plane_cheer'); this.hero.inv = 0;
    this.a3o.proj.forEach(s => this.killShot(s)); this.a3o.proj = [];
    this.a3o.zones.forEach(z => z.spr && z.spr.destroy()); this.a3o.zones = [];
    DOG.say(this, 'dog_a3_win', 2600, true);
  };
  P.a3Die = function () {
    const h = this.hero; h.spr.play('plane_ko');
    this.tweens.add({ targets: h.spr, angle: 25, duration: 600 });
  };

  // ------------------------------------------------------------------ Zeppelin-Zombie-Wirt
  P.a3Arena = function () {
    const BB = this.BB; this.arenaOn = true;
    const ev = (this.L.events || []).find(e => e.type === 'boss_intro');
    UI.hud.toast(t(ev ? ev.text_key : 'boss3_intro'), 2600); SFX.music('boss'); SFX.play('honk');
    this.time.delayedCall(1200, () => !this.dead && DOG.say(this, 'dog_a3_boss', 2200, true));
    const spr = this.add.sprite(this.camX + this.viewW + 80, BB.y, 'boss_zeppelin', 0).setDepth(24); spr.play('zep_idle');
    this.boss = { x: this.camX + this.viewW + 80, y: BB.y, hp: BB.hp_total, phase: 1, alive: true, entering: true, enterT: 0, inv: 0, bucket: 0, exposed: 0, spr, st: { busy: 0, timers: BL.phaseAttacks(BB, 1) }, atk: null, flashT: 0 };
    // the enemies of the approach are done
    this.a3o.enemies.forEach(e => { if (e.state === 'wait') e.alive = false; });
  };
  P.a3BossSX = function () { return F.bossAnchor(this.viewW, this.BB); };
  P.a3Boss = function (dt) {
    const bs = this.boss, BB = this.BB; if (!bs) return;
    const anchor = this.a3BossSX();
    if (bs.entering) {
      bs.enterT += dt; const u = Math.min(1, bs.enterT / 1.5), e = 1 - (1 - u) * (1 - u);
      bs.x = this.camX + this.viewW + 80 + (anchor - this.viewW - 80) * e;
      if (u >= 1) bs.entering = false;
    } else if (bs.alive) bs.x = this.camX + anchor;
    if (bs.alive) bs.y = BB.y + BB.bob_px * Math.sin(this.time0 * 1.3);
    bs.spr.setPosition(Math.round(bs.x), Math.round(bs.y));
    if (!bs.alive || bs.entering || this.dead || this.ended) return;
    bs.inv = Math.max(0, bs.inv - dt);
    bs.bucket = BL.refillBucket(bs.bucket, BB, 0, dt);
    if (bs.flashT > 0) { bs.flashT -= dt; if (bs.flashT <= 0) bs.spr.clearTint(); }
    if (bs.inv > 0) return;
    // the running attack
    const k = bs.atk;
    if (k) {
      k.t += dt;
      if (!k.fired && k.t >= (k.a.telegraph_s || 0)) { k.fired = true; this.a3BossFire(k); bs.spr.play(bs.phase === 3 ? 'zep_angry' : 'zep_idle'); }
      if (k.t >= (k.a.telegraph_s || 0) + k.a.busy_s) bs.atk = null;
      if (!k.fired && k.a.type === 'deckel') k.aim = F.aim(bs.x - 40, bs.y + 14, this.hero.x, this.plane.y);
    }
    const a = F.nextAttack(bs.st, dt);
    if (a) {
      const nk = { a, t: 0, fired: false };
      if (a.type === 'deckel') nk.aim = F.aim(bs.x - 40, bs.y + 14, this.hero.x, this.plane.y);
      if (a.type === 'schaum') nk.band = F.schaumBand(this.plane.y, a, FL);
      if (a.type === 'fass') nk.cols = F.fassColumns(this.plane.sx, a).map(sx => this.camX + sx);
      bs.atk = nk; bs.spr.play('zep_tell'); SFX.play('alert');
      if (this.barkCd <= 0) { this.barkCd = 3; this.time.delayedCall(Math.max(0, (a.telegraph_s - A3.bark_lead_s) * 1000), () => !this.dead && DOG.say(this, 'dog_a3_bark', 1000)); }
    }
  };
  P.a3BossFire = function (k) {
    const bs = this.boss, a = k.a;
    if (a.type === 'deckel') {
      F.fan(k.aim, a.count, a.spread_deg).forEach(an => this.a3Shot('deckel', bs.x - 40, bs.y + 14, Math.cos(an) * a.speed + this.scroll, Math.sin(an) * a.speed, 0, 1));
      SFX.play('throw');
    } else if (a.type === 'schaum') {
      const b = k.band, spr = this.add.image(bs.x - 40, (b.y0 + b.y1) / 2, 'fx_schaum').setDepth(40);
      spr.setDisplaySize(48, b.y1 - b.y0);
      this.a3o.zones.push({ kind: 'schaum', sx: bs.x - this.camX - 40, speed: a.speed_screen, x0: 0, x1: 0, y0: b.y0, y1: b.y1, life: 6, spr });
      SFX.play('splash');
    } else if (a.type === 'fass') {
      k.cols.forEach((x, i) => this.time.delayedCall(i * 80, () => !this.dead && !this.ended && this.a3Shot('fass', x, -12, 0, a.fall_px_s, 0, a.hp, 4)));
      SFX.play('crate');
    }
  };
  P.a3BossHit = function (dmg) {
    const bs = this.boss, BB = this.BB;
    dmg = BL.hitDamage(bs, BB, dmg); if (!dmg) return false;
    bs.hp -= dmg; this.charge += dmg * SP.charge_per_boss_damage;
    bs.spr.setTintFill(0xffffff); bs.flashT = 0.05; SFX.play('hit');
    if (bs.hp <= 0) { this.a3BossDefeat(); return true; }
    const np = BL.phaseFor(bs.hp, BB.phase_hp_thresholds);
    if (np !== bs.phase) {
      bs.phase = np; bs.inv = BB.transition_invuln_s; bs.atk = null; bs.st = { busy: 0, timers: BL.phaseAttacks(BB, np) };
      bs.spr.clearTint(); bs.flashT = 0; bs.spr.play('zep_angry'); SFX.play('honk'); this.shake(5, 300);
      const ev = (this.L.events || []).find(e => e.type === 'boss_phase' && e.phase === np);
      if (ev) UI.hud.toast(t(ev.text_key), 2400);
      this.a3o.proj.forEach(s => this.killShot(s)); this.a3o.proj = [];
    }
    return true;
  };
  P.a3BossDefeat = function () {
    const bs = this.boss, BB = this.BB;
    bs.alive = false; bs.hp = 0; bs.atk = null;
    this.a3End(); this.hero.spr.play('plane_fly');
    const ev = (this.L.events || []).find(e => e.type === 'boss_defeat');
    UI.hud.toast(t(ev ? ev.text_key : 'boss3_defeat'), 3200);
    bs.spr.clearTint(); bs.spr.play('zep_defeat');
    this.a3o.enemies.forEach(e => e.alive && e.active && this.a3Kill(e));
    for (let i = 0; i < 6; i++) this.time.delayedCall(i * 240, () => { this.cloud(bs.x + Math.random() * 80 - 40, bs.y + Math.random() * 40 - 20); this.shake(3, 120); SFX.play('poof'); });
    for (let i = 0; i < BB.bottle_drop; i++) this.time.delayedCall(300 + i * 40, () => this.a3Bottle(bs.x + Math.random() * 40 - 20, bs.y + 20, true));
    // the freed Alpine cow flies out of the stein and over to the plane
    this.time.delayedCall(1500, () => {
      this.tweens.add({ targets: bs.spr, y: 260, angle: -12, alpha: 0.2, duration: 1600, ease: 'Quad.in' });
      const cow = this.add.sprite(bs.x, bs.y, 'npc_alpenkuh', 0).setDepth(34); cow.play('alpenkuh_fly'); SFX.play('moo');
      this.cow = { spr: cow, t: 0 };
    });
    this.time.delayedCall(4800, () => { if (this.cow) this.cow.spr.play('alpenkuh_milk'); SFX.play('cheer'); });
    this.time.delayedCall(6200, () => this.finishWin());
  };

  // ------------------------------------------------------------------ drawing
  P.a3Draw = function (dt) {
    const g = this.g3, p = this.plane, h = this.hero, cam = this.camX, vw = this.viewW, T0 = this.time0;
    g.clear();
    const pulse = 0.55 + 0.45 * Math.sin(T0 * 18);
    const dash = (x0, y0, x1, y1, w) => { const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.floor(L / 8)); g.lineStyle(w || 2, ORANGE, pulse); for (let i = 0; i < n; i += 2) g.lineBetween(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n); };
    const bang = (x, y) => { g.fillStyle(INK, 0.8); g.fillCircle(x, y, 7); g.fillStyle(ORANGE, pulse); g.fillRect(x - 1, y - 5, 3, 6); g.fillRect(x - 1, y + 3, 3, 2); };
    // monster telegraphs (all ORANGE, >= tell_min_s)
    for (const e of this.a3o.enemies) {
      if (!e.alive || e.state !== 'tell') continue;
      if (e.type === 'taube' || e.type === 'adler' || e.type === 'drohne') {
        if (e.k) continue;
        const y = e.y; bang(cam + vw - A3.enemy_tell_screen_x, y);
        if (e.type !== 'taube') dash(cam + p.sx - 20, y, cam + vw - 26, y, e.type === 'drohne' ? 2 * (e.def.lane_half_px > 6 ? 1 : 1) : 2);
      } else if (e.type === 'ballon') dash(e.x, e.y + e.h / 2, e.x, FL.ground_y);
      else if (e.type === 'fallschirm' || e.type === 'kiste') { if (e.type === 'fallschirm') bang(e.x, 10); }
      else if (e.type === 'lampion') { g.lineStyle(2, ORANGE, pulse); g.strokeCircle(e.x, e.y, 10); }
      else if (e.type === 'blitz') { g.lineStyle(2, ORANGE, pulse); g.strokeRect(e.x - e.def.beam_half_px, e.y + e.h / 2, e.def.beam_half_px * 2, FL.ground_y - e.y - e.h / 2); }
      else if (e.type === 'hagelgeist' && e.aim !== undefined) dash(e.x, e.y, e.x + Math.cos(e.aim) * 120, e.y + Math.sin(e.aim) * 120);
      else if (e.type === 'jodler') F.fanDeg(e.def.fan_deg).forEach(v => dash(e.x - 6, e.y - 8, e.x - 6 + v.cx * 50, e.y - 8 + v.cy * 50));
      else if (e.type === 'brezelwerfer' && e.target) { const x = e.target.x, y = e.target.y; g.lineStyle(2, ORANGE, pulse); g.strokeCircle(x, y, 9); g.lineBetween(x - 13, y, x + 13, y); g.lineBetween(x, y - 13, x, y + 13); }
    }
    // gust wind lines
    const gb = F.boeAt(this.boes, h.x, A3.boe, this.scroll);
    for (const z of this.boes) {
      if (z.x1 < cam || z.x0 > cam + vw) continue;
      const near = gb.tell === z || (h.x >= z.x0 && h.x <= z.x1);
      g.lineStyle(1, near ? ORANGE : 0xd8e4f0, near ? pulse : 0.4);
      for (let i = 0; i < 9; i++) { const x = z.x0 + ((i * 53) % Math.max(20, z.x1 - z.x0)), y = 40 + ((i * 37 + T0 * 80 * z.dir * -1) % 140 + 140) % 140; g.lineBetween(x, y, x, y + 14 * (z.dir > 0 ? 1 : -1)); }
    }
    // the zeppelin's telegraphs
    const bs = this.boss;
    if (bs && bs.atk && !bs.atk.fired) {
      const k = bs.atk;
      if (k.a.type === 'deckel') F.fan(k.aim, k.a.count, k.a.spread_deg).forEach(a => dash(bs.x - 40, bs.y + 14, bs.x - 40 + Math.cos(a) * 140, bs.y + 14 + Math.sin(a) * 140));
      if (k.a.type === 'schaum') { g.fillStyle(ORANGE, 0.18 + 0.12 * pulse); g.fillRect(cam, k.band.y0, vw, k.band.y1 - k.band.y0); g.lineStyle(2, ORANGE, pulse); g.strokeRect(cam + 2, Math.max(1, k.band.y0), vw - 4, Math.min(215, k.band.y1) - Math.max(1, k.band.y0)); }
      if (k.a.type === 'fass') k.cols.forEach(x => dash(x, 0, x, FL.ground_y));
    }
    for (const z of this.a3o.zones) if (z.kind === 'beam') { g.fillStyle(0xfff3a0, 0.9); g.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0); g.fillStyle(0xffffff, 1); g.fillRect((z.x0 + z.x1) / 2 - 2, z.y0, 4, z.y1 - z.y0); }
    // cow follows the plane after the boss
    if (this.cow) { const c = this.cow.spr; c.x += (h.x - 30 - c.x) * Math.min(1, dt * 1.6); c.y += (p.y - 26 - c.y) * Math.min(1, dt * 1.6); }
    // the plane
    const pose = F.loopPose(p, FL);
    h.spr.setPosition(Math.round(h.x), Math.round(p.y - pose.lift));
    h.spr.setRotation(this.dead ? h.spr.rotation : pose.angle + (p.diveT > 0 ? 0.35 : 0));
    if (!this.dead && !this.ended) {
      const want = p.diveT > 0 ? 'plane_dive' : (p.ty < p.y - 6 ? 'plane_climb' : 'plane_fly');
      const cur = h.spr.anims.currentAnim ? h.spr.anims.currentAnim.key : '';
      if (cur !== 'plane_hurt' && cur !== 'plane_shoot' && cur !== want) h.spr.play(want);
    }
    h.spr.setAlpha(h.inv > 0 && !this.ended ? (Math.floor(h.inv * 14) % 2 ? 0.35 : 1) : 1);
  };

  // ------------------------------------------------------------------ test hook: what will be dangerous where, tau s from now
  // (used by the play-test bot in tests/bot.js; the game itself never calls it)
  P.a3Threats = function (tau) {
    const out = [], cam = this.camX + this.scroll * tau, vw = this.viewW, p = this.plane;
    for (const e of this.a3o.enemies) {
      if (!e.alive || !e.active || e.state === 'dying' || e.def.harmless) continue;
      let x = e.x, y = e.y;
      if (e.state === 'tell' && (e.type === 'taube' || e.type === 'adler' || e.type === 'drohne')) {
        const go = Math.max(0, tau - e.tt), vx = -(e.type === 'taube' ? e.def.speed : e.type === 'adler' ? e.def.swoop_px_s : e.def.dash_px_s);
        x = this.camX + this.scroll * Math.min(tau, e.tt) + vw + e.off + vx * go;
        if (e.type === 'taube') { out.push([x - e.w / 2, x + e.w / 2, y - e.h / 2 - e.def.sine_amp_px, y + e.h / 2 + e.def.sine_amp_px]); continue; }
      } else if (e.state === 'go' || e.state === 'tell' || e.state === 'idle' || e.state === 'idle_wait' || e.state === 'rest' || e.state === 'fire' || e.state === 'done') {
        if (e.type === 'taube' || e.type === 'adler' || e.type === 'drohne') x += (e.vx || 0) * tau;
        if (e.type === 'fallschirm') { if (e.state === 'tell' || e.state === 'idle_wait') y = -24 + e.def.fall_px_s * Math.max(0, tau - (e.tt || 0)); else y += e.def.fall_px_s * tau; }
        if (e.type === 'lampion') { if (e.state === 'go') y -= e.def.rise_px_s * tau; else y -= e.def.rise_px_s * Math.max(0, tau - (e.tt || 0)); }
        if (e.type === 'taube') { out.push([x - e.w / 2, x + e.w / 2, y - e.h / 2 - e.def.sine_amp_px, y + e.h / 2 + e.def.sine_amp_px]); continue; }
      }
      out.push([x - e.w / 2, x + e.w / 2, y - e.h / 2, y + e.h / 2]);
      // future beams / sandbags
      if (e.type === 'blitz' && (e.state === 'tell' || e.state === 'fire')) {
        const t0 = e.state === 'tell' ? e.tt : 0, t1 = (e.state === 'tell' ? e.tt : 0) + (e.state === 'fire' ? e.bt : e.def.beam_s);
        if (tau >= t0 - 0.1 && tau <= t1 + 0.1) out.push([e.x - e.def.beam_half_px, e.x + e.def.beam_half_px, e.y, FL.ground_y + 12]);
      }
      if (e.type === 'ballon' && e.state === 'tell' && tau >= e.tt) { const fy = e.y + e.h / 2 + e.def.drop_speed * (tau - e.tt); out.push([e.x - 8, e.x + 8, fy - 8, fy + 8]); }
      if (e.type === 'brezelwerfer' && e.state === 'tell' && e.target && tau >= e.tt + e.def.flight_s - 0.4) out.push([e.target.x - 14, e.target.x + 14, e.target.y - 14, e.target.y + 14]);
      if (e.type === 'hagelgeist' && e.state === 'tell' && tau >= e.tt && e.aim !== undefined) {
        const u = tau - e.tt; F.fan(e.aim, e.def.pellets, e.def.spread_deg).forEach(a => { const x2 = e.x - 6 + (Math.cos(a) * e.def.pellet_px_s + this.scroll) * u, y2 = e.y + Math.sin(a) * e.def.pellet_px_s * u; out.push([x2 - 6, x2 + 6, y2 - 6, y2 + 6]); });
      }
      if (e.type === 'jodler' && e.state === 'tell' && tau >= e.tt) {
        const u = tau - e.tt; F.fanDeg(e.def.fan_deg).forEach(v => { const x2 = e.x - 6 + (v.cx * e.def.note_px_s + this.scroll) * u, y2 = e.y - 8 + v.cy * e.def.note_px_s * u; out.push([x2 - 7, x2 + 7, y2 - 7, y2 + 7]); });
      }
    }
    for (const s of this.a3o.proj) { const q = F.predict(s, tau); out.push([q.x - s.r, q.x + s.r, q.y - s.r, q.y + s.r]); }
    for (const z of this.a3o.zones) {
      if (z.kind === 'beam' && tau <= z.life + 0.05) out.push([z.x0, z.x1, z.y0, z.y1]);
      if (z.kind === 'schaum') { const sx = z.sx - z.speed * tau; out.push([this.camX + this.scroll * tau + sx - 26, this.camX + this.scroll * tau + sx + 26, z.y0, z.y1]); }
    }
    const bs = this.boss;
    if (bs && bs.alive) {
      out.push([cam + this.a3BossSX() - this.BB.hitbox[0] / 2, cam + this.a3BossSX() + this.BB.hitbox[0] / 2, bs.y - this.BB.hitbox[1] / 2, bs.y + this.BB.hitbox[1] / 2]);
      const k = bs.atk;
      if (k && !k.fired) {
        const u = tau - (k.a.telegraph_s - k.t);
        if (u >= -0.2) {
          if (k.a.type === 'schaum') { const sx = this.a3BossSX() - 40 - k.a.speed_screen * Math.max(0, u); out.push([cam + sx - 26, cam + sx + 26, k.band.y0, k.band.y1]); }
          if (k.a.type === 'fass') k.cols.forEach(x => { const y = -12 + k.a.fall_px_s * Math.max(0, u); out.push([x - 9, x + 9, y - 9, y + 9]); });
          if (k.a.type === 'deckel') F.fan(k.aim, k.a.count, k.a.spread_deg).forEach(a => { const uu = Math.max(0, u); const x = bs.x - 40 + (Math.cos(a) * k.a.speed + this.scroll) * uu, y = bs.y + 14 + Math.sin(a) * k.a.speed * uu; out.push([x - 8, x + 8, y - 8, y + 8]); });
        }
      }
    }
    return out;
  };
})();
