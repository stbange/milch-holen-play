// Boss rules (spec: bosses): HP phases, damage with the exposed multiplier and the damage-per-second cap,
// the per-phase attack timers.
(function (root) {
  'use strict';
  // thresholds [_, phase2_at, phase3_at] in HP
  const phaseFor = (hp, thr) => hp <= thr[2] ? 3 : hp <= thr[1] ? 2 : 1;
  // effective damage of one hit, or 0 when the boss cannot take it. Spends the dps bucket (mutates bs.bucket).
  function hitDamage(bs, BB, dmg) {
    if (!bs || !bs.alive || bs.inv > 0 || bs.entering) return 0;
    if (bs.exposed > 0) dmg *= (BB.exposed_mult || 1);
    if (BB.dps_cap && dmg < 5) { dmg = Math.min(dmg, bs.bucket); bs.bucket -= dmg; if (dmg <= 0) return 0; }
    return dmg;
  }
  // refill of the dps bucket per frame (bigger while the boss is exposed)
  function refillBucket(bucket, BB, exposed, dt) {
    const m = exposed > 0 ? BB.exposed_mult : 1;
    return Math.min(BB.dps_cap * m, (bucket || 0) + BB.dps_cap * dt * m);
  }
  // fresh attack timers when phase p starts (first attack after offset + 2 s in phase 1, + 1.5 s later)
  const phaseAttacks = (BB, p) => BB.phases[p - 1].attacks.map(a => ({ a, t: (a.offset_s || 0) + (p === 1 ? 2.0 : 1.5), n: 0 }));
  // every second wave of an attack with every_second_wave is the big one
  const bigWave = (a, n) => !!(a.every_second_wave && n % 2 === 0);
  const api = { phaseFor, hitDamage, refillBucket, phaseAttacks, bigWave };
  const MH = root.MH || (root.MH = {}); MH.boss = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
