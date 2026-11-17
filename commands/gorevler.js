// commands/economy/gorevler.js — her gün 3 görev, hepsini bitirirsen bonus
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, bar, COLORS, nf } = require('../lib/ui');

function panel(interaction, v, g, u) {
  const claimable = v.quests.some(q => q.progress >= q.target && !q.claimed) || (v.allDone && !v.bonusClaimed);
  const done = v.quests.filter(q => q.claimed).length;
  const embed = card(interaction, {
    title: '📋 Günlük Görevler', color: COLORS.info,
    description: v.quests.map(q => `${q.claimed ? '✅' : q.progress >= q.target ? '🎁' : q.emoji} **${q.name}** — ${q.desc}\n${bar(q.progress, q.target, 10)} ${q.progress}/${q.target} • ödül **${nf(q.reward)}** coin`).join('\n\n'),
    fields: [{ name: '🏆 Hepsini bitirme bonusu', value: v.bonusClaimed ? '✅ Alındı' : `${nf(v.bonus)} coin + 🥚 Yumurta (${done}/3)`, inline: true }],
    footer: 'Görevler her gün gece yarısı yenilenir' });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`gorev_topla:${g}:${u}`).setLabel('Ödülleri Topla').setEmoji('🎁').setStyle(ButtonStyle.Success).setDisabled(!claimable));
  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder().setName('gorevler').setDescription('Günlük görevlerini gör ve ödüllerini topla'),
  execute: safeExecute('economy/gorevler', async (interaction) => {
    await interaction.deferReply();
    try {
      const g = interaction.guildId, u = interaction.user.id;
      await interaction.editReply(panel(interaction, await economy.get(`/quests?guildId=${g}&userId=${u}`), g, u));
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
  async handleClaim(interaction, g, u) {
    await interaction.deferUpdate();
    try {
      const r = await economy.post('/quests/claim', { guildId: g, userId: u });
      await interaction.editReply(panel(interaction, await economy.get(`/quests?guildId=${g}&userId=${u}`), g, u));
      await interaction.followUp({ content: `🎁 **+${nf(r.total)}** coin kazandın!${r.bonus ? `\n🏆 Tüm görevler bitti: bonus **+${nf(r.bonus)}** coin ve 🥚 ${r.egg}!` : ''}\n🏦 Bakiye: ${nf(r.balance)}`, ephemeral: true });
    } catch (err) { await interaction.followUp({ content: friendlyError(err), ephemeral: true }); }
  },
};
