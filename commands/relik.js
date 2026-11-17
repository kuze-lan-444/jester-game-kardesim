// commands/game/relik.js — relikler (kalıcı bonuslar) ve Ejder Seti
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const nf = (n) => Number(n).toLocaleString('tr-TR');
const P = '/pets-relics-antiques';

module.exports = {
  data: new SlashCommandBuilder().setName('relik').setDescription('Relikler')
    .addSubcommand(s => s.setName('liste').setDescription('Tüm relikler ve durumun'))
    .addSubcommand(s => s.setName('satinal').setDescription('Relik satın al')
      .addStringOption(o => o.setName('anahtar').setDescription('Relik anahtarı (/relik liste)').setRequired(true)))
    .addSubcommand(s => s.setName('yukselt').setDescription('Relik seviyesini artır')
      .addStringOption(o => o.setName('anahtar').setDescription('Relik anahtarı').setRequired(true))),

  execute: safeExecute('game/relik', async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const g = interaction.guildId, u = interaction.user.id;
    await interaction.deferReply();
    try {
      if (sub === 'liste') {
        const { relics } = await gameCore.get(`${P}/relics?guildId=${g}&userId=${u}`);
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x9B59B6).setTitle('💎 Relikler')
          .setDescription(relics.map(r => `${r.emoji} **${r.name}** (\`${r.key}\`) — ${r.owned ? `✅ Lv.${r.level}/${r.maxLevel}` : `${nf(r.price)} coin`}\n└ ${r.description}`).join('\n'))] });
      }
      const relicKey = interaction.options.getString('anahtar').toLowerCase();
      if (sub === 'satinal') {
        const r = await gameCore.post(`${P}/relics/buy`, { guildId: g, userId: u, relicKey });
        return interaction.editReply({ content: `${r.relic.emoji} **${r.relic.name}** satın alındı! Bakiye: ${nf(r.balance)}` });
      }
      const r = await gameCore.post(`${P}/relics/upgrade`, { guildId: g, userId: u, relicKey });
      await interaction.editReply({ content: `📈 Relik **Lv.${r.newLevel}** oldu! (-${nf(r.cost)} coin, bakiye: ${nf(r.balance)})` });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
