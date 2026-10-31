// Procedural pixel art for everything the Tech Artist's asset pack does not (yet) provide:
// hero, zombies, boss, trolley, truck, hazards and effects. Drawn at load time with hard-edged
// rectangles in the 24+3 colour palette, then given a 1 px ink outline automatically.
// If art/assets later ships a sprite with the same texture key, ART.build() skips it.
(function () {
  const C = {
    ink: '#1a1426', sky0: '#3b2a4f', sky1: '#7a3e66', sky2: '#d0606a', sky3: '#f4a261', glow: '#ffe08a',
    beam: '#4a2f24', wood: '#8a5a3b', plaster: '#e9dcc0', plasterSh: '#b3a283', roof: '#b0453a', roofSh: '#6e2a2a',
    rust: '#8c4a2a', rustHi: '#d07a3a', mossD: '#3d5a34', moss: '#74923f', stone: '#5c6068', stoneL: '#9a9ea6',
    zSh: '#4f7d5c', zSkin: '#8fc27a', zHi: '#cdeaa0', orange: '#ff7a1a', teal: '#2bb3a3', white: '#f6f2e8',
    skin: '#e3a882', skinSh: '#b9785a', tealSh: '#1b7a72',
  };

  function P(ctx, ox) {
    const p = {
      r(x, y, w, h, c) { ctx.fillStyle = C[c] || c; ctx.fillRect(ox + x, y, w, h); return p; },
      px(x, y, c) { return p.r(x, y, 1, 1, c); },
      // filled ellipse-ish disc, hard edged
      disc(cx, cy, rx, ry, c) {
        for (let y = -ry; y <= ry; y++) {
          const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + 0.35) * (ry + 0.35)))));
          p.r(cx - w, cy + y, w * 2 + 1, 1, c);
        }
        return p;
      },
      line(x0, y0, x1, y1, c) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
        for (let i = 0; i <= n; i++) p.px(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), c);
        return p;
      },
    };
    return p;
  }

  function outline(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h), d = img.data, out = new Uint8ClampedArray(d);
    const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : d[(y * w + x) * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (a(x, y)) continue;
      if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) {
        const i = (y * w + x) * 4; out[i] = 0x1a; out[i + 1] = 0x14; out[i + 2] = 0x26; out[i + 3] = 255;
      }
    }
    img.data.set(out); ctx.putImageData(img, 0, 0);
  }

  // Build a spritesheet texture: n frames of fw×fh, drawn with draw(p, i). pad leaves room for the outline.
  function sheet(scene, key, fw, fh, n, draw, opts) {
    if (scene.textures.exists(key)) return;
    opts = opts || {};
    const cw = fw * n, cv = document.createElement('canvas');
    cv.width = cw; cv.height = fh;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < n; i++) {
      const fc = document.createElement('canvas'); fc.width = fw; fc.height = fh;
      const fctx = fc.getContext('2d');
      draw(P(fctx, 0), i);
      if (opts.outline !== false) outline(fctx, fw, fh);
      ctx.drawImage(fc, i * fw, 0);
    }
    const tex = scene.textures.addCanvas(key, cv);
    for (let i = 0; i < n; i++) tex.add(i, 0, i * fw, 0, fw, fh);
  }

  // ---------------- Hero (24×44, feet on the deck at y≈36, tracks 38–43) ----------------
  // frames: 0-3 ride, 4 jump, 5 fall, 6 slam, 7 hurt, 8 brake, 9 cheer
  function hero(p, f) {
    const bob = (f < 4 && (f % 2)) ? 1 : 0;
    const crouch = f === 6 ? 4 : (f === 4 ? 2 : (f === 8 ? 1 : 0));
    const lean = f === 8 ? -1 : (f === 7 ? -2 : 0);
    const y0 = bob + crouch;
    // tracks (two units)
    [[2, 9], [13, 20]].forEach(([a, b]) => {
      p.r(a, 39, b - a + 1, 4, 'stone').r(a + 1, 43, b - a - 1, 1, 'stone');
      for (let x = a + 1 + ((f % 2)); x < b; x += 2) p.px(x, 39, 'stoneL');
      p.px(a + 1, 41, 'stoneL').px(Math.round((a + b) / 2), 41, 'stoneL').px(b - 1, 41, 'stoneL');
    });
    // deck
    p.r(1, 37, 22, 2, 'wood').r(3, 37, 18, 1, 'orange').px(0, 36, 'wood').px(23, 36, 'wood');
    // guns on the nose, side by side (one slightly higher = behind)
    p.r(16, 33, 6, 2, 'stone').r(21, 33, 2, 1, 'stoneL').r(15, 35, 7, 2, 'stoneL').r(22, 35, 2, 1, 'stone').r(16, 34, 2, 3, 'stone');
    // legs (cargo pants, olive) + sneakers
    const kn = crouch > 2 ? 2 : 0;
    p.r(5 + lean, 27 + y0 - kn, 3, 9 - y0 + kn, 'mossD').r(13 + lean, 27 + y0 - kn, 3, 9 - y0 + kn, 'mossD');
    p.r(4 + lean, 30 + y0, 1, 2, 'mossD').r(16 + lean, 30 + y0, 1, 2, 'mossD'); // pockets
    p.r(4, 35, 5, 2, 'white').r(4, 36, 5, 1, 'stone').r(12, 35, 5, 2, 'white').r(12, 36, 5, 1, 'stone');
    // torso (olive utility jacket)
    const ty = 15 + y0;
    p.r(7 + lean, ty, 9, 13, 'moss').r(7 + lean, ty, 2, 13, 'mossD').r(11 + lean, ty + 4, 3, 2, 'mossD').r(7 + lean, ty + 11, 9, 2, 'mossD');
    // backpack
    p.r(4 + lean, ty + 2, 3, 8, 'rust').r(4 + lean, ty + 2, 3, 1, 'rustHi');
    // arms
    if (f === 6 || f === 9) { // arms up
      p.r(5 + lean, ty - 6, 2, 7, 'moss').r(15 + lean, ty - 6, 2, 7, 'moss').r(5 + lean, ty - 7, 2, 2, 'skin').r(15 + lean, ty - 7, 2, 2, 'skin');
    } else if (f === 7) {
      p.r(15 + lean, ty + 1, 5, 2, 'moss').r(20 + lean, ty, 2, 2, 'skin').r(3 + lean, ty + 1, 4, 2, 'moss');
    } else {
      p.r(15 + lean, ty + 2, 6, 2, 'moss').r(21 + lean, ty + 2, 2, 2, 'skin'); // front arm out for balance
      p.r(9 + lean, ty + 3, 2, 6, 'mossD').r(9 + lean, ty + 9, 2, 1, 'skinSh');
    }
    // head (adult: longer face, stubble)
    const hy = 6 + y0;
    p.r(10 + lean, hy + 2, 6, 7, 'skin').r(10 + lean, hy + 7, 6, 2, 'skinSh').r(16 + lean, hy + 5, 1, 2, 'skin');
    p.px(14 + lean, hy + 4, 'ink').px(15 + lean, hy + 4, 'ink').px(14 + lean, hy + 3, 'beam').px(15 + lean, hy + 3, 'beam');
    p.r(14 + lean, hy + 7, 2, 1, 'beam');
    if (f === 7) p.r(14 + lean, hy + 6, 2, 2, 'ink');
    // helmet
    p.r(9 + lean, hy - 2, 8, 5, 'orange').r(10 + lean, hy - 3, 6, 1, 'orange').r(11 + lean, hy - 2, 3, 1, 'glow').r(9 + lean, hy + 2, 2, 3, 'orange');
    p.px(12 + lean, hy, 'white').px(13 + lean, hy, 'teal');
    // scarf, trailing
    const wave = [0, 1, 0, -1][f % 4];
    p.r(9 + lean, ty - 1, 7, 2, 'teal').r(9 + lean, ty, 2, 2, 'tealSh');
    p.r(4 + lean, ty - 1 + wave, 5, 2, 'teal').r(1 + lean, ty + wave + (f % 2), 3, 2, 'teal').px(1 + lean, ty + wave + 1, 'tealSh');
  }

  // ---------------- Zombies ----------------
  function jogger(p, f) { // 20×32: 0,1 walk  2 arms up  3 lunge  4 hit
    const step = f === 1 ? 1 : 0, lun = f === 3 ? -2 : 0;
    // legs: jogging pants (mauve with white stripe)
    p.r(6 + lun, 20, 3, 10 - step, 'sky1').r(11 + lun, 20, 3, 10 - (1 - step), 'sky1').px(8 + lun, 22, 'white').px(13 + lun, 22, 'white').px(8 + lun, 25, 'white').px(13 + lun, 25, 'white');
    p.r(5 + lun, 30 - step, 4, 2, 'white').r(10 + lun, 29 + step, 4, 2, 'white');
    // body: vest/hoodie
    p.r(5 + lun, 11, 10, 10, 'stone').r(5 + lun, 11, 10, 2, 'stoneL').r(9 + lun, 13, 1, 7, 'white');
    // head
    p.r(5 + lun, 2, 9, 9, 'zSkin').r(5 + lun, 8, 9, 3, 'zSh').r(6 + lun, 1, 7, 2, 'beam').r(5 + lun, 2, 2, 3, 'beam');
    p.r(5 + lun, 5, 2, 2, 'white').px(5 + lun, 6, 'ink').r(8 + lun, 5, 2, 2, 'white').px(8 + lun, 6, 'ink');
    p.r(5 + lun, 9, 3, 1, 'roofSh');
    // headband
    p.r(5 + lun, 3, 9, 1, 'roof');
    // arms
    if (f === 2) { p.r(2, 2, 2, 10, 'zSkin').r(15, 2, 2, 10, 'zSkin'); }
    else { p.r(1 + lun, 12 + step, 5, 2, 'zSkin').r(0 + lun, 15 - step, 5, 2, 'zSkin'); }
    if (f === 4) p.r(5, 5, 5, 2, 'ink');
  }
  function gnome(p, f) { // 12×16
    const s = f % 2;
    p.r(3, 0 + s, 6, 2, 'roof').r(2, 2 + s, 8, 3, 'roof').px(5, 0 + s, 'roofSh');
    p.r(3, 5 + s, 6, 3, 'zSkin').px(4, 6 + s, 'ink').px(7, 6 + s, 'ink');
    p.r(2, 8 + s, 8, 3, 'white').r(4, 11 + s, 4, 1, 'white');
    p.r(2, 10, 8, 4, 'sky1').r(1, 10, 1, 3, 'zSkin').r(10, 10, 1, 3, 'zSkin');
    p.r(3, 14, 2, 2, 'beam').r(7, 14 - s, 2, 2, 'beam');
  }
  function neighbour(p, f) { // 22×34: 0 idle 1 raise 2 throw 3 hit
    // bathrobe body
    p.r(5, 12, 12, 20, 'plasterSh').r(5, 12, 12, 2, 'plaster').r(10, 14, 2, 18, 'plaster').r(5, 22, 12, 2, 'roof');
    p.r(6, 32, 4, 2, 'roof').r(12, 32, 4, 2, 'roof'); // slippers
    // head with curlers
    p.r(6, 3, 10, 9, 'zSkin').r(6, 9, 10, 3, 'zSh').r(6, 1, 10, 3, 'stoneL');
    [6, 9, 12, 15].forEach(x => p.r(x, 0, 2, 2, 'sky2'));
    p.r(6, 6, 2, 2, 'white').px(6, 7, 'ink').r(10, 6, 2, 2, 'white').px(10, 7, 'ink').r(7, 10, 4, 1, 'roofSh');
    if (f === 1) { // lid raised above head
      p.r(3, 3, 2, 10, 'zSkin').r(17, 3, 2, 10, 'zSkin').r(1, -0 + 0, 20, 3, 'stoneL').r(9, 0, 4, 1, 'stone');
    } else if (f === 2) {
      p.r(1, 13, 5, 2, 'zSkin').r(17, 9, 4, 2, 'zSkin');
    } else {
      p.r(3, 13, 2, 8, 'zSkin').r(17, 13, 2, 8, 'zSkin');
    }
    if (f === 3) p.r(6, 6, 6, 2, 'ink');
  }
  function dackel(p, f) { // 24×12: 0,1 walk 2 bark 3 charge
    const s = f % 2;
    p.r(4, 3, 14, 5, 'wood').r(4, 3, 14, 1, 'rustHi').r(7, 4, 3, 2, 'zSh').r(13, 5, 2, 2, 'zSh'); // body
    p.r(0, 2 + (f === 3 ? 0 : s), 4, 2, 'wood'); // tail? no: head is on the left (they charge left)
    p.r(18, 2 - (f === 2 ? 1 : 0), 0, 0, 'wood');
    // head on the LEFT side (faces left)
    p.r(0, 2, 6, 5, 'wood').r(0, 6, 3, 1, 'zSkin').px(2, 3, 'glow').px(1, 3, 'ink');
    p.r(3, 0, 2, 4, 'beam'); // ear
    if (f === 2) p.r(0, 6, 3, 2, 'roofSh');
    p.r(18, 2 + s, 4, 1, 'wood'); // tail
    // legs
    p.r(5, 8, 2, 3 - s, 'beam').r(15, 8, 2, 2 + s, 'beam');
    if (f === 3) { p.r(5, 8, 3, 2, 'beam').r(14, 8, 3, 2, 'beam'); }
  }
  function lid(p, f) { // 14×8 bin lid
    p.r(1, 3, 12, 3, 'stoneL').r(2, 2, 10, 1, 'stoneL').r(5, 1, 4, 1, 'stone').r(1, 5, 12, 1, 'stone');
    if (f) p.r(3, 3, 3, 1, 'white');
  }
  function boss(p, f) { // 52×72: 0 idle 1 raise 2 stamp-down 3 hurt 4 walk
    const b = f === 4 ? 1 : 0;
    // legs
    p.r(16, 54, 7, 16, 'sky0').r(29, 54 + b, 7, 16 - b, 'sky0').r(14, 69, 10, 3, 'ink').r(28, 69, 10, 3, 'ink');
    // suit body
    p.r(11, 24, 30, 32, 'sky0').r(11, 24, 30, 3, 'sky1').r(24, 27, 4, 26, 'white').r(25, 28, 2, 18, 'roof');
    // chain of office
    for (let i = 0; i < 9; i++) p.r(14 + i * 3, 27 + Math.round(Math.sin(i / 8 * Math.PI) * 9), 2, 2, 'glow');
    p.r(23, 36, 6, 6, 'glow').r(24, 37, 4, 4, 'sky3');
    // sash
    p.line(12, 27, 38, 52, 'sky2').line(13, 27, 39, 52, 'sky2');
    // head (big, green, combover)
    p.r(14, 3, 24, 21, 'zSkin').r(14, 18, 24, 6, 'zSh').r(14, 2, 24, 3, 'stone').r(30, 0, 9, 4, 'stone');
    p.r(17, 9, 6, 5, 'white').r(29, 9, 6, 5, 'white').r(19, 11, 2, 2, 'ink').r(31, 11, 2, 2, 'ink');
    p.r(16, 7, 8, 2, 'mossD').r(28, 7, 8, 2, 'mossD'); // grumpy brows
    p.r(21, 18, 10, 2, 'roofSh').r(22, 18, 2, 1, 'white').r(28, 18, 2, 1, 'white');
    if (f === 3) { p.r(17, 11, 6, 2, 'ink').r(29, 11, 6, 2, 'ink').r(22, 17, 8, 4, 'roofSh'); }
    // arms + stamp
    if (f === 1) { // stamp raised
      p.r(41, 6, 5, 20, 'sky0').r(40, 0, 7, 7, 'wood').r(38, 6, 11, 4, 'roof').r(38, 9, 11, 1, 'roofSh');
      p.r(5, 26, 6, 16, 'sky0').r(5, 42, 6, 4, 'zSkin');
    } else if (f === 2) { // stamp down on the ground in front (left side)
      p.r(2, 30, 10, 5, 'sky0').r(0, 34, 6, 20, 'sky0').r(-2, 54, 12, 6, 'wood').r(-4, 60, 14, 6, 'roof').r(-4, 65, 14, 1, 'roofSh');
      p.r(41, 26, 6, 16, 'sky0').r(41, 42, 6, 4, 'zSkin');
    } else {
      p.r(5, 26, 6, 18, 'sky0').r(5, 44, 6, 4, 'zSkin').r(41, 26, 6, 14, 'sky0').r(40, 38, 8, 6, 'wood').r(38, 44, 12, 5, 'roof');
    }
  }
  function trolley(p, f) { // 34×30: shopping trolley with granny (0,1 roll  2 hurt)
    // Oma
    p.r(10, 1, 10, 4, 'stoneL').r(12, 0, 6, 2, 'stoneL').r(10, 4, 10, 7, 'skin').r(10, 9, 10, 2, 'skinSh');
    p.r(11, 6, 3, 2, 'ink').r(16, 6, 3, 2, 'ink').r(14, 6, 2, 1, 'ink'); // glasses
    if (f === 2) p.r(13, 9, 4, 2, 'roofSh'); else p.r(13, 9, 4, 1, 'roofSh');
    p.r(8, 11, 14, 6, 'sky1').r(8, 11, 14, 1, 'sky2').r(22, 10, 6, 2, 'sky1'); // cardigan + waving arm
    p.r(27, 7, 3, 3, 'skin');
    // cake on lap
    p.r(3, 9, 7, 3, 'plaster').r(3, 8, 7, 1, 'white').px(6, 7, 'roof');
    // basket (wire)
    p.r(2, 14, 28, 1, 'stoneL').r(4, 24, 24, 1, 'stoneL');
    for (let x = 2; x <= 29; x += 3) p.line(x, 14, x + (x < 16 ? 2 : -2), 24, 'stoneL');
    p.r(3, 18, 26, 1, 'stone');
    p.r(28, 8, 1, 7, 'stoneL').r(28, 7, 5, 2, 'roof'); // handle
    // wheels
    const s = f % 2;
    p.r(5, 26, 4, 4, 'stone').px(6 + s, 27, 'stoneL').r(22, 26, 4, 4, 'stone').px(23 + s, 27, 'stoneL');
    p.r(6, 25, 1, 1, 'stoneL').r(23, 25, 1, 1, 'stoneL');
  }
  function truck(p, f) { // 100×70 the monster bulky-waste truck, faces right
    const c = f % 2;
    // compactor body
    p.r(0, 10, 62, 46, 'rust').r(0, 10, 62, 4, 'rustHi').r(4, 18, 54, 2, 'roofSh').r(4, 30, 54, 2, 'roofSh').r(4, 42, 54, 2, 'roofSh');
    // junk sticking out of the top
    p.r(6, 0, 16, 11, 'sky1').r(8, 2, 12, 3, 'sky2'); // armchair
    p.r(28, 2, 8, 9, 'plaster').r(29, 4, 6, 1, 'plasterSh'); // fridge
    p.r(40, 5, 18, 6, 'wood').r(42, 3, 2, 3, 'wood'); // table
    // cab
    p.r(62, 20, 34, 36, 'rustHi').r(62, 20, 34, 3, 'glow').r(66, 24, 20, 12, 'sky0');
    // angry eyes in the windscreen
    p.r(68, 27, 6, 5, 'glow').r(78, 27, 6, 5, 'glow').r(71, 29, 3, 3, 'ink').r(81, 29, 3, 3, 'ink');
    p.line(67, 25, 74, 28, 'ink').line(84, 25, 77, 28, 'ink');
    // mouth / grille with teeth
    p.r(78, 40 + c * 2, 22, 12 - c * 2, 'ink');
    for (let x = 79; x < 99; x += 4) { p.r(x, 40 + c * 2, 2, 3, 'white'); p.r(x + 2, 49, 2, 3, 'white'); }
    p.r(94, 36, 6, 4, 'glow'); // headlight
    // wheels
    [14, 44, 80].forEach(x => { p.disc(x, 60, 8, 8, 'ink').disc(x, 60, 4, 4, 'stone').px(x + (c ? 2 : -2), 60, 'stoneL'); });
  }
  function sofa(p) { // 48×18
    p.r(2, 4, 44, 12, 'sky1').r(0, 2, 6, 14, 'sky2').r(42, 2, 6, 14, 'sky2').r(6, 6, 18, 5, 'sky2').r(24, 6, 18, 5, 'sky2');
    p.r(4, 16, 3, 2, 'beam').r(41, 16, 3, 2, 'beam').r(14, 12, 4, 2, 'plasterSh');
  }
  function fridge(p) { // 16×48
    p.r(1, 0, 14, 48, 'plaster').r(1, 16, 14, 1, 'plasterSh').r(12, 4, 2, 9, 'stoneL').r(12, 20, 2, 14, 'stoneL').r(3, 30, 4, 3, 'zSkin').r(3, 40, 6, 2, 'rust');
  }
  function pot(p, f) { // 12×12 flower pot
    p.r(2, 5, 8, 7, 'roof').r(1, 5, 10, 2, 'rustHi').r(3, 1, 2, 4, 'moss').r(6, 0, 2, 5, 'moss').r(5, 2, 1, 1, 'sky2').r(8, 2, 2, 2, 'mossD');
  }
  function scherben(p) { // 48×6 broken glass strip (3 tiles)
    for (let i = 0; i < 12; i++) { const x = i * 4 + (i % 2); p.r(x, 4 - (i % 3), 2, 2 + (i % 3), i % 2 ? 'teal' : 'zHi'); p.px(x, 3 - (i % 3), 'white'); }
  }
  function files(p) { // 24×20 Aktenstapel
    for (let i = 0; i < 5; i++) p.r(1 + (i % 2), 1 + i * 4, 22, 3, i % 2 ? 'plasterSh' : 'plaster').r(4, 2 + i * 4, 10, 1, 'stoneL');
    p.r(16, 0, 6, 4, 'roof');
  }
  function knoedel(p, f) { // 22×22 dumpling, rolls
    p.disc(11, 11, 9, 9, 'plaster').disc(9, 9, 4, 4, 'white');
    const spots = [[5, 13], [14, 6], [15, 15], [8, 16], [12, 11]];
    spots.forEach(([x, y], i) => { const a = f * Math.PI / 2, cx = 11 + Math.cos(a) * (x - 11) - Math.sin(a) * (y - 11), cy = 11 + Math.sin(a) * (x - 11) + Math.cos(a) * (y - 11); p.r(Math.round(cx), Math.round(cy), 2, 2, i % 2 ? 'plasterSh' : 'moss'); });
    p.r(4, 2, 6, 2, 'beam').r(3, 3, 3, 3, 'beam'); // gravy
  }
  function bullet(p) { p.r(0, 1, 6, 2, 'glow').r(4, 0, 2, 4, 'white'); }
  function poof(p, f) { // 24×24 dust cloud, 5 frames
    const r = [4, 7, 9, 9, 7][f], cs = f < 3 ? ['plaster', 'plasterSh'] : ['plasterSh', 'stoneL'];
    if (f < 4) { p.disc(12, 13, r, r - 1, cs[1]).disc(10, 12, r - 2, r - 3, cs[0]); }
    [[4, 6], [19, 5], [3, 19], [20, 18]].forEach(([x, y], i) => { if (f >= 1) p.disc(12 + (x - 12) * f / 4, 12 + (y - 12) * f / 4, Math.max(1, 3 - (f >> 1)), Math.max(1, 3 - (f >> 1)), cs[i % 2]); });
  }
  function hat(p, f) { // 10×6 little hats left behind: 0 headband 1 gnome hat 2 curler cap 3 dog collar 4 mayor's hat
    if (f === 0) p.r(1, 3, 8, 2, 'roof').r(3, 2, 4, 1, 'roof');
    if (f === 1) p.r(2, 4, 6, 2, 'roof').r(3, 2, 4, 2, 'roof').r(4, 0, 2, 2, 'roof');
    if (f === 2) p.r(1, 3, 8, 3, 'stoneL').r(2, 2, 2, 1, 'sky2').r(6, 2, 2, 1, 'sky2');
    if (f === 3) p.r(1, 3, 8, 2, 'roof').px(4, 5, 'glow');
    if (f === 4) p.r(0, 4, 10, 2, 'ink').r(2, 0, 6, 4, 'ink').r(2, 3, 6, 1, 'glow');
  }
  function muzzle(p, f) { p.r(0, 2, 4, 2, 'white').r(2, 0, 2, 6, 'glow').r(4, 1, 2, 4, 'glow'); }
  function spark(p, f) { p.r(2, 0, 1, 5, 'white').r(0, 2, 5, 1, 'white'); if (!f) p.px(2, 2, 'glow'); }
  function shock(p, f) { // 22×42 shockwave (tall variant clipped by scaleY)
    p.r(2, 0, 18, 42, 'glow').r(5, 3, 12, 39, 'sky3').r(8, 8, 6, 34, 'white');
    if (f) p.r(2, 0, 18, 3, 'white');
  }
  function sign(p, f) { // 30×28 roadside sign: 0 info (plaster), 1 warning (yellow), 2 town
    const bg = f === 1 ? 'glow' : (f === 2 ? 'teal' : 'plaster');
    p.r(13, 14, 3, 14, 'beam').r(1, 1, 28, 15, bg).r(1, 13, 28, 2, f === 1 ? 'sky3' : 'plasterSh');
    if (f === 1) { p.r(13, 3, 3, 7, 'ink').r(13, 11, 3, 2, 'ink'); }
    else { p.r(4, 4, 18, 1, 'stone').r(4, 7, 22, 1, 'stone').r(4, 10, 14, 1, 'stone'); }
  }
  function kasten(p) { // 18×16 crate of deposit bottles
    p.r(1, 6, 16, 10, 'roof').r(1, 6, 16, 2, 'rustHi').r(3, 10, 12, 2, 'roofSh');
    for (let i = 0; i < 4; i++) p.r(2 + i * 4, 1, 3, 6, 'moss').r(3 + i * 4, 0, 1, 2, 'glow').px(2 + i * 4, 2, 'zHi');
  }
  function lebkuchen(p) { // 16×14 gingerbread heart
    p.disc(5, 5, 4, 4, 'rust').disc(10, 5, 4, 4, 'rust');
    for (let y = 6; y < 14; y++) { const w = 13 - (y - 6) * 1.6; p.r(Math.round(7.5 - w / 2), y, Math.round(w), 1, 'rust'); }
    p.line(3, 4, 7, 6, 'white').line(8, 6, 12, 4, 'white').r(5, 8, 6, 1, 'glow').px(4, 3, 'rustHi').px(10, 3, 'rustHi');
  }
  function kuchen(p) { // 16×12 cake slice
    p.r(1, 4, 14, 7, 'glow').r(1, 4, 14, 2, 'white').r(1, 7, 14, 1, 'roof').r(6, 1, 3, 3, 'roof').px(7, 0, 'mossD');
  }
  function tape(p) { // 14×14 duct tape (Panzertape)
    p.disc(7, 7, 6, 6, 'stoneL').disc(7, 7, 2, 2, 'ink').r(9, 9, 5, 3, 'stoneL').r(3, 3, 3, 2, 'white');
  }
  function balcony(p) { // 40×12
    p.r(0, 0, 40, 3, 'wood').r(0, 0, 40, 1, 'rustHi');
    for (let x = 1; x < 40; x += 4) p.r(x, -0, 1, 0, 'wood');
    p.r(2, 3, 3, 9, 'beam').r(35, 3, 3, 9, 'beam').line(5, 10, 10, 3, 'beam').line(34, 10, 29, 3, 'beam');
  }
  function railing(p) { p.r(0, 0, 40, 2, 'wood'); for (let x = 1; x < 40; x += 4) p.r(x, 2, 2, 10, 'wood'); }
  function shadow(p) { p.r(2, 0, 12, 2, 'ink').r(0, 1, 16, 1, 'ink'); }
  function marker(p, f) { // 48×8 landing marker
    for (let x = 0; x < 48; x += 8) p.r(x, 2, 5, 4, f ? 'glow' : 'roof');
  }
  function goalFlag(p) { p.r(0, 0, 2, 40, 'stoneL').r(2, 1, 14, 9, 'white').r(2, 1, 7, 5, 'ink').r(9, 5, 7, 5, 'ink'); }
  function milk(p) { // 14×20 milk carton
    p.r(2, 5, 10, 15, 'white').r(2, 2, 10, 4, 'plaster').r(4, 0, 6, 2, 'plaster').r(2, 10, 10, 5, 'teal').r(4, 11, 2, 2, 'white').r(8, 12, 2, 2, 'white');
  }

  const ART = {
    C,
    build(scene) {
      sheet(scene, 'hero', 24, 44, 10, hero);
      sheet(scene, 'jogger', 20, 32, 5, jogger);
      sheet(scene, 'gnome', 12, 16, 2, gnome);
      sheet(scene, 'neighbour', 22, 34, 4, neighbour);
      sheet(scene, 'dackel', 24, 12, 4, dackel);
      sheet(scene, 'lid', 14, 8, 2, lid);
      sheet(scene, 'boss', 52, 72, 5, boss);
      sheet(scene, 'trolley', 34, 30, 3, trolley);
      sheet(scene, 'truck', 100, 70, 2, truck);
      sheet(scene, 'sofa', 48, 18, 1, sofa);
      sheet(scene, 'fridge', 16, 48, 1, fridge);
      sheet(scene, 'pot', 12, 12, 1, pot);
      sheet(scene, 'scherben', 48, 6, 1, scherben);
      sheet(scene, 'files', 24, 20, 1, files);
      sheet(scene, 'knoedel', 22, 22, 4, knoedel);
      sheet(scene, 'bullet', 6, 4, 1, bullet, { outline: false });
      sheet(scene, 'poof', 24, 24, 5, poof, { outline: false });
      sheet(scene, 'hat', 10, 6, 5, hat);
      sheet(scene, 'muzzle', 6, 6, 1, muzzle, { outline: false });
      sheet(scene, 'spark', 5, 5, 2, spark, { outline: false });
      sheet(scene, 'shock', 22, 42, 2, shock);
      sheet(scene, 'sign', 30, 28, 3, sign);
      sheet(scene, 'kasten', 18, 16, 1, kasten);
      sheet(scene, 'lebkuchen', 16, 14, 1, lebkuchen);
      sheet(scene, 'kuchen', 16, 12, 1, kuchen);
      sheet(scene, 'tape', 14, 14, 1, tape);
      sheet(scene, 'balcony', 40, 12, 1, balcony, { outline: false });
      sheet(scene, 'railing', 40, 12, 1, railing, { outline: false });
      sheet(scene, 'shadow', 16, 2, 1, shadow, { outline: false });
      sheet(scene, 'marker', 48, 8, 2, marker, { outline: false });
      sheet(scene, 'goalflag', 16, 40, 1, goalFlag);
      sheet(scene, 'milkbig', 14, 20, 1, milk);
    },
  };
  window.ART = ART;
})();
