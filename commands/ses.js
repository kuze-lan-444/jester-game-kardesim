// commands/admin/ses.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { voice } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ses')
    .setDescription('[Admin] Ses süresi sistemi yönetimi')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('sifirla').setDescription('Bu sunucunun ses verilerini sıfırlar (GERİ ALINAMAZ)')),

  execute: safeExecute('admin/ses', async (interaction) => {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });
    try {
      if (sub === 'sifirla') {
        await voice.post('/voice/reset-guild', { guildId: interaction.guildId });
        return interaction.editReply({ content: '✅ Bu sunucunun ses verileri sıfırlandı.' });
      }
    } catch (err) {
      await interaction.editReply({ content: friendlyError(err) });
    }
  }),
};
