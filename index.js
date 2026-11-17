// Jester Game Bot — Discord oyun botu (tek süreç, SQLite veritabanı)
const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* .env yoksa ortam değişkenleri kullanılır */ }

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const { logCritical } = require('./lib/logger-client');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || '';
if (!DISCORD_TOKEN) { console.error('⛔ DISCORD_TOKEN bulunamadı! .env dosyasına yaz (bkz. README).'); process.exit(1); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // Developer Portal > Bot > "Message Content Intent" AÇIK olmalı
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
for (const file of fs.readdirSync(path.join(__dirname, 'commands')).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(__dirname, 'commands', file));
  if (command && command.data && command.data.name && typeof command.execute === 'function') client.commands.set(command.data.name, command);
}
console.log(`📜 ${client.commands.size} komut yüklendi.`);

for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(__dirname, 'events', file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args));
  else client.on(event.name, (...args) => event.execute(...args));
}

client.login(DISCORD_TOKEN).catch((err) => {
  console.error('⛔ Discord girişi başarısız (token doğru mu?):', err.message);
  process.exit(1);
});

// Render her yeni sürümde botu SIGTERM ile kapatır: veritabanını düzgünce kapatıp çık
function shutdown(signal) {
  console.log(`${signal} alındı, kapanıyor...`);
  try { client.destroy(); } catch { /* zaten kapalı */ }
  try { require('./lib/db').db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* sorun değil */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Sadece PORT tanımlıysa (Render "Web Service" olarak kurulduysa) küçük bir sağlık yanıtı verir. Worker'da gerekmez.
if (process.env.PORT) require('http').createServer((_req, res) => res.end('Jester Game Bot çalışıyor')).listen(process.env.PORT);

process.on('unhandledRejection', (r) => { console.error('UnhandledRejection:', r); logCritical(`unhandledRejection: ${r}`, { fileName: 'index.js' }); });
process.on('uncaughtException', (e) => { console.error('UncaughtException:', e); logCritical(`uncaughtException: ${e.message}`, { fileName: 'index.js' }); });
