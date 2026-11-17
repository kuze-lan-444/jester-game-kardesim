// commands/economy/gunluk.js — günlük ödül + seri sistemi
const { SlashCommandBuilder } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, bar, COLORS, nf } = require('../lib/ui');

const CHESTS = { ahsap: '📦 Ahşap Sandık', demir: '⚙️ Demir Sandık', altin: '🥇 Altın Sandık', elmas: '💎 Elmas Sandık' };

module.exports = {
  data: new SlashCommandBuilder().setName('gunluk').setDescription('Günlük ödülünü al (her gün gelirsen seri bonusu artar!)'),
  execute: safeExecute('economy/gunluk', async (interaction) => {
    await interaction.deferReply();
    try {
      const r = await economy.post('/daily/claim', { guildId: interaction.guildId, userId: interaction.user.id });
      const inWeek = r.streak % 7 === 0 ? 7 : r.streak % 7;
      const fields = [
        { name: '🔥 Seri', value: `**${r.streak}** gün\n${bar(inWeek, 7, 7, '🔥', '▫️')} (${inWeek}/7)`, inline: true },
        { name: '🏦 Bakiye', value: nf(r.balance), inline: true },
        { name: '📅 Yarınki Ödül', value: `${nf(r.nextReward)} coin`, inline: true },
      ];
      if (r.bonusPct) fields.push({ name: '🦉 Bonus', value: `+%${r.bonusPct} (pet/antika)`, inline: true });
      if (r.milestone) fields.push({ name: '🎊 7 Günlük Seri Ödülü!', value: `${CHESTS[r.milestone.chest]} kazandın!` });
      await interaction.editReply({ embeds: [card(interaction, { title: '🎁 Günlük Ödül', color: COLORS.gold, description: `# +${nf(r.reward)} coin`, fields, footer: 'Seriyi bozmamak için her gün gel! 7. günde sandık var.' })] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
