// commands/game/kalkan.js — Hırsızlık Kalkanı (24 saat /çal'a karşı korur)
const { SlashCommandBuilder } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');

module.exports = {
  data: new SlashCommandBuilder().setName('kalkan').setDescription('Hırsızlık Kalkanı satın al (çalmaya karşı koruma)'),
  execute: safeExecute('game/kalkan', async (interaction) => {
    await interaction.deferReply();
    try {
      const r = await economy.post('/theft/shield-buy', { guildId: interaction.guildId, userId: interaction.user.id });
      await interaction.editReply({ content: `🛡️ Hırsızlık Kalkanı aktif! <t:${Math.floor(r.expiresAt / 1000)}:R> sona erer. Bakiye: ${r.balance.toLocaleString('tr-TR')}` });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
