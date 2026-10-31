// Wurst, the hero's companion dog. Purely cosmetic: he has no hitbox, no health, is never a target,
// and nothing in play.js reads his position, so he cannot change difficulty or the outcome of a run.
// He follows with a little lag (sometimes ahead, sometimes behind), hops gaps and crates, teleports back
// with a puff when he falls behind, rides on the board when it gets too hairy, barks at zombies, sniffs Pfand
// bottles, dodges slams and cheers at the finish. Lines live in src/i18n.js (EXTRA dog_*).
(function () {
  const TILE = 16, GY = window.GAME_DATA.tuning.world.ground_surface_y_px;
  const DEPTH = 10.5;            // above the street tiles (10), below shadows/markers (11), Scherben/crates (12), pickups, zombies, hero
  const G = 900, JUMP_V = -300, ACC = 700;
  const t = (k, v) => I18N.t(k, v);
  const R = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const FONT = { fontFamily: 'Silkscreen, "Pixelify Sans", Pixelify, monospace', fontSize: '8px', color: '#1a1426', align: 'center', wordWrap: { width: 112 } };

  function create(sc) {
    const h = sc.hero;
    const x = h.x - 22;
    const d = {
      name: 'Wurst', x, y: GY, vx: 0, vy: 0, grounded: true, state: 'follow', st: 0, off: -20, offT: R(2, 4),
      ride: false, rideT: 0, farT: 0, lastAnim: '', bubble: null, barked: new Set(),
      cd: { bark: 1.5, sniff: 3, joke: R(14, 22), any: 0, slam: 0 }, teleports: 0, said: [],
      spr: sc.add.sprite(x, GY, 'npc_wurst', 0).setOrigin(0.5, 1).setDepth(DEPTH),
    };
    sc.dog = d;
    if (!sc.attract && sc.levelNum === 1) sc.time.delayedCall(1300, () => say(sc, 'dog_intro', 2400));
    if (sc.mode === 'boss') d.cd.joke = R(6, 9);
    return d;
  }

  function anim(d, key, frameFn) {
    if (frameFn !== undefined) { d.spr.anims.stop(); d.spr.setFrame(frameFn); d.lastAnim = ''; return; }
    if (d.lastAnim !== key) { d.spr.play(key); d.lastAnim = key; }
  }

  // ---------------------------------------------------------------- speech bubble
  function say(sc, key, ms, force) {
    const d = sc.dog; if (!d) return false;
    if (!force && (d.bubble || d.cd.any > 0)) return false;
    kill(d);
    const txt = sc.add.text(0, 0, t(key), FONT).setOrigin(0.5, 0.5).setDepth(DEPTH + 0.2);
    const w = Math.ceil(txt.width) + 8, hgt = Math.ceil(txt.height) + 5;
    const box = sc.add.nineslice(0, 0, 'ui_speech_bubble', 0, Math.max(14, w), Math.max(13, hgt), 4, 4, 4, 4).setOrigin(0.5, 1).setDepth(DEPTH + 0.1);
    const tail = sc.add.image(0, 0, 'ui_speech_bubble_tail').setOrigin(0, 0).setDepth(DEPTH + 0.15);
    d.bubble = { txt, box, tail, w: box.width, h: box.height, until: sc.time0 + (ms || 1600) / 1000, key };
    d.said.push(key); if (d.said.length > 30) d.said.shift();
    d.cd.any = 3 + (ms || 1600) / 1000;
    placeBubble(sc, d);
    return true;
  }
  function kill(d) { if (!d.bubble) return; d.bubble.txt.destroy(); d.bubble.box.destroy(); d.bubble.tail.destroy(); d.bubble = null; }
  // above the dog, slid sideways so it never covers the hero; tail points down at the dog
  function placeBubble(sc, d) {
    const b = d.bubble; if (!b) return;
    const cam = sc.cameras.main, h = sc.hero, ax = Math.round(d.x + 4);
    const L = cam.scrollX + b.w / 2 + 2, Rr = cam.scrollX + sc.viewW - b.w / 2 - 2;
    let bx, by = Math.round(d.y - 20);
    if (d.ride) { bx = h.x - 14 - b.w / 2; }
    else if (d.x <= h.x) bx = Math.min(ax + b.w / 2 - 8, h.x - 13 - b.w / 2);
    else bx = Math.max(ax - b.w / 2 + 8, h.x + 13 + b.w / 2);
    bx = Math.round(Math.max(L, Math.min(Rr, bx)));
    if ((bx + b.w / 2 > h.x - 12 && bx - b.w / 2 < h.x + 12) || d.ride) by = Math.min(by, Math.round(h.y - 50));
    by = Math.max(b.h + 20, by);   // keep clear of the HUD row
    b.box.setPosition(bx, by); b.txt.setPosition(bx, by - b.h / 2 + 0.5);
    b.tail.setPosition(Math.max(bx - b.w / 2 + 2, Math.min(bx + b.w / 2 - 9, ax - 3)), by - 1);
  }

  // ---------------------------------------------------------------- movement helpers
  function teleport(sc, d, why) {
    const h = sc.hero, cam = sc.cameras.main;
    const vis = d.x > cam.scrollX - 8 && d.x < cam.scrollX + sc.viewW + 8 && d.y < 220;
    if (vis) sc.dust(d.x, Math.min(d.y, GY), 2);
    const side = (sc.mode === 'escort' && sc.trolley && sc.trolley.hitched) ? 20 : -18;
    const nx = h.x + side, f = sc.floorBelow(nx, Math.min(h.y, GY) - 8);
    d.teleports++; d.vx = h.vx; d.vy = 0; d.farT = 0;
    if (!isFinite(f) || Math.abs(f - h.y) > 40 || !h.grounded) { startRide(d); return why; }
    d.x = nx; d.y = f; d.grounded = true; d.ride = false;
    sc.dust(d.x, d.y, 2);
    return why;
  }
  function startRide(d) { d.ride = true; d.rideT = 0; d.state = 'follow'; }

  function forcedRide(sc) {
    return (sc.mode === 'chase' && sc.truck && sc.truck.on) || (sc.mode === 'boss' && sc.arenaOn);
  }

  // ---------------------------------------------------------------- per frame
  function update(sc, dt) {
    const d = sc.dog, h = sc.hero; if (!d || !h) return;
    for (const k in d.cd) d.cd[k] -= dt;
    const cam = sc.cameras.main;

    // arc 2: Wurst is drawn in the vehicle sheets (on the SUP nose / in the bike basket); only his bubble lives here
    if (sc.vehicle || sc.cutscene) {
      d.spr.setVisible(false); d.ride = true;
      const tr = sc.vehicle === 'bike' && sc.trailer && sc.trailer.dog.visible ? sc.trailer.dog : null;   // arc 2 bike: Wurst rides the SUP trailer
      if (tr) { d.x = tr.x; d.y = Math.min(tr.y, h.y) - 4; } else { d.x = h.x + (sc.vehicle === 'sup' ? 20 : -16); d.y = h.y - 10; }
      if (sc.ended && !sc.dead && d.state !== 'happy') { d.state = 'happy'; say(sc, 'dog_win', 2600, true); }
      if (sc.dead && d.state !== 'sad') { d.state = 'sad'; if (Math.random() < 0.7) say(sc, 'dog_sad', 2000, true); }
      if (d.bubble) { if (sc.time0 > d.bubble.until) kill(d); else placeBubble(sc, d); }
      return;
    }

    // celebration / sadness override everything
    if (sc.ended && !sc.dead && d.state !== 'happy') {
      d.state = 'happy'; d.st = 0; say(sc, 'dog_win', 2600, true);
      if (d.ride) { d.ride = false; d.y = h.y; d.x = h.x - 18; d.vy = -200; d.grounded = false; }
    }
    if (sc.dead && d.state !== 'sad') { d.state = 'sad'; d.st = 0; if (Math.random() < 0.7) say(sc, 'dog_sad', 2000, true); }

    // riding on the back of the board
    if (forcedRide(sc) && !d.ride && !sc.ended) {
      if (sc.mode === 'chase' && Math.random() < 0.6) say(sc, 'dog_ride', 2000, true);
      if (sc.mode === 'boss') say(sc, 'dog_boss', 2200, true);
      teleportToBoard(sc, d);
    }
    if (d.ride) {
      d.rideT += dt;
      d.x = h.x - 12; d.y = h.y - 7; d.vx = h.vx; d.vy = 0;
      anim(d, 'wurst_sit');
      // hop off once the ground is calm again
      if (!forcedRide(sc) && !sc.dead && d.rideT > 1.2 && h.grounded) {
        const f = sc.floorBelow(h.x - 20, h.y - 8);
        if (isFinite(f) && Math.abs(f - h.y) < 4) { d.ride = false; d.x = h.x - 14; d.y = h.y - 7; d.vy = -160; d.grounded = false; }
      }
      finish(sc, d);
      return;
    }

    // ----- choose where to be
    d.offT -= dt;
    const escortAhead = sc.mode === 'escort' && sc.trolley && sc.trolley.hitched;
    if (d.offT <= 0) {
      d.offT = R(2.5, 5.5);
      d.off = escortAhead ? pick([16, 22, 28, 34]) : pick([-34, -26, -20, -14, 18, 26, 32]);
    }
    let target = h.x + d.off, wantSit = false;
    // Oma Ronni waiting with her trolley: run to her and sit until the hero hitches up
    const tr = sc.trolley;
    if (tr && !tr.hitched && tr.x - h.x < 170 && tr.x > h.x) {
      target = tr.x + 20; wantSit = Math.abs(d.x - target) < 6;
      if (wantSit && Math.random() < dt * 0.5) say(sc, 'dog_oma', 2200);
    }
    if (sc.dead) target = d.x;

    // ----- interactions (only on the ground, never during the finale)
    if (d.grounded && d.state === 'follow' && !sc.ended && !sc.dead) {
      if (d.cd.bark <= 0) {
        const e = (sc.objs.enemies || []).find(e => e.alive && e.active !== false && !d.barked.has(e) && Math.abs(e.x - d.x) < 120 &&
          e.x > cam.scrollX + 8 && e.x < cam.scrollX + sc.viewW - 8);
        if (e) {
          d.barked.add(e); d.state = 'bark'; d.st = 0.55; d.face = e.x < d.x ? -1 : 1; d.cd.bark = R(3.5, 6); SFX.play('wuff');
          const key = e.type === 'dackel' && Math.random() < 0.6 ? 'dog_dackel' : e.type === 'gnome' && Math.random() < 0.3 ? 'dog_gnome'
            : Math.random() < 0.2 ? 'dog_zombie' : Math.random() < 0.5 ? 'dog_wuff_2' : 'dog_wuff';
          say(sc, key, 1000);
        }
      }
      if (d.state === 'follow' && d.cd.sniff <= 0) {
        const p = (sc.objs.pickups || []).find(p => p.alive && p.type === 'bottle' && !p.mag && Math.abs(p.x - (d.x + 8)) < 12 && p.y > d.y - 28);
        if (p) {
          d.cd.sniff = R(5, 9);
          if (Math.random() < 0.7) { d.state = 'sniff'; d.st = 0.6; if (Math.random() < 0.4) say(sc, pick(['dog_sniff_1', 'dog_sniff_2', 'dog_sniff_3']), 1600); }
        }
      }
      if (d.cd.joke <= 0) {
        d.cd.joke = R(24, 40);
        if (Math.abs(d.x - h.x) < 70) say(sc, pick(['dog_joke_1', 'dog_joke_2', 'dog_joke_3', 'dog_joke_4', 'dog_joke_5', 'dog_joke_6', 'dog_joke_7']), 2400);
      }
      // copy the hero's jumps now and then
      if (!h.grounded && h.vy < -100 && Math.abs(d.x - h.x) < 40 && Math.random() < dt * 6) { d.vy = JUMP_V * 0.8; d.grounded = false; }
    }

    // ----- state timers
    if (d.state === 'bark' || d.state === 'sniff' || d.state === 'yikes') { d.st -= dt; if (d.st <= 0) d.state = 'follow'; }
    let ax = 0;
    if (d.state === 'happy') {
      target = h.x - 18; if (d.grounded && Math.abs(d.x - target) < 10) { d.vy = -170; d.grounded = false; }
    }
    if (d.state === 'bark' || d.state === 'sniff' || d.state === 'sad' || wantSit) ax = -Math.sign(d.vx) * ACC * 1.5;
    else {
      const maxV = Math.max(Math.abs(h.vx) + 80, 150);
      const want = Math.max(-maxV, Math.min(maxV, (d.state === "happy" ? 0 : h.vx) + (target - d.x) * 3));
      ax = Math.sign(want - d.vx) * Math.min(ACC * (d.grounded ? 1 : 0.6), Math.abs(want - d.vx) / dt);
    }
    if (d.state !== 'yikes') d.vx += ax * dt;
    if ((d.state === 'bark' || d.state === 'sniff' || d.state === 'sad' || wantSit) && Math.abs(d.vx) < 10) d.vx = 0;

    // ----- terrain: hop gaps, steps and crates in the way
    const dir = d.vx >= 0 ? 1 : -1;
    if (d.grounded && Math.abs(d.vx) > 20) {
      const ahead = d.x + dir * 12;
      const fAhead = sc.floorBelow(ahead, d.y);
      const wall = sc.solidAt(ahead, d.y - 4) || sc.solidAt(ahead, d.y - 12);
      if (wall || fAhead > d.y + 10) { d.vy = JUMP_V; d.grounded = false; }
    }
    // horizontal move with a simple wall check (he's tiny: he squeezes along walls, never through the hero's logic)
    let nx = d.x + d.vx * dt;
    if (sc.solidAt(nx + dir * 5, d.y - 3) && sc.solidAt(nx + dir * 5, d.y - 10)) { nx = d.x; d.vx = 0; }
    d.x = nx;
    // vertical
    d.vy += G * dt;
    let ny = d.y + d.vy * dt;
    const f = sc.floorBelow(d.x, d.y);
    if (d.vy >= 0 && ny >= f) { ny = f; d.vy = 0; if (!d.grounded && d.state === 'follow' && Math.random() < 0.3) sc.dust(d.x, f, 1); d.grounded = true; }
    else if (d.grounded && f > d.y + 1) d.grounded = false;
    if (d.vy < 0) d.grounded = false;
    d.y = ny;

    // ----- never stranded: off screen, too far, in a pit, or stuck behind something
    const off = d.x < cam.scrollX - 20 || d.x > cam.scrollX + sc.viewW + 20;
    const far = Math.abs(d.x - h.x) > 150;
    const stuck = Math.abs(d.x - target) > 70 && Math.abs(d.vx) < 15 && d.state === 'follow';
    d.farT = (off || far || stuck) ? d.farT + dt : 0;
    if (!sc.dead && (d.y > 230 || d.farT > (stuck ? 1.2 : 0.5))) teleport(sc, d, d.y > 230 ? 'pit' : 'far');

    // ----- animation
    if (d.state === 'happy') anim(d, d.grounded && Math.abs(d.vx) > 30 ? 'wurst_run' : 'wurst_happy');
    else if (d.state === 'yikes') anim(d, 'wurst_yikes');
    else if (d.state === 'bark') anim(d, 'wurst_bark');
    else if (d.state === 'sniff') anim(d, 'wurst_sniff');
    else if (!d.grounded) anim(d, null, frameOf(sc, 'wurst_jump', d.vy < -80 ? 0 : d.vy < 80 ? 1 : 2));
    else if (Math.abs(d.vx) > 12) anim(d, 'wurst_run');
    else anim(d, 'wurst_sit');
    if (d.lastAnim === 'wurst_run') d.spr.anims.timeScale = Math.max(0.6, Math.min(1.6, Math.abs(d.vx) / 120));
    else d.spr.anims.timeScale = 1;
    d.spr.setFlipX(d.state === 'bark' ? d.face < 0 : (d.vx < -12 && d.state !== 'happy'));
    finish(sc, d);
  }

  function teleportToBoard(sc, d) { const cam = sc.cameras.main; if (d.x > cam.scrollX && d.x < cam.scrollX + sc.viewW) sc.dust(d.x, Math.min(d.y, GY), 2); startRide(d); }
  const frameCache = {};
  function frameOf(sc, key, i) {
    if (!frameCache[key]) { const a = sc.anims.get(key); frameCache[key] = a ? a.frames.map(f => f.frame.name) : [0]; }
    const fr = frameCache[key]; return fr[Math.min(i, fr.length - 1)];
  }
  function finish(sc, d) {
    d.spr.setPosition(Math.round(d.x), Math.round(d.y));
    if (d.bubble) { if (sc.time0 > d.bubble.until) kill(d); else placeBubble(sc, d); }
  }

  // ---------------------------------------------------------------- events from play.js
  function onSlam(sc, x, radius) {
    const d = sc.dog; if (!d || d.ride || d.cd.slam > 0) return;
    if (Math.abs(d.x - x) > radius + 18) return;
    d.cd.slam = 1.5;
    d.state = 'yikes'; d.st = 0.5; d.vy = -220; d.grounded = false; d.vx = (d.x < x ? -1 : 1) * 110;
    sc.dust(d.x, d.y, 2);
    if (Math.random() < 0.5) say(sc, 'dog_yikes', 900);
  }
  function onHurt(sc) { const d = sc.dog; if (d && !sc.dead && Math.random() < 0.4) say(sc, 'dog_hurt', 1600); }
  function onRespawn(sc) { const d = sc.dog; if (d && !d.ride && !sc.vehicle) teleport(sc, d, 'respawn'); }

  window.DOG = { create, update, onSlam, onHurt, onRespawn, say };
})();
