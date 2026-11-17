// events/interactionCreate.js — slash komutları, butonlar ve seçim menüleri
const { logError } = require('../lib/logger-client');
const ui = require('../lib/ui');
const madenciCmd = require('../commands/madenci');
const oduncuCmd = require('../commands/oduncu');
const evlenCmd = require('../commands/evlen');
const petCmd = require('../commands/pet');
const gelistirCmd = require('../commands/gelistir');
const yardimCmd = require('../commands/yardim');
const gorevCmd = require('../commands/gorevler');
const setupCmd = require('../commands/setup');

const notYours = (i) => i.reply({ content: '🚫 Bu panel sana ait değil.', ephemeral: true });

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      ui.patch(interaction);

      // Merkezi yönetim paneli (/setup): menü, düğme ve formlar
      if (interaction.customId && interaction.customId.startsWith('setup_')) {
        if (interaction.isStringSelectMenu()) return await setupCmd.handleSelect(interaction);
        if (interaction.isButton()) return await setupCmd.handleButton(interaction);
        if (interaction.isModalSubmit()) return await setupCmd.handleModal(interaction);
      }

      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        return await command.execute(interaction);
      }

      if (interaction.isButton()) {
        const [action, guildId, ownerId, extra] = interaction.customId.split(':');
        if (action.startsWith('mine_')) return interaction.user.id !== ownerId ? notYours(interaction) : madenciCmd.handleButton(interaction, action, guildId, ownerId);
        if (action.startsWith('wood_')) return interaction.user.id !== ownerId ? notYours(interaction) : oduncuCmd.handleButton(interaction, action, guildId, ownerId);
        if (action === 'marry_accept') return evlenCmd.handleAccept(interaction, guildId, ownerId, extra);
        if (action === 'marry_reject') return evlenCmd.handleReject(interaction, ownerId, extra);
        if (action === 'gelistir_pet') return interaction.user.id !== ownerId ? notYours(interaction) : gelistirCmd.handlePetUpgrade(interaction, guildId, ownerId);
        if (action === 'gelistir_antika') return interaction.user.id !== ownerId ? notYours(interaction) : gelistirCmd.handleAntikaUpgrade(interaction, guildId, ownerId);
        if (action.startsWith('bj_')) return interaction.user.id !== ownerId ? notYours(interaction) : undefined; // blackjack düğmelerini komutun kendi collector'ı işler
        if (action === 'gorev_topla') return interaction.user.id !== ownerId ? notYours(interaction) : gorevCmd.handleClaim(interaction, guildId, ownerId);
        return; // diğer butonlar (ör. /çal iptal) kendi komutlarındaki collector ile yönetilir
      }

      if (interaction.isStringSelectMenu()) {
        const [action, guildId, ownerId] = interaction.customId.split(':');
        if (action !== 'yardim_select' && interaction.user.id !== ownerId) return interaction.reply({ content: '🚫 Bu menü sana ait değil.', ephemeral: true });
        if (action === 'yardim_select') return yardimCmd.handleSelect(interaction);
        if (action === 'pet_select') return petCmd.handleSelect(interaction, guildId);
      }
    } catch (err) {
      logError(err, { fileName: 'events/interactionCreate.js', userId: interaction.user && interaction.user.id, serverId: interaction.guildId });
    }
  },
};
