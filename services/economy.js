'use strict';
// services/economy.js — bakiye, banka, transfer, market, evlilik, kraliyet unvanları, hırsızlık, oyuncu pazarı
const { get, all, run, tx, ensureGuild, today, ApiError, cooldownLeft, setCooldown } = require('../lib/db');
const { petBonus, antiqueBonus } = require('./bonuses');
const { cfg, assertEnabled } = require('./config');

const ROYAL_BASE_PRICE = 2000;
const ROYAL_STEP = 1000;
const ROYAL_ITEMS = [
  { key: 'kral_taci', name: 'Kral Tacı', emoji: '👑' },
  { key: 'kralice_taci', name: 'Kraliçe Tacı', emoji: '👑' },
  { key: 'pelerin', name: 'Kraliyet Pelerini', emoji: '🧥' },
  { key: 'mucevher', name: 'Kraliyet Mücevheri', emoji: '💎' },
];

function need(obj, ...keys) {
  for (const k of keys) if (obj[k] === undefined || obj[k] === null || obj[k] === '') throw new ApiError('missing_' + k);
}
function toInt(v) { const n = Math.floor(Number(v)); if (!Number.isFinite(n)) throw new ApiError('invalid_amount'); return n; }

function ensureEco(g, u) {
  ensureGuild(g);
  run('INSERT OR IGNORE INTO economy (guild_id,user_id,balance,bank) VALUES (?,?,0,0)', g, u);
  return get('SELECT balance, bank FROM economy WHERE guild_id=? AND user_id=?', g, u);
}

// Çekirdek: bakiyeyi değiştirir (negatif = harcama). Yetersizse hata fırlatır. Yeni bakiyeyi döndürür.
function addCoin(g, u, amount, reason = 'misc', source = 'bot') {
  amount = toInt(amount);
  return tx(() => {
    const cur = ensureEco(g, u);
    const next = Number(cur.balance) + amount;
    if (next < 0) throw new ApiError('insufficient_funds', { balance: Number(cur.balance) });
    run('UPDATE economy SET balance=? WHERE guild_id=? AND user_id=?', next, g, u);
    run('INSERT INTO transactions (guild_id,user_id,amount,reason,source_service,balance_after) VALUES (?,?,?,?,?,?)', g, u, amount, reason, source, next);
    if (/(_bet|_oyunu)$/.test(reason)) require('./quests').progress(g, u, 'oyun', 1);
    return next;
  });
}
const getBalance = (g, u) => { const r = ensureEco(g, u); return { balance: Number(r.balance), bank: Number(r.bank) }; };

// ── Oyuncu pazarı eşya türleri ───────────────────────────────────────────
const ITEM_KINDS = {
  material: { table: 'mmo_craft_mats', col: 'mat_key', aliases: ['material', 'malzeme', 'mat'] },
  egg: { table: 'mmo_eggs', col: 'egg_type', aliases: ['egg', 'yumurta'] },
  chest: { table: 'mmo_chests', col: 'chest_type', aliases: ['chest', 'sandik', 'sandık'] },
};
function resolveKind(t) {
  const x = String(t || '').toLowerCase();
  for (const [k, v] of Object.entries(ITEM_KINDS)) if (v.aliases.includes(x)) return k;
  throw new ApiError('unsupported_item_type');
}
function takeItem(g, u, kind, key, qty) {
  const k = ITEM_KINDS[kind];
  const row = get(`SELECT quantity FROM ${k.table} WHERE guild_id=? AND user_id=? AND ${k.col}=?`, g, u, key);
  if (!row || Number(row.quantity) < qty) throw new ApiError('not_owned');
  run(`UPDATE ${k.table} SET quantity = quantity - ? WHERE guild_id=? AND user_id=? AND ${k.col}=?`, qty, g, u, key);
}
function giveItem(g, u, kind, key, qty) {
  const k = ITEM_KINDS[kind];
  run(`INSERT INTO ${k.table} (guild_id,user_id,${k.col},quantity) VALUES (?,?,?,?)
       ON CONFLICT (guild_id,user_id,${k.col}) DO UPDATE SET quantity = quantity + excluded.quantity`, g, u, key, qty);
}

const theftUses = (g, u) => Number(get('SELECT xp FROM theft_levels WHERE guild_id=? AND user_id=?', g, u)?.xp || 0);
// Kullanım sayısına göre çalınan miktar: başlangıç + (kademe sayısı × artış), en fazla tavan kadar
function theftAmount(g, uses) {
  const step = Math.max(1, cfg(g, 'theft.tier_uses'));
  return Math.min(cfg(g, 'theft.max_amount'), cfg(g, 'theft.base_amount') + Math.floor(uses / step) * cfg(g, 'theft.tier_increment'));
}
const dayBefore = () => new Date(Date.now() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
function dailyReward(g, u, streak) {
  const bonusPct = petBonus(g, u, 'daily') + antiqueBonus(g, u, 'dailyBonus');
  const base = cfg(g, 'daily.base') + Math.min(streak, cfg(g, 'daily.max_streak')) * cfg(g, 'daily.per_streak');
  return { reward: Math.round(base * (1 + bonusPct / 100)), bonusPct };
}

const routes = {
  'GET /balance': ({ query }) => { need(query, 'guildId', 'userId'); return { ok: true, ...getBalance(query.guildId, query.userId) }; },

  'POST /add-coin': ({ body }) => {
    need(body, 'guildId', 'userId', 'amount');
    const balance = addCoin(body.guildId, body.userId, body.amount, body.reason || 'misc', body.sourceService || 'bot');
    return { ok: true, balance };
  },

  'POST /transfer': ({ body }) => {
    need(body, 'guildId', 'fromUserId', 'toUserId', 'amount');
    const amount = toInt(body.amount);
    if (amount <= 0) throw new ApiError('invalid_amount');
    if (body.fromUserId === body.toUserId) throw new ApiError('cannot_transfer_self');
    return tx(() => {
      const fromBalance = addCoin(body.guildId, body.fromUserId, -amount, 'transfer_out');
      const toBalance = addCoin(body.guildId, body.toUserId, amount, 'transfer_in');
      return { ok: true, fromBalance, toBalance };
    });
  },

  'POST /bank/deposit': ({ body }) => {
    need(body, 'guildId', 'userId', 'amount');
    const amount = toInt(body.amount); if (amount <= 0) throw new ApiError('invalid_amount');
    return tx(() => {
      const cur = ensureEco(body.guildId, body.userId);
      if (Number(cur.balance) < amount) throw new ApiError('insufficient_funds');
      run('UPDATE economy SET balance=balance-?, bank=bank+? WHERE guild_id=? AND user_id=?', amount, amount, body.guildId, body.userId);
      return { ok: true, ...getBalance(body.guildId, body.userId) };
    });
  },
  'POST /bank/withdraw': ({ body }) => {
    need(body, 'guildId', 'userId', 'amount');
    const amount = toInt(body.amount); if (amount <= 0) throw new ApiError('invalid_amount');
    return tx(() => {
      const cur = ensureEco(body.guildId, body.userId);
      if (Number(cur.bank) < amount) throw new ApiError('insufficient_bank_balance');
      run('UPDATE economy SET balance=balance+?, bank=bank-? WHERE guild_id=? AND user_id=?', amount, amount, body.guildId, body.userId);
      return { ok: true, ...getBalance(body.guildId, body.userId) };
    });
  },

  'GET /leaderboard': ({ query }) => {
    need(query, 'guildId');
    const limit = Math.min(parseInt(query.limit, 10) || 10, 25);
    const rows = all('SELECT user_id, balance+bank AS total FROM economy WHERE guild_id=? AND balance+bank>0 ORDER BY total DESC LIMIT ?', query.guildId, limit);
    return { ok: true, leaderboard: rows.map(r => ({ userId: r.user_id, total: Number(r.total) })) };
  },

  'POST /claims/increment': ({ body }) => {
    need(body, 'guildId', 'userId', 'claimType', 'max');
    const d = today(), max = toInt(body.max);
    return tx(() => {
      ensureGuild(body.guildId);
      const row = get('SELECT count FROM daily_counts WHERE guild_id=? AND user_id=? AND claim_date=? AND claim_type=?', body.guildId, body.userId, d, body.claimType);
      const count = row ? Number(row.count) : 0;
      if (count >= max) return { ok: false, current: count, max };
      run(`INSERT INTO daily_counts (guild_id,user_id,claim_date,claim_type,count) VALUES (?,?,?,?,1)
           ON CONFLICT (guild_id,user_id,claim_date,claim_type) DO UPDATE SET count=count+1`, body.guildId, body.userId, d, body.claimType);
      return { ok: true, current: count + 1, max };
    });
  },

  // ── Rol marketi ve renk rolleri ───────────────────────────────────────
  'GET /market/roles': ({ query }) => {
    need(query, 'guildId');
    return { ok: true, roles: all('SELECT role_id, price, is_premium FROM market_roles WHERE guild_id=? ORDER BY price', query.guildId).map(r => ({ role_id: r.role_id, price: Number(r.price), is_premium: !!r.is_premium })) };
  },
  'POST /market/roles': ({ body }) => {
    need(body, 'guildId', 'roleId', 'price');
    ensureGuild(body.guildId);
    run(`INSERT INTO market_roles (guild_id,role_id,price,is_premium) VALUES (?,?,?,?)
         ON CONFLICT (guild_id,role_id) DO UPDATE SET price=excluded.price, is_premium=excluded.is_premium`, body.guildId, body.roleId, toInt(body.price), body.isPremium ? 1 : 0);
    return { ok: true };
  },
  'POST /market/roles/remove': ({ body }) => {
    need(body, 'guildId', 'roleId');
    run('DELETE FROM market_roles WHERE guild_id=? AND role_id=?', body.guildId, body.roleId);
    return { ok: true };
  },
  'POST /market/roles/buy': ({ body }) => {
    need(body, 'guildId', 'userId', 'roleId');
    const r = get('SELECT price FROM market_roles WHERE guild_id=? AND role_id=?', body.guildId, body.roleId);
    if (!r) throw new ApiError('role_not_for_sale');
    return { ok: true, balance: addCoin(body.guildId, body.userId, -Number(r.price), 'market_role_buy') };
  },
  'GET /market/color-roles': ({ query }) => {
    need(query, 'guildId');
    return { ok: true, roles: all('SELECT role_id, price FROM color_roles WHERE guild_id=? ORDER BY price', query.guildId).map(r => ({ role_id: r.role_id, price: Number(r.price) })) };
  },
  'POST /market/color-roles': ({ body }) => {
    need(body, 'guildId', 'roleId');
    ensureGuild(body.guildId);
    run(`INSERT INTO color_roles (guild_id,role_id,price) VALUES (?,?,?)
         ON CONFLICT (guild_id,role_id) DO UPDATE SET price=excluded.price`, body.guildId, body.roleId, toInt(body.price ?? cfg(body.guildId, 'market.color_price')));
    return { ok: true };
  },
  'POST /market/color-roles/buy': ({ body }) => {
    need(body, 'guildId', 'userId', 'roleId');
    const r = get('SELECT price FROM color_roles WHERE guild_id=? AND role_id=?', body.guildId, body.roleId);
    if (!r) throw new ApiError('role_not_for_sale');
    return { ok: true, balance: addCoin(body.guildId, body.userId, -Number(r.price), 'color_role_buy') };
  },

  // ── Oyuncu pazarı ─────────────────────────────────────────────────────
  'GET /market/player-market': ({ query }) => {
    need(query, 'guildId');
    return { ok: true, listings: all('SELECT id,seller_id,item_type,item_key,quantity,price FROM player_market WHERE guild_id=? ORDER BY id DESC LIMIT 50', query.guildId)
      .map(l => ({ ...l, price: Number(l.price) })) };
  },
  'POST /market/player-market/list': ({ body }) => {
    need(body, 'guildId', 'sellerId', 'itemType', 'itemKey', 'price');
    const kind = resolveKind(body.itemType), qty = Math.max(1, toInt(body.quantity || 1)), price = toInt(body.price);
    if (price <= 0) throw new ApiError('invalid_amount');
    return tx(() => {
      ensureGuild(body.guildId);
      takeItem(body.guildId, body.sellerId, kind, body.itemKey, qty);
      const r = run('INSERT INTO player_market (guild_id,seller_id,item_type,item_key,quantity,price,listed_at) VALUES (?,?,?,?,?,?,?)',
        body.guildId, body.sellerId, kind, body.itemKey, qty, price, new Date().toISOString());
      return { ok: true, listingId: Number(r.lastInsertRowid) };
    });
  },
  'POST /market/player-market/buy': ({ body }) => {
    need(body, 'guildId', 'buyerId', 'listingId');
    return tx(() => {
      const l = get('SELECT * FROM player_market WHERE id=? AND guild_id=?', toInt(body.listingId), body.guildId);
      if (!l) throw new ApiError('listing_not_found');
      if (l.seller_id === body.buyerId) throw new ApiError('cannot_buy_own_listing');
      const buyerBalance = addCoin(body.guildId, body.buyerId, -Number(l.price), 'player_market_buy');
      const payout = Number(l.price) - Math.floor(Number(l.price) * cfg(body.guildId, 'market.tax_pct') / 100);
      addCoin(body.guildId, l.seller_id, payout, 'player_market_sell');
      giveItem(body.guildId, body.buyerId, l.item_type, l.item_key, Number(l.quantity));
      run('DELETE FROM player_market WHERE id=?', l.id);
      return { ok: true, buyerBalance };
    });
  },
  'POST /market/player-market/cancel': ({ body }) => {
    need(body, 'guildId', 'sellerId', 'listingId');
    return tx(() => {
      const l = get('SELECT * FROM player_market WHERE id=? AND guild_id=?', toInt(body.listingId), body.guildId);
      if (!l) throw new ApiError('listing_not_found');
      if (l.seller_id !== body.sellerId) throw new ApiError('not_owned');
      giveItem(body.guildId, l.seller_id, l.item_type, l.item_key, Number(l.quantity));
      run('DELETE FROM player_market WHERE id=?', l.id);
      return { ok: true };
    });
  },

  // ── Evlilik ───────────────────────────────────────────────────────────
  'GET /marriage/status': ({ query }) => {
    need(query, 'guildId', 'userId');
    const m = get('SELECT user1,user2,married_at FROM marriages WHERE guild_id=? AND user1=?', query.guildId, query.userId);
    const ring = get('SELECT 1 AS x FROM rings WHERE guild_id=? AND user_id=?', query.guildId, query.userId);
    return { ok: true, marriage: m || null, hasRing: !!ring };
  },
  'GET /marriage/all': ({ query }) => {
    need(query, 'guildId');
    return { ok: true, marriages: all('SELECT user1,user2,married_at FROM marriages WHERE guild_id=? AND user1 < user2', query.guildId) };
  },
  'POST /marriage/buy-ring': ({ body }) => {
    need(body, 'guildId', 'userId');
    assertEnabled(body.guildId, 'marriage.enabled');
    return tx(() => {
      if (get('SELECT 1 AS x FROM marriages WHERE guild_id=? AND user1=?', body.guildId, body.userId)) throw new ApiError('already_married');
      if (get('SELECT 1 AS x FROM rings WHERE guild_id=? AND user_id=?', body.guildId, body.userId)) throw new ApiError('already_has_ring');
      const balance = addCoin(body.guildId, body.userId, -cfg(body.guildId, 'marriage.ring_price'), 'ring_buy');
      run('INSERT INTO rings (guild_id,user_id) VALUES (?,?)', body.guildId, body.userId);
      return { ok: true, balance };
    });
  },
  'POST /marriage/marry': ({ body }) => {
    need(body, 'guildId', 'userId', 'targetId');
    assertEnabled(body.guildId, 'marriage.enabled');
    if (body.userId === body.targetId) throw new ApiError('cannot_marry_self');
    return tx(() => {
      const g = body.guildId;
      for (const u of [body.userId, body.targetId]) {
        if (get('SELECT 1 AS x FROM marriages WHERE guild_id=? AND user1=?', g, u)) throw new ApiError('already_married');
      }
      if (!get('SELECT 1 AS x FROM rings WHERE guild_id=? AND user_id=?', g, body.userId)) throw new ApiError('no_ring');
      run('DELETE FROM rings WHERE guild_id=? AND user_id=?', g, body.userId);
      const when = today();
      run('INSERT INTO marriages (guild_id,user1,user2,married_at) VALUES (?,?,?,?)', g, body.userId, body.targetId, when);
      run('INSERT INTO marriages (guild_id,user1,user2,married_at) VALUES (?,?,?,?)', g, body.targetId, body.userId, when);
      return { ok: true };
    });
  },
  'POST /marriage/divorce': ({ body }) => {
    need(body, 'guildId', 'userId');
    return tx(() => {
      const m = get('SELECT user2 FROM marriages WHERE guild_id=? AND user1=?', body.guildId, body.userId);
      if (!m) throw new ApiError('not_married');
      run('DELETE FROM marriages WHERE guild_id=? AND (user1=? OR user1=?)', body.guildId, body.userId, m.user2);
      return { ok: true, formerSpouseId: m.user2 };
    });
  },

  // ── Kraliyet unvanları ────────────────────────────────────────────────
  'GET /royal/items': ({ query }) => {
    need(query, 'guildId');
    ensureGuild(query.guildId);
    for (const it of ROYAL_ITEMS) run('INSERT OR IGNORE INTO royal_items (guild_id,item_key,owner_id,price) VALUES (?,?,NULL,?)', query.guildId, it.key, ROYAL_BASE_PRICE);
    const rows = all('SELECT item_key, owner_id, price FROM royal_items WHERE guild_id=?', query.guildId);
    return { ok: true, items: ROYAL_ITEMS.map(it => { const r = rows.find(x => x.item_key === it.key); return { ...it, ownerId: r?.owner_id || null, price: Number(r?.price || ROYAL_BASE_PRICE) }; }) };
  },
  'POST /royal/buy': ({ body }) => {
    need(body, 'guildId', 'userId', 'itemKey');
    const def = ROYAL_ITEMS.find(i => i.key === body.itemKey);
    if (!def) throw new ApiError('unknown_item');
    return tx(() => {
      ensureGuild(body.guildId);
      run('INSERT OR IGNORE INTO royal_items (guild_id,item_key,owner_id,price) VALUES (?,?,NULL,?)', body.guildId, def.key, ROYAL_BASE_PRICE);
      const row = get('SELECT owner_id, price FROM royal_items WHERE guild_id=? AND item_key=?', body.guildId, def.key);
      if (row.owner_id === body.userId) throw new ApiError('already_owned');
      const price = Number(row.price);
      addCoin(body.guildId, body.userId, -price, 'royal_buy');
      if (row.owner_id) addCoin(body.guildId, row.owner_id, price, 'royal_refund');
      const newPrice = price + ROYAL_STEP;
      run('UPDATE royal_items SET owner_id=?, price=? WHERE guild_id=? AND item_key=?', body.userId, newPrice, body.guildId, def.key);
      return { ok: true, item: def, pricePaid: price, prevOwner: row.owner_id || null, newPrice };
    });
  },

  // ── Hırsızlık ─────────────────────────────────────────────────────────
  'GET /theft/status': ({ query }) => {
    need(query, 'guildId', 'userId');
    const g = query.guildId, s = get('SELECT expires_at FROM theft_shields WHERE guild_id=? AND user_id=?', g, query.userId);
    const out = { ok: true, enabled: cfg(g, 'theft.enabled'), shielded: !!(s && Number(s.expires_at) > Date.now()) };
    if (query.thiefId) {
      const uses = theftUses(g, query.thiefId);
      out.cooldownMs = cooldownLeft(g, query.thiefId, 'theft', cfg(g, 'theft.cooldown_s') * 1000);
      out.uses = uses; out.amount = theftAmount(g, uses);
    }
    return out;
  },
  'POST /theft/attempt': ({ body }) => {
    need(body, 'guildId', 'thiefId', 'victimId');
    const { guildId: g, thiefId, victimId } = body;
    assertEnabled(g, 'theft.enabled');
    return tx(() => {
      const left = cooldownLeft(g, thiefId, 'theft', cfg(g, 'theft.cooldown_s') * 1000);
      if (left) throw new ApiError('cooldown', { retryAfterMs: left });
      const sh = get('SELECT expires_at FROM theft_shields WHERE guild_id=? AND user_id=?', g, victimId);
      if (sh && Number(sh.expires_at) > Date.now()) throw new ApiError('victim_shielded');
      const uses = theftUses(g, thiefId), amount = theftAmount(g, uses);
      if (getBalance(g, victimId).balance < amount) throw new ApiError('victim_broke', { amount });
      addCoin(g, victimId, -amount, 'theft_victim');
      addCoin(g, thiefId, amount, 'theft_gain');
      const newUses = uses + 1, nextAmount = theftAmount(g, newUses), step = Math.max(1, cfg(g, 'theft.tier_uses'));
      run(`INSERT INTO theft_levels (guild_id,user_id,level,xp) VALUES (?,?,?,?)
           ON CONFLICT (guild_id,user_id) DO UPDATE SET level=excluded.level, xp=excluded.xp`, g, thiefId, Math.floor(newUses / step), newUses);
      setCooldown(g, thiefId, 'theft', cfg(g, 'theft.cooldown_s') * 1000);
      return { ok: true, stolen: amount, uses: newUses, leveled: nextAmount > amount, newLevel: Math.floor(newUses / step), nextAmount,
        remainingToNext: nextAmount > amount ? 0 : (nextAmount < cfg(g, 'theft.max_amount') ? step - (newUses % step) : 0) };
    });
  },
  'POST /theft/shield-buy': ({ body }) => {
    need(body, 'guildId', 'userId');
    return tx(() => {
      const balance = addCoin(body.guildId, body.userId, -cfg(body.guildId, 'market.shield_price'), 'shield_buy');
      const expires = Date.now() + cfg(body.guildId, 'market.shield_hours') * 3600 * 1000;
      run(`INSERT INTO theft_shields (guild_id,user_id,expires_at) VALUES (?,?,?)
           ON CONFLICT (guild_id,user_id) DO UPDATE SET expires_at=excluded.expires_at`, body.guildId, body.userId, expires);
      return { ok: true, balance, expiresAt: expires };
    });
  },

  // ── Günlük ödül ve seri ───────────────────────────────────────────────
  'GET /daily/status': ({ query }) => {
    need(query, 'guildId', 'userId');
    const d = today(), y = dayBefore();
    const r = get('SELECT last_date, streak, best FROM daily_streaks WHERE guild_id=? AND user_id=?', query.guildId, query.userId);
    const alive = r && (r.last_date === d || r.last_date === y);
    const streak = alive ? Number(r.streak) : 0;
    return { ok: true, streak, best: r ? Number(r.best) : 0, claimedToday: !!(r && r.last_date === d), nextReward: dailyReward(query.guildId, query.userId, streak + (r && r.last_date === d ? 1 : 1)).reward };
  },
  'POST /daily/claim': ({ body }) => {
    need(body, 'guildId', 'userId');
    assertEnabled(body.guildId, 'daily.enabled');
    const { guildId: g, userId: u } = body;
    return tx(() => {
      ensureGuild(g);
      const d = today(), y = dayBefore();
      const r = get('SELECT last_date, streak, best FROM daily_streaks WHERE guild_id=? AND user_id=?', g, u);
      if (r && r.last_date === d) throw new ApiError('already_claimed');
      const streak = r && r.last_date === y ? Number(r.streak) + 1 : 1;
      const { reward, bonusPct } = dailyReward(g, u, streak);
      const balance = addCoin(g, u, reward, 'daily');
      run(`INSERT INTO daily_streaks (guild_id,user_id,last_date,streak,best) VALUES (?,?,?,?,?)
           ON CONFLICT (guild_id,user_id) DO UPDATE SET last_date=excluded.last_date, streak=excluded.streak, best=MAX(best, excluded.streak)`, g, u, d, streak, streak);
      let milestone = null;
      if (streak % 7 === 0) {
        const kinds = ['ahsap', 'demir', 'altin', 'elmas'], key = kinds[(streak / 7 - 1) % 4];
        require('./mmo').addChest(g, u, key, 1);
        milestone = { chest: key };
      }
      return { ok: true, reward, streak, bonusPct, milestone, balance, nextReward: dailyReward(g, u, streak + 1).reward };
    });
  },

  // ── Kalıcı XP boost ───────────────────────────────────────────────────
  'POST /boosts/buy': ({ body }) => {
    need(body, 'guildId', 'userId');
    return tx(() => {
      if (get('SELECT 1 AS x FROM xp_boosts WHERE guild_id=? AND user_id=?', body.guildId, body.userId)) throw new ApiError('already_owned');
      const balance = addCoin(body.guildId, body.userId, -cfg(body.guildId, 'market.xpboost_price'), 'xpboost_buy');
      run('INSERT INTO xp_boosts (guild_id,user_id) VALUES (?,?)', body.guildId, body.userId);
      return { ok: true, balance };
    });
  },
};

module.exports = { routes, addCoin, getBalance, ensureEco };
