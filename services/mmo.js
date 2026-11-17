'use strict';
// services/mmo.js — yumurta, sandık, MMO petleri, silah/zırh, craft, geliştirme, parçalama
const { get, all, run, tx, ensureGuild, ApiError } = require('../lib/db');
const { addCoin } = require('./economy');
const C = require('./mmo-constants');

const RARITY_NAMES = ['Sıradan', 'Nadir', 'Epik', 'Efsanevi', 'Mitik'];
const MAT_DEFS = [...C.CRAFT_MATERIALS, ...C.ADVANCED_CRAFT_MATERIALS];
const matDef = (key) => MAT_DEFS.find(m => m.key === key);
const DISMANTLE_REFUND = 0.7;

function need(o, ...keys) { for (const k of keys) if (o[k] === undefined || o[k] === null || o[k] === '') throw new ApiError('missing_' + k); }

// ── Craft malzemeleri ────────────────────────────────────────────────────
const matQty = (g, u, k) => Number(get('SELECT quantity FROM mmo_craft_mats WHERE guild_id=? AND user_id=? AND mat_key=?', g, u, k)?.quantity || 0);
function addMat(g, u, k, qty) {
  ensureGuild(g);
  run(`INSERT INTO mmo_craft_mats (guild_id,user_id,mat_key,quantity) VALUES (?,?,?,?)
       ON CONFLICT (guild_id,user_id,mat_key) DO UPDATE SET quantity=quantity+excluded.quantity`, g, u, k, qty);
}
const hasMats = (g, u, recipe) => Object.entries(recipe).every(([k, q]) => matQty(g, u, k) >= q);
function spendMats(g, u, recipe) {
  if (!hasMats(g, u, recipe)) return false;
  for (const [k, q] of Object.entries(recipe)) addMat(g, u, k, -q);
  return true;
}

// ── Yumurta / sandık stokları ────────────────────────────────────────────
function addEgg(g, u, type, qty = 1) {
  ensureGuild(g);
  run(`INSERT INTO mmo_eggs (guild_id,user_id,egg_type,quantity) VALUES (?,?,?,?)
       ON CONFLICT (guild_id,user_id,egg_type) DO UPDATE SET quantity=quantity+excluded.quantity`, g, u, type, qty);
}
function addChest(g, u, type, qty = 1) {
  ensureGuild(g);
  run(`INSERT INTO mmo_chests (guild_id,user_id,chest_type,quantity) VALUES (?,?,?,?)
       ON CONFLICT (guild_id,user_id,chest_type) DO UPDATE SET quantity=quantity+excluded.quantity`, g, u, type, qty);
}
function consume(table, col, g, u, key) {
  const r = run(`UPDATE ${table} SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND ${col}=? AND quantity>0`, g, u, key);
  return r.changes > 0;
}
const addShards = (g, u, petKey, qty) => run(`INSERT INTO mmo_pet_shards (guild_id,user_id,pet_key,quantity) VALUES (?,?,?,?)
  ON CONFLICT (guild_id,user_id,pet_key) DO UPDATE SET quantity=quantity+excluded.quantity`, g, u, petKey, qty);
const getShards = (g, u, petKey) => Number(get('SELECT quantity FROM mmo_pet_shards WHERE guild_id=? AND user_id=? AND pet_key=?', g, u, petKey)?.quantity || 0);

function petView(row) {
  const def = C.MMORPG_PETS.find(p => p.key === row.pet_key) || {};
  return { ...def, level: Number(row.level), hatchedAt: row.hatched_at, rarityName: RARITY_NAMES[def.rarity] };
}
function getActivePets(g, u) {
  const rows = all('SELECT slot, pet_key, pet_hatched_at FROM mmo_active_pets WHERE guild_id=? AND user_id=? ORDER BY slot', g, u);
  return rows.filter(r => r.pet_key).map(r => {
    const owned = get('SELECT level FROM mmo_pets WHERE guild_id=? AND user_id=? AND pet_key=? AND hatched_at=?', g, u, r.pet_key, r.pet_hatched_at);
    return { slot: r.slot, ...C.MMORPG_PETS.find(p => p.key === r.pet_key), level: owned ? Number(owned.level) : 1, hatchedAt: r.pet_hatched_at };
  });
}
function petStatBonus(g, u, stat) {
  return getActivePets(g, u).reduce((s, p) => p.bonusType !== stat ? s : s + p.bonusBase * (1 + (p.level - 1) * (C.MMO_PET_BONUS_PER_LV / 100)), 0);
}

// ── Silah / zırh ─────────────────────────────────────────────────────────
const getWeapons = (g, u) => all('SELECT id, weapon_key, enhancement FROM mmo_weapons WHERE guild_id=? AND user_id=?', g, u);
const getArmors = (g, u) => all('SELECT id, armor_key, slot, enhancement FROM mmo_armors WHERE guild_id=? AND user_id=?', g, u);
function bestWeapon(g, u) {
  let best = null, bp = -1;
  for (const w of getWeapons(g, u)) { const p = C.getWeaponBattlePower(w.weapon_key, Number(w.enhancement)); if (p > bp) { bp = p; best = { ...w, power: p }; } }
  return best;
}
function bestArmorPerSlot(g, u) {
  const by = {};
  for (const a of getArmors(g, u)) { const p = C.getArmorBattlePower(a.armor_key, Number(a.enhancement), a.slot); if (!by[a.slot] || p > by[a.slot].power) by[a.slot] = { ...a, power: p }; }
  return by;
}

const routes = {
  'GET /materials': ({ query }) => {
    need(query, 'guildId', 'userId');
    const rows = all('SELECT mat_key, quantity FROM mmo_craft_mats WHERE guild_id=? AND user_id=? AND quantity>0', query.guildId, query.userId);
    return { ok: true, materials: rows.map(r => ({ key: r.mat_key, ...(matDef(r.mat_key) || {}), quantity: Number(r.quantity) })) };
  },
  'POST /materials/sell': ({ body }) => {
    need(body, 'guildId', 'userId', 'matKey');
    const qty = Math.max(1, Math.floor(Number(body.quantity || 1))), def = matDef(body.matKey);
    if (!def) throw new ApiError('unknown_material');
    return tx(() => {
      if (matQty(body.guildId, body.userId, body.matKey) < qty) throw new ApiError('insufficient_materials');
      addMat(body.guildId, body.userId, body.matKey, -qty);
      const earned = def.sellValue * qty;
      return { ok: true, earned, balance: addCoin(body.guildId, body.userId, earned, 'material_sell') };
    });
  },

  // Yumurta
  'GET /eggs': ({ query }) => {
    need(query, 'guildId', 'userId');
    const rows = all('SELECT egg_type, quantity FROM mmo_eggs WHERE guild_id=? AND user_id=? AND quantity>0', query.guildId, query.userId);
    return { ok: true, catalog: C.PET_EGG_TYPES, owned: rows.map(r => ({ ...C.PET_EGG_TYPES.find(e => e.key === r.egg_type), quantity: Number(r.quantity) })) };
  },
  'POST /eggs/buy': ({ body }) => {
    need(body, 'guildId', 'userId', 'eggType');
    const egg = C.PET_EGG_TYPES.find(e => e.key === body.eggType);
    if (!egg) throw new ApiError('unknown_egg');
    return tx(() => { const balance = addCoin(body.guildId, body.userId, -egg.price, 'egg_buy'); addEgg(body.guildId, body.userId, egg.key); return { ok: true, egg, balance }; });
  },
  'POST /eggs/hatch': ({ body }) => {
    need(body, 'guildId', 'userId', 'eggType');
    const { guildId: g, userId: u } = body;
    return tx(() => {
      if (!consume('mmo_eggs', 'egg_type', g, u, body.eggType)) throw new ApiError('no_egg');
      const pet = C.pickMmoPetFromEgg(body.eggType);
      const duplicate = !!get('SELECT 1 AS x FROM mmo_pets WHERE guild_id=? AND user_id=? AND pet_key=?', g, u, pet.key);
      const hatchedAt = new Date().toISOString();
      run('INSERT INTO mmo_pets (guild_id,user_id,pet_key,level,hatched_at) VALUES (?,?,?,1,?)', g, u, pet.key, hatchedAt);
      if (duplicate) addShards(g, u, pet.key, 1); // aynı petten tekrar çıkarsa 1 parça (shard) hediye
      return { ok: true, pet: { ...pet, rarity: RARITY_NAMES[pet.rarity] }, hatchedAt, shardGained: duplicate ? 1 : 0 };
    });
  },

  // MMO petleri
  'GET /pets': ({ query }) => {
    need(query, 'guildId', 'userId');
    const owned = all('SELECT pet_key, level, hatched_at FROM mmo_pets WHERE guild_id=? AND user_id=?', query.guildId, query.userId).map(petView);
    return { ok: true, owned, active: getActivePets(query.guildId, query.userId) };
  },
  'POST /pets/set-active': ({ body }) => {
    need(body, 'guildId', 'userId', 'slot');
    const { guildId: g, userId: u } = body, slot = Number(body.slot);
    if (!(slot >= 0 && slot < C.MMO_PET_MAX_ACTIVE)) throw new ApiError('invalid_slot');
    return tx(() => {
      if (!body.petKey) { run('DELETE FROM mmo_active_pets WHERE guild_id=? AND user_id=? AND slot=?', g, u, slot); return { ok: true }; }
      if (!get('SELECT 1 AS x FROM mmo_pets WHERE guild_id=? AND user_id=? AND pet_key=? AND hatched_at=?', g, u, body.petKey, body.hatchedAt)) throw new ApiError('not_owned');
      run('DELETE FROM mmo_active_pets WHERE guild_id=? AND user_id=? AND pet_key=? AND pet_hatched_at=?', g, u, body.petKey, body.hatchedAt);
      run(`INSERT INTO mmo_active_pets (guild_id,user_id,slot,pet_key,pet_hatched_at) VALUES (?,?,?,?,?)
           ON CONFLICT (guild_id,user_id,slot) DO UPDATE SET pet_key=excluded.pet_key, pet_hatched_at=excluded.pet_hatched_at`, g, u, slot, body.petKey, body.hatchedAt);
      return { ok: true };
    });
  },
  'POST /pets/upgrade': ({ body }) => {
    need(body, 'guildId', 'userId', 'petKey', 'hatchedAt');
    const { guildId: g, userId: u } = body;
    return tx(() => {
      const row = get('SELECT level FROM mmo_pets WHERE guild_id=? AND user_id=? AND pet_key=? AND hatched_at=?', g, u, body.petKey, body.hatchedAt);
      if (!row) throw new ApiError('not_owned');
      const lvl = Number(row.level);
      if (lvl >= C.MMO_PET_MAX_LEVEL) throw new ApiError('max_level');
      const shardCost = C.getPetShardCostForLevel(lvl);
      if (shardCost > 0) {
        const have = getShards(g, u, body.petKey);
        if (have < shardCost) throw new ApiError('insufficient_shards', { required: shardCost, owned: have });
        addShards(g, u, body.petKey, -shardCost);
      }
      run('UPDATE mmo_pets SET level=level+1 WHERE guild_id=? AND user_id=? AND pet_key=? AND hatched_at=?', g, u, body.petKey, body.hatchedAt);
      return { ok: true, newLevel: lvl + 1, shardCost };
    });
  },
  'GET /pets/stat-bonus': ({ query }) => ({ ok: true, bonus: petStatBonus(query.guildId, query.userId, query.stat) }),

  // Sandık
  'GET /chests': ({ query }) => {
    need(query, 'guildId', 'userId');
    const rows = all('SELECT chest_type, quantity FROM mmo_chests WHERE guild_id=? AND user_id=? AND quantity>0', query.guildId, query.userId);
    return { ok: true, catalog: C.MMORPG_CHESTS, owned: rows.map(r => ({ ...C.MMORPG_CHESTS.find(c => c.key === r.chest_type), quantity: Number(r.quantity) })) };
  },
  'POST /chests/buy': ({ body }) => {
    need(body, 'guildId', 'userId', 'chestType');
    const chest = C.MMORPG_CHESTS.find(c => c.key === body.chestType);
    if (!chest) throw new ApiError('unknown_chest');
    return tx(() => { const balance = addCoin(body.guildId, body.userId, -chest.price, 'chest_buy'); addChest(body.guildId, body.userId, chest.key); return { ok: true, chest, balance }; });
  },
  'POST /chests/open': ({ body }) => {
    need(body, 'guildId', 'userId', 'chestType');
    const { guildId: g, userId: u } = body;
    return tx(() => {
      if (!consume('mmo_chests', 'chest_type', g, u, body.chestType)) throw new ApiError('no_chest');
      const roll = Math.random();
      if (roll < 0.55) {
        const mat = C.CRAFT_MATERIALS[Math.floor(Math.random() * C.CRAFT_MATERIALS.length)];
        const qty = 3 + Math.floor(Math.random() * 8);
        addMat(g, u, mat.key, qty);
        return { ok: true, type: 'craft_mat', item: mat, qty };
      }
      if (roll < 0.85) {
        const eggType = { ahsap: 'siradan', demir: 'nadir', altin: 'altin', elmas: 'kristal', kraliyet: 'kraliyet' }[body.chestType] || 'siradan';
        addEgg(g, u, eggType, 1);
        return { ok: true, type: 'egg', eggType, egg: C.PET_EGG_TYPES.find(e => e.key === eggType) || { name: eggType, emoji: '🥚' } };
      }
      const adv = C.ADVANCED_CRAFT_MATERIALS[Math.floor(Math.random() * C.ADVANCED_CRAFT_MATERIALS.length)];
      addMat(g, u, adv.key, 1);
      return { ok: true, type: 'craft_mat', item: adv, qty: 1, rare: true };
    });
  },

  // Silah / zırh
  'GET /weapons': ({ query }) => { need(query, 'guildId', 'userId'); return { ok: true, owned: getWeapons(query.guildId, query.userId).map(w => ({ ...w, enhancement: Number(w.enhancement) })) }; },
  'GET /armors': ({ query }) => { need(query, 'guildId', 'userId'); return { ok: true, owned: getArmors(query.guildId, query.userId).map(a => ({ ...a, enhancement: Number(a.enhancement) })) }; },
  'POST /weapons/craft': ({ body }) => {
    need(body, 'guildId', 'userId', 'weaponType', 'tierKey');
    const tier = C.WEAPON_TIERS.find(t => t.key === body.tierKey);
    if (!tier) throw new ApiError('unknown_tier');
    if (!C.WEAPON_TYPES.find(t => t.key === body.weaponType)) throw new ApiError('unknown_weapon_type');
    const { guildId: g, userId: u } = body;
    return tx(() => {
      if (tier.canBuy && tier.price > 0) addCoin(g, u, -tier.price, 'weapon_buy');
      else if (!spendMats(g, u, tier.craft)) throw new ApiError('insufficient_materials', { required: tier.craft });
      const weaponKey = `${body.weaponType}_${tier.key}`;
      const r = run('INSERT INTO mmo_weapons (guild_id,user_id,weapon_key,enhancement) VALUES (?,?,?,0)', g, u, weaponKey);
      return { ok: true, id: Number(r.lastInsertRowid), weaponKey };
    });
  },
  'POST /armors/craft': ({ body }) => {
    need(body, 'guildId', 'userId', 'tierKey', 'slotKey');
    const tier = C.ARMOR_TIERS.find(t => t.key === body.tierKey);
    if (!tier) throw new ApiError('unknown_tier');
    if (!C.ARMOR_SLOTS.find(s => s.key === body.slotKey)) throw new ApiError('unknown_slot');
    const { guildId: g, userId: u } = body;
    return tx(() => {
      if (tier.canBuy && tier.price > 0) addCoin(g, u, -tier.price, 'armor_buy');
      else if (!spendMats(g, u, tier.craft)) throw new ApiError('insufficient_materials', { required: tier.craft });
      const r = run('INSERT INTO mmo_armors (guild_id,user_id,armor_key,slot,enhancement) VALUES (?,?,?,?,0)', g, u, tier.key, body.slotKey);
      return { ok: true, id: Number(r.lastInsertRowid), tierKey: tier.key, slotKey: body.slotKey };
    });
  },
  'GET /gear/best': ({ query }) => ({ ok: true, weapon: bestWeapon(query.guildId, query.userId), armor: bestArmorPerSlot(query.guildId, query.userId) }),

  'POST /enhance': ({ body }) => {
    need(body, 'guildId', 'userId', 'itemType', 'itemId');
    const table = body.itemType === 'weapon' ? 'mmo_weapons' : 'mmo_armors';
    const { guildId: g, userId: u } = body;
    return tx(() => {
      const item = get(`SELECT * FROM ${table} WHERE id=? AND guild_id=? AND user_id=?`, Math.floor(Number(body.itemId)), g, u);
      if (!item) throw new ApiError('not_found');
      const enh = Number(item.enhancement);
      if (enh >= 10) throw new ApiError('max_enhancement');
      const coinCost = C.ENHANCEMENT_COIN_COST[enh];
      const matReq = C.getAdvancedEnhanceRequirement(enh) || C.ENHANCEMENT_MAT_COST;
      if (!hasMats(g, u, matReq)) throw new ApiError('insufficient_materials', { required: matReq });
      const balance = addCoin(g, u, -coinCost, 'enhance');
      spendMats(g, u, matReq);
      const successRate = C.ENHANCEMENT_SUCCESS_RATES[enh];
      const success = Math.random() * 100 < successRate;
      if (success) run(`UPDATE ${table} SET enhancement=enhancement+1 WHERE id=?`, item.id);
      return { ok: true, success, newEnhancement: success ? enh + 1 : enh, coinCost, matReq, successRate, balance };
    });
  },

  // Parçalama: harcanan malzemenin %70'i iade edilir (satın alınan eşyalar için malzeme iadesi de aynı tarif üzerinden)
  'POST /dismantle': ({ body }) => {
    need(body, 'guildId', 'userId', 'itemType', 'itemId');
    const isWeapon = body.itemType === 'weapon', table = isWeapon ? 'mmo_weapons' : 'mmo_armors';
    const { guildId: g, userId: u } = body;
    return tx(() => {
      const item = get(`SELECT * FROM ${table} WHERE id=? AND guild_id=? AND user_id=?`, Math.floor(Number(body.itemId)), g, u);
      if (!item) throw new ApiError('not_found');
      const tierKey = isWeapon ? String(item.weapon_key).split('_')[1] : item.armor_key;
      const tier = (isWeapon ? C.WEAPON_TIERS : C.ARMOR_TIERS).find(t => t.key === tierKey);
      const refunded = {};
      for (const [k, q] of Object.entries(tier ? tier.craft : {})) {
        const back = Math.floor(q * DISMANTLE_REFUND);
        if (back > 0) { addMat(g, u, k, back); refunded[matDef(k)?.name || k] = back; }
      }
      run(`DELETE FROM ${table} WHERE id=?`, item.id);
      return { ok: true, refunded };
    });
  },
};

module.exports = { routes, petStatBonus, getActivePets, bestWeapon, bestArmorPerSlot, addMat, addEgg, addChest, matDef };
