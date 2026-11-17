// commands/game/balik.js — balıkçılık
const { SlashCommandBuilder } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, animate, bar, rarityColor, COLORS, nf } = require('../lib/ui');
const API = '/fishing';

module.exports = {
  data: new SlashCommandBuilder().setName('balik').setDescription('Balıkçılık')
    .addSubcommand(s => s.setName('at').setDescription('Oltayı at ve balık tut (15 sn bekleme)'))
    .addSubcommand(s => s.setName('sat').setDescription('Tuttuğun tüm balıkları sat'))
    .addSubcommand(s => s.setName('envanter').setDescription('Balıklarını gör'))
    .addSubcommand(s => s.setName('durum').setDescription('Balıkçılık seviyeni ve olta durumunu gör'))
    .addSubcommand(s => s.setName('yem').setDescription('Yem al (nadir balık şansını artırır, tanesi 150 coin)')
      .addIntegerOption(o => o.setName('adet').setDescription('Kaç adet (1-50)').setRequired(true).setMinValue(1).setMaxValue(50)))
    .addSubcommand(s => s.setName('olta').setDescription('Oltanı geliştir (daha nadir balıklar)'))
    .addSubcommand(s => s.setName('siralama').setDescription('Balıkçılık sıralaması')),

  execute: safeExecute('game/balik', async (interaction) => {
    const sub = interaction.options.getSubcommand(), g = interaction.guildId, u = interaction.user.id;
    await interaction.deferReply();
    try {
      if (sub === 'at') {
        const r = await gameCore.post(`${API}/cast`, { guildId: g, userId: u });
        const f = (t) => ({ embeds: [card(interaction, { description: `# ${t}`, color: COLORS.sea })] });
        await animate(interaction, [f('🎣 Olta atıldı...'), f('〰️〰️〰️ 🌊 〰️〰️〰️'), f('❗ Balık yem aldı!')], 900);
        const fish = r.fish;
        return interaction.editReply({ embeds: [card(interaction, {
          title: fish.rarity === 'çöp' ? '🎣 Hay aksi!' : '🎣 Balık yakaladın!', color: rarityColor(fish.rarity),
          description: `# ${fish.emoji} ${fish.name}${r.kg ? `\n**${r.kg}** kg` : ''}`,
          fields: [{ name: '💎 Nadirlik', value: fish.rarity, inline: true }, { name: '💰 Değer', value: `${nf(fish.value)} coin`, inline: true }, { name: '✨ XP', value: `+${r.xpGained}`, inline: true },
            ...(r.leveled ? [{ name: '📈 Seviye Atladın!', value: `Balıkçılık Lv.${r.newLevel}` }] : [])],
          footer: r.baited ? `Yem kaldı: ${r.baitLeft}` : 'Yemle nadir balık şansı artar: /balik yem' })] });
      }
      if (sub === 'sat') { const r = await gameCore.post(`${API}/sell`, { guildId: g, userId: u }); return interaction.editReply({ content: `💰 ${r.count} balık satıldı\n**+${nf(r.total)}** coin kazandın!\n🏦 Bakiye: ${nf(r.balance)}` }); }
      if (sub === 'envanter') {
        const { inventory } = await gameCore.get(`${API}/inventory?guildId=${g}&userId=${u}`);
        return interaction.editReply({ embeds: [card(interaction, { title: '🎣 Balık Envanteri', color: COLORS.sea,
          description: inventory.length ? inventory.map(x => `${x.emoji} **${x.name}** x${x.count} — ${nf(x.value * x.count)} coin`).join('\n') : 'Hiç balığın yok. `/balik at` ile başla!' })] });
      }
      if (sub === 'durum') {
        const s = await gameCore.get(`${API}/status?guildId=${g}&userId=${u}`);
        return interaction.editReply({ embeds: [card(interaction, { title: '🎣 Balıkçılık', color: COLORS.sea, fields: [
          { name: 'Seviye', value: `${s.level}\n${bar(s.xp, s.xpNeeded, 10, '🟦')} ${s.xp}/${s.xpNeeded}`, inline: true },
          { name: '🎣 Olta', value: `Seviye ${s.rodLevel}/5${s.rodUpgradeCost ? `\nSonraki: ${nf(s.rodUpgradeCost)} coin` : ' (MAX)'}`, inline: true },
          { name: '🪱 Yem', value: String(s.baitUses), inline: true },
          { name: '🎒 Çanta', value: `${s.inventoryCount} balık (~${nf(s.inventoryValue)} coin)`, inline: true },
          { name: '🐟 Toplam', value: nf(s.total), inline: true }] })] });
      }
      if (sub === 'yem') { const r = await gameCore.post(`${API}/buy-bait`, { guildId: g, userId: u, amount: interaction.options.getInteger('adet') }); return interaction.editReply({ content: `🪱 ${r.amount} yem alındı (-${nf(r.cost)} coin)\nToplam yem: **${r.baitUses}** • Bakiye: ${nf(r.balance)}` }); }
      if (sub === 'olta') { const r = await gameCore.post(`${API}/upgrade-rod`, { guildId: g, userId: u }); return interaction.editReply({ content: `🎣 Oltan **Seviye ${r.newLevel}** oldu!\n(-${nf(r.cost)} coin, bakiye: ${nf(r.balance)})` }); }
      const { leaderboard } = await gameCore.get(`${API}/leaderboard?guildId=${g}&limit=10`);
      return interaction.editReply({ embeds: [card(interaction, { title: '🏆 Balıkçılık Sıralaması', color: COLORS.sea,
        description: leaderboard.length ? leaderboard.map((x, i) => `${['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`} <@${x.userId}> — Lv.${x.level} (${nf(x.total)} balık)`).join('\n') : 'Henüz kimse yok.' })] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
