'use strict';
// services/voice.js — ses kanalı süresi takibi (saatte 50 coin)
const { get, all, run, ensureGuild, ApiError } = require('../lib/db');
const { addCoin } = require('./economy');
const { coinMult } = require('./bonuses');
const { cfg } = require('./config');

const sessions = new Map(); // "guild:user" -> giriş zamanı (ms)

function startSession(g, u, at = Date.now()) { sessions.set(`${g}:${u}`, at); }

const routes = {
  'POST /voice/join': ({ body }) => {
    if (!body.guildId || !body.userId) throw new ApiError('missing_ids');
    startSession(body.guildId, body.userId);
    return { ok: true };
  },
  'POST /voice/leave': ({ body }) => {
    const { guildId: g, userId: u } = body;
    if (!g || !u) throw new ApiError('missing_ids');
    const key = `${g}:${u}`, joined = sessions.get(key);
    if (!joined) return { ok: true, skipped: true };
    sessions.delete(key);
    const seconds = Math.floor((Date.now() - joined) / 1000);
    ensureGuild(g);
    run(`INSERT INTO voice_activity (guild_id,user_id,total_seconds) VALUES (?,?,?)
         ON CONFLICT (guild_id,user_id) DO UPDATE SET total_seconds=total_seconds+excluded.total_seconds`, g, u, seconds);
    const units = cfg(g, 'voice.enabled') ? Math.floor(seconds / (cfg(g, 'voice.interval_min') * 60)) : 0;
    const coin = Math.round(units * cfg(g, 'voice.reward_coin') * coinMult(g, u));
    const balance = coin > 0 ? addCoin(g, u, coin, 'voice_reward') : null;
    return { ok: true, sessionSeconds: seconds, coinAwarded: coin, balance };
  },
  'POST /voice/reset-guild': ({ body }) => {
    if (!body.guildId) throw new ApiError('missing_guildId');
    run('DELETE FROM voice_activity WHERE guild_id=?', body.guildId);
    return { ok: true };
  },
  'GET /voice/leaderboard': ({ query }) => {
    const limit = Math.min(parseInt(query.limit, 10) || 10, 25);
    const rows = all('SELECT user_id, total_seconds FROM voice_activity WHERE guild_id=? ORDER BY total_seconds DESC LIMIT ?', query.guildId, limit);
    return { ok: true, leaderboard: rows.map(r => ({ userId: r.user_id, totalSeconds: Number(r.total_seconds) })) };
  },
};

module.exports = { routes, startSession };
