'use strict';
// services/gather.js — madencilik ve odunculuk (özgün kodda bu modüllerin servis/sabit dosyaları eksikti; yeniden yazıldı)
const { get, all, run, tx, ensureGuild, ApiError, cooldownLeft, setCooldown } = require('../lib/db');
const { addCoin } = require('./economy');
const { xpMult, coinMult, hasRelic } = require('./bonuses');
const mmo = require('./mmo');
const { cfg, assertEnabled } = require('./config');

const FOODS = {
  ekmek: { name: 'Ekmek', emoji: '🍞', energy: 5, price: 200 },
  corba: { name: 'Çorba', emoji: '🍲', energy: 10, price: 350 },
  et:    { name: 'Et', emoji: '🥩', energy: 20, price: 600 },
};
const xpNeeded = (lvl) => Math.round(50 * lvl * 1.3);
const RANKS = [[1, 'Çaylak'], [5, 'Çırak'], [10, 'Usta'], [20, 'Uzman'], [35, 'Efsane']];
const rankOf = (lvl) => RANKS.filter(r => lvl >= r[0]).pop()[1];
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
function pickWeighted(list) { const t = list.reduce((s, x) => s + x.w, 0); let r = Math.random() * t; for (const x of list) { if (r < x.w) return x; r -= x.w; } return list[0]; }

const ORES = [
  { key: 'tas', name: 'Taş', emoji: '🪨', value: 6, w: 40, minLevel: 1 },
  { key: 'demir', name: 'Demir Cevheri', emoji: '⚙️', value: 14, w: 28, minLevel: 1 },
  { key: 'bakir', name: 'Bakır Cevheri', emoji: '🟤', value: 16, w: 20, minLevel: 2 },
  { key: 'gumus', name: 'Gümüş', emoji: '⚪', value: 30, w: 12, minLevel: 4 },
  { key: 'altin', name: 'Altın', emoji: '🟡', value: 55, w: 7, minLevel: 6 },
  { key: 'elmas', name: 'Elmas', emoji: '💎', value: 120, w: 3, minLevel: 10 },
];
const WOODS = [
  { key: 'mese', name: 'Meşe', emoji: '🪵', value: 6, w: 40, minLevel: 1 },
  { key: 'cam', name: 'Çam', emoji: '🌲', value: 9, w: 28, minLevel: 1 },
  { key: 'kayin', name: 'Kayın', emoji: '🌳', value: 15, w: 20, minLevel: 2 },
  { key: 'ceviz', name: 'Ceviz', emoji: '🥜', value: 28, w: 12, minLevel: 4 },
  { key: 'abanoz', name: 'Abanoz', emoji: '⬛', value: 55, w: 7, minLevel: 6 },
  { key: 'kadim', name: 'Kadim Ağaç', emoji: '✨', value: 110, w: 3, minLevel: 10 },
];

function makeGatherer(conf) {
  // Tüm sayılar (bekleme, enerji, fiyat, çarpan) /setup panelinden okunur: cfg(sunucu, `${p}.anahtar`)
  const { name, p, table, inv, invCol, workers, level, xp, total, items, itemsKey, dropMats } = conf;
  const C = (g, k) => cfg(g, `${p}.${k}`);
  const itemDef = (k) => items.find(i => i.key === k);

  function state(g, u) {
    ensureGuild(g);
    run(`INSERT OR IGNORE INTO ${table} (guild_id,user_id,last_energy_regen) VALUES (?,?,?)`, g, u, Date.now());
    let r = get(`SELECT * FROM ${table} WHERE guild_id=? AND user_id=?`, g, u);
    const max = C(g, 'base_energy') + C(g, 'energy_per_tier') * Number(r.energy_cap_tier);
    const ENERGY_REGEN_MS = C(g, 'regen_min') * 60 * 1000;
    let energy = Number(r.energy), last = Number(r.last_energy_regen) || Date.now();
    if (energy < max) {
      const gained = Math.floor((Date.now() - last) / ENERGY_REGEN_MS);
      if (gained > 0) { energy = Math.min(max, energy + gained); last += gained * ENERGY_REGEN_MS; if (energy >= max) last = Date.now(); run(`UPDATE ${table} SET energy=?, last_energy_regen=? WHERE guild_id=? AND user_id=?`, energy, last, g, u); }
    } else if (last < Date.now() - ENERGY_REGEN_MS) { run(`UPDATE ${table} SET last_energy_regen=? WHERE guild_id=? AND user_id=?`, Date.now(), g, u); }
    r = get(`SELECT * FROM ${table} WHERE guild_id=? AND user_id=?`, g, u);
    return { row: r, max };
  }
  const workerPrice = (g, n) => C(g, 'worker_price') * n;
  const capPrice = (g, tier) => C(g, 'cap_price') * (tier + 1);
  const foodPrice = (g, f) => Math.round(f.price * C(g, 'food_pct') / 100);

  function status(g, u) {
    const { row, max } = state(g, u);
    const inventory = all(`SELECT ${invCol} AS k, amount FROM ${inv} WHERE guild_id=? AND user_id=? AND amount>0`, g, u);
    const value = inventory.reduce((s, i) => s + Number(i.amount) * (itemDef(i.k)?.value || 0), 0);
    const lvl = Number(row[level]);
    return {
      ok: true, workers: Number(row[workers]), level: lvl, xp: Number(row[xp]), xpNeeded: xpNeeded(lvl), rank: rankOf(lvl),
      energy: Number(row.energy), maxEnergy: max, total: Number(row[total]), inventoryCount: inventory.reduce((s, i) => s + Number(i.amount), 0), inventoryValue: value,
      enabled: C(g, 'enabled'), cooldownMs: cooldownLeft(g, u, 'gather:' + p, C(g, 'cooldown_s') * 1000),
      nextWorkerPrice: Number(row[workers]) >= C(g, 'max_workers') ? null : workerPrice(g, Number(row[workers])), nextCapPrice: Number(row.energy_cap_tier) >= C(g, 'max_cap_tier') ? null : capPrice(g, Number(row.energy_cap_tier)),
    };
  }

  function act(g, u) {
    assertEnabled(g, `${p}.enabled`);
    return tx(() => {
      const left = cooldownLeft(g, u, 'gather:' + p, C(g, 'cooldown_s') * 1000);
      if (left) throw new ApiError('cooldown', { retryAfterMs: left });
      const { row } = state(g, u);
      if (Number(row.energy) < 1) throw new ApiError('insufficient_energy');
      const lvl = Number(row[level]), n = Number(row[workers]);
      const eligible = items.filter(i => i.minLevel <= lvl);
      const got = [];
      for (let i = 0; i < n; i++) got.push(pickWeighted(eligible));
      for (const it of got) run(`INSERT INTO ${inv} (guild_id,user_id,${invCol},amount) VALUES (?,?,?,1)
        ON CONFLICT (guild_id,user_id,${invCol}) DO UPDATE SET amount=amount+1`, g, u, it.key);
      // Madenlerde craft malzemesi düşebilir (silah/zırh üretiminde kullanılır)
      const mats = [];
      if (dropMats) {
        const mult = hasRelic(g, u, 'sansli_kazma') ? (get('SELECT level FROM relic_upgrades WHERE guild_id=? AND user_id=? AND relic_key=?', g, u, 'sansli_kazma')?.level >= 2 ? 4 : 2) : 1;
        const maxTier = 1 + Math.floor(lvl / 5);
        const pool = require('./mmo-constants').CRAFT_MATERIALS.filter(m => m.tier <= maxTier);
        for (let i = 0; i < n; i++) if (Math.random() < 0.10 + Math.min(0.15, lvl * 0.01)) {
          const m = pool[Math.floor(Math.random() * pool.length)];
          mmo.addMat(g, u, m.key, mult);
          const ex = mats.find(x => x.key === m.key); if (ex) ex.qty += mult; else mats.push({ key: m.key, name: m.name, emoji: m.emoji, qty: mult });
        }
      }
      const gainXp = Math.round(got.length * 3 * xpMult(g, u) * C(g, 'xp_pct') / 100);
      let newXp = Number(row[xp]) + gainXp, newLvl = lvl;
      while (newXp >= xpNeeded(newLvl)) { newXp -= xpNeeded(newLvl); newLvl++; }
      run(`UPDATE ${table} SET energy=energy-1, ${xp}=?, ${level}=?, ${total}=${total}+? WHERE guild_id=? AND user_id=?`, newXp, newLvl, got.length, g, u);
      setCooldown(g, u, 'gather:' + p, C(g, 'cooldown_s') * 1000);
      require('./quests').progress(g, u, name === 'mining' ? 'madencilik' : 'odunculuk', 1);
      return { ok: true, [itemsKey]: got.map(i => ({ key: i.key, name: i.name, emoji: i.emoji })), mats, xpGained: gainXp, leveled: newLvl > lvl, newLevel: newLvl };
    });
  }

  function sell(g, u) {
    return tx(() => {
      const rows = all(`SELECT ${invCol} AS k, amount FROM ${inv} WHERE guild_id=? AND user_id=? AND amount>0`, g, u);
      if (!rows.length) throw new ApiError('empty_inventory');
      let base = rows.reduce((s, r) => s + Number(r.amount) * (itemDef(r.k)?.value || 0), 0);
      let pct = 0;
      if (hasRelic(g, u, 'madenci') && dropMats) pct += 20;
      if (hasRelic(g, u, 'tuccar')) pct += 10;
      const totalCoin = Math.round(base * (1 + pct / 100) * coinMult(g, u) * C(g, 'sell_pct') / 100);
      run(`UPDATE ${inv} SET amount=0 WHERE guild_id=? AND user_id=?`, g, u);
      const balance = addCoin(g, u, totalCoin, name + '_sell');
      return { ok: true, total: totalCoin, balance };
    });
  }

  const routes = {
    status: ({ query }) => status(query.guildId, query.userId),
    act: ({ body }) => act(body.guildId, body.userId),
    inventory: ({ query }) => ({ ok: true, inventory: all(`SELECT ${invCol} AS k, amount FROM ${inv} WHERE guild_id=? AND user_id=? AND amount>0`, query.guildId, query.userId)
      .map(r => ({ [invCol]: `${itemDef(r.k)?.emoji || ''} ${itemDef(r.k)?.name || r.k}`, amount: Number(r.amount) })) }),
    sell: ({ body }) => sell(body.guildId, body.userId),
    leaderboard: ({ query }) => ({ ok: true, leaderboard: all(`SELECT user_id, ${level} AS lvl, ${xp} AS xp FROM ${table} WHERE guild_id=? ORDER BY lvl DESC, xp DESC LIMIT ?`, query.guildId, Math.min(parseInt(query.limit, 10) || 10, 25))
      .map(r => ({ userId: r.user_id, level: Number(r.lvl), xp: Number(r.xp) })) }),
    buyWorker: ({ body }) => tx(() => {
      assertEnabled(body.guildId, `${p}.enabled`);
      const { row } = state(body.guildId, body.userId), n = Number(row[workers]);
      if (n >= C(body.guildId, 'max_workers')) throw new ApiError('max_level');
      const cost = workerPrice(body.guildId, n), balance = addCoin(body.guildId, body.userId, -cost, name + '_worker');
      run(`UPDATE ${table} SET ${workers}=${workers}+1 WHERE guild_id=? AND user_id=?`, body.guildId, body.userId);
      return { ok: true, workers: n + 1, cost, balance };
    }),
    buyCap: ({ body }) => tx(() => {
      assertEnabled(body.guildId, `${p}.enabled`);
      const { row } = state(body.guildId, body.userId), t = Number(row.energy_cap_tier);
      if (t >= C(body.guildId, 'max_cap_tier')) throw new ApiError('max_level');
      const cost = capPrice(body.guildId, t), balance = addCoin(body.guildId, body.userId, -cost, name + '_cap');
      run(`UPDATE ${table} SET energy_cap_tier=energy_cap_tier+1 WHERE guild_id=? AND user_id=?`, body.guildId, body.userId);
      return { ok: true, maxEnergy: C(body.guildId, 'base_energy') + C(body.guildId, 'energy_per_tier') * (t + 1), cost, balance };
    }),
    buyFood: ({ body }) => tx(() => {
      assertEnabled(body.guildId, `${p}.enabled`);
      const f = FOODS[body.foodKey]; if (!f) throw new ApiError('unknown_food');
      const { row, max } = state(body.guildId, body.userId);
      if (Number(row.energy) >= max) throw new ApiError('energy_full');
      const price = foodPrice(body.guildId, f);
      const balance = addCoin(body.guildId, body.userId, -price, name + '_food');
      const energy = Math.min(max, Number(row.energy) + f.energy);
      run(`UPDATE ${table} SET energy=? WHERE guild_id=? AND user_id=?`, energy, body.guildId, body.userId);
      return { ok: true, energy, maxEnergy: max, cost: price, balance };
    }),
    fill: ({ body }) => tx(() => {
      const { row, max } = state(body.guildId, body.userId), missing = max - Number(row.energy);
      if (missing <= 0) throw new ApiError('energy_full');
      assertEnabled(body.guildId, `${p}.enabled`);
      const cost = missing * C(body.guildId, 'fill_cost'), balance = addCoin(body.guildId, body.userId, -cost, name + '_fill');
      run(`UPDATE ${table} SET energy=? WHERE guild_id=? AND user_id=?`, max, body.guildId, body.userId);
      return { ok: true, energy: max, maxEnergy: max, cost, balance };
    }),
  };
  return routes;
}

const mining = makeGatherer({ name: 'mining', p: 'mining', table: 'mining_data', inv: 'mining_inventory', invCol: 'ore', workers: 'miners', level: 'mining_level', xp: 'mining_xp', total: 'total_ores_mined', items: ORES, itemsKey: 'ores', dropMats: true });
const wood = makeGatherer({ name: 'wood', p: 'wood', table: 'woodcutting_data', inv: 'woodcutting_inventory', invCol: 'wood', workers: 'lumberjacks', level: 'wood_level', xp: 'wood_xp', total: 'total_logs_cut', items: WOODS, itemsKey: 'logs', dropMats: false });

function mount(prefix, g, act) {
  return {
    [`GET ${prefix}/status`]: g.status, [`POST ${prefix}/${act}`]: g.act, [`GET ${prefix}/inventory`]: g.inventory,
    [`POST ${prefix}/sell`]: g.sell, [`GET ${prefix}/leaderboard`]: g.leaderboard, [`POST ${prefix}/buy-worker`]: g.buyWorker,
    [`POST ${prefix}/buy-energy-cap`]: g.buyCap, [`POST ${prefix}/buy-food`]: g.buyFood, [`POST ${prefix}/buy-energy-fill`]: g.fill,
  };
}
const routes = { ...mount('/mining', mining, 'dig'), ...mount('/woodcutting', wood, 'chop') };

module.exports = { routes, FOODS };
