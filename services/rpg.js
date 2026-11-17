'use strict';
// services/rpg.js — RPG sınıf/stat, savaş gücü, zindanlar, düello, slot makinesi, relic setleri
const { get, all, run, tx, ensureGuild, today, ApiError, checkCooldown, cooldownLeft, setCooldown } = require('../lib/db');
const { addCoin, getBalance } = require('./economy');
const { xpMult, coinMult } = require('./bonuses');
const mmo = require('./mmo');
const K = require('./pet-constants');
const C = require('./mmo-constants');
const { cfg, assertEnabled } = require('./config');

const RPG_CLASSES = {
  sovalye: { key: 'sovalye', name: 'Şövalye', emoji: '⚔️', weights: { hp: 1.3, attack: 1.3, defense: 1.3 } },
  nisanci: { key: 'nisanci', name: 'Nişancı', emoji: '🏹', weights: { critical: 1.4, speed: 1.4 } },
  buyucu:  { key: 'buyucu',  name: 'Büyücü',  emoji: '🪄', weights: { magic: 1.4, mana: 1.4 } },
};
const STATS = ['hp', 'attack', 'defense', 'critical', 'speed', 'mana', 'magic'];
const STAT_POWER = { hp: 2, attack: 4, defense: 3, critical: 3, speed: 2, mana: 1, magic: 3 };
const STAT_MAX_LEVEL = 100;
const statUpgradeCost = (lvl) => 250 + 150 * (lvl - 1);
const rpgXpNeeded = (lvl) => Math.round(100 * lvl * 1.15);
function need(o, ...keys) { for (const k of keys) if (!o[k]) throw new ApiError('missing_' + k); }

function getStats(g, u) {
  ensureGuild(g);
  run('INSERT OR IGNORE INTO rpg_stats (guild_id,user_id) VALUES (?,?)', g, u);
  const r = get('SELECT hp,attack,defense,critical,speed,mana,magic FROM rpg_stats WHERE guild_id=? AND user_id=?', g, u);
  return Object.fromEntries(STATS.map(s => [s, Number(r[s])]));
}
function getClass(g, u) { const k = get('SELECT class FROM rpg_class WHERE guild_id=? AND user_id=?', g, u)?.class; return k ? RPG_CLASSES[k] || null : null; }
function getRpgLevel(g, u) {
  const r = get('SELECT rpg_level, rpg_xp FROM rpg_data WHERE guild_id=? AND user_id=?', g, u);
  const level = r ? Number(r.rpg_level) : 1, xp = r ? Number(r.rpg_xp) : 0;
  return { level, xp, xpNeeded: rpgXpNeeded(level) };
}
function addRpgXp(g, u, amount) {
  ensureGuild(g);
  run('INSERT OR IGNORE INTO rpg_data (guild_id,user_id,rpg_level,rpg_xp) VALUES (?,?,1,0)', g, u);
  let { level, xp } = getRpgLevel(g, u);
  const before = level;
  xp += amount;
  while (xp >= rpgXpNeeded(level)) { xp -= rpgXpNeeded(level); level++; }
  run('UPDATE rpg_data SET rpg_level=?, rpg_xp=? WHERE guild_id=? AND user_id=?', level, xp, g, u);
  return { leveled: level > before, newLevel: level };
}

function battlePower(g, u) {
  const stats = getStats(g, u), cls = getClass(g, u), lv = getRpgLevel(g, u);
  let statPower = 0;
  for (const s of STATS) statPower += (stats[s] - 1) * STAT_POWER[s] * (cls && cls.weights[s] ? cls.weights[s] : 1);
  const weapon = mmo.bestWeapon(g, u)?.power || 0;
  const armor = Object.values(mmo.bestArmorPerSlot(g, u)).reduce((s, a) => s + a.power, 0);
  const pets = mmo.getActivePets(g, u).reduce((s, p) => s + p.bonusBase * (1 + (p.level - 1) * (C.MMO_PET_BONUS_PER_LV / 100)), 0);
  const base = lv.level * 5;
  const total = Math.round(base + statPower + weapon + armor + pets);
  return { total, base, stats: Math.round(statPower), weapon, armor, pets: Math.round(pets) };
}

// ── Zindanlar ────────────────────────────────────────────────────────────
const M = (key, chance, min, max) => ({ type: 'mat', key, chance, min, max });
const DUNGEONS = [
  { monster: { emoji: '👺', name: 'Goblin Şefi' }, key: 'goblin',  name: 'Goblin Mağarası',   emoji: '👺', minLevel: 1,  recPower: 8,   xp: 40,   coin: [80, 160],     cdMs: 3 * 60e3,  drops: [M('demir_cevheri', 0.5, 1, 3), M('bakir_cevheri', 0.4, 1, 3)] },
  { monster: { emoji: '💀', name: 'İskelet Şövalye' }, key: 'iskelet', name: 'İskelet Mezarlığı', emoji: '💀', minLevel: 4,  recPower: 40,   xp: 90,   coin: [180, 320],    cdMs: 5 * 60e3,  drops: [M('obsidyen', 0.35, 1, 2), M('altin_cevheri', 0.35, 1, 3)] },
  { monster: { emoji: '🧊', name: 'Buz Devi' }, key: 'buzul',   name: 'Buzul Tüneli',      emoji: '❄️', minLevel: 8,  recPower: 110,  xp: 160,  coin: [320, 560],    cdMs: 8 * 60e3,  drops: [M('buz_cekirdegi', 0.15, 1, 1), M('saf_kristal', 0.3, 1, 2)] },
  { monster: { emoji: '🌋', name: 'Lav Golemi' }, key: 'lav',     name: 'Lav Kalesi',        emoji: '🌋', minLevel: 12, recPower: 220,  xp: 260,  coin: [520, 900],    cdMs: 10 * 60e3, drops: [M('lav_tasi', 0.3, 1, 2), M('elmas_cevheri', 0.25, 1, 2)] },
  { monster: { emoji: '👤', name: 'Gölge Hükümdarı' }, key: 'golge',   name: 'Gölge Diyarı',      emoji: '🌑', minLevel: 18, recPower: 400,  xp: 420,  coin: [800, 1400],   cdMs: 12 * 60e3, drops: [M('karanlik_oz', 0.2, 1, 1), M('ruh_tozu', 0.3, 1, 2), { type: 'egg', key: 'nadir', chance: 0.08 }] },
  { monster: { emoji: '🐲', name: 'Kadim Ejder' }, key: 'ejder',   name: 'Ejder Yuvası',      emoji: '🐉', minLevel: 25, recPower: 750,  xp: 700,  coin: [1400, 2400],  cdMs: 15 * 60e3, drops: [M('ejder_pulu', 0.3, 1, 2), M('ay_tasi', 0.15, 1, 1), { type: 'chest', key: 'altin', chance: 0.1 }] },
  { monster: { emoji: '🌀', name: 'Kaos Lordu' }, key: 'kaos',    name: 'Kaos Boşluğu',      emoji: '🌀', minLevel: 35, recPower: 1300, xp: 1100, coin: [2400, 4000],  cdMs: 20 * 60e3, drops: [M('gunes_parcasi', 0.15, 1, 1), M('yildirim_kristali', 0.15, 1, 1), { type: 'egg', key: 'kristal', chance: 0.1 }, { type: 'chest', key: 'elmas', chance: 0.08 }] },
];
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Sonucu (başarı/başarısızlık) önceden belirlenmiş savaşın tur tur anlatımını üretir
function simulateBattle(d, power, hpLevel, critChance, success) {
  const playerMax = Math.round(120 + hpLevel * 25 + power * 2);
  const monsterMax = Math.round(d.recPower * 4 + 80);
  const n = 4 + Math.floor(Math.random() * 3);
  const weights = (k) => { const w = Array.from({ length: k }, () => 0.7 + Math.random() * 0.6); const t = w.reduce((a, b) => a + b, 0); return w.map(x => x / t); };
  const wm = weights(n), wp = weights(n);
  const monsterLoss = success ? monsterMax : monsterMax * (0.3 + Math.random() * 0.4);
  const playerLoss = success ? playerMax * (0.15 + Math.random() * 0.5) : playerMax;
  let ph = playerMax, mh = monsterMax;
  const rounds = [];
  for (let i = 0; i < n; i++) {
    const crit = Math.random() * 100 < critChance + 8;
    let dealt = Math.round(monsterLoss * wm[i]), taken = Math.round(playerLoss * wp[i]);
    if (i === n - 1) { dealt = success ? mh : Math.min(dealt, mh - 1); taken = success ? Math.min(taken, ph - 1) : ph; }
    mh = Math.max(0, mh - dealt); ph = Math.max(0, ph - taken);
    rounds.push({ n: i + 1, dealt, taken, crit, playerHp: ph, monsterHp: mh });
  }
  return { playerMax, monsterMax, monster: d.monster, rounds };
}

// ── Relic setleri ────────────────────────────────────────────────────────
function relicSets(g, u) {
  const owned = new Set(all('SELECT relic_key FROM relics WHERE guild_id=? AND user_id=?', g, u).map(r => r.relic_key));
  const count = K.EJDER_SET_KEYS.filter(k => owned.has(k)).length;
  return [{
    key: 'ejder', name: 'Ejder Seti', emoji: '🐉', count, total: K.EJDER_SET_KEYS.length, equipped: count === K.EJDER_SET_KEYS.length,
    bonus2: 'Yok (set 3 parçada aktifleşir)', bonus4: 'Yok',
    bonusFull: `+%${K.EJDER_BASE_COIN_BONUS} coin, +%${K.EJDER_BASE_XP_BONUS} XP`,
  }];
}

// ── Slot ─────────────────────────────────────────────────────────────────
const SLOT_SYMBOLS = [['🍒', 35, 4], ['🍋', 28, 6], ['🔔', 18, 10], ['💎', 12, 20], ['7️⃣', 7, 50]];
function spinReel() { let r = Math.random() * 100; for (const s of SLOT_SYMBOLS) { if (r < s[1]) return s; r -= s[1]; } return SLOT_SYMBOLS[0]; }

const routes = {
  'GET /rpg-core/profile': ({ query }) => {
    need(query, 'guildId', 'userId');
    const lv = getRpgLevel(query.guildId, query.userId);
    return { ok: true, class: getClass(query.guildId, query.userId), level: lv.level, xp: lv.xp, xpNeeded: lv.xpNeeded, stats: getStats(query.guildId, query.userId) };
  },
  'GET /rpg-core/stats': ({ query }) => {
    need(query, 'guildId', 'userId');
    const cls = getClass(query.guildId, query.userId);
    return { ok: true, stats: getStats(query.guildId, query.userId), class: cls ? cls.name : null };
  },
  'POST /rpg-core/class/select': ({ body }) => {
    need(body, 'guildId', 'userId', 'classKey');
    const cls = RPG_CLASSES[body.classKey];
    if (!cls) throw new ApiError('unknown_class');
    ensureGuild(body.guildId);
    run(`INSERT INTO rpg_class (guild_id,user_id,class) VALUES (?,?,?)
         ON CONFLICT (guild_id,user_id) DO UPDATE SET class=excluded.class`, body.guildId, body.userId, cls.key);
    return { ok: true, class: { key: cls.key, name: cls.name, emoji: cls.emoji } };
  },
  'POST /rpg-core/stats/upgrade': ({ body }) => {
    need(body, 'guildId', 'userId', 'stat');
    if (!STATS.includes(body.stat)) throw new ApiError('unknown_stat');
    return tx(() => {
      const stats = getStats(body.guildId, body.userId), lvl = stats[body.stat];
      if (lvl >= STAT_MAX_LEVEL) throw new ApiError('max_level');
      const cost = Math.round(statUpgradeCost(lvl) * cfg(body.guildId, 'rpg.stat_cost_pct') / 100);
      const balance = addCoin(body.guildId, body.userId, -cost, 'stat_upgrade');
      run(`UPDATE rpg_stats SET ${body.stat}=${body.stat}+1 WHERE guild_id=? AND user_id=?`, body.guildId, body.userId);
      return { ok: true, newLevel: lvl + 1, cost, balance };
    });
  },
  'POST /rpg-core/stats/reset': ({ body }) => {
    need(body, 'guildId', 'userId');
    return tx(() => {
      const stats = getStats(body.guildId, body.userId);
      let refund = 0;
      for (const s of STATS) for (let l = 1; l < stats[s]; l++) refund += statUpgradeCost(l);
      run('UPDATE rpg_stats SET hp=1,attack=1,defense=1,critical=1,speed=1,mana=1,magic=1 WHERE guild_id=? AND user_id=?', body.guildId, body.userId);
      run('DELETE FROM rpg_class WHERE guild_id=? AND user_id=?', body.guildId, body.userId);
      const balance = refund > 0 ? addCoin(body.guildId, body.userId, refund, 'stat_reset_refund') : getBalance(body.guildId, body.userId).balance;
      return { ok: true, refund, balance };
    });
  },

  'GET /dungeon-fight/battle-power': ({ query }) => { need(query, 'guildId', 'userId'); return { ok: true, power: battlePower(query.guildId, query.userId) }; },
  'GET /dungeon-fight/relic-sets': ({ query }) => { need(query, 'guildId', 'userId'); return { ok: true, sets: relicSets(query.guildId, query.userId) }; },
  'GET /dungeon-fight/dungeons': () => ({ ok: true, dungeons: DUNGEONS.map(d => ({ key: d.key, name: d.name, emoji: d.emoji, minLevel: d.minLevel, recPower: d.recPower })) }),

  'POST /dungeon-fight/dungeons/enter': ({ body }) => {
    need(body, 'guildId', 'userId', 'dungeonKey');
    const { guildId: g, userId: u } = body;
    assertEnabled(g, 'dungeon.enabled');
    const d = DUNGEONS.find(x => x.key === String(body.dungeonKey).toLowerCase());
    if (!d) throw new ApiError('unknown_dungeon', { available: DUNGEONS.map(x => x.key).join(', ') });
    return tx(() => {
      const lv = getRpgLevel(g, u);
      if (lv.level < d.minLevel) throw new ApiError('level', { required: d.minLevel });
      const left = checkCooldown(g, u, 'dungeon:' + d.key);
      if (left) throw new ApiError('cooldown', { retryAfterMs: left });
      const power = battlePower(g, u).total;
      const chance = Math.round(Math.min(95, Math.max(5, 55 + (power / d.recPower - 1) * 45)));
      const success = Math.random() * 100 < chance;
      const critChance = Math.min(25, getStats(g, u).critical * 0.5);
      const isCrit = success && Math.random() * 100 < critChance;
      const mult = (isCrit ? 1.5 : 1);
      const xp = Math.round(d.xp * (success ? 1 : 0.25) * mult * xpMult(g, u) * cfg(g, 'dungeon.xp_pct') / 100);
      const coin = success ? Math.round(rand(d.coin[0], d.coin[1]) * mult * coinMult(g, u) * cfg(g, 'dungeon.coin_pct') / 100) : 0;
      if (coin > 0) addCoin(g, u, coin, 'dungeon_reward');
      const lvRes = addRpgXp(g, u, xp);
      const drops = [];
      if (success) {
        for (const dr of d.drops) {
          if (Math.random() >= dr.chance) continue;
          if (dr.type === 'mat') { const q = rand(dr.min, dr.max); mmo.addMat(g, u, dr.key, q); const m = mmo.matDef(dr.key); drops.push({ emoji: m?.emoji, name: m?.name || dr.key, qty: q }); }
          else if (dr.type === 'egg') { mmo.addEgg(g, u, dr.key, 1); const e = C.PET_EGG_TYPES.find(x => x.key === dr.key); drops.push({ emoji: e?.emoji, name: e?.name, qty: 1 }); }
          else if (dr.type === 'chest') { mmo.addChest(g, u, dr.key, 1); const c = C.MMORPG_CHESTS.find(x => x.key === dr.key); drops.push({ emoji: c?.emoji, name: c?.name, qty: 1 }); }
        }
      }
      setCooldown(g, u, 'dungeon:' + d.key, Math.round(d.cdMs * cfg(g, 'dungeon.cooldown_pct') / 100));
      if (success) require('./quests').progress(g, u, 'zindan', 1);
      const battle = simulateBattle(d, power, getStats(g, u).hp, critChance, success);
      return { ok: true, battle, success, dungeon: { key: d.key, name: d.name, emoji: d.emoji }, xp, coin, successChance: chance, isCrit, leveled: lvRes.leveled, newLevel: lvRes.newLevel, drops };
    });
  },

  'POST /dungeon-fight/fight': ({ body }) => {
    need(body, 'guildId', 'challengerId', 'opponentId');
    const { guildId: g, challengerId: a, opponentId: b } = body;
    if (a === b) throw new ApiError('cannot_fight_self');
    assertEnabled(g, 'fight.enabled');
    return tx(() => {
      const left = cooldownLeft(g, a, 'fight', cfg(g, 'fight.cooldown_s') * 1000);
      if (left) throw new ApiError('cooldown', { retryAfterMs: left });
      const pa = Math.max(1, battlePower(g, a).total), pb = Math.max(1, battlePower(g, b).total);
      const chance = Math.round(Math.min(cfg(g, 'fight.max_chance'), Math.max(cfg(g, 'fight.min_chance'), pa / (pa + pb) * 100)));
      const aWins = Math.random() * 100 < chance;
      const winnerId = aWins ? a : b, loserId = aWins ? b : a;
      const loserBal = getBalance(g, loserId).balance;
      const stolen = Math.min(cfg(g, 'fight.steal_max'), Math.floor(loserBal * cfg(g, 'fight.steal_pct') / 100));
      if (stolen > 0) { addCoin(g, loserId, -stolen, 'duel_loss'); addCoin(g, winnerId, stolen, 'duel_win'); }
      setCooldown(g, a, 'fight', cfg(g, 'fight.cooldown_s') * 1000);
      return { ok: true, winnerId, challengerChance: chance, stolen };
    });
  },

  'POST /gambling/slot': ({ body }) => {
    need(body, 'guildId', 'userId', 'bet');
    const bet = Math.floor(Number(body.bet));
    const { guildId: g, userId: u } = body;
    assertEnabled(g, 'slot.enabled');
    if (!(bet >= cfg(g, 'slot.min_bet') && bet <= cfg(g, 'slot.max_bet'))) throw new ApiError('bet_range', { min: cfg(g, 'slot.min_bet'), max: cfg(g, 'slot.max_bet') });
    const SLOT_DAILY_MAX = cfg(g, 'slot.daily_limit');
    return tx(() => {
      ensureGuild(g);
      const d = today();
      const plays = Number(get('SELECT plays FROM mmo_slot_daily WHERE guild_id=? AND user_id=? AND play_date=?', g, u, d)?.plays || 0);
      if (plays >= SLOT_DAILY_MAX) throw new ApiError('cooldown', { reason: 'daily_limit' });
      addCoin(g, u, -bet, 'slot_bet');
      run(`INSERT INTO mmo_slot_daily (guild_id,user_id,play_date,plays) VALUES (?,?,?,1)
           ON CONFLICT (guild_id,user_id,play_date) DO UPDATE SET plays=plays+1`, g, u, d);
      const reels = [spinReel(), spinReel(), spinReel()];
      let multiplier = 0;
      if (reels[0][0] === reels[1][0] && reels[1][0] === reels[2][0]) multiplier = reels[0][2];
      else if (reels.filter(r => r[0] === '🍒').length === 2) multiplier = 2;
      const payout = bet * multiplier;
      const balance = payout > 0 ? addCoin(g, u, payout, 'slot_win') : getBalance(g, u).balance;
      return { ok: true, reels: reels.map(r => r[0]), multiplier, winAmount: payout - bet, balance, playsLeft: SLOT_DAILY_MAX - plays - 1 };
    });
  },
};

module.exports = { routes, battlePower, getRpgLevel };
