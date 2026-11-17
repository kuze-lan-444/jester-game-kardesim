// commands/games/zar.js — görsel zar (üst 4-6 / alt 1-3)
const { SlashCommandBuilder } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, animate, COLORS, nf } = require('../lib/ui');
const { cfg, gate } = require('../services/config');

const lossStreak = new Map();
const PIPS = { 1: ['   ', ' ● ', '   '], 2: ['●  ', '   ', '  ●'], 3: ['●  ', ' ● ', '  ●'], 4: ['● ●', '   ', '● ●'], 5: ['● ●', ' ● ', '● ●'], 6: ['● ●', '● ●', '● ●'] };
const die = (n) => `\`\`\`\n┌─────┐\n│ ${PIPS[n][0]} │\n│ ${PIPS[n][1]} │\n│ ${PIPS[n][2]} │\n└─────┘\n\`\`\``;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('zar')
    .setDescription('Zar at, üst (4-6) ya da alt (1-3) tahmin et')
    .addSubcommand(s => s.setName('ust').setDescription('Üst (4-6) tahmin et'))
    .addSubcommand(s => s.setName('alt').setDescription('Alt (1-3) tahmin et')),

  execute: safeExecute('games/zar', async (interaction) => {
    if (await gate(interaction, 'zar.enabled')) return;
    const sub = interaction.options.getSubcommand();
    const secim = sub === 'ust' ? 'üst' : 'alt';
    const roll = Math.floor(Math.random() * 6) + 1;
    const sonuc = roll <= 3 ? 'alt' : 'üst', kazandi = secim === sonuc;
    const key = `${interaction.guildId}:${interaction.user.id}`;
    const WIN = cfg(interaction.guildId, 'zar.win'), LOSE = cfg(interaction.guildId, 'zar.lose');
    let delta = kazandi ? WIN : -LOSE, extra = '';
    if (!kazandi) {
      const streak = (lossStreak.get(key) || 0) + 1;
      lossStreak.set(key, streak);
      if (streak >= 2) { delta = -(LOSE * 4); extra = '\n🔥 **Cooked!** İki kez üst üste kaybettin, ek ceza uygulandı.'; lossStreak.set(key, 0); }
    } else lossStreak.set(key, 0);
    await interaction.deferReply();
    try {
      const result = await economy.post('/add-coin', { guildId: interaction.guildId, userId: interaction.user.id, amount: delta, reason: 'zar_oyunu', sourceService: 'bot' });
      const f = (n) => ({ embeds: [card(interaction, { title: '🎲 Zar yuvarlanıyor...', color: COLORS.game, description: die(n) })] });
      await animate(interaction, [f(1 + Math.floor(Math.random() * 6)), f(1 + Math.floor(Math.random() * 6)), f(1 + Math.floor(Math.random() * 6))], 600);
      await interaction.editReply({ embeds: [card(interaction, {
        title: `🎲 ${roll} geldi → ${sonuc.toUpperCase()}`, color: kazandi ? COLORS.success : COLORS.error,
        description: `${die(roll)}Tahminin: **${secim.toUpperCase()}**\n${kazandi ? `🎉 Kazandın! **+${delta}** coin` : `😿 Kaybettin. **${delta}** coin`}${extra}`,
        fields: [{ name: '🏦 Bakiye', value: nf(result.balance), inline: true }] })] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
