// Pickup art: a mission item's own image (pickup_<id>) if the manifest has one, else its frame in 'pickups'.
function pickupFrame(type) {
  const A = window.ART_MANIFEST.assets, own = A.find(x => x.key === 'pickup_' + type);
  if (own) return { key: own.key, frame: undefined };
  const a = (A.find(x => x.key === 'pickups') || {}), fr = a.frames || {}, al = a.aliases || {};
  const v = fr[type] !== undefined ? fr[type] : fr[al[type]];
  return { key: 'pickups', frame: v === undefined ? 0 : (Array.isArray(v) ? v[0] : v) };
}
window.pickupFrame = pickupFrame;

// The level scene. One scene runs every mode from the design data:
//   run (L1, L2), escort (L3), chase (L4), boss (L5), and an "attract" mode behind the menus.
// Physics is a small hand-written tile platformer (flat ground at y=184, gaps, blocks, crates,
// one-way shelves) so every number can come straight from design/data/tuning.json.
(function () {
  const G = window.GAME_DATA, T = G.tuning;
  const M = T.movement, PL = T.player, GUN = T.gun, SP = T.special, EN = T.enemies, HZ = T.hazards,
    PK = T.pickups, ESC = T.escort, CH = T.chase, CAM = T.camera, B = T.boss, FL = T.flow;
  const LEVELS = G.levels.levels, UPG = G.upgrades.upgrades;
  const TILE = 16, GY = T.world.ground_surface_y_px, ROW0 = GY % TILE, ROWS = 13;
  const GROUND_ROW = (GY - ROW0) / TILE;          // 11 -> tile rows 11-12 are the street
  const EMPTY = 0, SOLID = 1, ONEWAY = 2, CRATE = 3, JUNK = 4;
  // Hurtbox from the art manifest (hero frames are 48x48): 14x30, bottom 7 px above the track contact point.
  const HB_W = PL.hurtbox_w, HB_H = PL.hurtbox_h, HB_OFF = 7;
  const rowOf = y => Math.floor((y - ROW0) / TILE);
  const rowTop = r => ROW0 + r * TILE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const approach = (v, target, step) => v < target ? Math.min(target, v + step) : Math.max(target, v - step);
  const t = (k, v) => I18N.t(k, v);
  const isSolid = v => v === SOLID || v === CRATE || v === JUNK;

  // Building templates (tile indices of the Tech Artist's tileset, -1 = empty); bottom row stands on the street.
  const TPL = {
    house1: [[-1, -1, 27, 29, -1, -1], [-1, 27, 28, 28, 29, -1], [27, 28, 28, 28, 28, 29], [19, 19, 19, 19, 19, 19], [16, 17, 23, 17, 22, 17], [16, 24, 16, 17, 20, 21], [26, 25, 26, 26, 26, 26]],
    house2: [[-1, -1, 30, -1, -1], [-1, 27, 28, 29, -1], [27, 28, 31, 28, 29], [19, 19, 19, 19, 19], [16, 18, 23, 18, 22], [16, 18, 16, 18, 21], [19, 24, 19, 20, 19], [26, 25, 26, 26, 26]],
    shop: [[76, 76, 76, 76, 76, 76], [75, 75, 75, 75, 75, 75], [75, 75, 75, 75, 75, 75], [-1, 32, 33, 34, 35, -1], [-1, 40, 41, 41, 42, -1], [-1, 36, 37, 38, 39, -1], [-1, 36, 37, 38, 39, -1]],
    ruin: [[76, 76, -1, 76], [75, 75, 76, 75], [75, 73, 75, 75], [75, 75, 75, 74]],
    lamp: [[70], [71]], litfass: [[54], [55], [56]], bus: [[57, 58, 59], [60, 61, 62], [63, 64, 65]], busSign: [[66], [71]],
    fence: [[43, 43, 43, 44]], garden: [[45, 46, 47]], shed: [[48, 49, 50], [51, 52, 53]], hedge: [[72, 72]], bin: [[69]],
    wallLow: [[76, 76, 76], [75, 74, 75]],
  };

  function computeStats() {
    const s = {
      fire_rate_per_s: GUN.fire_rate_per_s, extra_bullet_angles_deg: [], crush_on_contact: [], scherben_harmless: false,
      slam_damage: M.slam_damage, slam_radius: M.slam_radius, hp_hearts: PL.hp_hearts, magnet_radius: PK.magnet_base_radius,
      special_unlocked: false, special_level: 0,
    };
    const up = SAVE.data.upgrades;
    UPG.forEach(u => {
      for (let i = 0; i < (up[u.id] || 0) && i < u.levels.length; i++) {
        const eff = u.levels[i].effect;
        for (const k in eff) { if (k.endsWith('_add')) s[k.slice(0, -4)] += eff[k]; else s[k] = eff[k]; }
      }
    });
    s.hp_hearts = Math.min(s.hp_hearts, PL.max_hearts_with_upgrades);
    return s;
  }
  function rng(seed) { let a = (seed * 2654435761) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }

  class Play extends Phaser.Scene {
    constructor() { super('Play'); }
    init(data) { this.levelNum = (data && data.level) || 0; }

    create() {
      const n = this.levelNum;
      this.attract = n === 0;
      this.L = this.attract ? { mode: 'attract', length_screens: 40, signs: [], enemies: [], hazards: [], pickups: [], win: { type: 'none', x: 1e9 } } : LEVELS[n - 1];
      this.mode = this.L.mode;
      this.stats = computeStats();
      this.viewW = this.scale.width;
      this.ended = false; this.dead = false; this.winDone = false; this.time0 = 0; this.hitstop = 0;
      this.runBottles = 0; this.healsLeft = 1; this.arenaOn = false; this.boss = null; this.trolley = null; this.truck = null; 
      let W = this.L.length_screens * 24 + 30;
      if (this.mode === 'boss') W = this.L.arena_start_x + 1400;
      this.W = W;
      this.grid = new Uint8Array(W * ROWS);
      this.crates = new Map(); this.junk = []; this.gaps = [];
      for (let c = 0; c < W; c++) { this.setCell(c, GROUND_ROW, SOLID); this.setCell(c, GROUND_ROW + 1, SOLID); }

      this.makeBackground();
      this.objs = { enemies: [], bullets: [], pickups: [], lids: [], pots: [], drops: [], waves: [], files: [], knoedels: [], scherben: [], signs: [] };
      this.buildLevel();
      this.makeTiles();
      this.makeHero();
      if (this.mode === 'escort') this.makeTrolley();
      if (this.mode === 'chase') this.makeTruck();

      const cam = this.cameras.main;
      cam.setBounds(0, 0, W * TILE, 216);
      cam.setRoundPixels(true);
      cam.scrollX = 0;

      this.charge = 0;
      this.specialReq = this.stats.special_unlocked ? SP.charge_required[Math.max(0, this.stats.special_level - 1)] : 0;
      this.maxHearts = this.stats.hp_hearts; this.hearts = this.maxHearts;

      INPUT.clear();
      if (!this.attract) {
        INPUT.enabled = false;
        this.time.delayedCall(FL.restart_input_lock_s * 1000, () => { if (!this.dead && !this.ended) INPUT.enabled = true; });
        INPUT.onPause = () => this.pauseGame();
        INPUT.onSpecial = () => this.fireSpecial();
        UI.hud.show(true);
        this.lastHud = {};
        this.refreshHud(true);
        UI.hud.warn(null); UI.hud.sign(null);
      } else {
        INPUT.enabled = false; INPUT.onPause = null; INPUT.onSpecial = null;
        UI.hud.show(false);
      }
      this.events.once('shutdown', () => { INPUT.enabled = false; UI.hud.sign(null); UI.hud.warn(null); this.scale.off('resize', this.onResize, this); });
      this.scale.on('resize', this.onResize, this);
      window.__PLAY = this; // used by the automated smoke test
    }

    onResize(size) {
      this.viewW = size.width;
      this.cameras.main.setSize(size.width, size.height);
      this.parallax.forEach(p => p.spr.setSize(size.width, 216));
    }

    // ------------------------------------------------------------ grid helpers
    cell(c, r) { if (r < 0 || r >= ROWS) return EMPTY; if (c < 0) return SOLID; if (c >= this.W) return EMPTY; return this.grid[r * this.W + c]; }
    setCell(c, r, v) { if (c >= 0 && c < this.W && r >= 0 && r < ROWS) this.grid[r * this.W + c] = v; }
    solidAt(px, py) { return isSolid(this.cell(Math.floor(px / TILE), rowOf(py))); }
    floorBelow(x, y) { // top y of the first standable surface at or below y (allowing 6 px of step)
      const c = Math.floor(x / TILE);
      for (let r = Math.max(0, rowOf(y - 6)); r < ROWS; r++) { const v = this.cell(c, r); if (v !== EMPTY && rowTop(r) >= y - 6) return rowTop(r); }
      return Infinity;
    }

    // ------------------------------------------------------------ background
    makeBackground() {
      this.parallax = [];
      [['parallax_0_sky', 0], ['parallax_1_far_hills', 0.1], ['parallax_2_mid_roofs', 0.25], ['parallax_3_near_ruins', 0.5]].forEach(([k, f], i) => {
        this.parallax.push({ spr: this.add.tileSprite(0, 0, this.viewW, 216, k).setOrigin(0).setScrollFactor(0).setDepth(i), f });
      });
      this.parallax.push({ spr: this.add.tileSprite(0, 0, this.viewW, 216, 'parallax_4_front_grass').setOrigin(0).setScrollFactor(0).setDepth(60), f: 1.25 });
    }

    makeTiles() {
      const W = this.W;
      const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: W, height: ROWS });
      const ts = map.addTilesetImage('village', 'tiles_village', TILE, TILE, 0, 0);
      this.bgLayer = map.createBlankLayer('bg', ts, 0, ROW0).setDepth(5);
      this.gLayer = map.createBlankLayer('ground', ts, 0, ROW0).setDepth(10);
      const R = rng(this.levelNum + 7), gl = this.gLayer;
      for (let c = 0; c < W; c++) for (let r = 0; r < ROWS; r++) {
        const v = this.cell(c, r);
        if (v === SOLID) {
          if (r === GROUND_ROW) { const k = R(); gl.putTileAt(k < 0.08 ? 10 : k < 0.12 ? 8 : (c % 2), c, r); }
          else if (r > GROUND_ROW) gl.putTileAt(R() < 0.25 ? 3 : 2, c, r);
          else gl.putTileAt(this.cell(c, r - 1) === SOLID ? 75 : 76, c, r);
        } else if (v === ONEWAY) gl.putTileAt(67, c, r);
      }
      // decorations behind the action
      const reserved = new Uint8Array(W);
      this.gaps.forEach(g => { for (let c = g.x - 1; c <= g.x + g.w; c++) if (c >= 0 && c < W) reserved[c] = 1; });
      const stamp = (name, x) => {
        const tp = TPL[name], h = tp.length, w = tp[0].length;
        for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) if (tp[i][j] >= 0 && x + j >= 0 && x + j < W) this.bgLayer.putTileAt(tp[i][j], x + j, GROUND_ROW - h + i);
        for (let j = -1; j <= w; j++) if (x + j >= 0 && x + j < W) reserved[x + j] = 2;
      };
      const free = (x, w) => { for (let j = -1; j <= w; j++) if (x + j < 0 || x + j >= W || reserved[x + j]) return false; return true; };
      const n = this.levelNum, winX = this.L.win && this.L.win.x < 1e8 ? this.L.win.x : null;
      if (!this.attract) {
        stamp(n === 3 ? 'house2' : 'house1', 0);
        if (n === 1 && winX) stamp('shop', winX - 5);           // Kaufkiste: door tile sits at winX
        if (n === 2 && winX) { stamp('fence', winX - 5); stamp('house1', winX); }
        if (n === 3 && winX) stamp('house2', winX - 1);
      }
      const big = ['house1', 'house2', 'ruin', 'shed', 'house1', 'ruin', 'bus'];
      const small = ['lamp', 'litfass', 'fence', 'garden', 'hedge', 'bin', 'lamp', 'busSign', 'wallLow'];
      for (let x = 7; x < W - 4;) {
        const useBig = R() < 0.45, list = useBig ? big : small, name = list[Math.floor(R() * list.length)];
        const w = TPL[name][0].length;
        if (free(x, w) && !(winX && x > winX + 8)) stamp(name, x);
        x += w + 1 + Math.floor(R() * (useBig ? 4 : 7));
      }
      for (let x = 30; x < W - 10; x += 40 + Math.floor(R() * 50)) {
        if (free(x, 4) && !(winX && x > winX - 6)) { this.add.image(x * TILE, GY, 'prop_car_rusty').setOrigin(0, 1).setDepth(7); for (let j = 0; j < 4; j++) reserved[x + j] = 2; }
      }
      if (n === 1 || n === 3 || this.attract) this.add.image(150 * TILE, GY - 60, 'prop_church_tower').setOrigin(0, 1).setDepth(4);
      if (n === 4 && winX) this.drawBridge(winX);
      if (winX && (n === 2 || n === 3)) this.add.image(winX * TILE + 4, GY, 'goalflag').setOrigin(0.5, 1).setDepth(8);
    }

    drawBridge(x) {
      const g = this.add.graphics().setDepth(55), C = ART.C, hex = c => parseInt(C[c].slice(1), 16);
      const px = x * TILE - 8;
      g.fillStyle(hex('stone')); g.fillRect(px, 40, 36, 144); g.fillRect(px + 500, 40, 36, 144); g.fillRect(px - 300, 24, 900, 24);
      g.fillStyle(hex('stoneL')); g.fillRect(px - 300, 24, 900, 3); g.fillRect(px + 4, 48, 3, 136); g.fillRect(px + 504, 48, 3, 136);
      g.fillStyle(hex('ink')); g.fillRect(px - 300, 46, 900, 2);
      for (let i = -300; i < 600; i += 12) { g.fillStyle(hex('rust')); g.fillRect(px + i, 19, 8, 5); }
      this.bridgeX = px;
    }

    // ------------------------------------------------------------ level content from levels.json
    buildLevel() {
      const L = this.L, O = this.objs;
      (L.hazards || []).forEach(h => {
        if (h.type === 'gap') {
          for (let c = h.x; c < h.x + h.w; c++) { this.setCell(c, GROUND_ROW, EMPTY); this.setCell(c, GROUND_ROW + 1, EMPTY); }
          this.gaps.push({ x: h.x, w: h.w });
        } else if (h.type === 'block') {
          for (let c = h.x; c < h.x + (h.w || 1); c++) for (let k = 1; k <= (h.h || 1); k++) this.setCell(c, GROUND_ROW - k, SOLID);
        } else if (h.type === 'platform') {
          for (let c = h.x; c < h.x + (h.w || 1); c++) this.setCell(c, GROUND_ROW - (h.y || 3), ONEWAY);
        } else if (h.type === 'crate') {
          for (let c = h.x; c < h.x + (h.w || 1); c++) for (let k = 1; k <= (h.h || 1); k++) this.addCrate(c, GROUND_ROW - k);
        } else if (h.type === 'scherben') {
          const spr = this.add.tileSprite(h.x * TILE, GY + 1, (h.w || 3) * TILE, 6, 'hz_scherben').setOrigin(0, 1).setDepth(12);
          O.scherben.push({ x0: h.x * TILE, x1: (h.x + (h.w || 3)) * TILE, spr });
        } else if (h.type === 'blumentopf') {
          const y = GY - (h.y || 5) * TILE, x = h.x * TILE + 8;
          this.add.image(x, y, 'balcony').setOrigin(0.5, 0).setDepth(8).setScale(0.5);
          const spr = this.add.sprite(x, y + 2, 'hz_blumentopf', 0).setOrigin(0.5, 1).setDepth(21);
          const sh = this.add.sprite(x, GY + 1, 'hz_shadow_16', 0).setOrigin(0.5, 1).setDepth(11).setAlpha(0);
          O.pots.push({ x, y: y + 2, y0: y + 2, spr, sh, state: 'idle', t: 0 });
        } else if (h.type === 'sperrmuell_drop') {
          O.drops.push({ x: h.x * TILE, size: h.size || 'sofa', state: 'wait', t: 0 });
        }
      });
      this.gaps.forEach(g => {
        this.add.image((g.x - 1) * TILE, GY, 'tiles_village', 13).setOrigin(0, 1).setDepth(9);
        this.add.image((g.x + g.w) * TILE, GY, 'tiles_village', 15).setOrigin(0, 1).setDepth(9);
      });
      (L.enemies || []).forEach(e => {
        const count = e.count || 1, spacing = e.type === 'gnome' ? EN.gnome.group_spacing_px : 0;
        for (let i = 0; i < count; i++) this.spawnEnemy(e.type, e.x * TILE + 8 + i * spacing, GY - (e.y || 0) * TILE, { idx: i, onBalcony: (e.y || 0) > 0 });
      });
      (L.pickups || []).forEach(p => {
        const n = p.count || 1, y0 = p.y || 0;
        if (p.type === 'bottle') {
          for (let i = 0; i < n; i++) {
            let x, yT;
            if (p.pattern === 'arc') {
              const mid = (n - 1) / 2, u = n > 1 ? (i - mid) / (mid + 0.75) : 0;
              x = (p.x + (i - mid) * 1.5) * TILE + 8; yT = 1 + (y0 - 1) * (1 - u * u);
            } else { x = (p.x + i) * TILE + 8; yT = y0; }
            this.addPickup('bottle', x, GY - yT * TILE - 9);
          }
        } else this.addPickup(p.type, p.x * TILE + 8, GY - y0 * TILE - 10);
      });
      (L.signs || []).forEach(s => {
        const k = s.text_key, warn = /baustelle|dackel|sperrmuell|brake|backoff|slam|double|jump/.test(k), x = s.x * TILE + 8;
        this.add.image(x, GY, 'prop_sign_post').setOrigin(0.5, 1).setDepth(9);
        const board = this.add.nineslice(x, GY - 26, warn ? 'prop_sign_board_warn' : 'prop_sign_board', 0, 32, 20, 4, 4, 4, 4).setOrigin(0.5, 1).setDepth(9);
        O.signs.push({ x, key: k, spr: board });
      });
      this.items = (L.win && L.win.items) ? L.win.items.map(() => false) : null;
      this.eventsLeft = (L.events || []).filter(e => e.x !== undefined).map(e => Object.assign({}, e));
    }

    addCrate(c, r) {
      this.setCell(c, r, CRATE);
      this.crates.set(c + ',' + r, { c, r, hp: HZ.crate.hp_per_crate, spr: this.add.sprite(c * TILE, rowTop(r), 'hz_crate', 0).setOrigin(0).setDepth(12) });
    }
    hitCrate(c, r, dmg) {
      const k = c + ',' + r, cr = this.crates.get(k); if (!cr) return;
      cr.hp -= dmg; this.flash(cr.spr);
      if (cr.hp <= 0) {
        this.crates.delete(k); this.setCell(c, r, EMPTY); cr.spr.play('crate_break'); cr.spr.once('animationcomplete', () => cr.spr.destroy());
        this.poof(c * TILE + 8, rowTop(r) + 10); SFX.play('crate'); this.shake(2, 80);
        for (let i = 0; i < 4; i++) this.debris(c * TILE + 8, rowTop(r) + 8, 'wood');
      } else { SFX.play('hit'); cr.spr.setFrame(clamp(HZ.crate.hp_per_crate - cr.hp, 0, 2)); }
    }

    addPickup(type, x, y, loose) {
      const pf = pickupFrame(type);
      const spr = this.add.sprite(x, y, pf.key, pf.frame).setDepth(15);
      if (type === 'bottle') spr.play({ key: 'pfand_bottle_shine', startFrame: Math.floor(Math.random() * 4) });
      const def = PK[type] || { radius: 12 };
      const p = { type, x, y, spr, r: def.radius || 12, alive: true, vy: loose ? -150 - Math.random() * 60 : 0, vx: loose ? (Math.random() * 80 - 20) : 0, loose: !!loose, mag: false };
      if (type !== 'bottle') this.tweens.add({ targets: spr, scaleX: 1.12, scaleY: 1.12, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.objs.pickups.push(p);
      return p;
    }

    spawnEnemy(type, x, y, opt) {
      const d = EN[type]; if (!d) return null;
      const spr = this.add.sprite(x, y, 'zombie_' + type, 0).setOrigin(0.5, 1).setDepth(20).setFlipX(true);
      const e = { type, x, y, vx: 0, vy: 0, hp: d.hp, w: d.hitbox[0], h: d.hitbox[1], spr, state: 'idle', t: 0, alive: true, active: false,
        drops: (opt && opt.noDrop) ? 0 : (d.bottle_drop || 0), phase: ((opt && opt.idx) || 0) * 0.13, fixed: !!(opt && opt.onBalcony), flashT: 0, hop: 0 };
      if (type === 'jogger') spr.play('jogger_walk');
      if (type === 'neighbour' && e.fixed) { this.add.image(x, y, 'balcony').setOrigin(0.5, 0).setDepth(8); this.add.image(x, y - 12, 'railing').setOrigin(0.5, 0).setDepth(21); }
      this.objs.enemies.push(e);
      return e;
    }

    makeHero() {
      const x = this.mode === 'chase' ? 120 : 40;
      this.hero = {
        x, y: GY, vx: this.attract ? M.run_speed : 0, vy: 0, grounded: true, coyote: 0, buffer: 0, airJumps: M.air_jumps, slamming: false,
        holdT: 0, kb: 0, inv: 0, pending: null, lastJumpT: -1, fire: 0, recoil: 0, lastGround: x,
        spr: this.add.sprite(x, GY, 'hero', 12).setOrigin(0.5, 47 / 48).setDepth(25),
      };
      this.hero.spr.play('hero_ride'); this.hero.anim = 'hero_ride';
    }
    makeTrolley() {
      const hx = this.L.hitch_x * TILE;
      this.trolley = { x: hx, y: GY, hp: ESC.trolley_hp, inv: 0, hitched: false, spr: this.add.sprite(hx, GY, 'npc_oma_trolley', 0).setOrigin(0.5, 1).setDepth(24) };
    }
    makeTruck() {
      this.truck = { spr: this.add.sprite(-200, GY + 2, 'npc_truck', 0).setOrigin(0, 1).setDepth(40), on: false, x: -200 };
      this.truck.spr.play('truck_drive');
    }

    // ------------------------------------------------------------ main loop
    update(time, deltaMs) {
      const dt = Math.min(deltaMs / 1000, 1 / 30);
      if (this.hitstop > 0) { this.hitstop -= dt; return; }
      this.time0 += dt;
      const h = this.hero;
      if (this.attract) this.updateAttract(dt);
      else if (!this.dead && !this.ended) this.handleInput(dt);
      if (!this.dead) this.moveHero(dt);
      else { h.vy += M.gravity * dt; h.y += h.vy * dt; h.x += h.vx * dt; }
      this.updateCamera(dt);
      if (!this.attract) {
        this.updateTrolley(dt);
        this.updateTruck(dt);
        this.updateBoss(dt);
        this.updateEnemies(dt);
        this.updateGun(dt);
        this.updateBullets(dt);
        this.updateHazards(dt);
        this.updatePickups(dt);
        this.updateKnoedels(dt);
        this.updateSignsEvents();
        if (!this.dead && !this.ended) { this.checkContacts(); this.checkWin(); }
        this.refreshHud();
      }
      this.drawHero(dt);
      const sx = this.cameras.main.scrollX;
      this.parallax.forEach(p => { p.spr.tilePositionX = Math.round(sx * p.f); });
    }

    updateAttract(dt) {
      const h = this.hero;
      if (h.x > (this.W - 30) * TILE) { h.x -= 400 * TILE; this.cameras.main.scrollX -= 400 * TILE; }
      if (h.grounded && Math.random() < dt * 0.2) this.jump();
    }

    // ------------------------------------------------------------ input -> hero actions
    handleInput(dt) {
      const h = this.hero;
      const q = INPUT.queue.splice(0);
      for (const ev of q) {
        if (ev.type === 'press') {
          if (h.grounded || h.coyote > 0) this.jump();
          else if (!h.pending) h.pending = { t: 0.08 };
        } else if (ev.type === 'swipe' || ev.type === 'slam') {
          if (!h.grounded || (this.time0 - h.lastJumpT) < 0.2) { h.pending = null; this.slam(); }
        }
      }
      if (h.pending) {
        h.pending.t -= dt;
        if (h.pending.t <= 0) {
          h.pending = null;
          if (h.grounded) this.jump();
          else if (h.airJumps > 0) this.doubleJump();
          else h.buffer = M.jump_buffer_s;
        }
      }
    }
    jump() {
      const h = this.hero;
      h.vy = -M.jump_velocity; h.grounded = false; h.coyote = 0; h.lastJumpT = this.time0; h.slamming = false;
      SFX.play('jump'); this.dust(h.x, h.y);
    }
    doubleJump() {
      const h = this.hero; h.vy = -M.double_jump_velocity; h.airJumps--; h.slamming = false;
      SFX.play('djump'); this.dust(h.x, h.y, 2);
      this.tweens.add({ targets: h.spr, angle: { from: 0, to: -360 }, duration: 320, onComplete: () => h.spr.setAngle(0) });
    }
    slam() {
      const h = this.hero; if (h.slamming) return;
      h.slamming = true; h.vy = M.slam_speed; h.vx *= M.slam_x_speed_factor; h.spr.setAngle(0); SFX.play('throw');
    }

    speedProfile() {
      if (this.mode === 'escort' && this.trolley && this.trolley.hitched) return { run: ESC.run_speed, brake: ESC.brake_speed, back: ESC.back_off_speed };
      if (this.mode === 'chase' && this.truck && this.truck.on) return { run: CH.hero_run_speed, brake: M.brake_speed, back: M.back_off_speed };
      return { run: M.run_speed, brake: M.brake_speed, back: M.back_off_speed };
    }

    moveHero(dt) {
      const h = this.hero, sp = this.speedProfile();
      if (h.kb > 0) h.kb -= dt;
      else if (this.ended) h.vx = approach(h.vx, 0, M.brake_decel * dt);
      else {
        const brake = INPUT.brake;
        let target, rate;
        if (brake) {
          h.holdT += dt;
          target = h.holdT >= M.back_off_hold_s ? sp.back : sp.brake;
          rate = h.grounded ? M.brake_decel : M.air_brake_decel;
        } else { h.holdT = 0; target = sp.run; rate = h.vx < target ? M.accel_to_run : M.brake_decel; }
        if (h.slamming) target = Math.min(target, sp.run * M.slam_x_speed_factor);
        h.vx = approach(h.vx, target, rate * dt);
      }
      let nx = h.x + h.vx * dt;
      const half = HB_W / 2, yTop = h.y - HB_H - HB_OFF + 1, yBot = h.y - 1;
      if (h.vx > 0) {
        const c = Math.floor((nx + half) / TILE);
        for (let r = rowOf(yTop); r <= rowOf(yBot); r++) if (isSolid(this.cell(c, r))) { nx = c * TILE - half - 0.01; h.vx = 0; break; }
      } else if (h.vx < 0) {
        const c = Math.floor((nx - half) / TILE);
        for (let r = rowOf(yTop); r <= rowOf(yBot); r++) if (isSolid(this.cell(c, r))) { nx = (c + 1) * TILE + half + 0.01; h.vx = 0; break; }
      }
      h.x = nx;
      const cam = this.cameras.main;
      if (this.mode === 'chase' && this.truck && this.truck.on) h.x = Math.min(h.x, cam.scrollX + CH.hero_screen_x_max);
      if (this.mode === 'boss' && this.arenaOn) h.x = clamp(h.x, cam.scrollX + B.hero_screen_x_range[0], cam.scrollX + B.hero_screen_x_range[1]);
      if (this.trolley && this.trolley.hitched) h.x = Math.min(h.x, this.trolley.x + ESC.follow_distance_px + 6);
      if (!(this.mode === 'chase' && this.truck && this.truck.on)) h.x = Math.max(h.x, cam.scrollX + 8, 8);
      // vertical
      const wasGrounded = h.grounded, prevY = h.y;
      if (h.slamming) h.vy = M.slam_speed; else h.vy = Math.min(h.vy + M.gravity * dt, M.max_fall_speed);
      let ny = h.y + h.vy * dt;
      h.grounded = false;
      const cL = Math.floor((h.x - half + 1) / TILE), cR = Math.floor((h.x + half - 1) / TILE);
      if (h.vy >= 0) {
        for (let r = rowOf(prevY - 0.01); r <= rowOf(ny); r++) {
          const ty = rowTop(r); if (ty < prevY - 0.01 || ty > ny) continue;
          let hit = false;
          for (let c = cL; c <= cR; c++) { const v = this.cell(c, r); if (isSolid(v) || (v === ONEWAY && prevY <= ty + 0.01)) hit = true; }
          if (hit) { ny = ty; h.vy = 0; h.grounded = true; break; }
        }
      } else {
        const headOld = prevY - HB_H - HB_OFF, headNew = ny - HB_H - HB_OFF;
        for (let r = rowOf(headOld); r >= rowOf(headNew); r--) {
          let hit = false;
          for (let c = cL; c <= cR; c++) if (isSolid(this.cell(c, r))) hit = true;
          if (hit && rowTop(r + 1) <= headOld + 0.01) { ny = rowTop(r + 1) + HB_H + HB_OFF; h.vy = 0; break; }
        }
      }
      h.y = ny;
      if (h.grounded) {
        if (!wasGrounded) this.onLand();
        h.coyote = M.coyote_time_s; h.airJumps = M.air_jumps; h.lastGround = h.x;
        if (h.buffer > 0) { h.buffer = 0; this.jump(); }
      } else { h.coyote -= dt; if (h.buffer > 0) h.buffer -= dt; }
      if (h.inv > 0) h.inv -= dt;
      if (!this.attract && h.y > 216 + 40 && !this.dead) this.fellInPit();
    }

    onLand() {
      const h = this.hero;
      if (!h.slamming) { SFX.play('land'); this.dust(h.x, h.y, 1); return; }
      h.slamming = false;
      const R = this.stats.slam_radius, D = this.stats.slam_damage;
      SFX.play('slam'); this.shake(4, 160); this.hitstop = 0.05;
      const fx = this.add.sprite(h.x, h.y + 1, 'fx_slam', 0).setOrigin(0.5, 1).setDepth(34).setScale(R / 24, 1);
      fx.play('slam_impact'); fx.once('animationcomplete', () => fx.destroy());
      this.dust(h.x - 8, h.y, 3); this.dust(h.x + 8, h.y, 3);
      this.objs.enemies.forEach(e => { if (e.alive && Math.abs(e.x - h.x) <= R + e.w / 2 && Math.abs(e.y - h.y) <= 28) this.damageEnemy(e, D, h.x); });
      if (this.boss && this.boss.alive && Math.abs(this.boss.x - h.x) <= R + B.hitbox[0] / 2) this.damageBoss(D);
      const c0 = Math.floor((h.x - R) / TILE), c1 = Math.floor((h.x + R) / TILE);
      for (let c = c0; c <= c1; c++) for (let r = rowOf(h.y - 20); r <= rowOf(h.y + 2); r++) if (this.cell(c, r) === CRATE) this.hitCrate(c, r, 99);
      this.objs.lids.forEach(l => { if (Math.abs(l.x - h.x) < R && Math.abs(l.y - h.y) < 30) this.killLid(l); });
    }

    fellInPit() {
      const h = this.hero;
      SFX.play('pit');
      if (this.loseHeart(PL.pit_damage_hearts)) return;
      const gx = Math.floor(h.x / TILE);
      const gap = this.gaps.filter(g => g.x <= gx + 2).sort((a, b) => b.x - a.x)[0];
      let rx = gap ? (gap.x - PL.pit_respawn_back_tiles) * TILE + 8 : h.lastGround;
      if (this.mode === 'chase' && this.truck.on && gap) {
        const cam = this.cameras.main;
        if (rx < cam.scrollX + CH.truck_warning_screen_x + 16) rx = (gap.x + gap.w + 1) * TILE + 8;
      }
      h.x = rx; h.y = GY; h.vx = 0; h.vy = 0; h.slamming = false; h.inv = PL.invuln_after_hit_s; h.kb = 0; h.grounded = true;
      while (this.solidAt(h.x, h.y - 2) && h.y > 40) h.y -= TILE;
      if (this.trolley && this.trolley.hitched) this.trolley.x = h.x - ESC.follow_distance_px;
    }

    // returns true if this killed the hero
    loseHeart(n) {
      this.hearts -= n; this.shake(5, 220); this.flashScreen();
      SFX.play('hurt');
      if (this.hearts <= 0) { this.hearts = 0; this.die(); return true; }
      return false;
    }
    hurtHero() {
      const h = this.hero;
      if (h.inv > 0 || this.dead || this.ended) return;
      h.inv = PL.invuln_after_hit_s; h.kb = PL.knockback_s;
      h.vx = PL.knockback_vx; h.vy = -Math.abs(PL.knockback_vy); h.slamming = false; h.grounded = false;
      this.hitstop = 0.06;
      this.loseHeart(1);
    }
    die(reasonKey) {
      if (this.dead || this.ended) return;
      this.dead = true; INPUT.enabled = false;
      const h = this.hero; h.vx = -30; h.vy = -220; h.spr.stop(); h.spr.setFrame(7);
      SFX.play('lose'); SFX.music(null); UI.hud.warn(null);
      this.deathKey = reasonKey || this.L.death_extra_key;
      this.refreshHud(true);
      this.time.delayedCall(FL.death_freeze_s * 1000 + 300, () => {
        UI.death(this.levelNum, this.deathKey, () => GAMEFLOW.startLevel(this.levelNum, true), () => GAMEFLOW.toMap());
      });
    }

    // ------------------------------------------------------------ camera
    updateCamera(dt) {
      const cam = this.cameras.main, h = this.hero, maxX = this.W * TILE - this.viewW;
      if (this.mode === 'chase' && this.truck && this.truck.on) {
        if (!this.ended && !this.dead) cam.scrollX = Math.min(maxX, cam.scrollX + CH.camera_speed * dt);
      } else if (this.mode === 'boss' && this.arenaOn) {
        if (!this.ended && !this.dead) cam.scrollX = Math.min(maxX, cam.scrollX + B.arena_scroll_speed * dt);
      } else if (!this.dead) {
        const target = clamp(h.x - CAM.follow_screen_x, 0, maxX);
        cam.scrollX += (target - cam.scrollX) * Math.min(1, CAM.lerp_per_s * dt);
      }
    }

    // ------------------------------------------------------------ escort trolley
    updateTrolley(dt) {
      const tr = this.trolley; if (!tr) return;
      const h = this.hero;
      if (!tr.hitched) {
        if (h.x >= tr.x + ESC.follow_distance_px) {
          tr.hitched = true; SFX.play('item'); UI.hud.toast(t('oma_hitch'), 2600);
          this.objs.signs.forEach(s => { if (s.x < tr.x) s.done = true; });
        }
      } else if (!this.dead) {
        let want = h.x - ESC.follow_distance_px;
        // crates stop the trolley (and therefore the hero, through the leash)
        const front = want + 17, c = Math.floor(front / TILE);
        if (isSolid(this.cell(c, GROUND_ROW - 1))) want = Math.min(want, c * TILE - 17.01);
        tr.x = Math.max(Math.min(want, tr.x + 400 * dt), tr.x - 400 * dt);
        const rolling = Math.abs(h.vx) > 5 && tr.inv <= 0;
        if (rolling && !tr.spr.anims.isPlaying) tr.spr.play('oma_roll'); else if (!rolling && tr.inv <= 0 && tr.spr.anims.isPlaying) tr.spr.stop();
      }
      if (tr.inv > 0) { tr.inv -= dt; tr.spr.setAlpha(Math.floor(tr.inv * 10) % 2 ? 0.4 : 1); } else tr.spr.setAlpha(1);
      tr.spr.x = Math.round(tr.x); tr.spr.y = GY;
    }
    hurtTrolley(n) {
      const tr = this.trolley; if (!tr || !tr.hitched || tr.inv > 0 || this.dead || this.ended) return;
      tr.hp -= n; tr.inv = ESC.invuln_after_hit_s; SFX.play('hurt'); this.shake(3, 140); tr.spr.play('oma_hurt');
      if (tr.hp <= 0) { tr.hp = 0; this.die('death_oma'); }
    }
    trolleyBox() { const tr = this.trolley; return { x0: tr.x - ESC.hurtbox[0] / 2, x1: tr.x + ESC.hurtbox[0] / 2, y0: GY - ESC.hurtbox[1], y1: GY }; }

    // ------------------------------------------------------------ chase truck and drops
    updateTruck(dt) {
      const tk = this.truck; if (!tk) return;
      const cam = this.cameras.main, h = this.hero;
      if (!tk.on && !this.ended && this.time0 > 0.8) {
        tk.on = true; SFX.play('honk'); tk.spr.play('truck_honk'); tk.spr.once('animationcomplete', () => tk.spr.play('truck_drive')); UI.hud.toast(t('truck_honk'), 2200); this.shake(3, 300);
        SFX.music('boss');
      }
      if (tk.on) {
        const targetX = this.ended ? cam.scrollX - 140 : cam.scrollX + CH.truck_kill_zone_screen_x - 100;
        tk.x = this.ended ? tk.x - 10 * dt : approach(tk.x, targetX, 220 * dt);
        if (this.ended && this.bridgeX) tk.x = Math.min(tk.x, this.bridgeX - 100);
        tk.spr.x = Math.round(tk.x + Math.sin(this.time0 * 20) * 0.6);
        const sx = h.x - cam.scrollX;
        if (!this.ended && !this.dead) {
          const danger = sx < CH.truck_warning_screen_x; UI.hud.warn(danger ? t('hud_truck_warning') : null);
          if (danger && Math.floor(this.time0 * 8) % 2) tk.spr.setTintFill(0xffffff); else tk.spr.clearTint();
          if (sx < CH.truck_kill_zone_screen_x) { this.shake(8, 400); SFX.play('honk'); this.hearts = 0; this.die('death_truck'); }
        }
      } else tk.spr.x = cam.scrollX - 200;
      // sofa / fridge drops: marker appears marker_lead_s before the hero arrives
      const D = HZ.sperrmuell_drop;
      this.objs.drops.forEach(d => {
        if (d.state === 'wait') {
          const eta = (d.x - h.x) / Math.max(40, h.vx);
          if (d.x - h.x < 420 && eta <= D.marker_lead_s + 0.6) {
            d.state = 'marker'; d.t = 0.6 + Math.max(0, Math.min(D.marker_lead_s, eta) - 0.6);
            const sz = D.sizes[d.size]; d.w = sz.w_tiles; d.h = sz.h_tiles;
            const mk = d.w >= 3 ? 'hz_landing_marker_48' : 'hz_landing_marker_16';
            d.mk = this.add.sprite(d.x + d.w * 8, GY, mk, 0).setOrigin(0.5, 1).setDepth(11); d.mk.play(mk.replace('hz_', ''));
            SFX.play('warn');
          }
        } else if (d.state === 'marker') {
          d.t -= dt;
          if (d.t <= 0) {
            d.state = 'fall'; d.y = -40;
            d.spr = this.add.image(d.x + d.w * 8, d.y, 'hz_' + d.size).setOrigin(0.5, 1).setDepth(19);
          }
        } else if (d.state === 'fall') {
          d.y += 520 * dt; d.spr.y = d.y;
          if (d.y >= GY) {
            d.state = 'landed'; d.spr.y = GY; d.mk.destroy(); SFX.play('crate'); this.shake(4, 180);
            this.dust(d.x + 4, GY, 2); this.dust(d.x + d.w * TILE - 4, GY, 2);
            const c0 = Math.floor(d.x / TILE);
            if (h.x + HB_W / 2 > d.x && h.x - HB_W / 2 < d.x + d.w * TILE && h.y > GY - d.h * TILE - 4) this.hurtHero();
            for (let c = c0; c < c0 + d.w; c++) for (let k = 1; k <= d.h; k++) this.setCell(c, GROUND_ROW - k, JUNK);
            this.junk.push(d);
            if (this.hero.x > d.x - 4 && this.hero.x < d.x + d.w * TILE + 4) this.hero.y = Math.min(this.hero.y, GY - d.h * TILE);
          }
        }
      });
    }
    smashJunk(d) {
      if (d.state !== 'landed') return;
      d.state = 'gone'; const c0 = Math.floor(d.x / TILE);
      for (let c = c0; c < c0 + d.w; c++) for (let k = 1; k <= d.h; k++) this.setCell(c, GROUND_ROW - k, EMPTY);
      this.poof(d.x + d.w * 8, GY - d.h * 8); for (let i = 0; i < 6; i++) this.debris(d.x + d.w * 8, GY - d.h * 8, 'wood');
      d.spr.destroy(); SFX.play('crate');
    }

    // ------------------------------------------------------------ boss
    startArena() {
      this.arenaOn = true;
      const cam = this.cameras.main;
      const sx = cam.scrollX + this.viewW - (384 - B.screen_x);
      const spr = this.add.sprite(sx + 120, GY, 'boss_buergermeister', 6).setOrigin(0.5, 1).setDepth(22).setFlipX(true);
      spr.play('boss_walk');
      this.boss = { hp: B.hp_total, phase: 1, inv: 0, alive: true, spr, x: sx + 120, entering: true, timers: {}, waveCount: 0, telegraph: null, flashT: 0 };
      this.tweens.add({ targets: this.boss, x: sx, duration: 1400, ease: 'Quad.out', onComplete: () => { this.boss.entering = false; this.boss.spr.play('boss_idle'); } });
      this.setupPhase(1);
      SFX.music('boss'); SFX.play('stamp'); this.shake(4, 300);
      UI.hud.toast(t('boss_intro'), 2400);
      UI.hud.boss(1);
    }
    setupPhase(p) {
      const bs = this.boss; bs.phase = p; bs.attacks = B.phases[p - 1].attacks.map(a => ({ a, t: (a.offset_s || 0) + (p === 1 ? 2.0 : 1.5), n: 0 }));
    }
    updateBoss(dt) {
      if (this.mode !== 'boss') return;
      const cam = this.cameras.main, h = this.hero;
      if (!this.arenaOn && !this.dead && h.x >= this.L.arena_start_x * TILE) this.startArena();
      const bs = this.boss; if (!bs) return;
      const anchor = cam.scrollX + this.viewW - (384 - B.screen_x);
      if (!bs.entering && bs.alive) bs.x = anchor;
      if (bs.alive && !bs.entering) bs.spr.x = Math.round(bs.x + Math.sin(this.time0 * 3) * 2);
      else bs.spr.x = Math.round(bs.x);
      if (bs.inv > 0) { bs.inv -= dt; bs.spr.setAlpha(Math.floor(bs.inv * 8) % 2 ? 0.6 : 1); } else bs.spr.setAlpha(1);
      if (bs.flashT > 0) { bs.flashT -= dt; if (bs.flashT <= 0) bs.spr.clearTint(); }
      if (!bs.alive || bs.entering || this.dead) return;
      if (bs.inv > 0) return;
      if (bs.spr.anims.currentAnim && bs.spr.anims.currentAnim.key === 'boss_rage') bs.spr.play('boss_idle');
      // attacks
      bs.attacks.forEach(at => {
        at.t -= dt;
        if (at.t > 0) return;
        const a = at.a;
        at.t = a.interval_s;
        if (a.type === 'stamp_shockwave' || a.type === 'double_stamp') {
          if (bs.telegraph) { at.t = 0.4; return; }
          at.n++;
          const big = a.every_second_wave && at.n % 2 === 0;
          bs.telegraph = { t: a.telegraph_s, a, big };
          bs.spr.stop(); bs.spr.setFrame(13); SFX.play('warn');
          if (big) UI.hud.toast(t('boss_big_stamp'), 1200);
        } else if (a.type === 'aktenstapel') {
          const tx = clamp(h.x, cam.scrollX + 16, cam.scrollX + this.viewW - 120);
          const relX = tx - cam.scrollX;
          const sh = this.add.sprite(tx, GY + 1, 'hz_shadow_24', 0).setOrigin(0.5, 1).setDepth(11);
          this.objs.files.push({ relX, x: tx, y: -30, a, t: a.telegraph_s, sh, spr: null, hp: a.hp, alive: true });
          SFX.play('warn');
        } else if (a.type === 'summon') {
          const alive = this.objs.enemies.filter(e => e.alive && e.type === a.enemy).length;
          for (let i = 0; i < Math.min(a.count, a.max_alive - alive); i++) {
            const e = this.spawnEnemy(a.enemy, bs.x - 10 - i * 26, GY, { noDrop: a.bottle_drop_override === 0 });
            if (e) { e.active = true; this.poof(e.x, GY - 12); }
          }
        }
      });
      if (bs.telegraph) {
        bs.telegraph.t -= dt;
        if (bs.telegraph.t <= 0) {
          const { a, big } = bs.telegraph; bs.telegraph = null;
          bs.spr.play({ key: 'boss_stamp', startFrame: 2 }); bs.spr.once('animationcomplete', () => bs.alive && bs.spr.play('boss_idle'));
          const n = a.waves || 1;
          for (let i = 0; i < n; i++) this.time.delayedCall(i * (a.wave_gap_s || 0) * 1000, () => this.spawnWave(a, big));
        }
      }
    }
    spawnWave(a, big) {
      const bs = this.boss; if (!bs || !bs.alive || this.dead) return;
      const hgt = big ? a.every_second_wave.wave_h : a.wave_h;
      SFX.play('stamp'); this.shake(big ? 6 : 3, 160);
      const wk = big ? 'boss_stamp_wave_big' : 'boss_stamp_wave';
      const spr = this.add.sprite(bs.x - 30, GY, wk, 0).setOrigin(0.5, 1).setDepth(33).setFlipX(true); spr.play(big ? 'stamp_wave_big' : 'stamp_wave');
      this.objs.waves.push({ x: bs.x - 30, vx: B.arena_scroll_speed - a.wave_speed_screen, w: a.wave_w, h: hgt, spr, dmg: a.damage, alive: true });
      const label = this.add.text(bs.x - 16, GY - 80, t(big ? 'boss_big_stamp' : 'boss_stamp'), { fontFamily: '"Pixelify Sans", Pixelify, sans-serif', fontSize: '10px', color: '#c43c3c', stroke: '#1a1426', strokeThickness: 3 }).setOrigin(0.5).setDepth(50).setAngle(-8);
      this.tweens.add({ targets: label, y: label.y - 16, alpha: 0, duration: 700, delay: 300, onComplete: () => label.destroy() });
    }
    damageBoss(dmg) {
      const bs = this.boss; if (!bs || !bs.alive || bs.inv > 0 || bs.entering) return false;
      bs.hp -= dmg; this.charge += dmg * SP.charge_per_boss_damage;
      bs.spr.setTintFill(0xffffff); bs.flashT = 0.05;
      if (!bs.telegraph && (!bs.spr.anims.isPlaying || bs.spr.anims.currentAnim.key === 'boss_idle')) { bs.spr.play('boss_hit'); bs.spr.once('animationcomplete', () => bs.alive && !bs.telegraph && bs.spr.play('boss_idle')); }
      SFX.play('hit');
      const thr = B.phase_hp_thresholds;
      if (bs.hp <= 0) { this.defeatBoss(); return true; }
      const newPhase = bs.hp <= thr[2] ? 3 : bs.hp <= thr[1] ? 2 : 1;
      if (newPhase !== bs.phase) {
        bs.inv = B.transition_invuln_s; bs.telegraph = null;
        this.setupPhase(newPhase); bs.spr.clearTint(); bs.flashT = 0; bs.spr.play('boss_rage'); SFX.play('honk'); this.shake(5, 300);
        const ev = (this.L.events || []).find(e => e.type === 'boss_phase' && e.phase === newPhase);
        if (ev) UI.hud.toast(t(ev.text_key), 2400);
        this.objs.files.forEach(f => this.killFile(f));
      }
      return true;
    }
    defeatBoss() {
      const bs = this.boss; bs.alive = false; bs.hp = 0; this.ended = true; INPUT.enabled = false;
      UI.hud.toast(t('boss_defeat'), 3000); bs.spr.clearTint(); bs.spr.play('boss_defeat'); SFX.play('win'); SFX.music(null);
      this.objs.waves.forEach(w => { w.alive = false; w.spr.destroy(); }); this.objs.waves = [];
      this.objs.files.forEach(f => this.killFile(f));
      this.objs.enemies.forEach(e => e.alive && this.killEnemy(e, true));
      for (let i = 0; i < 8; i++) this.time.delayedCall(i * 220, () => { this.poof(bs.x + Math.random() * 40 - 20, GY - Math.random() * 60); this.shake(3, 120); SFX.play('poof'); });
      this.time.delayedCall(1800, () => {
        this.hat(bs.x, GY - 70, 'boss'); bs.spr.setVisible(false); this.poof(bs.x, GY - 30);
        for (let i = 0; i < B.bottle_drop; i++) { const p = this.addPickup('bottle', bs.x + Math.random() * 30 - 15, GY - 40 - Math.random() * 30, true); p.mag = true; }
      });
      this.time.delayedCall(3600, () => this.finishWin());
    }

    // ------------------------------------------------------------ enemies
    enemyTarget(e) {
      const tr = this.trolley;
      if (tr && tr.hitched && Math.abs(e.x - tr.x) < Math.abs(e.x - this.hero.x)) return { x: tr.x, vx: this.hero.vx, y: GY - 10 };
      return { x: this.hero.x, vx: this.hero.vx, y: this.hero.y - 16 };
    }
    updateEnemies(dt) {
      const cam = this.cameras.main, right = cam.scrollX + this.viewW + 24;
      this.objs.enemies.forEach(e => {
        if (!e.alive) return;
        if (!e.active) { if (e.x < right) { e.active = true; } else return; }
        if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0) e.spr.clearTint(); }
        const d = EN[e.type], tg = this.enemyTarget(e), dist = e.x - tg.x;
        e.t -= dt;
        if (e.type === 'jogger') {
          if (e.state === 'idle') { e.vx = -d.speed; if (dist > 0 && dist < d.lunge_trigger_px + 12 && e.y >= GY - 1) { e.state = 'tele'; e.t = d.lunge_telegraph_s; e.vx = 0; e.spr.stop(); e.spr.setFrame(7); } }
          else if (e.state === 'tele') { e.spr.x += Math.sin(this.time0 * 60) * 0.5; if (e.t <= 0) { e.state = 'lunge'; e.t = d.lunge_s; e.vx = -d.lunge_speed; e.spr.setFrame(9); } }
          else if (e.state === 'lunge') { if (e.t <= 0) { e.state = 'idle'; e.spr.play('jogger_walk'); } }
          this.walkerPhysics(e, dt);
        } else if (e.type === 'gnome') {
          e.vx = -d.speed; e.hop -= dt;
          if (e.hop <= 0 && e.vy === 0 && e.y >= this.floorBelow(e.x, e.y) - 0.5) { e.hop = d.hop_interval_s; e.vy = -Math.sqrt(2 * 400 * d.hop_height); e.spr.play('gnome_hop'); }
          this.walkerPhysics(e, dt, 400);
        } else if (e.type === 'dackel') {
          if (e.state === 'idle') { if (!e.anim) { e.spr.play('dackel_idle'); e.anim = 1; } if (dist > 0 && dist < d.trigger_range_px) { e.state = 'tele'; e.t = d.charge_telegraph_s; e.spr.play({ key: 'dackel_bark', repeat: -1 }); SFX.play('bark'); } }
          else if (e.state === 'tele') { if (e.t <= 0) { e.state = 'charge'; e.t = d.charge_max_s; e.vx = -d.charge_speed; e.spr.play('dackel_run'); } }
          else if (e.state === 'charge') { if (e.t <= 0) e.vx = approach(e.vx, -40, 200 * dt); }
          this.walkerPhysics(e, dt);
        } else if (e.type === 'neighbour') {
          if (e.state === 'idle') {
            if (!e.anim) { e.spr.play('neighbour_idle'); e.anim = 1; }
            if (dist > -60 && dist < d.activate_range_px && e.x < cam.scrollX + this.viewW - 8) {
              if (e.t <= 0) { e.state = 'tele'; e.t = d.throw_telegraph_s; e.spr.play('neighbour_raise'); SFX.play('warn'); }
            }
          } else if (e.state === 'tele') {
            if (e.t <= 0) { e.state = 'idle'; e.anim = 0; e.t = d.throw_interval_s; e.spr.play('neighbour_throw'); this.throwLid(e); }
          }
          if (!e.fixed) this.walkerPhysics(e, dt);
        }
        e.spr.setFlipX(e.type === 'neighbour' ? dist < 0 : true);
        if (e.state !== 'tele' || e.type !== 'jogger') e.spr.x = Math.round(e.x);
        e.spr.y = Math.round(e.y);
        if (e.x < cam.scrollX - 80 || e.y > 260) { e.alive = false; e.spr.destroy(); }
      });
      if (this.objs.enemies.length > 60) this.objs.enemies = this.objs.enemies.filter(e => e.alive);
      // lids
      this.objs.lids.forEach(l => {
        if (!l.alive) return;
        l.vy += 400 * dt; l.x += l.vx * dt; l.y += l.vy * dt; l.spr.setPosition(Math.round(l.x), Math.round(l.y));
        if (l.y >= GY - 3 || this.solidAt(l.x, l.y)) this.killLid(l);
      });
      this.objs.lids = this.objs.lids.filter(l => l.alive);
    }
    walkerPhysics(e, dt, grav) {
      e.vy += (grav || M.gravity) * dt; e.y += e.vy * dt;
      const nx = e.x + e.vx * dt;
      if (!this.solidAt(nx - (e.vx < 0 ? e.w / 2 : -e.w / 2), e.y - 4)) e.x = nx;
      else if (e.type === 'jogger' || e.type === 'dackel') e.vx = 0;
      const f = this.floorBelow(e.x, e.y - e.vy * dt);
      if (e.vy >= 0 && e.y >= f) { e.y = f; e.vy = 0; }
    }
    throwLid(e) {
      const d = EN.neighbour, tg = this.enemyTarget(e), f = d.lid_flight_s, g = 400;
      const tx = tg.x + tg.vx * f, ty = tg.y, sx = e.x - 4, sy = e.y - 30;
      const l = { x: sx, y: sy, vx: (tx - sx) / f, vy: (ty - sy - 0.5 * g * f * f) / f, alive: true, hp: d.lid_hp,
        spr: this.add.sprite(sx, sy, 'proj_lid', 0).setDepth(30) };
      l.spr.play('lid_spin'); SFX.play('throw');
      this.objs.lids.push(l);
    }
    killLid(l) {
      if (!l.alive) return; l.alive = false;
      l.spr.play('lid_break'); l.spr.once('animationcomplete', () => l.spr.destroy()); SFX.play('crate');
    }
    damageEnemy(e, dmg, fromX) {
      if (!e.alive) return;
      e.hp -= dmg;
      if (e.hp <= 0) { this.killEnemy(e); return; }
      e.spr.setTintFill(0xffffff); e.flashT = 0.05;
      if (e.type !== 'neighbour' || !e.fixed) e.x += (e.x >= fromX ? 2 : -2);
      SFX.play('hit');
    }
    killEnemy(e, silent) {
      e.alive = false;
      const key = e.type + '_defeat';
      e.spr.clearTint(); e.spr.play(key);
      e.spr.once('animationcomplete', () => { this.poof(e.spr.x, e.spr.y - e.h / 2); e.spr.destroy(); });
      this.hat(e.x, e.y - e.h, e.type);
      SFX.play('poof'); this.hitstop = Math.max(this.hitstop, 0.025);
      if (!silent) {
        this.charge += SP.charge_per_kill;
        for (let i = 0; i < e.drops; i++) this.addPickup('bottle', e.x, e.y - 14, true);
      }
    }

    // ------------------------------------------------------------ guns
    muzzles() { const h = this.hero; return [[h.x + 21, h.y - 10], [h.x + 21, h.y - 4]]; }
    findTarget(mx, my) {
      const R = GUN.auto_target_range, cone = GUN.auto_target_cone_deg * Math.PI / 180;
      const ok = (x, y) => { const dx = x - mx, dy = y - my; if (dx < 4) return false; const d = Math.hypot(dx, dy); if (d > R) return false; return Math.abs(Math.atan2(dy, dx)) <= cone; };
      let best = null, bd = 1e9;
      const consider = (x, y, pr) => { if (!ok(x, y)) return; const d = Math.hypot(x - mx, y - my) - pr; if (d < bd) { bd = d; best = { x, y }; } };
      this.objs.lids.forEach(l => { if (l.alive && Math.hypot(l.x - mx, l.y - my) < GUN.projectile_priority_range) consider(l.x, l.y, 1000); });
      this.objs.files.forEach(f => { if (f.alive && f.spr && Math.hypot(f.x - mx, f.y - my) < GUN.projectile_priority_range) consider(f.x, f.y - 10, 1000); });
      if (best) return best;
      this.objs.enemies.forEach(e => { if (e.alive && e.active) consider(e.x, e.y - e.h / 2, 0); });
      if (this.boss && this.boss.alive && !this.boss.entering) consider(this.boss.x, GY - 34, 0);
      if (best) return best;
      const c0 = Math.floor(mx / TILE), c1 = Math.floor((mx + R) / TILE);
      for (let c = c0; c <= c1 && !best; c++) for (let r = GROUND_ROW - 1; r >= 0; r--) if (this.cell(c, r) === CRATE) { consider(c * TILE + 8, rowTop(r) + 8, 0); if (best) break; }
      return best;
    }
    updateGun(dt) {
      const h = this.hero;
      h.fire -= dt;
      if (this.dead || this.ended || h.fire > 0) return;
      h.gunSide = (h.gunSide || 0) ^ 1;
      const [mx, my] = this.muzzles()[h.gunSide];
      const tg = this.findTarget(mx, my);
      if (!tg) { h.fire = 0.05; return; }
      h.fire = 1 / this.stats.fire_rate_per_s;
      const base = Math.atan2(tg.y - my, tg.x - mx);
      [0].concat(this.stats.extra_bullet_angles_deg).forEach(deg => {
        const a = base + deg * Math.PI / 180;
        const spr = this.add.sprite(mx + 1, my, 'fx_bullet', 0).setDepth(32).setRotation(a);
        spr.play('bullet_fly');
        this.objs.bullets.push({ x: mx + 1, y: my, vx: Math.cos(a) * GUN.bullet_speed, vy: Math.sin(a) * GUN.bullet_speed, life: GUN.bullet_lifetime_s, spr, alive: true });
      });
      const fl = this.add.sprite(mx, my, 'fx_muzzle_flash', 0).setOrigin(0, 0.5).setDepth(31);
      fl.play('muzzle_flash'); fl.once('animationcomplete', () => fl.destroy());
      h.recoil = 0.06;
      SFX.play('shoot');
    }
    updateBullets(dt) {
      const bonus = GUN.enemy_hitbox_bonus_px, hb = GUN.bullet_hitbox_px / 2;
      this.objs.bullets.forEach(b => {
        if (!b.alive) return;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        b.spr.setPosition(Math.round(b.x), Math.round(b.y));
        const hit = () => { b.alive = false; b.spr.setRotation(0); b.spr.play('bullet_hit'); b.spr.once('animationcomplete', () => b.spr.destroy()); };
        if (b.life <= 0) { b.alive = false; b.spr.destroy(); return; }
        const c = Math.floor(b.x / TILE), r = rowOf(b.y), v = this.cell(c, r);
        if (v === CRATE) { this.hitCrate(c, r, GUN.bullet_damage); hit(); return; }
        if (v === SOLID || v === JUNK) { hit(); return; }
        for (const l of this.objs.lids) if (l.alive && Math.abs(l.x - b.x) < 6 + hb + bonus && Math.abs(l.y - b.y) < 3 + hb + bonus) { this.killLid(l); hit(); return; }
        for (const f of this.objs.files) if (f.alive && f.spr && Math.abs(f.x - b.x) < 12 + hb && b.y > f.y - 20 - hb && b.y < f.y + hb) { this.killFile(f); hit(); return; }
        for (const e of this.objs.enemies) {
          if (!e.alive || !e.active) continue;
          if (Math.abs(e.x - b.x) < e.w / 2 + hb + bonus && b.y > e.y - e.h - hb - bonus && b.y < e.y + hb + bonus) { this.damageEnemy(e, GUN.bullet_damage, b.x - b.vx); this.spark(b.x, b.y); hit(); return; }
        }
        const bs = this.boss;
        if (bs && bs.alive && !bs.entering && Math.abs(bs.x - b.x) < B.hitbox[0] / 2 + hb && b.y > GY - B.hitbox[1]) {
          if (bs.inv <= 0) { this.damageBoss(GUN.bullet_damage); this.spark(b.x, b.y); } hit(); return;
        }
      });
      this.objs.bullets = this.objs.bullets.filter(b => b.alive);
    }

    // ------------------------------------------------------------ hazards
    heroBox() { const h = this.hero; return { x0: h.x - HB_W / 2, x1: h.x + HB_W / 2, y0: h.y - HB_OFF - HB_H, y1: h.y - HB_OFF }; }
    overlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
    updateHazards(dt) {
      const h = this.hero, P = HZ.blumentopf, hb = this.heroBox(), tb = this.trolley && this.trolley.hitched ? this.trolleyBox() : null;
      this.objs.pots.forEach(p => {
        if (p.state === 'idle') { if (p.x - h.x < P.trigger_ahead_px) { p.state = 'tele'; p.t = P.telegraph_s; p.spr.play('blumentopf_wobble'); p.sh.setAlpha(0.5); } }
        else if (p.state === 'tele') { p.t -= dt; if (p.t <= 0) { p.state = 'fall'; p.spr.stop(); p.spr.setFrame(0); } }
        else if (p.state === 'fall') {
          p.y += P.fall_speed * dt; p.spr.y = Math.round(p.y);
          p.sh.setFrame(Math.min(2, Math.floor(3 * (1 - (GY - p.y) / (GY - p.y0)))));
          const box = { x0: p.x - P.hitbox[0] / 2, x1: p.x + P.hitbox[0] / 2, y0: p.y - P.hitbox[1], y1: p.y };
          if (this.overlap(box, hb)) { this.hurtHero(); this.breakPot(p); }
          else if (tb && this.overlap(box, tb)) { this.hurtTrolley(P.damage); this.breakPot(p); }
          else if (p.y >= GY) this.breakPot(p);
        }
      });
      if (!this.stats.scherben_harmless && h.grounded && h.y >= GY - 0.5) {
        for (const s of this.objs.scherben) if (h.x + HB_W / 2 - 3 > s.x0 && h.x - HB_W / 2 + 3 < s.x1) { this.hurtHero(); break; }
      }
      const cam = this.cameras.main;
      this.objs.waves.forEach(w => {
        if (!w.alive) return;
        w.x += w.vx * dt; w.spr.x = Math.round(w.x);
        const box = { x0: w.x - w.w / 2 + 2, x1: w.x + w.w / 2 - 2, y0: GY - w.h, y1: GY };
        if (this.overlap(box, hb)) this.hurtHero();
        if (w.x < cam.scrollX - 30) { w.alive = false; w.spr.destroy(); }
      });
      this.objs.waves = this.objs.waves.filter(w => w.alive);
      this.objs.files.forEach(f => {
        if (!f.alive) return;
        f.x = cam.scrollX + f.relX; f.sh.x = f.x;
        if (!f.spr) { f.t -= dt; f.sh.setFrame(Math.min(2, Math.floor(3 * (1 - f.t / f.a.telegraph_s)))); if (f.t <= 0) { f.spr = this.add.sprite(f.x, f.y, 'boss_aktenstapel', 0).setOrigin(0.5, 1).setDepth(29); } return; }
        f.y += f.a.fall_speed * dt; f.spr.setPosition(Math.round(f.x), Math.round(f.y));
        const box = { x0: f.x - f.a.w / 2, x1: f.x + f.a.w / 2, y0: f.y - f.a.h, y1: f.y };
        if (this.overlap(box, hb)) { this.hurtHero(); this.killFile(f); }
        else if (f.y >= GY) { this.shake(2, 100); this.killFile(f); }
      });
      this.objs.files = this.objs.files.filter(f => f.alive);
    }
    breakPot(p) {
      p.state = 'gone'; p.sh.destroy(); p.spr.play('blumentopf_break'); p.spr.once('animationcomplete', () => p.spr.destroy()); SFX.play('crate');
    }
    killFile(f) {
      if (!f.alive) return; f.alive = false; f.sh.destroy();
      if (f.spr) { f.spr.play('aktenstapel_break'); f.spr.once('animationcomplete', () => f.spr.destroy()); SFX.play('crate'); }
    }

    // ------------------------------------------------------------ pickups
    updatePickups(dt) {
      const h = this.hero, hx = h.x, hy = h.y - 16, mr = this.stats.magnet_radius, cam = this.cameras.main;
      this.objs.pickups.forEach(p => {
        if (!p.alive) return;
        if (p.loose && !p.mag) {
          p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98;
          const f = this.floorBelow(p.x, p.y + 8) - 8;
          if (p.vy > 0 && p.y >= f) { p.y = f; p.vy *= -0.35; if (Math.abs(p.vy) < 30) { p.vy = 0; p.loose = false; } p.vx *= 0.6; }
        }
        const d = Math.hypot(p.x - hx, p.y - hy);
        if (!p.mag && p.type === 'bottle' && mr > 0 && d < mr) p.mag = true;
        if (p.mag && !this.dead) { const sp = PK.magnet_pull_speed * dt / Math.max(d, 1); p.x += (hx - p.x) * Math.min(1, sp); p.y += (hy - p.y) * Math.min(1, sp); }
        p.spr.setPosition(Math.round(p.x), Math.round(p.y));
        if (!this.dead && d < p.r + 9) this.collect(p);
        else if (PK[p.type] && PK[p.type].mission_item && p.x < cam.scrollX - 8) { p.x = cam.scrollX + this.viewW + 40; p.y = GY - 10; }
      });
      this.objs.pickups = this.objs.pickups.filter(p => p.alive);
    }
    collect(p) {
      p.alive = false; const def = PK[p.type] || {};
      if (def.value) { this.runBottles += def.value; SFX.play(p.type === 'kasten' ? 'kasten' : 'pickup'); }
      if (def.heal_hero) {
        if (this.healsLeft > 0 && this.hearts < this.maxHearts) { this.hearts = Math.min(this.maxHearts, this.hearts + def.heal_hero); this.healsLeft--; SFX.play('heal'); this.sparkle(p.x, p.y, 0xd94c6b); }
        else SFX.play('pickup');
      }
      if (def.heal_trolley && this.trolley) { this.trolley.hp = Math.min(ESC.trolley_hp, this.trolley.hp + def.heal_trolley); SFX.play('heal'); }
      if (def.mission_item && this.items) {
        const i = this.L.win.items.indexOf(p.type); if (i >= 0) this.items[i] = true;
        SFX.play('item'); UI.hud.toast(t('hud_items', { N: this.items.filter(Boolean).length }), 1600);
      }
      const s = p.spr; this.tweens.killTweensOf(s);
      this.tweens.add({ targets: s, y: s.y - 14, alpha: 0, scale: 1.5, duration: 220, onComplete: () => s.destroy() });
    }

    // ------------------------------------------------------------ Knödel special
    fireSpecial() {
      if (this.attract || this.dead || this.ended || !this.stats.special_unlocked || this.charge < this.specialReq) return;
      this.charge = 0;
      const h = this.hero, lvl = this.stats.special_level - 1;
      const spr = this.add.sprite(h.x + 16, h.y, 'fx_knoedel', 0).setOrigin(0.5, 1).setDepth(28);
      spr.play('knoedel_roll'); SFX.play('knoedel'); this.shake(2, 120);
      this.objs.knoedels.push({ x: h.x + 16, y: h.y, life: SP.knoedel_lifetime_s, spr, dmgE: SP.damage_per_enemy[lvl], dmgB: SP.damage_vs_boss[lvl], hitBoss: false, hit: new Set() });
    }
    updateKnoedels(dt) {
      const R = SP.knoedel_radius;
      this.objs.knoedels.forEach(k => {
        if (k.life <= 0) return;
        k.life -= dt; k.x += SP.knoedel_roll_speed * dt;
        const f = this.floorBelow(k.x, k.y); k.y = f === Infinity ? k.y + 200 * dt : f;
        k.spr.setPosition(Math.round(k.x), Math.round(k.y));
        const cx = k.x, cy = k.y - R;
        this.objs.enemies.forEach(e => { if (e.alive && e.active && !k.hit.has(e) && Math.abs(e.x - cx) < R + e.w / 2 && cy + R > e.y - e.h && cy - R < e.y) { k.hit.add(e); this.damageEnemy(e, k.dmgE, cx); } });
        this.objs.lids.forEach(l => { if (l.alive && Math.hypot(l.x - cx, l.y - cy) < R + 8) this.killLid(l); });
        this.objs.files.forEach(fl => { if (fl.alive && fl.spr && Math.abs(fl.x - cx) < R + 12 && fl.y > cy - R) this.killFile(fl); });
        const c = Math.floor((cx + R) / TILE);
        for (let r = rowOf(cy - R); r <= rowOf(cy + R - 1); r++) if (this.cell(c, r) === CRATE) this.hitCrate(c, r, 99);
        this.junk.forEach(d => { if (d.state === 'landed' && cx + R > d.x && cx - R < d.x + d.w * TILE) this.smashJunk(d); });
        const bs = this.boss;
        if (bs && bs.alive && !k.hitBoss && Math.abs(bs.x - cx) < B.hitbox[0] / 2 + R) { k.hitBoss = true; if (bs.inv <= 0) { this.damageBoss(k.dmgB); this.shake(4, 200); } }
        if (k.life <= 0) { k.spr.play('knoedel_burst'); k.spr.once('animationcomplete', () => k.spr.destroy()); SFX.play('poof'); }
      });
      this.objs.knoedels = this.objs.knoedels.filter(k => k.life > 0);
    }

    // ------------------------------------------------------------ signs, contacts, win
    updateSignsEvents() {
      const h = this.hero; let near = null;
      for (const s of this.objs.signs) if (!s.done && s.x - h.x < 90 && h.x - s.x < 40) { near = s; break; }
      if (near !== this.curSign) { this.curSign = near; UI.hud.sign(near ? t(near.key) : null); }
    }
    checkContacts() {
      const h = this.hero, hb = this.heroBox(), tb = this.trolley && this.trolley.hitched ? this.trolleyBox() : null;
      for (const e of this.objs.enemies) {
        if (!e.alive || !e.active) continue;
        const eb = { x0: e.x - e.w / 2, x1: e.x + e.w / 2, y0: e.y - e.h, y1: e.y };
        if (this.overlap(hb, eb)) {
          if (h.vy > 0 && hb.y1 - h.vy / 60 <= eb.y0 + 6) { // stomp
            this.damageEnemy(e, h.slamming ? this.stats.slam_damage : M.stomp_damage, h.x);
            h.vy = -M.stomp_bounce_velocity; h.slamming = false; h.airJumps = M.air_jumps; SFX.play('stomp'); this.dust(h.x, eb.y0, 1);
          } else if (this.stats.crush_on_contact.indexOf(e.type) >= 0) this.killEnemy(e);
          else if (h.inv <= 0) { this.hurtHero(); if (e.type === 'dackel') e.vx = -40; }
        } else if (tb && this.overlap(tb, eb) && e.type !== 'neighbour') { this.hurtTrolley(EN[e.type].contact_damage); }
      }
      for (const l of this.objs.lids) {
        if (!l.alive) continue;
        const lb = { x0: l.x - 6, x1: l.x + 6, y0: l.y - 3, y1: l.y + 3 };
        if (this.overlap(hb, lb)) { this.hurtHero(); this.killLid(l); }
        else if (tb && this.overlap(tb, lb)) { this.hurtTrolley(EN.neighbour.lid_damage); this.killLid(l); }
      }
      const bs = this.boss;
      if (bs && bs.alive && !bs.entering && this.overlap(hb, { x0: bs.x - B.hitbox[0] / 2, x1: bs.x + B.hitbox[0] / 2, y0: GY - B.hitbox[1], y1: GY })) this.hurtHero();
    }
    checkWin() {
      const w = this.L.win, h = this.hero;
      if (!w || w.type === 'defeat_boss' || w.type === 'none') return;
      if (h.x < w.x * TILE) return;
      if (w.type === 'reach_x_with_items' && this.items.some(v => !v)) {
        if (!this.nagT || this.time0 - this.nagT > 3) { this.nagT = this.time0; UI.hud.toast(t('hud_items', { N: this.items.filter(Boolean).length }), 1500); SFX.play('nope'); }
        return;
      }
      if (w.type === 'reach_x_with_trolley' && !(this.trolley && this.trolley.hitched && this.trolley.hp > 0)) return;
      this.ended = true; INPUT.enabled = false; UI.hud.warn(null);
      SFX.play('win'); SFX.music(null);
      if (this.levelNum === 1) { const m = this.add.sprite(h.x + 6, h.y - 44, 'pickups', 10).setDepth(40); this.tweens.add({ targets: m, y: m.y - 10, duration: 400, yoyo: true, repeat: -1 }); }
      this.time.delayedCall(1400, () => this.finishWin());
    }
    finishWin() {
      if (this.winDone) return; this.winDone = true;
      UI.hud.sign(null); UI.hud.warn(null);
      GAMEFLOW.win(this.levelNum, this.runBottles);
    }

    // ------------------------------------------------------------ HUD
    refreshHud(force) {
      const c = this.lastHud || {}, set = (k, v) => { if (force || c[k] !== v) { c[k] = v; return true; } return false; };
      if (set('hearts', this.hearts + '/' + this.maxHearts)) UI.hud.hearts(this.hearts, this.maxHearts);
      if (this.trolley) { const v = this.trolley.hitched ? this.trolley.hp : -1; if (set('cakes', v)) { if (v < 0) UI.hud.row2(''); else UI.hud.cakes(v, ESC.trolley_hp); } }
      else if (this.items) { if (set('items', this.items.join())) UI.hud.items(this.items); }
      else if (set('row2', '')) UI.hud.row2('');
      if (set('bottles', this.runBottles)) UI.hud.bottles(this.runBottles);
      if (this.mode === 'boss') {
        UI.hud.progress(null);
        const f = this.boss ? Math.round(100 * this.boss.hp / B.hp_total) / 100 : null;
        if (set('boss', f)) UI.hud.boss(f);
      } else {
        const f = Math.round(100 * clamp(this.hero.x / (this.L.win.x * TILE), 0, 1)) / 100;
        if (set('prog', f)) UI.hud.progress(f);
        if (set('boss', null)) UI.hud.boss(null);
      }
      const sv = this.stats.special_unlocked, frac = sv ? Math.min(1, this.charge / this.specialReq) : 0, k = sv + ':' + Math.floor(frac * 12);
      if (set('special', k)) UI.hud.special(sv, frac, frac >= 1);
      this.lastHud = c;
    }

    pauseGame() {
      if (this.attract || this.dead || this.ended || this.scene.isPaused()) return;
      this.scene.pause(); SFX.music(null); INPUT.clear();
      UI.pause(() => { this.scene.resume(); INPUT.clear(); SFX.music(this.mode === 'boss' && this.arenaOn || this.mode === 'chase' ? 'boss' : 'play'); },
        () => GAMEFLOW.startLevel(this.levelNum, true), () => GAMEFLOW.toMap());
    }

    // ------------------------------------------------------------ hero drawing
    drawHero(dt) {
      const h = this.hero, s = h.spr;
      let anim;
      if (this.dead) anim = 'hero_ko';
      else if (this.ended && h.grounded) anim = 'hero_celebrate';
      else if (h.kb > 0) anim = 'hero_hurt';
      else if (h.slamming) anim = 'hero_slam';
      else if (!h.grounded) anim = h.airJumps < M.air_jumps ? 'hero_kickflip' : 'hero_jump';
      else if (INPUT.brake && h.vx < M.run_speed * 0.8) anim = 'hero_brake';
      else if (Math.abs(h.vx) < 4) anim = 'hero_idle';
      else anim = 'hero_ride';
      if (h.anim !== anim) { h.anim = anim; s.play(anim); }
      if (h.recoil > 0) h.recoil -= dt;
      s.x = Math.round(h.x + 2 - (h.recoil > 0 ? 1 : 0)); s.y = Math.round(h.y);
      s.setAlpha(h.inv > 0 && !this.dead ? (Math.floor(h.inv * PL.blink_hz * 2) % 2 ? 0.35 : 1) : 1);
    }

    // ------------------------------------------------------------ juice
    shake(px, ms) { this.cameras.main.shake(ms, px / 216); }
    flash(spr) { spr.setTintFill(0xffffff); this.time.delayedCall(50, () => spr.active && spr.clearTint()); }
    flashScreen() { this.cameras.main.flash(120, 255, 80, 80); }
    poof(x, y) { const p = this.add.sprite(x, y + 8, 'fx_dust_poof', 0).setOrigin(0.5, 1).setDepth(35).setScale(1.5); p.play('dust_poof'); p.once('animationcomplete', () => p.destroy()); }
    dust(x, y, n) { for (let i = 0; i < (n || 1); i++) { const p = this.add.sprite(x + (Math.random() * 8 - 4), y, 'fx_dust_poof', 0).setOrigin(0.5, 1).setDepth(26).setScale(0.6); p.play('dust_poof'); p.once('animationcomplete', () => p.destroy()); } }
    hat(x, y, type) {
      const f = { jogger: 0, gnome: 1, neighbour: 2, dackel: 3 }[type];
      const s = f === undefined ? this.add.sprite(x, y, 'boss_buergermeister', 36).setOrigin(0.5, 1) : this.add.sprite(x, y, 'fx_hats', f).setOrigin(0.5, 1);
      s.setDepth(27);
      this.tweens.add({ targets: s, y: { from: y, to: y - 24 }, angle: 200, duration: 300, ease: 'Quad.out', yoyo: false,
        onComplete: () => this.tweens.add({ targets: s, y: this.floorBelow(x, y) === Infinity ? GY : this.floorBelow(x, y), angle: 360, duration: 350, ease: 'Bounce.out',
          onComplete: () => this.tweens.add({ targets: s, alpha: 0, delay: 2500, duration: 400, onComplete: () => s.destroy() }) }) });
    }
    spark(x, y) { const s = this.add.image(x, y, 'spark', 0).setDepth(36); this.time.delayedCall(60, () => s.destroy()); }
    sparkle(x, y, tint) { for (let i = 0; i < 6; i++) { const s = this.add.image(x, y, 'spark', 1).setDepth(36).setTint(tint || 0xffffff); this.tweens.add({ targets: s, x: x + Math.cos(i) * 18, y: y + Math.sin(i) * 18, alpha: 0, duration: 400, onComplete: () => s.destroy() }); } }
    debris(x, y) { const s = this.add.rectangle(x, y, 3, 3, 0x8a5a3b).setDepth(36); this.tweens.add({ targets: s, x: x + Math.random() * 40 - 20, y: y + 20 + Math.random() * 10, angle: 180, alpha: 0, duration: 500, ease: 'Quad.in', onComplete: () => s.destroy() }); }
  }

  window.PlayScene = Play;
})();
