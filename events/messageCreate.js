// events/messageCreate.js — spam/filtre kontrolü, mesaj XP'si, seviye bildirimi ve seviye rolleri
// Seviye sisteminin tüm ayarları (XP, bekleme, kanal, mesaj, roller) /setup → Seviye Sistemi bölümünden yönetilir.
const { AttachmentBuilder } = require('discord.js');
const { user, moderation } = require('../lib/service-clients');
const { logError } = require('../lib/logger-client');
const { card, COLORS } = require('../lib/ui');
const { levelCardOlustur } = require('../lib/levelCard');
const { cfg } = require('../services/config');
const levelRoles = require('../services/levelroles');

const lastRoleSync = new Map(); // "guild:user" -> son kontrol zamanı (her mesajda rolleri taramamak için)

function renderTemplate(template, vars) {
  return String(template).replace(/\{(mention|user|level|coins|server|role)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
}

module.exports = {
  name: 'messageCreate',
  renderTemplate,
  async execute(message) {
    if (message.author.bot || !message.guild) return;
    const guildId = message.guild.id;
    const userId = message.author.id;

    try {
      const [spamResult, filterResult] = await Promise.all([
        moderation.post('/spam/check', { guildId, userId, content: message.content }),
        moderation.post('/filter/check', { guildId, userId, content: message.content }),
      ]);
      if (spamResult.isSpam || filterResult.flagged) {
        await message.delete().catch(() => {});
        const warnMsg = await message.channel.send({
          content: `⚠️ ${message.author}, mesajın ${spamResult.isSpam ? 'spam' : 'yasaklı içerik'} nedeniyle silindi.`,
        }).catch(() => null);
        setTimeout(() => { if (warnMsg) warnMsg.delete().catch(() => {}); }, 5000);
        return;
      }
    } catch (err) {
      logError(err, { fileName: 'events/messageCreate.js', userId, serverId: guildId });
    }

    let currentLevel = 0;
    try {
      const result = await user.post('/level/message-xp', { guildId, userId });
      currentLevel = result.level || result.newLevel || 0;

      if (result.leveled) {
        // Roller önce verilir ki bildirimde {role} yazılabilsin
        const granted = await syncRoles(message, currentLevel);
        if (cfg(guildId, 'level.notify')) await notify(message, result, granted);
      }
    } catch (err) {
      logError(err, { fileName: 'events/messageCreate.js', userId, serverId: guildId });
    }

    // Admin sonradan rol ödülü eklediyse ya da rol silindiyse, üye bir sonraki mesajında eksiği tamamlanır
    try {
      const k = `${guildId}:${userId}`, now = Date.now();
      if (currentLevel > 0 && now - (lastRoleSync.get(k) || 0) > 10 * 60 * 1000) {
        lastRoleSync.set(k, now);
        await syncRoles(message, currentLevel);
      }
    } catch (err) {
      logError(err, { fileName: 'events/messageCreate.js', userId, serverId: guildId });
    }

    user.post('/messages/count', { guildId, channelId: message.channel.id, userId }).catch(() => {});
  },
};

async function syncRoles(message, level) {
  const member = message.member;
  if (!member) return [];
  const res = await levelRoles.syncMember(member, level, cfg(message.guild.id, 'level.keep_old_roles'));
  return res.added;
}

async function notify(message, result, grantedRoles) {
  const g = message.guild.id, author = message.author;
  const text = renderTemplate(cfg(g, 'level.message'), {
    mention: `${author}`, user: author.username, level: result.newLevel, coins: result.coinReward || 0,
    server: message.guild.name || '', role: grantedRoles.length ? grantedRoles.map(r => `${r}`).join(', ') : '',
  });

  // Varsayılan (eski) embed mesajı — kart oluşturulamazsa bu gider
  let payload = {
    content: `${author}`,
    embeds: [card(null, { title: '🎉 SEVİYE ATLADIN!', color: COLORS.success, description: text + (result.coinReward ? `\n💰 Ödül: **+${result.coinReward}** coin` : ''),
      thumbnail: author.displayAvatarURL ? author.displayAvatarURL({ size: 128 }) : undefined })],
  };

  // Görsel seviye kartı (CCG kimlik kartı)
  try {
    const xpNeeded = (result.newLevel + 1) * cfg(g, 'level.xp_per_level');
    const png = await levelCardOlustur(message.member || author, result.newLevel, result.xp, xpNeeded);
    payload = {
      content: `${author} ${text}${result.coinReward ? `\n💰 Ödül: **+${result.coinReward}** coin` : ''}`,
      files: [new AttachmentBuilder(png, { name: 'seviye.png' })],
    };
  } catch (err) {
    logError(err, { fileName: 'events/messageCreate.js', userId: author.id, serverId: g });
  }

  let channel = message.channel;
  const chId = cfg(g, 'level.channel');
  if (chId) {
    const target = message.guild.channels && message.guild.channels.cache && message.guild.channels.cache.get(chId);
    if (target && typeof target.send === 'function') channel = target;
  }
  await channel.send(payload).catch(() => message.channel.send(payload).catch(() => {}));
}