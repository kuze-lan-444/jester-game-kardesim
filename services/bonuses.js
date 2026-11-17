'use strict';
// services/bonuses.js — pet / antika / relik / boost kaynaklı XP ve coin artışları
const { get } = require('../lib/db');
const { PETS, PET_BONUS_PER_LEVEL, ANTIQUES, EJDER_SET_KEYS, EJDER_BASE_COIN_BONUS, EJDER_BASE_XP_BONUS } = require('./pet-constants');

function petBonus(g, u, type) {
  const a = get('SELECT pet_key FROM active_pet WHERE guild_id=? AND user_id=?', g, u);
  if (!a || !a.pet_key) return 0;
  const def = PETS.find(p => p.key === a.pet_key);
  if (!def || def.bonusType !== type) return 0;
  const row = get('SELECT level FROM pets WHERE guild_id=? AND user_id=? AND pet_key=?', g, u, a.pet_key);
  return def.bonusBase + ((row ? Number(row.level) : 1) - 1) * PET_BONUS_PER_LEVEL;
}
function antiqueBonus(g, u, field) {
  const a = get('SELECT antique_key FROM active_antique WHERE guild_id=? AND user_id=?', g, u);
  if (!a || !a.antique_key) return 0;
  const def = ANTIQUES.find(x => x.key === a.antique_key);
  if (!def) return 0;
  const up = get('SELECT upgrade_level FROM antique_upgrades WHERE guild_id=? AND user_id=? AND antique_key=?', g, u, a.antique_key);
  return (def[field] || 0) * (1 + (up ? Number(up.upgrade_level) : 0) * 0.5);
}
const hasEjderSet = (g, u) => EJDER_SET_KEYS.every(k => hasRelic(g, u, k));
const hasRelic = (g, u, key) => !!get('SELECT 1 AS x FROM relics WHERE guild_id=? AND user_id=? AND relic_key=?', g, u, key);

// Yüzde olarak döner (ör. 25 = +%25)
function xpBonusPct(g, u) {
  let pct = petBonus(g, u, 'xp') + antiqueBonus(g, u, 'xpBonus');
  if (hasRelic(g, u, 'bilgelik')) pct += 15;
  if (hasEjderSet(g, u)) pct += EJDER_BASE_XP_BONUS;
  if (get('SELECT 1 AS x FROM xp_boosts WHERE guild_id=? AND user_id=?', g, u)) pct += 50;
  return pct;
}
function coinBonusPct(g, u) {
  let pct = petBonus(g, u, 'coin') + antiqueBonus(g, u, 'coinBonus');
  if (hasEjderSet(g, u)) pct += EJDER_BASE_COIN_BONUS;
  if (get('SELECT 1 AS x FROM coin_boosts WHERE guild_id=? AND user_id=?', g, u)) pct += 50;
  return pct;
}
const xpMult = (g, u) => 1 + xpBonusPct(g, u) / 100;
const coinMult = (g, u) => 1 + coinBonusPct(g, u) / 100;

module.exports = { petBonus, antiqueBonus, hasRelic, xpBonusPct, coinBonusPct, xpMult, coinMult };
