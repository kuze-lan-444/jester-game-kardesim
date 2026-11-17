// commands/game/petmarket.js — klasik pet satın alma (kedi: XP, köpek: coin, baykuş: günlük bonus)
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const nf = (n) => Number(n).toLocaleString('tr-TR');
const P = '/pets-relics-antiques';

module.exports = {
  data: new SlashCommandBuilder().setName('petmarket').setDescription('Pet marketi')
    .addSubcommand(s => s.setName('liste').setDescription('Satılık petler ve sağladıkları bonuslar'))
    .addSubcommand(s => s.setName('satinal').setDescription('Pet satın al')
      .addStringOption(o => o.setName('pet').setDescription('Pet').setRequired(true)
        .addChoices({ name: '🐱 Kedi (+XP)', value: 'kedi' }, { name: '🐶 Köpek (+Coin)', value: 'kopek' }, { name: '🦉 Baykuş (+Günlük)', value: 'baykus' }))),

  execute: safeExecute('game/petmarket', async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const g = interaction.guildId, u = interaction.user.id;
    await interaction.deferReply();
    try {
      if (sub === 'liste') {
        const { catalog } = await gameCore.get(`${P}/pets?guildId=${g}&userId=${u}`);
        const label = { xp: 'XP kazanımı', coin: 'Coin kazanımı', daily: 'Günlük ödül' };
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xF39C12).setTitle('🐾 Pet Marketi')
          .setDescription(catalog.map(p => `${p.emoji} **${p.name}** — ${nf(p.price)} coin\n└ +%${p.bonusBase} ${label[p.bonusType]} (her seviyede +%4, en fazla Lv.5)`).join('\n'))] });
      }
      const r = await gameCore.post(`${P}/pets/buy`, { guildId: g, userId: u, petKey: interaction.options.getString('pet') });
      await interaction.editReply({ content: `${r.pet.emoji} **${r.pet.name}** satın alındı! Bakiye: ${nf(r.balance)}\nAktif peti değiştirmek için \`/pet\`, geliştirmek için \`/gelistir\`.` });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
