// Difficulty tiers (openspec change add-difficulty-tiers; specs missions-progression, enemies-bosses, economy):
// tier names, the per-tier multipliers, the seeded extra spawns with the fairness checker, the boss
// variants and the gold-look colour maps. Pure rules: data in, data out. Easy returns the original data.
(function (root) {
  'use strict';
  const core = root.MH && root.MH.core ? root.MH.core : require('./core.js');
  const TIERS = ['easy', 'medium', 'hard'];
  const TILE = 16;
  const parseTier = s => TIERS.indexOf(s) >= 0 ? s : null;
  const info = (D, tier) => D.tiers[tier] || D.tiers.easy;
  const rank = (D, tier) => info(D, tier).rank;
  const tierOfRank = r => TIERS[r - 1] || null;
  // FNV-1a 32 bit (seed for the extra spawns: level id + tier)
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  // ------------------------------------------------------------------ multipliers
  const enemyHp = (hp, tier, D) => Math.max(1, Math.round(hp * info(D, tier).hp));
  // time between shots; never shorter than minS (the telegraph in front of it); easy keeps s exactly
  const fireInterval = (s, tier, D, minS) => { const f = info(D, tier).fire; return f === 1 ? s : Math.max(minS || 0, s / f); };
  const pfand = (n, tier, D) => Math.round(n * info(D, tier).pfand);
  // hard scrolls a little faster in plain runs, bike rides and flights (never in chases, escorts, arenas)
  const SCROLL_MODES = ['run', 'water', 'mixed', 'bike', 'flight', 'flight_boss', 'boss'];
  const scrollMult = (tier, kind, D) => ['run', 'bike', 'flight'].indexOf(kind) >= 0 ? info(D, tier).scroll : 1;
  // ------------------------------------------------------------------ zones
  const arcOf = L => L.index <= 5 ? 1 : L.index <= 10 ? 2 : 3;
  function zoneOf(L, x) {
    const a = arcOf(L);
    if (a === 1) return 'ground';
    if (a === 3) return 'flight';
    if (L.mode === 'water') return 'water';
    if (L.mode === 'mixed') return x < L.dock_x ? 'water' : 'bike';
    return 'bike';
  }
  // hop length in tiles for a zone (ground / bike: v0 2 v / g; water: lower gravity, hop 0.7 x height)
  function hopTiles(zone, L, T, tier, D) {
    const M = T.movement, air = 2 * M.jump_velocity / M.gravity;
    if (zone === 'water') {
      const W = T.arc2.water, g = M.gravity * W.gravity_mult, v = Math.sqrt(W.hop_height_ratio) * M.jump_velocity;
      const cur = (L.hazards || []).filter(h => h.type === 'current' && zoneOf(L, h.x) === 'water').reduce((m, h) => Math.max(m, h.speed), 0) || W.current_base;
      return 2 * v / g * cur / TILE;
    }
    const sp = zone === 'bike' ? T.arc2.bike.run_speed : L.mode === 'chase' ? T.chase.hero_run_speed : M.run_speed;
    return air * sp * scrollMult(tier, zone === 'bike' ? 'bike' : 'run', D) / TILE;
  }
  // the x range (tiles) where extras may go
  function clearRange(L, F) {
    const lo = F.start_clear_tiles;
    const hi = L.win && L.win.x ? L.win.x - F.goal_clear_tiles : (L.arena_start_x || 0) - F.arena_clear_tiles;
    return [lo, hi];
  }
  // ------------------------------------------------------------------ threat model
  function threatOf(D, T, zone, r, isHaz) {
    const TM = D.threats[zone] || D.threats.ground, m = TM[r.type] || TM._default;
    if (!m || m.cls === 'none') return null;
    let w = m.w || 1;
    if (m.w_from) w = r[m.w_from] || 1;
    if (m.w_kind) w = ((T.hazards.duck.kinds[r.kind] || T.hazards.duck.kinds.branch).w_px) / TILE;
    if (m.count_px) w += ((r.count || 1) - 1) * m.count_px / TILE;
    const x0 = r.x + (m.dx || 0);
    return { x0, x1: x0 + w, cls: m.cls, jump: !!m.jump, trig: m.trigger_px ? r.x - m.trigger_px / TILE : null, haz: !!isHaz };
  }
  function lineThreats(L, D, T, zone) {
    const out = [];
    (L.enemies || []).forEach(r => { if (zoneOf(L, r.x) === zone) { const t = threatOf(D, T, zone, r, false); if (t) out.push(t); } });
    (L.hazards || []).forEach(r => { if (zoneOf(L, r.x) === zone) { const t = threatOf(D, T, zone, r, true); if (t) out.push(t); } });
    return out;
  }
  // fairness for the side-scrolling zones: null when c may join `others`, else the failed rule
  function fairLine(cands, others, hop, F) {
    for (const c of cands) {
      const near = [c.cls];
      for (const o of others) {
        const dist = Math.max(o.x0 - c.x1, c.x0 - o.x1);
        if (dist < F.gap_hops * hop) return 'gap';
        if ((o.jump && c.x0 >= o.x1 && c.x0 - o.x1 < F.landing_hops * hop) || (c.jump && o.x0 >= c.x1 && o.x0 - c.x1 < F.landing_hops * hop)) return 'landing';
        if ((c.jump && o.trig !== null && o.trig > c.x0 - hop / 2 && o.trig < c.x1 + hop / 2) ||
            (o.jump && c.trig !== null && c.trig > o.x0 - hop / 2 && c.trig < o.x1 + hop / 2)) return 'midhop';
        if (dist < 2 * hop + 1) near.push(o.cls);
      }
      if (new Set(near).size > F.max_inputs) return 'inputs';
    }
    return null;
  }
  // ------------------------------------------------------------------ flight lane
  function flightBands(L, T, x0, x1, extra) {
    const E = T.enemies, TR = T.arc3.terrain, bands = [];
    const inWin = px => px >= x0 * TILE && px <= x1 * TILE;
    (L.hazards || []).concat(extra.filter(r => r.terrain)).forEach(h => {
      const kind = h.kind || h.type, def = TR[kind];
      if (!def || !def.boxes) return;
      def.boxes.forEach(b => { const bx0 = h.x * TILE + b[0], bx1 = h.x * TILE + b[1]; if (bx1 >= x0 * TILE && bx0 <= x1 * TILE) bands.push([b[2] + (h.dy || 0), b[3] + (h.dy || 0)]); });
    });
    (L.enemies || []).concat(extra.filter(r => !r.terrain)).forEach(e => {
      const d = E[e.type]; if (!d || !e.y || e.type === 'adler') return;
      const hh = (d.hitbox ? d.hitbox[1] : 12) / 2 + (d.sine_amp_px || 0);
      if (inWin(e.x * TILE)) bands.push([e.y - hh, e.y + hh]);
    });
    return bands;
  }
  // the widest free vertical lane (px) between y_min and y_max
  function freeLane(bands, yMin, yMax) {
    const b = bands.map(v => [Math.max(yMin, v[0]), Math.min(yMax, v[1])]).filter(v => v[1] > v[0]).sort((p, q) => p[0] - q[0]);
    let best = 0, y = yMin;
    for (const v of b) { if (v[0] > y) best = Math.max(best, v[0] - y); y = Math.max(y, v[1]); }
    return Math.max(best, yMax - y);
  }
  function fairFlight(L, T, D, unit, added) {
    const F = D.fairness, FL = T.arc3.flight, need = Math.max(F.lane_hitbox_mult * FL.hurtbox[1], T.arc3.corridor_min_px);
    const all = (L.enemies || []).concat(added);
    for (const r of unit) {
      const terr = (L.hazards || []).filter(h => h.type === 'terrain').concat(added.filter(a => a.terrain));
      const sep = r.terrain ? terr : all.filter(a => !a.terrain);
      if (sep.some(o => o !== r && Math.abs(o.x - r.x) < F.flight_min_sep_tiles)) return 'gap';
      const bands = flightBands(L, T, r.x - F.flight_window_tiles, r.x + F.flight_window_tiles, added.concat(unit));
      if (freeLane(bands, FL.y_min, FL.y_max) < need) return 'lane';
    }
    return null;
  }
  // ------------------------------------------------------------------ extras
  function pickWeighted(list, rand) {
    const tot = list.reduce((s, e) => s + (e.weight || 1), 0);
    let u = rand() * tot;
    for (const e of list) { u -= (e.weight || 1); if (u < 0) return e; }
    return list[list.length - 1];
  }
  const allowed = (s, L) => (!s.min_level || L.index >= s.min_level) && !(s.no_levels && s.no_levels.indexOf(L.index) >= 0);
  // resolve '@extra_type' / '@own' and 'copy' y into a concrete spec
  function resolve(s, L, LV, rand) {
    if (s.type === '@extra_type') return LV.extra_type ? Object.assign({}, LV.extra_type) : null;
    if (s.type === '@own') {
      const own = (L.enemies || []).filter(e => e.type !== 'kiste');
      if (!own.length) return null;
      const e = own[Math.floor(rand() * own.length)];
      return { type: e.type, y: e.y, count: e.count };
    }
    return Object.assign({}, s);
  }
  // spec -> records relative to x (dx), the first one is the main record
  function unitOf(s, L, rand) {
    let y = s.y;
    if (y === 'copy' || y === undefined) {
      const same = (L.enemies || []).filter(e => e.type === s.type);
      y = same.length ? same[Math.floor(rand() * same.length)].y : 0;
    }
    const recs = [];
    const base = r => { const o = { type: s.type }; if (y) o.y = y; Object.assign(o, r); return o; };
    if (s.terrain) recs.push({ dx: 0, rec: { type: 'terrain', kind: s.type, dy: 0 }, hazard: true, terrain: true });
    else if (s.hazard) {
      const r = { type: s.type }; if (s.y) r.y = s.y; if (s.w) r.w = s.w; if (s.kind) r.kind = s.kind;
      recs.push({ dx: 0, rec: r, hazard: true });
    } else {
      const n = s.pack || 1;
      for (let i = 0; i < n; i++) recs.push({ dx: i * (s.gap || 0), rec: base(s.count > 1 ? { count: s.count } : {}) });
    }
    if (s.sign) recs.push({ dx: s.sign_dx || 0, rec: { text_key: s.sign }, sign: true });
    return recs;
  }
  const at = (u, x) => u.map(q => Object.assign({}, q, { rec: Object.assign({}, q.rec, { x: x + q.dx }) }));
  // candidate x: the middle of a free stretch (longer stretches more likely), then the nearest shifts
  // (+-1 .. +-shift_tiles); up to `tries` stretches (specials: all) are tried before the extra is dropped
  function candidates(xs, lo, hi, span, rand, F, tries) {
    const pts = [lo].concat(xs.filter(x => x > lo && x < hi).sort((a, b) => a - b), [hi]), out = [];
    let gaps = [];
    for (let i = 1; i < pts.length; i++) { const g = pts[i] - pts[i - 1]; if (g > span) gaps.push({ a: pts[i - 1], g, weight: g * g }); }
    for (let n = 0; n < (tries || F.tries || 1) && gaps.length; n++) {
      const p = pickWeighted(gaps, rand), mid = Math.round(p.a + (p.g - span) / 2);
      gaps = gaps.filter(q => q !== p);
      out.push(mid);
      for (let k = 1; k <= F.shift_tiles; k++) out.push(mid - k, mid + k);
    }
    return out;
  }
  function levelFor(L, tier, T) {
    const D = T.difficulty, ti = info(D, tier);
    if (!D || tier === 'easy' || !parseTier(tier)) return L;
    const out = clone(L), F = D.fairness, LV = D.levels[L.id] || {}, rand = core.rng(hash(L.id + ':' + tier));
    const [lo, hi] = clearRange(L, F), stats = { placed: 0, moved: 0, dropped: 0, extended: 0, reasons: {} };
    out.extras = [];
    // river currents a bit faster on hard (never above the cap, never slower than before)
    const WT = D.water;
    if (tier === 'hard' && WT) (out.hazards || []).forEach(h => { if (h.type === 'current' && h.speed < WT.current_cap) h.speed = Math.min(WT.current_cap, h.speed + WT.hard_current_add); });
    const zones = [];
    (out.enemies || []).concat(out.hazards || []).forEach(r => { const z = zoneOf(L, r.x); if (zones.indexOf(z) < 0) zones.push(z); });
    if (!zones.length) zones.push(zoneOf(L, lo));
    zones.forEach(zone => {
      const tab = D.spawn_tables[zone] && D.spawn_tables[zone][tier];
      if (!tab) return;
      const inZone = r => zoneOf(L, r.x) === zone && r.x >= lo && r.x <= hi;
      const okZone = rs => rs.every(q => q.sign || (zoneOf(L, q.rec.x) === zone && q.rec.x >= lo && q.rec.x <= hi && !(L.dock_x && Math.abs(q.rec.x - L.dock_x) < F.arena_clear_tiles)));
      const groups = (out.enemies || []).filter(r => zoneOf(L, r.x) === zone).length +
        (zone === 'flight' ? 0 : (out.hazards || []).filter(r => zoneOf(L, r.x) === zone && threatOf(D, T, zone, r, true)).length);
      let budget = Math.round(groups * (ti.density - 1));
      const hop = zone === 'flight' ? 0 : hopTiles(zone, out, T, tier, D);
      const fail = why => { stats.reasons[why] = (stats.reasons[why] || 0) + 1; };
      // longer groups ("every gnome conga is 2 longer")
      tab.specials.filter(s => s.extend).forEach(s => (out.enemies || []).forEach(r => {
        if (r.type !== s.extend || !inZone(r)) return;
        const old = r.count || 1; r.count = old + s.add;
        if (zone !== 'flight') {
          const me = threatOf(D, T, zone, r, false), others = lineThreats(out, D, T, zone).filter(t => !(t.x0 === me.x0 && t.cls === me.cls && !t.haz));
          const why = fairLine([me], others, hop, F);
          if (why) { r.count = old; fail(why); return; }
        }
        stats.extended++;
      }));
      const place = (s, tries) => {
        if (!s || !allowed(s, L)) return false;
        const u = unitOf(s, L, rand), span = Math.max(1, ...u.map(q => q.dx + (q.rec.w || 1)));
        const xs = zone === 'flight' ? (out.enemies || []).concat(out.hazards || []).map(r => r.x)
          : lineThreats(out, D, T, zone).reduce((a, t) => a.concat([t.x0, t.x1]), []);
        const cs = candidates(xs, lo, hi, span, rand, F, tries);
        for (let k = 0; k < cs.length; k++) {
          const rs = at(u, cs[k]);
          if (!okZone(rs)) { if (k === cs.length - 1) fail('zone'); continue; }
          let why;
          if (zone === 'flight') why = fairFlight(out, T, D, rs.map(q => Object.assign({ terrain: !!q.terrain }, q.rec)), out.extras.filter(e => zoneOf(L, e.x) === zone).map(e => Object.assign({ terrain: e.type === 'terrain' }, e)));
          else {
            // each member of a unit (Wolfi pack) is checked against the line and the members before it
            const mine = rs.filter(q => !q.sign).map(q => threatOf(D, T, zone, q.rec, q.hazard)).filter(Boolean), line = lineThreats(out, D, T, zone);
            for (let i = 0; i < mine.length && !why; i++) why = fairLine([mine[i]], line.concat(mine.slice(0, i)), hop, F);
          }
          if (why) { if (k === cs.length - 1) fail(why); continue; }
          rs.forEach(q => {
            if (q.sign) (out.signs || (out.signs = [])).push(q.rec);
            else { (q.hazard ? out.hazards : out.enemies).push(q.rec); out.extras.push(q.rec); }
          });
          stats.placed++; if (k > 0) stats.moved++;
          return true;
        }
        stats.dropped++;
        return false;
      };
      const specials = tab.specials.filter(s => !s.extend).concat(tier === 'hard' && zone === 'flight' ? (LV.hard_specials || []) : []);
      specials.forEach(s0 => { place(resolve(s0, L, LV, rand), 1e9); budget--; });   // guaranteed extras try every free stretch
      const fill = tab.fill.filter(s => allowed(s, L) && (s.type !== '@extra_type' || LV.extra_type));
      for (let guard = 0; budget > 0 && fill.length && guard < 200; guard++) { place(resolve(pickWeighted(fill, rand), L, LV, rand)); budget--; }
    });
    (out.signs || []).sort((a, b) => a.x - b.x);
    out.tierStats = stats;
    return out;
  }
  // ------------------------------------------------------------------ bosses
  // kind: 'buergermeister' | 'kirmeskuh' | 'zeppelin' (the boss id)
  function bossFor(BB, tier, D) {
    if (tier === 'easy' || !parseTier(tier)) return BB;
    const B = clone(BB), m = info(D, tier).boss_hp, t0 = BB.phase_hp_thresholds;
    B.hp_total = Math.round(BB.hp_total * m);
    B.phase_hp_thresholds = [B.hp_total, Math.round(B.hp_total * D.boss_phase2_ratio), Math.round(B.hp_total * t0[2] / t0[0])];
    const R = tier === 'hard' && D.hard_boss[BB.id];
    if (R) {
      const last = B.phases[B.phases.length - 1].attacks;
      if (R.replace) {
        const i = last.findIndex(a => a.type === R.replace), src = B.phases[R.with_from_phase - 1].attacks.find(a => a.type === R.with);
        if (i >= 0 && src) last[i] = clone(src);
      } else {
        const a = last.find(x => x.type === R.attack);
        if (a) Object.assign(a, R.set);
      }
    }
    return B;
  }
  // ------------------------------------------------------------------ best tier + gold looks
  // record a win at tier into best[] (never lowered); returns true when it went up
  function recordBest(best, n, tier) {
    const r = TIERS.indexOf(tier) + 1;
    if (r <= (best[n - 1] || 0)) return false;
    best[n - 1] = r; return true;
  }
  // the gold look a hard win of mission n unlocks (or null)
  function goldFor(D, n, tier) {
    if (tier !== 'hard') return null;
    const C = D.cosmetics;
    return Object.keys(C).find(k => C[k] && C[k].mission === n) || null;
  }
  // colour swaps (hex 'rrggbb' -> 'rrggbb') for each recoloured sheet; palette colours only
  const GOLD_MAPS = {
    hero: { '8c4a2a': 'f4a261', '4a2f24': 'd07a3a', 'ff7a1a': 'ffe08a', 'd07a3a': 'ffe08a' },
    hero_sup: { 'b3a283': 'f4a261', 'e9dcc0': 'ffe08a', '8a5a3b': 'd07a3a' },
    bike_trailer: { 'e9dcc0': 'ffe08a', 'b3a283': 'f4a261', '2bb3a3': 'd07a3a' },
    hero_plane: { 'b0453a': 'f4a261', '6e2a2a': '8c4a2a', 'e9dcc0': 'ffe08a' }
  };
  const goldMap = sheet => GOLD_MAPS[sheet] || null;
  // which gold sheets are worn: unlocked and switched on
  function goldSheets(D, cos) {
    if (!cos || cos.gold_off) return [];
    const C = D.cosmetics, out = [];
    Object.keys(C).forEach(k => { if (C[k] && C[k].sheets && cos[k]) C[k].sheets.forEach(s => out.push(s)); });
    return out;
  }
  const api = { TIERS, SCROLL_MODES, parseTier, info, rank, tierOfRank, hash, enemyHp, fireInterval, pfand, scrollMult, arcOf, zoneOf, hopTiles, clearRange,
    threatOf, lineThreats, fairLine, flightBands, freeLane, fairFlight, unitOf, candidates, levelFor, bossFor, recordBest, goldFor, goldMap, goldSheets, GOLD_MAPS };
  const MH = root.MH || (root.MH = {}); MH.tiers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
