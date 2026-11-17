// commands/admin/backupsil.js
const { background } = require('../lib/service-clients');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { safeExecute } = require('../lib/safe-execute');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backupsil')
    .setDescription('[Admin] Bir yerel yedeği siler')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('dosya').setDescription('Silinecek yedek dosya adı (/backuplist)').setRequired(true)),

  execute: safeExecute('admin/backupsil', async (interaction) => {
    await interaction.deferReply({ ephemeral: true });
    try {
      await background.post('/backup/delete', { name: interaction.options.getString('dosya') });
      await interaction.editReply({ content: '✅ Yedek silindi.' });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
