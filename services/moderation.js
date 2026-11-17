'use strict';
// services/moderation.js — spam ve yasaklı kelime kontrolü
const { get, run } = require('../lib/db');
const { cfg } = require('./config');

const REPEAT_MS = 15000;                         // tekrar penceresi (sayı panelden ayarlanır)
const recent = new Map(); // "guild:user" -> [{t, text}]

function norm(s) { return String(s || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ''); }

const routes = {
  'POST /spam/check': ({ body }) => {
    if (!cfg(body.guildId, 'mod.spam_enabled')) return { ok: true, isSpam: false };
    const WINDOW_MS = cfg(body.guildId, 'mod.spam_burst_seconds') * 1000, MAX_IN_WINDOW = cfg(body.guildId, 'mod.spam_burst_count'), MAX_REPEAT = cfg(body.guildId, 'mod.repeat_count');
    const key = `${body.guildId}:${body.userId}`, now = Date.now(), text = String(body.content || '').trim().toLowerCase();
    const list = (recent.get(key) || []).filter(m => now - m.t < Math.max(WINDOW_MS, REPEAT_MS));
    list.push({ t: now, text });
    recent.set(key, list);
    const burst = list.filter(m => now - m.t < WINDOW_MS).length >= MAX_IN_WINDOW;
    const repeat = text.length > 0 && list.filter(m => m.text === text && now - m.t < REPEAT_MS).length >= MAX_REPEAT;
    const isSpam = burst || repeat;
    if (isSpam) {
      run('INSERT INTO moderation_logs (guild_id,user_id,action_type,reason,moderator_id) VALUES (?,?,?,?,?)', body.guildId, body.userId, 'spam_delete', burst ? 'burst' : 'repeat', 'AUTO');
    }
    return { ok: true, isSpam };
  },
  // Yasaklı kelime listesi /setup → Moderasyon bölümünden yönetilir (virgülle ayrılmış).
  'POST /filter/check': ({ body }) => {
    const legacy = get("SELECT value FROM server_settings WHERE guild_id=? AND key='banned_words'", body.guildId)?.value || '';
    const list = cfg(body.guildId, 'mod.banned_words') || legacy;
    if (!list) return { ok: true, flagged: false };
    const words = list.split(',').map(w => norm(w)).filter(Boolean);
    const text = norm(body.content);
    const hit = words.find(w => text.includes(w));
    if (hit) run('INSERT INTO moderation_logs (guild_id,user_id,action_type,reason,moderator_id) VALUES (?,?,?,?,?)', body.guildId, body.userId, 'filter_delete', 'banned_word', 'AUTO');
    return { ok: true, flagged: !!hit };
  },
};

module.exports = { routes };
