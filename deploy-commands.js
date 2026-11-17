// Slash komutlarını Discord'a kaydeder: `node deploy-commands.js`
// Komut eklediğinde/değiştirdiğinde tekrar çalıştır.
const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* .env yoksa ortam değişkenleri */ }
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN || '';
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const GUILD_ID = process.env.DISCORD_GUILD_ID || '';
if (!TOKEN || !CLIENT_ID) { console.error('⛔ .env içinde DISCORD_TOKEN ve DISCORD_CLIENT_ID gerekli.'); process.exit(1); }

const commands = [];
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(__dirname, 'commands', file));
  if (command && command.data) commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log(`🔄 ${commands.length} komut kaydediliyor...`);
    const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
    await rest.put(route, { body: commands });
    console.log(`✅ ${commands.length} komut kaydedildi${GUILD_ID ? ` (sunucu: ${GUILD_ID} — hemen kullanılabilir)` : ' (global — yayılması ~1 saat sürebilir)'}.`);
    process.exit(0);
  } catch (err) { console.error('⛔ Komut kaydı başarısız:', err); process.exit(1); }
})();
