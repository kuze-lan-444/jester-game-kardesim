// commands/profile/profil.js — her şeyin bir arada göründüğü zengin profil kartı
const { SlashCommandBuilder } = require('discord.js');
const { gameCore, economy, user } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, bar, COLORS, nf } = require('../lib/ui');
const P = '/pets-relics-antiques';

const tryIt = async (p, fallback = null) => { try { return await p; } catch { return fallback; } };

module.exports = {
  data: new SlashCommandBuilder().setName('profil').setDescription('Zengin profil kartı (seviye, servet, RPG, üretim, evlilik...)')
    .addUserOption(o => o.setName('kullanici').setDescription('Profiline bakılacak kişi (boşsa sen)')),

  execute: safeExecute('profile/profil', async (interaction) => {
    const target = interaction.options.getUser('kullanici') || interaction.user;
    const g = interaction.guildId, u = target.id, q = `guildId=${g}&userId=${u}`;
    await interaction.deferReply();
    try {
      const [prof, bal, rpg, power, mar, pets, ants, mine, wood, fish, daily] = await Promise.all([
        tryIt(user.get(`/profile?${q}`)), tryIt(economy.get(`/balance?${q}`)), tryIt(gameCore.get(`/rpg-core/profile?${q}`)),
        tryIt(gameCore.get(`/dungeon-fight/battle-power?${q}`)), tryIt(economy.get(`/marriage/status?${q}`)),
        tryIt(gameCore.get(`${P}/pets?${q}`)), tryIt(gameCore.get(`${P}/antiques/inventory?${q}`)),
        tryIt(gameCore.get(`/mining/status?${q}`)), tryIt(gameCore.get(`/woodcutting/status?${q}`)),
        tryIt(gameCore.get(`/fishing/status?${q}`)), tryIt(economy.get(`/daily/status?${q}`)),
      ]);
      const lv = prof ? prof.level : { level: 0, xp: 0, xpNeeded: 78 };
      const fields = [
        { name: '💬 Sohbet Seviyesi', value: `**Lv.${lv.level}**\n${bar(lv.xp, lv.xpNeeded || 1, 10, '🟦')} ${nf(lv.xp)}/${nf(lv.xpNeeded)}`, inline: true },
        { name: '💰 Servet', value: bal ? `Cüzdan: **${nf(bal.balance)}**\nBanka: **${nf(bal.bank)}**\nToplam: **${nf(bal.balance + bal.bank)}**` : '—', inline: true },
        { name: '⚔️ RPG', value: rpg ? `${rpg.class ? `${rpg.class.emoji} ${rpg.class.name}` : 'Sınıf yok'}\nLv.**${rpg.level}** • Güç: **${nf(power ? power.power.total : 0)}**` : '—', inline: true },
        { name: '⛏️ Üretim', value: `Madenci Lv.**${mine ? mine.level : 1}**\nOduncu Lv.**${wood ? wood.level : 1}**\nBalıkçı Lv.**${fish ? fish.level : 1}**`, inline: true },
      ];
      const ap = pets && pets.active, aa = ants && ants.owned.find(a => a.active);
      fields.push({ name: '🐾 Eşyalar', value: `${ap ? `${ap.emoji} ${ap.name} Lv.${ap.level}` : 'Pet yok'}\n${aa ? `${aa.emoji} ${aa.name} +${aa.upgradeLevel}` : 'Antika yok'}`, inline: true });
      fields.push({ name: '💍 Evlilik', value: mar && mar.marriage ? `Evli: <@${mar.marriage.user2}>\n${mar.marriage.married_at}` : 'Bekâr', inline: true });
      if (daily) fields.push({ name: '🔥 Günlük Seri', value: `**${daily.streak}** gün (en iyi: ${daily.best})`, inline: true });
      await interaction.editReply({ embeds: [card(interaction, { title: `🪪 ${target.username} — Profil`, color: COLORS.gold, thumbnail: target.displayAvatarURL ? target.displayAvatarURL({ size: 256 }) : undefined, fields })] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
