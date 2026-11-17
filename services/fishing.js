'use strict';
// services/fishing.js — balıkçılık: olta at, balık tut, sat, yem al, olta geliştir
const { get, all, run, tx, ensureGuild, ApiError, cooldownLeft, setCooldown } = require('../lib/db');
const { addCoin } = require('./economy');
const { xpMult, coinMult, hasRelic } = require('./bonuses');
const quests = require('./quests');
const { cfg, assertEnabled } = require('./config');

const FISH = [
  { key: 'eski_bot',  name: 'Eski Bot',        emoji: '👢', value: 3,   w: 6,   rod: 1, rarity: 'çöp' },
  { key: 'hamsi',     name: 'Hamsi',           emoji: '🐟', value: 10,  w: 38,  rod: 1, rarity: 'yaygın' },
  { key: 'istavrit',  name: 'İstavrit',        emoji: '🐟', value: 15,  w: 27,  rod: 1, rarity: 'yaygın' },
  { key: 'levrek',    name: 'Levrek',          emoji: '🐠', value: 32,  w: 15,  rod: 1, rarity: 'nadir' },
  { key: 'cipura',    name: 'Çipura',          emoji: '🐠', value: 40,  w: 9,   rod: 2, rarity: 'nadir' },
  { key: 'ahtapot',   name: 'Ahtapot',         emoji: '🐙', value: 110, w: 3.5, rod: 2, rarity: 'epik' },
  { key: 'kilic',     name: 'Kılıç Balığı',    emoji: '🗡️', value: 160, w: 2.5, rod: 3, rarity: 'epik' },
  { key: 'orfoz',     name: 'Orfoz',           emoji: '🦈', value: 260, w: 1.5, rod: 3, rarity: 'efsanevi' },
  { key: 'koi',       name: 'Koi',             emoji: '🎏', value: 520, w: 0.7, rod: 4, rarity: 'efsanevi' },
  { key: 'altin',     name: 'Altın Balık',     emoji: '✨', value: 1500, w: 0.2, rod: 5, rarity: 'mitik' },
];
const ROD_COST = [0, 2500, 6000, 12000, 25000];   // seviye -> sonraki seviye maliyeti
const MAX_ROD = 5;
const xpNeeded = (l) => 60 * l;
const fishDef = (k) => FISH.find(f => f.key === k);

function state(g, u) {
  ensureGuild(g);
  run('INSERT OR IGNORE INTO fishing_data (guild_id,user_id) VALUES (?,?)', g, u);
  return get('SELECT * FROM fishing_data WHERE guild_id=? AND user_id=?', g, u);
}
const bait = (g, u) => Number(get('SELECT uses_left FROM fish_boosts WHERE guild_id=? AND user_id=?', g, u)?.uses_left || 0);
const invRows = (g, u) => all('SELECT fish_key, count FROM fish_inventory WHERE guild_id=? AND user_id=? AND count>0', g, u);

function pick(rod, baited) {
  const pool = FISH.filter(f => f.rod <= rod).map(f => {
    const rare = f.value >= 100;
    return { ...f, ww: f.w * (rare ? 1 + rod * 0.2 + (baited ? 1 : 0) : 1) * (f.key === 'eski_bot' && baited ? 0 : 1) };
  });
  let r = Math.random() * pool.reduce((s, f) => s + f.ww, 0);
  for (const f of pool) { if (r < f.ww) return f; r -= f.ww; }
  return pool[0];
}

const routes = {
  'GET /fishing/status': ({ query }) => {
    const s = state(query.guildId, query.userId), inv = invRows(query.guildId, query.userId);
    return { ok: true, rodLevel: Number(s.rod_level), level: Number(s.level), xp: Number(s.xp), xpNeeded: xpNeeded(Number(s.level)), total: Number(s.total_caught),
      baitUses: bait(query.guildId, query.userId), inventoryCount: inv.reduce((a, r) => a + Number(r.count), 0),
      inventoryValue: inv.reduce((a, r) => a + Number(r.count) * (fishDef(r.fish_key)?.value || 0), 0),
      rodUpgradeCost: Number(s.rod_level) >= MAX_ROD ? null : Math.round(ROD_COST[Number(s.rod_level)] * cfg(query.guildId, 'fishing.rod_cost_pct') / 100) };
  },
  'POST /fishing/cast': ({ body }) => {
    const { guildId: g, userId: u } = body;
    assertEnabled(g, 'fishing.enabled');
    return tx(() => {
      const left = cooldownLeft(g, u, 'fish', cfg(g, 'fishing.cooldown_s') * 1000);
      if (left) throw new ApiError('cooldown', { retryAfterMs: left });
      const s = state(g, u), baited = bait(g, u) > 0;
      if (baited) run('UPDATE fish_boosts SET uses_left=uses_left-1 WHERE guild_id=? AND user_id=?', g, u);
      const f = pick(Number(s.rod_level), baited);
      run(`INSERT INTO fish_inventory (guild_id,user_id,fish_key,count) VALUES (?,?,?,1)
           ON CONFLICT (guild_id,user_id,fish_key) DO UPDATE SET count=count+1`, g, u, f.key);
      const gain = Math.max(2, Math.round((f.value / 6) * xpMult(g, u) * cfg(g, 'fishing.xp_pct') / 100));
      let xp = Number(s.xp) + gain, lvl = Number(s.level);
      while (xp >= xpNeeded(lvl)) { xp -= xpNeeded(lvl); lvl++; }
      run('UPDATE fishing_data SET xp=?, level=?, total_caught=total_caught+1 WHERE guild_id=? AND user_id=?', xp, lvl, g, u);
      setCooldown(g, u, 'fish', cfg(g, 'fishing.cooldown_s') * 1000);
      quests.progress(g, u, 'balik', 1);
      const kg = f.key === 'eski_bot' ? 0 : Math.round((0.2 + Math.random() * (f.value / 40 + 1)) * 10) / 10;
      return { ok: true, fish: { key: f.key, name: f.name, emoji: f.emoji, value: f.value, rarity: f.rarity }, kg, xpGained: gain, leveled: lvl > Number(s.level), newLevel: lvl, baitLeft: bait(g, u), baited };
    });
  },
  'GET /fishing/inventory': ({ query }) => ({ ok: true, inventory: invRows(query.guildId, query.userId).map(r => ({ ...fishDef(r.fish_key), count: Number(r.count) })) }),
  'POST /fishing/sell': ({ body }) => tx(() => {
    const { guildId: g, userId: u } = body;
    const rows = invRows(g, u);
    if (!rows.length) throw new ApiError('empty_inventory');
    const base = rows.reduce((a, r) => a + Number(r.count) * (fishDef(r.fish_key)?.value || 0), 0);
    const total = Math.round(base * (hasRelic(g, u, 'deniz') ? 1.25 : 1) * coinMult(g, u) * cfg(g, 'fishing.sell_pct') / 100);
    const count = rows.reduce((a, r) => a + Number(r.count), 0);
    run('UPDATE fish_inventory SET count=0 WHERE guild_id=? AND user_id=?', g, u);
    return { ok: true, total, count, balance: addCoin(g, u, total, 'fish_sell') };
  }),
  'POST /fishing/buy-bait': ({ body }) => tx(() => {
    const { guildId: g, userId: u } = body, n = Math.max(1, Math.min(50, Math.floor(Number(body.amount || 5))));
    assertEnabled(g, 'fishing.enabled');
    const price = cfg(g, 'fishing.bait_price');
    const balance = addCoin(g, u, -price * n, 'fish_bait');
    run(`INSERT INTO fish_boosts (guild_id,user_id,uses_left) VALUES (?,?,?)
         ON CONFLICT (guild_id,user_id) DO UPDATE SET uses_left=uses_left+excluded.uses_left`, g, u, n);
    return { ok: true, amount: n, cost: price * n, baitUses: bait(g, u), balance };
  }),
  'POST /fishing/upgrade-rod': ({ body }) => tx(() => {
    const { guildId: g, userId: u } = body, s = state(g, u), lvl = Number(s.rod_level);
    if (lvl >= MAX_ROD) throw new ApiError('max_level');
    const cost = Math.round(ROD_COST[lvl] * cfg(g, 'fishing.rod_cost_pct') / 100), balance = addCoin(g, u, -cost, 'fish_rod');
    run('UPDATE fishing_data SET rod_level=rod_level+1 WHERE guild_id=? AND user_id=?', g, u);
    return { ok: true, newLevel: lvl + 1, cost, balance };
  }),
  'GET /fishing/leaderboard': ({ query }) => ({ ok: true, leaderboard: all('SELECT user_id, level, total_caught FROM fishing_data WHERE guild_id=? ORDER BY level DESC, xp DESC LIMIT ?', query.guildId, Math.min(parseInt(query.limit, 10) || 10, 25))
    .map(r => ({ userId: r.user_id, level: Number(r.level), total: Number(r.total_caught) })) }),
};

module.exports = { routes, FISH };
