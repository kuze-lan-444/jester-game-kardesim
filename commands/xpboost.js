// commands/games/xpboost.js
const { SlashCommandBuilder } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');

module.exports = {
  data: new SlashCommandBuilder().setName('xpboost').setDescription('Kalıcı 1.5x XP Boost satın al'),

  execute: safeExecute('games/xpboost', async (interaction) => {
    await interaction.deferReply();
    try {
      const result = await economy.post('/boosts/buy', { guildId: interaction.guildId, userId: interaction.user.id });
      await interaction.editReply({ content: `⚡ Kalıcı XP Boost (1.5x) satın alındı! Yeni bakiyen: ${result.balance.toLocaleString('tr-TR')}` });
    } catch (err) {
      await interaction.editReply({ content: friendlyError(err) });
    }
  }),
};
