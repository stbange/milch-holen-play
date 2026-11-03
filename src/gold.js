// Gold looks (openspec add-difficulty-tiers: Hard reward). The four hero sheets (hero board, SUP,
// bike trailer, biplane) become canvas textures under their own keys at boot, so every animation keeps
// working; GOLD.apply() redraws each one from the original pixels or the gold palette swap
// (MH.tiers.GOLD_MAPS, palette colours only) and uploads it again. The hero sheet only swaps the
// board rows (frame-local y >= 34) so the face and clothes stay as drawn.
(function () {
  const S = {};   // key -> { tex, orig: ImageData, gold: ImageData, ctx }
  const BOARD_Y = 34;
  const hex = (r, g, b) => ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  function swap(img, map, fh, minY) {
    const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), d = out.data;
    for (let y = 0; y < img.height; y++) {
      if (minY && (y % fh) < minY) continue;
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4; if (!d[i + 3]) continue;
        const to = map[hex(d[i], d[i + 1], d[i + 2])]; if (!to) continue;
        const v = parseInt(to, 16); d[i] = v >> 16; d[i + 1] = (v >> 8) & 255; d[i + 2] = v & 255;
      }
    }
    return out;
  }
  function init(scene) {
    const TM = scene.textures, MAPS = window.MH.tiers.GOLD_MAPS;
    Object.keys(MAPS).forEach(key => {
      if (!TM.exists(key) || S[key]) return;
      const old = TM.get(key), src = old.getSourceImage(), w = src.width, h = src.height;
      const frames = old.getFrameNames().map(n => { const f = old.get(n); return [n, f.cutX, f.cutY, f.cutWidth, f.cutHeight]; });
      const fh = frames.length ? frames[0][4] : h;
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(src, 0, 0);
      const orig = ctx.getImageData(0, 0, w, h), gold = swap(orig, MAPS[key], fh, key === 'hero' ? BOARD_Y : 0);
      TM.remove(key);
      const tex = TM.addCanvas(key, cv);
      frames.forEach(([n, x, y, fw, fhh]) => { if (n !== '__BASE') tex.add(isNaN(+n) ? n : +n, 0, x, y, fw, fhh); });
      S[key] = { tex, orig, gold, ctx, on: false };
    });
    apply();
  }
  // which sheets wear gold right now (unlocked and not switched off)
  function worn() { return window.MH.tiers.goldSheets(window.GAME_DATA.tuning.difficulty, SAVE.data.cosmetics); }
  function apply() {
    const on = worn();
    Object.keys(S).forEach(key => {
      const s = S[key], g = on.indexOf(key) >= 0; if (g === s.on) return;
      s.on = g; s.ctx.putImageData(g ? s.gold : s.orig, 0, 0); s.tex.refresh();
    });
  }
  window.GOLD = { init, apply, worn, state: () => Object.keys(S).filter(k => S[k].on) };
})();
