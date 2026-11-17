'use strict';
// services/pets.js — klasik pet, antika ve relik sistemi
const { get, all, run, tx, ensureGuild, today, ApiError } = require('../lib/db');
const { addCoin } = require('./economy');
const K = require('./pet-constants');

const ANTIQUE_MAX_UPGRADE = 5;
const antiqueUpgradeCost = (def, lvl) => Math.round(def.price * 0.3 * (lvl + 1));
function need(o, ...keys) { for (const k of keys) if (!o[k]) throw new ApiError('missing_' + k); }

function petRow(g, u, key) { return get('SELECT level FROM pets WHERE guild_id=? AND user_id=? AND pet_key=?', g, u, key); }
function activePetKey(g, u) { return get('SELECT pet_key FROM active_pet WHERE guild_id=? AND user_id=?', g, u)?.pet_key || null; }
function activeAntiqueKey(g, u) { return get('SELECT antique_key FROM active_antique WHERE guild_id=? AND user_id=?', g, u)?.antique_key || null; }
const petView = (def, lvl) => ({ ...def, level: lvl, bonusPct: def.bonusBase + (lvl - 1) * K.PET_BONUS_PER_LEVEL, nextCost: lvl >= K.PET_MAX_LEVEL ? null : K.PET_UPGRADE_COSTS[lvl] });

function dailyMarket(g) {
  ensureGuild(g);
  const d = today();
  let row = get('SELECT antique1, antique2 FROM daily_antique_market WHERE guild_id=? AND market_date=?', g, d);
  if (!row) {
    const a = K.pickDailyAntique(), b = K.pickDailyAntique([a.key]);
    run('INSERT INTO daily_antique_market (guild_id,market_date,antique1,antique2) VALUES (?,?,?,?)', g, d, a.key, b.key);
    row = { antique1: a.key, antique2: b.key };
  }
  return [row.antique1, row.antique2].map(k => K.ANTIQUES.find(a => a.key === k)).filter(Boolean);
}

const routes = {
  // ── Pet ────────────────────────────────────────────────────────────
  'GET /pets': ({ query }) => {
    need(query, 'guildId', 'userId');
    const owned = all('SELECT pet_key, level FROM pets WHERE guild_id=? AND user_id=?', query.guildId, query.userId)
      .map(r => petView(K.PETS.find(p => p.key === r.pet_key), Number(r.level)));
    const ak = activePetKey(query.guildId, query.userId);
    return { ok: true, catalog: K.PETS, owned, active: owned.find(p => p.key === ak) || null };
  },
  'POST /pets/buy': ({ body }) => {
    need(body, 'guildId', 'userId', 'petKey');
    const def = K.PETS.find(p => p.key === body.petKey);
    if (!def) throw new ApiError('unknown_pet');
    return tx(() => {
      if (petRow(body.guildId, body.userId, def.key)) throw new ApiError('already_owned');
      const balance = addCoin(body.guildId, body.userId, -def.price, 'pet_buy');
      run('INSERT INTO pets (guild_id,user_id,pet_key,level) VALUES (?,?,?,1)', body.guildId, body.userId, def.key);
      if (!activePetKey(body.guildId, body.userId)) run(`INSERT INTO active_pet (guild_id,user_id,pet_key) VALUES (?,?,?)
        ON CONFLICT (guild_id,user_id) DO UPDATE SET pet_key=excluded.pet_key`, body.guildId, body.userId, def.key);
      return { ok: true, pet: def, balance };
    });
  },
  'POST /pets/set-active': ({ body }) => {
    need(body, 'guildId', 'userId', 'petKey');
    if (!petRow(body.guildId, body.userId, body.petKey)) throw new ApiError('not_owned');
    run(`INSERT INTO active_pet (guild_id,user_id,pet_key) VALUES (?,?,?)
         ON CONFLICT (guild_id,user_id) DO UPDATE SET pet_key=excluded.pet_key`, body.guildId, body.userId, body.petKey);
    return { ok: true };
  },
  'POST /pets/upgrade': ({ body }) => {
    need(body, 'guildId', 'userId');
    const key = body.petKey || activePetKey(body.guildId, body.userId);
    if (!key) throw new ApiError('not_owned');
    return tx(() => {
      const row = petRow(body.guildId, body.userId, key);
      if (!row) throw new ApiError('not_owned');
      const lvl = Number(row.level);
      if (lvl >= K.PET_MAX_LEVEL) throw new ApiError('max_level');
      const cost = K.PET_UPGRADE_COSTS[lvl];
      const balance = addCoin(body.guildId, body.userId, -cost, 'pet_upgrade');
      run('UPDATE pets SET level=level+1 WHERE guild_id=? AND user_id=? AND pet_key=?', body.guildId, body.userId, key);
      return { ok: true, petKey: key, newLevel: lvl + 1, cost, balance };
    });
  },

  // ── Antika ─────────────────────────────────────────────────────────
  'GET /antiques/market': ({ query }) => { need(query, 'guildId'); return { ok: true, antiques: dailyMarket(query.guildId) }; },
  'GET /antiques/inventory': ({ query }) => {
    need(query, 'guildId', 'userId');
    const ak = activeAntiqueKey(query.guildId, query.userId);
    const rows = all('SELECT antique_key FROM antique_inventory WHERE guild_id=? AND user_id=? AND count>0', query.guildId, query.userId);
    return { ok: true, owned: rows.map(r => {
      const def = K.ANTIQUES.find(a => a.key === r.antique_key);
      const up = get('SELECT upgrade_level FROM antique_upgrades WHERE guild_id=? AND user_id=? AND antique_key=?', query.guildId, query.userId, def.key);
      const lvl = up ? Number(up.upgrade_level) : 0;
      return { ...def, upgradeLevel: lvl, active: ak === def.key, nextCost: lvl >= ANTIQUE_MAX_UPGRADE ? null : antiqueUpgradeCost(def, lvl) };
    }) };
  },
  'POST /antiques/buy': ({ body }) => {
    need(body, 'guildId', 'userId', 'antiqueKey');
    const def = K.ANTIQUES.find(a => a.key === body.antiqueKey);
    if (!def) throw new ApiError('unknown_antique');
    return tx(() => {
      if (!dailyMarket(body.guildId).some(a => a.key === def.key)) throw new ApiError('not_in_market');
      if (get('SELECT 1 AS x FROM antique_inventory WHERE guild_id=? AND user_id=? AND antique_key=? AND count>0', body.guildId, body.userId, def.key)) throw new ApiError('already_owned');
      const balance = addCoin(body.guildId, body.userId, -def.price, 'antique_buy');
      run(`INSERT INTO antique_inventory (guild_id,user_id,antique_key,count) VALUES (?,?,?,1)
           ON CONFLICT (guild_id,user_id,antique_key) DO UPDATE SET count=1`, body.guildId, body.userId, def.key);
      return { ok: true, antique: def, balance };
    });
  },
  'POST /antiques/set-active': ({ body }) => {
    need(body, 'guildId', 'userId', 'antiqueKey');
    if (!get('SELECT 1 AS x FROM antique_inventory WHERE guild_id=? AND user_id=? AND antique_key=? AND count>0', body.guildId, body.userId, body.antiqueKey)) throw new ApiError('not_owned');
    run(`INSERT INTO active_antique (guild_id,user_id,antique_key) VALUES (?,?,?)
         ON CONFLICT (guild_id,user_id) DO UPDATE SET antique_key=excluded.antique_key`, body.guildId, body.userId, body.antiqueKey);
    return { ok: true };
  },
  'POST /antiques/upgrade': ({ body }) => {
    need(body, 'guildId', 'userId');
    const key = body.antiqueKey || activeAntiqueKey(body.guildId, body.userId);
    if (!key) throw new ApiError('not_owned');
    const def = K.ANTIQUES.find(a => a.key === key);
    return tx(() => {
      if (!get('SELECT 1 AS x FROM antique_inventory WHERE guild_id=? AND user_id=? AND antique_key=? AND count>0', body.guildId, body.userId, key)) throw new ApiError('not_owned');
      const up = get('SELECT upgrade_level FROM antique_upgrades WHERE guild_id=? AND user_id=? AND antique_key=?', body.guildId, body.userId, key);
      const lvl = up ? Number(up.upgrade_level) : 0;
      if (lvl >= ANTIQUE_MAX_UPGRADE) throw new ApiError('max_level');
      const cost = antiqueUpgradeCost(def, lvl);
      const balance = addCoin(body.guildId, body.userId, -cost, 'antique_upgrade');
      run(`INSERT INTO antique_upgrades (guild_id,user_id,antique_key,upgrade_level) VALUES (?,?,?,?)
           ON CONFLICT (guild_id,user_id,antique_key) DO UPDATE SET upgrade_level=excluded.upgrade_level`, body.guildId, body.userId, key, lvl + 1);
      return { ok: true, antiqueKey: key, newLevel: lvl + 1, cost, balance };
    });
  },

  // ── Relik ──────────────────────────────────────────────────────────
  'GET /relics': ({ query }) => {
    need(query, 'guildId', 'userId');
    const owned = new Set(all('SELECT relic_key FROM relics WHERE guild_id=? AND user_id=?', query.guildId, query.userId).map(r => r.relic_key));
    return { ok: true, relics: K.RELICS.map(r => {
      const up = get('SELECT level FROM relic_upgrades WHERE guild_id=? AND user_id=? AND relic_key=?', query.guildId, query.userId, r.key);
      return { ...r, owned: owned.has(r.key), level: up ? Number(up.level) : 1, maxLevel: K.getRelicMaxLv(r), upgradeCost: K.getRelicUpgCost(r) };
    }) };
  },
  'POST /relics/buy': ({ body }) => {
    need(body, 'guildId', 'userId', 'relicKey');
    const def = K.RELICS.find(r => r.key === body.relicKey);
    if (!def) throw new ApiError('unknown_relic');
    return tx(() => {
      if (get('SELECT 1 AS x FROM relics WHERE guild_id=? AND user_id=? AND relic_key=?', body.guildId, body.userId, def.key)) throw new ApiError('already_owned');
      const balance = addCoin(body.guildId, body.userId, -def.price, 'relic_buy');
      run('INSERT INTO relics (guild_id,user_id,relic_key) VALUES (?,?,?)', body.guildId, body.userId, def.key);
      run('INSERT OR IGNORE INTO relic_upgrades (guild_id,user_id,relic_key,level) VALUES (?,?,?,1)', body.guildId, body.userId, def.key);
      return { ok: true, relic: def, balance };
    });
  },
  'POST /relics/upgrade': ({ body }) => {
    need(body, 'guildId', 'userId', 'relicKey');
    const def = K.RELICS.find(r => r.key === body.relicKey);
    if (!def) throw new ApiError('unknown_relic');
    return tx(() => {
      if (!get('SELECT 1 AS x FROM relics WHERE guild_id=? AND user_id=? AND relic_key=?', body.guildId, body.userId, def.key)) throw new ApiError('not_owned');
      const up = get('SELECT level FROM relic_upgrades WHERE guild_id=? AND user_id=? AND relic_key=?', body.guildId, body.userId, def.key);
      const lvl = up ? Number(up.level) : 1;
      if (lvl >= K.getRelicMaxLv(def)) throw new ApiError('max_level');
      const cost = K.getRelicUpgCost(def);
      const balance = addCoin(body.guildId, body.userId, -cost, 'relic_upgrade');
      run(`INSERT INTO relic_upgrades (guild_id,user_id,relic_key,level) VALUES (?,?,?,?)
           ON CONFLICT (guild_id,user_id,relic_key) DO UPDATE SET level=excluded.level`, body.guildId, body.userId, def.key, lvl + 1);
      return { ok: true, newLevel: lvl + 1, cost, balance };
    });
  },
};

module.exports = { routes };
