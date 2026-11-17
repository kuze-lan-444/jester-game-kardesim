// commands/games/yazitura.js — havada dönen madeni para
const { SlashCommandBuilder } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, animate, COLORS, nf } = require('../lib/ui');
const { cfg, gate } = require('../services/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('yazitura')
    .setDescription('Yazı ya da tura tahmin et')
    .addStringOption(o => o.setName('secim').setDescription('Tahminin').setRequired(true)
      .addChoices({ name: 'Yazı', value: 'yazı' }, { name: 'Tura', value: 'tura' })),

  execute: safeExecute('games/yazitura', async (interaction) => {
    if (await gate(interaction, 'yazitura.enabled')) return;
    const secim = interaction.options.getString('secim');
    const sonuc = Math.random() < 0.5 ? 'yazı' : 'tura';
    const kazandi = secim === sonuc, delta = kazandi ? cfg(interaction.guildId, 'yazitura.win') : -cfg(interaction.guildId, 'yazitura.lose');
    await interaction.deferReply();
    try {
      const result = await economy.post('/add-coin', { guildId: interaction.guildId, userId: interaction.user.id, amount: delta, reason: 'yazitura_oyunu', sourceService: 'bot' });
      await animate(interaction, ['🪙 Para havaya atıldı...', '🌀 🪙 ... 🌀 ... dönüyor ...', '✨ Düşüyor...'].map(t => ({ embeds: [card(interaction, { description: `# ${t}`, color: COLORS.gold })] })), 700);
      await interaction.editReply({ embeds: [card(interaction, {
        title: `🪙 ${sonuc.toUpperCase()} geldi!`, color: kazandi ? COLORS.success : COLORS.error,
        description: `Tahminin: **${secim.toUpperCase()}**\n${kazandi ? `🎉 Kazandın! **+${delta}** coin` : `😿 Kaybettin. **${delta}** coin`}`,
        fields: [{ name: '🏦 Bakiye', value: nf(result.balance), inline: true }] })] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
