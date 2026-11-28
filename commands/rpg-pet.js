// commands/rpg/rpg-pet.js — MMORPG pet yönetimi (klasik /pet'ten farklı sistem).
// DÜZELTME: Artık pet anahtarı / doğum zamanı elle yazılmıyor. Listedeki numarayı yazıyorsun.
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');

// Pet anahtarı API'de hangi alanda geliyorsa onu bul
const keyOf = (p) => p.key ?? p.petKey ?? p.petId ?? p.id ?? p.type;

// Liste ve kuşan/yükselt aynı sırayı kullansın diye sabit sıralama
const sortPets = (owned) =>
  [...owned].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'tr') ||
    String(a.hatchedAt).localeCompare(String(b.hatchedAt)));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rpg-pet')
    .setDescription('MMORPG pet yönetimi')
    .addSubcommand(s => s.setName('liste').setDescription('Tüm petlerini gör'))
    .addSubcommand(s => s.setName('kusan').setDescription('Pet slotuna kuşan')
      .addIntegerOption(o => o.setName('no').setDescription('Listedeki pet numarası').setRequired(true).setMinValue(1))
      .addIntegerOption(o => o.setName('slot').setDescription('Slot (1-6)').setRequired(true).setMinValue(1).setMaxValue(6)))
    .addSubcommand(s => s.setName('cikar').setDescription('Pet slotundan çıkar')
      .addIntegerOption(o => o.setName('slot').setDescription('Slot (1-6)').setRequired(true).setMinValue(1).setMaxValue(6)))
    .addSubcommand(s => s.setName('yukselt').setDescription('Pet seviye yükselt')
      .addIntegerOption(o => o.setName('no').setDescription('Listedeki pet numarası').setRequired(true).setMinValue(1))),

  execute: safeExecute('rpg/rpg-pet', async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId, userId = interaction.user.id;
    await interaction.deferReply();
    try {
      if (sub === 'cikar') {
        const slot = interaction.options.getInteger('slot') - 1;
        await gameCore.post('/mmo-equipment/pets/set-active', { guildId, userId, slot, petKey: null });
        return interaction.editReply({ content: `✅ Slot ${slot + 1} boşaltıldı.` });
      }

      const { owned, active } = await gameCore.get(`/mmo-equipment/pets?guildId=${guildId}&userId=${userId}`);
      const pets = sortPets(owned);

      if (sub === 'liste') {
        const embed = new EmbedBuilder().setColor(0xF39C12).setTitle('🐉 MMO Petlerin')
          .setDescription(pets.length
            ? pets.map((p, i) => {
                const isActive = active.some(a => a && a.hatchedAt === p.hatchedAt);
                return `**${i + 1}.** ${p.emoji} **${p.name}** Lv.${p.level}${isActive ? ' ✅ *(aktif)*' : ''}`;
              }).join('\n') + '\n\nKuşanmak için: `/rpg-pet kusan no:<numara> slot:<1-6>`'
            : 'Hiç petin yok.');
        return interaction.editReply({ embeds: [embed] });
      }

      const no = interaction.options.getInteger('no');
      const pet = pets[no - 1];
      if (!pet) return interaction.editReply({ content: `❌ ${no} numaralı pet yok. \`/rpg-pet liste\` ile numaraya bak.` });
      const petKey = keyOf(pet);
      const hatchedAt = pet.hatchedAt;

      if (sub === 'kusan') {
        const slot = interaction.options.getInteger('slot') - 1;
        await gameCore.post('/mmo-equipment/pets/set-active', { guildId, userId, slot, petKey, hatchedAt });
        return interaction.editReply({ content: `✅ ${pet.emoji} **${pet.name}** slot ${slot + 1}'e kuşandırıldı.` });
      }
      if (sub === 'yukselt') {
        const result = await gameCore.post('/mmo-equipment/pets/upgrade', { guildId, userId, petKey, hatchedAt });
        return interaction.editReply({ content: `📈 ${pet.emoji} **${pet.name}** yükseltildi! Yeni seviye: ${result.newLevel}${result.shardCost ? ` (-${result.shardCost} shard)` : ''}` });
      }
    } catch (err) {
      await interaction.editReply({ content: friendlyError(err) });
    }
  }),
};