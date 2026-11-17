// commands/games/atyarisi.js — canlı at yarışı (4 at, %25 şans, x3.5 ödeme)
const { SlashCommandBuilder } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, animate, COLORS, nf } = require('../lib/ui');
const { ApiError } = require('../lib/db');
const { cfg, gate } = require('../services/config');

const TRACK = 16;

function track(pos, chosen, winnerIdx, finished, HORSES) {
  const lines = HORSES.map((n, i) => {
    const p = Math.min(TRACK, pos[i]);
    return `${i + 1} ${n.padEnd(12)} |${'·'.repeat(p)}🐎${'·'.repeat(TRACK - p)}|🏁${finished && i === winnerIdx ? ' 🥇' : ''}${i === chosen ? ' ◀' : ''}`;
  });
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('atyarisi')
    .setDescription('At yarışına bahis yap')
    .addIntegerOption(o => { o.setName('at').setDescription('At numarası (1-4)').setRequired(true).setMinValue(1).setMaxValue(4); return o; })
    .addIntegerOption(o => o.setName('bahis').setDescription('Bahis miktarı').setRequired(true).setMinValue(1)),

  execute: safeExecute('games/atyarisi', async (interaction) => {
    const chosen = interaction.options.getInteger('at') - 1, bet = interaction.options.getInteger('bahis');
    const g = interaction.guildId;
    if (await gate(interaction, 'horse.enabled')) return;
    // Atların isimleri, ödeme oranı ve bahis sınırları /setup → At Yarışı bölümünden ayarlanır
    const HORSES = [1, 2, 3, 4].map(n => cfg(g, `horse.name${n}`)), PAYOUT_MULTIPLIER = cfg(g, 'horse.payout');
    await interaction.deferReply();
    try {
      if (bet < cfg(g, 'horse.min_bet') || bet > cfg(g, 'horse.max_bet')) throw new ApiError('bet_range', { min: cfg(g, 'horse.min_bet'), max: cfg(g, 'horse.max_bet') });
      const charge = await economy.post('/add-coin', { guildId: interaction.guildId, userId: interaction.user.id, amount: -bet, reason: 'atyarisi_bet', sourceService: 'bot' });
      const winnerIdx = Math.floor(Math.random() * HORSES.length), won = winnerIdx === chosen;
      const speed = HORSES.map((_, i) => (i === winnerIdx ? 1 : 0.72 + Math.random() * 0.2));
      const at = (t) => speed.map(s => Math.round(TRACK * t * s));
      const frame = (t, title) => ({ embeds: [card(interaction, { title, color: COLORS.game, description: track(at(t), chosen, winnerIdx, false, HORSES) + `Senin atın: **${chosen + 1}. ${HORSES[chosen]}** — Bahis: ${nf(bet)}` })] });
      await animate(interaction, [frame(0, '🏇 Atlar kapıda...'), frame(0.3, '🏇 Yarış başladı!'), frame(0.6, '🏇 Son düzlük!'), frame(0.9, '🏇 Bitişe doğru!')], 900);
      const payout = Math.round(bet * PAYOUT_MULTIPLIER);
      const final = won ? await economy.post('/add-coin', { guildId: interaction.guildId, userId: interaction.user.id, amount: payout, reason: 'atyarisi_win', sourceService: 'bot' }) : { balance: charge.balance };
      await interaction.editReply({ embeds: [card(interaction, {
        title: `🏆 Kazanan: ${winnerIdx + 1}. ${HORSES[winnerIdx]}!`, color: won ? COLORS.success : COLORS.error,
        description: track(speed.map((s, i) => (i === winnerIdx ? TRACK : Math.round(TRACK * s * 0.95))), chosen, winnerIdx, true, HORSES) + (won ? `🎉 Kazandın! **+${nf(payout - bet)}** coin` : '😿 Kaybettin.'),
        fields: [{ name: '🏦 Bakiye', value: nf(final.balance), inline: true }] })] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
