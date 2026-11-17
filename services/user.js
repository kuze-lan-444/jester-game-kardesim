'use strict';
// services/user.js — mesaj XP / seviye (tamamen /setup panelinden ayarlanır), profil, sohbet sayacı
const { get, all, run, tx, ensureGuild, today, ApiError, checkCooldown, setCooldown } = require('../lib/db');
const { addCoin } = require('./economy');
const { xpMult } = require('./bonuses');
const { cfg } = require('./config');

const getXpNeeded = (lvl, g) => (lvl + 1) * cfg(g, 'level.xp_per_level');
const tierReward = (lvl) => lvl >= 40 ? 700 : lvl >= 30 ? 500 : lvl >= 20 ? 300 : lvl >= 10 ? 200 : 100;
const getLevelUpCoinReward = (lvl, g) => Math.round(tierReward(lvl) * cfg(g, 'level.coin_reward_pct') / 100);

function getLevel(g, u) {
  const r = get('SELECT xp, level FROM user_levels WHERE guild_id=? AND user_id=?', g, u);
  return r ? { xp: Number(r.xp), level: Number(r.level) } : { xp: 0, level: 0 };
}

function addXp(g, u, amount) {
  return tx(() => {
    ensureGuild(g);
    run('INSERT OR IGNORE INTO user_levels (guild_id,user_id,xp,level) VALUES (?,?,0,0)', g, u);
    let { xp, level } = getLevel(g, u);
    const max = cfg(g, 'level.max_level');
    if (level >= max) return { leveled: false, newLevel: level, level, xpGained: 0, coinReward: 0, xp };
    xp += amount;
    let newLevel = level, coin = 0;
    while (xp >= getXpNeeded(newLevel, g) && newLevel < max) {
      xp -= getXpNeeded(newLevel, g); newLevel++; coin += getLevelUpCoinReward(newLevel, g);
    }
    if (newLevel >= max) xp = 0;
    run('UPDATE user_levels SET xp=?, level=? WHERE guild_id=? AND user_id=?', xp, newLevel, g, u);
    let balance = null;
    if (coin > 0) balance = addCoin(g, u, coin, 'level_up_reward');
    return { leveled: newLevel > level, newLevel, level: newLevel, xpGained: amount, coinReward: coin, balance, xp };
  });
}

const routes = {
  'POST /level/message-xp': ({ body }) => {
    const { guildId: g, userId: u } = body;
    if (!g || !u) throw new ApiError('missing_ids');
    const cur = getLevel(g, u);
    if (!cfg(g, 'level.enabled')) return { ok: true, leveled: false, skipped: true, disabled: true, level: cur.level };
    if (checkCooldown(g, u, 'msgxp')) return { ok: true, leveled: false, skipped: true, level: cur.level };
    setCooldown(g, u, 'msgxp', cfg(g, 'level.cooldown_s') * 1000);
    const lo = cfg(g, 'level.xp_min'), hi = Math.max(lo, cfg(g, 'level.xp_max'));
    const base = lo + Math.floor(Math.random() * (hi - lo + 1));
    const amount = Math.max(base > 0 ? 1 : 0, Math.round(base * xpMult(g, u)));
    return { ok: true, ...addXp(g, u, amount) };
  },
  'POST /level/xp/add': ({ body }) => {
    if (!body.guildId || !body.userId || !body.amount) throw new ApiError('missing_ids');
    return { ok: true, ...addXp(body.guildId, body.userId, Math.floor(Number(body.amount))) };
  },
  'GET /level/leaderboard': ({ query }) => {
    const limit = Math.min(parseInt(query.limit, 10) || 10, 25);
    const rows = all('SELECT user_id, level, xp FROM user_levels WHERE guild_id=? ORDER BY level DESC, xp DESC LIMIT ?', query.guildId, limit);
    return { ok: true, leaderboard: rows.map(r => ({ userId: r.user_id, level: Number(r.level), xp: Number(r.xp) })) };
  },
  'GET /profile': ({ query }) => {
    const l = getLevel(query.guildId, query.userId);
    const atMax = l.level >= cfg(query.guildId, 'level.max_level');
    return { ok: true, level: { ...l, xpNeeded: atMax ? 0 : getXpNeeded(l.level, query.guildId) } };
  },
  'POST /messages/count': ({ body }) => {
    const { guildId: g, channelId: c, userId: u } = body;
    if (!g || !c || !u) throw new ApiError('missing_ids');
    ensureGuild(g);
    run(`INSERT INTO message_counts (guild_id,channel_id,user_id,count_date,count) VALUES (?,?,?,?,1)
         ON CONFLICT (guild_id,channel_id,user_id,count_date) DO UPDATE SET count=count+1`, g, c, u, today());
    require('./quests').progress(g, u, 'mesaj', 1);
    return { ok: true };
  },
  'GET /messages/top': ({ query }) => {
    const limit = Math.min(parseInt(query.limit, 10) || 10, 25);
    const rows = all('SELECT user_id, count FROM message_counts WHERE guild_id=? AND channel_id=? AND count_date=? ORDER BY count DESC LIMIT ?',
      query.guildId, query.channelId, query.date || today(), limit);
    return { ok: true, top: rows.map(r => ({ userId: r.user_id, count: Number(r.count) })) };
  },
  'POST /messages/reset': ({ body }) => {
    if (!body.guildId) throw new ApiError('missing_guildId');
    run('DELETE FROM message_counts WHERE guild_id=?', body.guildId);
    return { ok: true };
  },
};

module.exports = { routes, addXp, getLevel, getXpNeeded };
