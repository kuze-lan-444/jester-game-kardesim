// commands/rpg/slot.js — animasyonlu slot makinesi (günlük max 10 kez)
const { SlashCommandBuilder } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, animate, COLORS, nf } = require('../lib/ui');
const { cfg } = require('../services/config');

const machine = (r, note) => `\`\`\`\n╔════════════════════╗\n║  ${r[0]}  ┃  ${r[1]}  ┃  ${r[2]}  ║\n╚════════════════════╝\n\`\`\`${note ? '\n' + note : ''}`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slot')
    .setDescription('Slot makinesi oyna')
    .addIntegerOption(o => o.setName('bahis').setDescription('Bahis miktarı').setRequired(true).setMinValue(1)),

  execute: safeExecute('rpg/slot', async (interaction) => {
    const bet = interaction.options.getInteger('bahis');
    await interaction.deferReply();
    try {
      const r = await gameCore.post('/gambling/slot', { guildId: interaction.guildId, userId: interaction.user.id, bet });
      const spin = (reels) => ({ embeds: [card(interaction, { title: '🎰 JESTER SLOT', color: COLORS.game, description: machine(reels, `Bahis: **${nf(bet)}** coin`) })] });
      await animate(interaction, [spin(['🔄', '🔄', '🔄']), spin([r.reels[0], '🔄', '🔄']), spin([r.reels[0], r.reels[1], '🔄'])], 800);
      const win = r.multiplier > 0, jackpot = r.multiplier >= 20;
      await interaction.editReply({ embeds: [card(interaction, {
        title: jackpot ? '💎 JACKPOT!!! 💎' : win ? '🎉 KAZANDIN!' : '😿 Kaybettin',
        color: jackpot ? COLORS.legend : win ? COLORS.success : COLORS.error,
        description: machine(r.reels),
        fields: [
          { name: win ? '💰 Kazanç' : '💸 Kayıp', value: win ? `**+${nf(r.winAmount)}** coin (x${r.multiplier})` : `**-${nf(bet)}** coin`, inline: true },
          { name: '🏦 Bakiye', value: nf(r.balance), inline: true },
          { name: '🎟️ Kalan Hak', value: `${r.playsLeft}/${cfg(interaction.guildId, 'slot.daily_limit')}`, inline: true },
        ] })] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
