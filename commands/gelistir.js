// commands/game/gelistir.js — aktif pet ve aktif antikayı geliştirme paneli (özgün repoda eksikti, yeniden yazıldı)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const nf = (n) => Number(n).toLocaleString('tr-TR');
const P = '/pets-relics-antiques';

module.exports = {
  data: new SlashCommandBuilder().setName('gelistir').setDescription('Aktif petini ve aktif antikanı geliştir'),

  execute: safeExecute('game/gelistir', async (interaction) => {
    await interaction.deferReply();
    const g = interaction.guildId, u = interaction.user.id;
    try {
      const pets = await gameCore.get(`${P}/pets?guildId=${g}&userId=${u}`);
      const ants = await gameCore.get(`${P}/antiques/inventory?guildId=${g}&userId=${u}`);
      const ap = pets.active, aa = ants.owned.find(a => a.active);
      const embed = new EmbedBuilder().setColor(0xF39C12).setTitle('🔧 Geliştirme')
        .addFields(
          { name: '🐾 Aktif Pet', value: ap ? `${ap.emoji} **${ap.name}** Lv.${ap.level} (+%${ap.bonusPct} ${ap.bonusType})\n${ap.nextCost ? `Sonraki seviye: ${nf(ap.nextCost)} coin` : 'MAX'}` : 'Aktif pet yok (`/petmarket`, `/pet`)' },
          { name: '🏺 Aktif Antika', value: aa ? `${aa.emoji} **${aa.name}** +${aa.upgradeLevel}\n${aa.nextCost ? `Sonraki seviye: ${nf(aa.nextCost)} coin` : 'MAX'}` : 'Aktif antika yok (`/antika`)' },
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gelistir_pet:${g}:${u}`).setLabel('Peti Geliştir').setStyle(ButtonStyle.Primary).setEmoji('🐾').setDisabled(!ap || !ap.nextCost),
        new ButtonBuilder().setCustomId(`gelistir_antika:${g}:${u}`).setLabel('Antikayı Geliştir').setStyle(ButtonStyle.Primary).setEmoji('🏺').setDisabled(!aa || !aa.nextCost),
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),

  async handlePetUpgrade(interaction, guildId, userId) {
    await interaction.deferUpdate();
    try {
      const r = await gameCore.post(`${P}/pets/upgrade`, { guildId, userId });
      await interaction.followUp({ content: `🐾 Pet **Lv.${r.newLevel}** oldu! (-${nf(r.cost)} coin, bakiye: ${nf(r.balance)})`, ephemeral: true });
    } catch (err) { await interaction.followUp({ content: friendlyError(err), ephemeral: true }); }
  },
  async handleAntikaUpgrade(interaction, guildId, userId) {
    await interaction.deferUpdate();
    try {
      const r = await gameCore.post(`${P}/antiques/upgrade`, { guildId, userId });
      await interaction.followUp({ content: `🏺 Antika **+${r.newLevel}** oldu! (-${nf(r.cost)} coin, bakiye: ${nf(r.balance)})`, ephemeral: true });
    } catch (err) { await interaction.followUp({ content: friendlyError(err), ephemeral: true }); }
  },
};
