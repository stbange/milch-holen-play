// Run stats for one level: base tuning + bought kiosk upgrades + the Kiosk-Tuete boon (spec: economy).
(function (root) {
  'use strict';
  // T: tuning, UPG: upgrades list (design data), owned: SAVE.data.upgrades, boon: tuning.boons.pool entry or null
  function computeStats(T, UPG, owned, boon) {
    const GUN = T.gun, M = T.movement, PL = T.player, PK = T.pickups;
    const s = {
      fire_rate_per_s: GUN.fire_rate_per_s, extra_bullet_angles_deg: [], crush_on_contact: [], scherben_harmless: false,
      slam_damage: M.slam_damage, slam_radius: M.slam_radius, hp_hearts: PL.hp_hearts, magnet_radius: PK.magnet_base_radius,
      special_unlocked: false, special_level: 0, parachute: false, rudder: false,
    };
    UPG.forEach(u => {
      for (let i = 0; i < (owned[u.id] || 0) && i < u.levels.length; i++) {
        const eff = u.levels[i].effect;
        for (const k in eff) { if (k.endsWith('_add')) s[k.slice(0, -4)] += eff[k]; else s[k] = eff[k]; }
      }
    });
    s.hp_hearts = Math.min(s.hp_hearts, PL.max_hearts_with_upgrades);
    s.bottle_mult = 1; s.jump_mult = 1; s.duckling = false; s.special_recharge_mult = 1; s.shield_hits = 0; s.dackel_friendly = false; s.special_starts_full = false;
    s.fly_speed_mult = 1; s.crash_shield = 0; s.loop_cooldown_mult = 1;
    if (boon) {
      if (boon.extra_hearts) s.hp_hearts = Math.min(boon.max_hearts || 6, s.hp_hearts + boon.extra_hearts);
      if (boon.fire_rate_add) s.fire_rate_per_s += boon.fire_rate_add;
      if (boon.magnet_radius) s.magnet_radius = Math.max(s.magnet_radius, boon.magnet_radius);
      if (boon.bottle_mult) s.bottle_mult = boon.bottle_mult;
      if (boon.shield_hits) s.shield_hits = boon.shield_hits;
      if (boon.dackel_friendly) s.dackel_friendly = true;
      if (boon.special_starts_full) s.special_starts_full = true;
      if (boon.jump_mult) s.jump_mult = boon.jump_mult;
      if (boon.duckling) s.duckling = true;
      if (boon.special_recharge_mult) s.special_recharge_mult = boon.special_recharge_mult;
      if (boon.fly_speed_mult) s.fly_speed_mult = boon.fly_speed_mult;
      if (boon.crash_shield) s.crash_shield = boon.crash_shield;
      if (boon.loop_cooldown_mult) s.loop_cooldown_mult = boon.loop_cooldown_mult;
    }
    return s;
  }
  // the boon bound to level n (SAVE.data.boon = {id, level}), or null
  function activeBoon(pool, saved, n) {
    return (n > 0 && saved && saved.level === n) ? (pool.find(b => b.id === saved.id) || null) : null;
  }
  const api = { computeStats, activeBoon };
  const MH = root.MH || (root.MH = {}); MH.stats = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
