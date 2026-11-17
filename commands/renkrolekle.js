// commands/economy/renkrolekle.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('renkrolekle')
    .setDescription('[Admin] Renk rolü ekler')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true))
    .addIntegerOption(o => o.setName('fiyat').setDescription('Fiyat (boşsa panelde ayarlı varsayılan)').setRequired(false).setMinValue(0)),

  execute: safeExecute('economy/renkrolekle', async (interaction) => {
    const role = interaction.options.getRole('rol');
    const price = interaction.options.getInteger('fiyat') ?? require('../services/config').cfg(interaction.guildId, 'market.color_price');
    await interaction.deferReply({ ephemeral: true });
    try {
      await economy.post('/market/color-roles', { guildId: interaction.guildId, roleId: role.id, price });
      await interaction.editReply({ content: `✅ ${role} renk rolü eklendi (${price} coin).` });
    } catch (err) {
      await interaction.editReply({ content: friendlyError(err) });
    }
  }),
};
