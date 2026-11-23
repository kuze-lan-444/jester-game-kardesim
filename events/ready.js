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

    // GitHub yedeği (GITHUB_BACKUP_TOKEN ve GITHUB_BACKUP_REPO tanımlıysa): açılıştan 2 dk sonra, sonra her 15 dakikada bir (sadece veri değiştiyse)
    const gh = require('../lib/github-backup');
    if (gh.enabled()) {
      setTimeout(() => gh.push('açılış'), 2 * 60 * 1000).unref?.();
      setInterval(() => gh.push('otomatik'), 15 * 60 * 1000).unref?.();
      console.log('☁️ GitHub yedekleme açık.');
    } else {
      console.log('ℹ️ GitHub yedekleme kapalı (GITHUB_BACKUP_TOKEN / GITHUB_BACKUP_REPO tanımlı değil). Render ücretsiz planda veri kalıcı değildir!');
    }
  },
};
