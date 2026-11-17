'use strict';
// services/quests.js — her gün 3 görev, hepsi bitince bonus
const { get, all, run, tx, ensureGuild, today, ApiError } = require('../lib/db');
const { cfg, assertEnabled } = require('./config');

const QUESTS = [
  { key: 'mesaj',      emoji: '💬', name: 'Sohbet Kurdu',   desc: '20 mesaj yaz',        target: 20, reward: 300 },
  { key: 'madencilik', emoji: '⛏️', name: 'Madenci',        desc: '5 kez maden kaz',     target: 5,  reward: 400 },
  { key: 'odunculuk',  emoji: '🪓', name: 'Oduncu',         desc: '5 kez ağaç kes',      target: 5,  reward: 400 },
  { key: 'zindan',     emoji: '🗡️', name: 'Zindan Avcısı',  desc: '1 zindanı kazan',     target: 1,  reward: 600 },
  { key: 'oyun',       emoji: '🎲', name: 'Şanslı El',      desc: '3 şans oyunu oyna',   target: 3,  reward: 350 },
  { key: 'balik',      emoji: '🎣', name: 'Balıkçı',        desc: '5 balık tut',         target: 5,  reward: 400 },
];

function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function todaysQuests(g, u, d = today()) {
  const seed = hash(`${g}:${u}:${d}`);
  return [...QUESTS].sort((a, b) => hash(a.key + seed) - hash(b.key + seed)).slice(0, 3);
}
function rows(g, u, d = today()) {
  return all('SELECT quest_key, progress, claimed FROM daily_quests WHERE guild_id=? AND user_id=? AND quest_date=?', g, u, d);
}

// Başka servisler çağırır: progress(g,u,'zindan',1). Hata verirse oyunu bozmaz.
function progress(g, u, key, amount = 1) {
  try {
    if (!cfg(g, 'quests.enabled')) return;
    const q = todaysQuests(g, u).find(x => x.key === key);
    if (!q) return;
    ensureGuild(g);
    run(`INSERT INTO daily_quests (guild_id,user_id,quest_date,quest_key,progress,claimed) VALUES (?,?,?,?,?,0)
         ON CONFLICT (guild_id,user_id,quest_date,quest_key) DO UPDATE SET progress=MIN(?, progress+?)`, g, u, today(), key, Math.min(amount, q.target), q.target, amount);
  } catch { /* görev takibi oyunu asla bozmamalı */ }
}

function view(g, u) {
  const have = rows(g, u);
  const list = todaysQuests(g, u).map(q => {
    const r = have.find(x => x.quest_key === q.key);
    return { ...q, reward: cfg(g, 'quests.reward_' + q.key), progress: r ? Number(r.progress) : 0, claimed: !!(r && r.claimed) };
  });
  const bonus = !!have.find(x => x.quest_key === '_bonus');
  return { quests: list, bonusClaimed: bonus, allDone: list.every(q => q.claimed), bonus: cfg(g, 'quests.bonus'), enabled: cfg(g, 'quests.enabled') };
}

const routes = {
  'GET /quests': ({ query }) => ({ ok: true, ...view(query.guildId, query.userId) }),
  'POST /quests/claim': ({ body }) => {
    const { guildId: g, userId: u } = body;
    if (!g || !u) throw new ApiError('missing_ids');
    const { addCoin } = require('./economy');
    assertEnabled(g, 'quests.enabled');
    return tx(() => {
      const v = view(g, u);
      const claimable = v.quests.filter(q => q.progress >= q.target && !q.claimed);
      if (!claimable.length && !(v.allDone && !v.bonusClaimed)) throw new ApiError('nothing_to_claim');
      let total = 0;
      for (const q of claimable) {
        run('UPDATE daily_quests SET claimed=1 WHERE guild_id=? AND user_id=? AND quest_date=? AND quest_key=?', g, u, today(), q.key);
        total += q.reward;
      }
      let bonus = 0, egg = null;
      const after = view(g, u);
      if (after.allDone && !after.bonusClaimed) {
        bonus = cfg(g, 'quests.bonus'); total += bonus;
        run('INSERT INTO daily_quests (guild_id,user_id,quest_date,quest_key,progress,claimed) VALUES (?,?,?,?,1,1)', g, u, today(), '_bonus');
        require('./mmo').addEgg(g, u, 'siradan', 1); egg = 'Sıradan Yumurta';
      }
      const balance = addCoin(g, u, total, 'quest_reward');
      return { ok: true, claimed: claimable.length, total, bonus, egg, balance };
    });
  },
};

module.exports = { routes, progress, QUESTS };
