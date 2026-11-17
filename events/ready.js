// events/ready.js
const { logInfo } = require('../lib/logger-client');
const { startSession } = require('../services/voice');
const { runBackup } = require('../services/backup');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ ${client.user.tag} olarak giriş yapıldı. ${client.guilds.cache.size} sunucuda aktif.`);
    await logInfo(`Bot başlatıldı: ${client.user.tag} (${client.guilds.cache.size} sunucu)`, { fileName: 'events/ready.js' });
    client.user.setActivity('/yardim | Jester Game', { type: 3 });

    // Bot açıldığında zaten ses kanalında olanların süresi de sayılsın
    for (const guild of client.guilds.cache.values()) {
      for (const vs of guild.voiceStates.cache.values()) {
        if (vs.channelId && vs.member && !vs.member.user.bot) startSession(guild.id, vs.id);
      }
    }

    // Her 6 saatte bir otomatik yedek (data/backups, son 20 yedek saklanır)
    const doBackup = () => { try { runBackup('otomatik'); } catch (e) { console.error('Yedek alınamadı:', e.message); } };
    setTimeout(doBackup, 60 * 1000).unref?.();
    setInterval(doBackup, 6 * 60 * 60 * 1000).unref?.();
  },
};
