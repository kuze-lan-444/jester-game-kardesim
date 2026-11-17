// commands/game/antika.js — günlük antika pazarı (her gün 2 antika)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const nf = (n) => Number(n).toLocaleString('tr-TR');
const P = '/pets-relics-antiques';

module.exports = {
  data: new SlashCommandBuilder().setName('antika').setDescription('Antika pazarı')
    .addSubcommand(s => s.setName('liste').setDescription('Bugünkü antika pazarını gör'))
    .addSubcommand(s => s.setName('satinal').setDescription('Bugünkü pazardan antika al')
      .addStringOption(o => o.setName('anahtar').setDescription('Antika anahtarı (/antika liste\'de yazar)').setRequired(true)))
    .addSubcommand(s => s.setName('envanter').setDescription('Antikalarını gör'))
    .addSubcommand(s => s.setName('kusan').setDescription('Bir antikayı aktif yap (bonusunu verir)')
      .addStringOption(o => o.setName('anahtar').setDescription('Antika anahtarı').setRequired(true))),

  execute: safeExecute('game/antika', async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const g = interaction.guildId, u = interaction.user.id;
    await interaction.deferReply();
    try {
      if (sub === 'liste') {
        const { antiques } = await gameCore.get(`${P}/antiques/market?guildId=${g}`);
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xB7950B).setTitle('🏺 Bugünkü Antika Pazarı')
          .setDescription(antiques.map(a => `${a.emoji} **${a.name}** (\`${a.key}\`, ${a.rarity}) — ${nf(a.price)} coin\n└ +%${a.xpBonus} XP, +%${a.coinBonus} coin${a.dailyBonus ? `, +%${a.dailyBonus} günlük` : ''}`).join('\n'))] });
      }
      if (sub === 'envanter') {
        const { owned } = await gameCore.get(`${P}/antiques/inventory?guildId=${g}&userId=${u}`);
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xB7950B).setTitle('🏺 Antikaların')
          .setDescription(owned.length ? owned.map(a => `${a.emoji} **${a.name}** (\`${a.key}\`) +${a.upgradeLevel}${a.active ? ' ✅ *(aktif)*' : ''}`).join('\n') : 'Hiç antikan yok.')] });
      }
      const antiqueKey = interaction.options.getString('anahtar').toLowerCase();
      if (sub === 'satinal') {
        const r = await gameCore.post(`${P}/antiques/buy`, { guildId: g, userId: u, antiqueKey });
        return interaction.editReply({ content: `${r.antique.emoji} **${r.antique.name}** satın alındı! Bakiye: ${nf(r.balance)}\nBonus için \`/antika kusan anahtar:${r.antique.key}\`` });
      }
      await gameCore.post(`${P}/antiques/set-active`, { guildId: g, userId: u, antiqueKey });
      await interaction.editReply({ content: '✅ Aktif antika güncellendi!' });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
