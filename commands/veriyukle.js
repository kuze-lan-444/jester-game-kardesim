// commands/admin/veriyukle.js
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { safeExecute } = require('../lib/safe-execute');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('veriyukle')
    .setDescription('[Admin] Yedekten geri yükleme talimatını gösterir')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('commit-sha').setDescription('Geri yüklenecek yedek commit SHA (/backuplist ile bul)').setRequired(true)),

  execute: safeExecute('admin/veriyukle', async (interaction) => {
    await interaction.reply({
      content: 'ℹ️ Canlı veri geri yükleme risklidir, bu yüzden otomatik yapılmıyor. Geri yüklemek için: botu durdur, `data/backups` içindeki istediğin yedeği kopyalayıp `data/jester.db` adıyla değiştir, botu tekrar başlat. Yedek listesi için `/backuplist`.',
      ephemeral: true,
    });
  }),
};
