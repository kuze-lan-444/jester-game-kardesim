// commands/games/tahmin.js — 1-6 sayı tahmini (ödeme çarpanı ve bahis sınırları /setup panelinden ayarlanır)
const { SlashCommandBuilder } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { ApiError } = require('../lib/db');
const { cfg, gate } = require('../services/config');

module.exports = {
  data: new SlashCommandBuilder().setName('tahmin').setDescription('1-6 arası bir sayı tut, doğru bilirsen bahsin katını kazan')
    .addIntegerOption(o => o.setName('sayi').setDescription('Tahminin (1-6)').setRequired(true).setMinValue(1).setMaxValue(6))
    .addIntegerOption(o => o.setName('bahis').setDescription('Bahis miktarı').setRequired(true).setMinValue(1)),
  execute: safeExecute('games/tahmin', async (interaction) => {
    const guess = interaction.options.getInteger('sayi'), bet = interaction.options.getInteger('bahis');
    const g = interaction.guildId, u = interaction.user.id;
    if (await gate(interaction, 'tahmin.enabled')) return;
    await interaction.deferReply();
    try {
      if (bet < cfg(g, 'tahmin.min_bet') || bet > cfg(g, 'tahmin.max_bet')) throw new ApiError('bet_range', { min: cfg(g, 'tahmin.min_bet'), max: cfg(g, 'tahmin.max_bet') });
      const PAY = cfg(g, 'tahmin.payout');
      const charge = await economy.post('/claims/increment', { guildId: g, userId: u, claimType: 'tahmin', max: cfg(g, 'tahmin.daily_limit') });
      if (!charge.ok) return interaction.editReply({ content: `⏳ Günlük tahmin hakkın doldu (${charge.max}/gün).` });
      await economy.post('/add-coin', { guildId: g, userId: u, amount: -bet, reason: 'tahmin_bet', sourceService: 'bot' });
      const roll = Math.floor(Math.random() * 6) + 1;
      const won = roll === guess;
      const res = won ? await economy.post('/add-coin', { guildId: g, userId: u, amount: bet * PAY, reason: 'tahmin_win', sourceService: 'bot' }) : await economy.get(`/balance?guildId=${g}&userId=${u}`);
      await interaction.editReply({ content: `🔢 Tuttuğum sayı: **${roll}** — Tahminin: **${guess}**\n${won ? `🎉 Bildin! **+${(bet * (PAY - 1)).toLocaleString('tr-TR')}** coin kazandın! (x${PAY})` : '😿 Bilemedin.'}\n💰 Bakiye: ${res.balance.toLocaleString('tr-TR')}` });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
