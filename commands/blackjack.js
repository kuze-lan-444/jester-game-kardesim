// commands/games/blackjack.js — düğmeli (Çek / Dur / İkiye Katla) gerçek blackjack
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { economy } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const ui = require('../lib/ui');
const { card, COLORS, nf } = ui;
const { ApiError } = require('../lib/db');
const { cfg, gate } = require('../services/config');

const SUITS = ['♠️', '♥️', '♦️', '♣️'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function value(hand) {
  let t = 0, aces = 0;
  for (const c of hand) { if (c.r === 'A') { aces++; t += 11; } else t += ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r); }
  while (t > 21 && aces) { t -= 10; aces--; }
  return t;
}
const isBJ = (h) => h.length === 2 && value(h) === 21;
const show = (hand, hide) => hand.map((c, i) => (hide && i === 1 ? '🂠' : `**${c.r}**${c.s}`)).join('  ');

function newGame(bet) {
  const deck = newDeck();
  const g = { deck, bet, total: bet, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], done: false, result: null, doubled: false, settled: false };
  if (isBJ(g.player) || isBJ(g.dealer)) finish(g);
  return g;
}
function dealerPlay(g) { while (value(g.dealer) < 17) g.dealer.push(g.deck.pop()); }
function finish(g) {
  g.done = true;
  const p = value(g.player), d = value(g.dealer);
  if (isBJ(g.player) && isBJ(g.dealer)) g.result = 'push';
  else if (isBJ(g.player)) g.result = 'blackjack';
  else if (isBJ(g.dealer)) g.result = 'lose';
  else if (p > 21) g.result = 'lose';
  else if (d > 21 || p > d) g.result = 'win';
  else if (p === d) g.result = 'push';
  else g.result = 'lose';
}
function hit(g) { g.player.push(g.deck.pop()); if (value(g.player) > 21) { g.done = true; g.result = 'lose'; } else if (value(g.player) === 21) stand(g); }
function stand(g) { dealerPlay(g); finish(g); }
const payout = (g) => ({ win: g.total * 2, blackjack: Math.floor(g.total * 2.5), push: g.total, lose: 0 }[g.result] || 0);

function render(interaction, g, balance) {
  const done = g.done, p = value(g.player);
  const titles = { win: '🎉 KAZANDIN!', blackjack: '🃏 BLACKJACK! (x2.5)', push: '🤝 Berabere', lose: p > 21 ? '💥 BATTIN!' : '😿 Kaybettin' };
  const color = !done ? COLORS.game : ['win', 'blackjack'].includes(g.result) ? COLORS.success : g.result === 'push' ? COLORS.warn : COLORS.error;
  const fields = [
    { name: `🧑 Sen (${p})`, value: show(g.player), inline: true },
    { name: `🎩 Krupiye (${done ? value(g.dealer) : '?'})`, value: show(g.dealer, !done), inline: true },
    { name: '💰 Bahis', value: nf(g.total), inline: true },
  ];
  if (done) { const pay = payout(g); fields.push({ name: pay > g.total ? '🏆 Kazanç' : pay === g.total ? '↩️ İade' : '💸 Kayıp', value: pay > g.total ? `**+${nf(pay - g.total)}** coin` : pay === g.total ? 'Bahis iade edildi' : `**-${nf(g.total)}** coin`, inline: true }); if (balance != null) fields.push({ name: '🏦 Bakiye', value: nf(balance), inline: true }); }
  const payload = { embeds: [card(interaction, { title: done ? titles[g.result] : '🃏 Blackjack — sıra sende', color, fields, footer: done ? undefined : 'Çek: kart al • Dur: bitir • 2x: bahsi ikiye katla, tek kart al' })], components: [] };
  if (!done) {
    const id = (a) => `bj_${a}:${interaction.guildId}:${interaction.user.id}`;
    payload.components = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id('hit')).setLabel('Çek').setEmoji('🃏').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(id('stand')).setLabel('Dur').setEmoji('✋').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(id('double')).setLabel('2x').setEmoji('💰').setStyle(ButtonStyle.Danger).setDisabled(g.player.length !== 2),
    )];
  }
  return payload;
}

async function settle(interaction, g) {
  if (g.settled) return null;
  g.settled = true;
  const pay = payout(g);
  const gid = interaction.guildId, uid = interaction.user.id;
  const res = pay > 0 ? await economy.post('/add-coin', { guildId: gid, userId: uid, amount: pay, reason: 'blackjack_win', sourceService: 'bot' }) : await economy.get(`/balance?guildId=${gid}&userId=${uid}`);
  return res.balance;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Blackjack oyna: Çek, Dur ya da 2x')
    .addIntegerOption(o => o.setName('bahis').setDescription('Bahis miktarı').setRequired(true).setMinValue(1)),

  execute: safeExecute('games/blackjack', async (interaction) => {
    const bet = interaction.options.getInteger('bahis');
    const gid = interaction.guildId, uid = interaction.user.id;
    if (await gate(interaction, 'blackjack.enabled')) return;
    await interaction.deferReply();
    let g;
    try {
      if (bet < cfg(gid, 'blackjack.min_bet') || bet > cfg(gid, 'blackjack.max_bet')) throw new ApiError('bet_range', { min: cfg(gid, 'blackjack.min_bet'), max: cfg(gid, 'blackjack.max_bet') });
      const BJ_MAX_DAILY = cfg(gid, 'blackjack.daily_limit');
      const limit = await economy.post('/claims/increment', { guildId: gid, userId: uid, claimType: 'blackjack', max: BJ_MAX_DAILY });
      if (!limit.ok) return interaction.editReply({ content: `⏳ Günlük blackjack hakkın doldu (${limit.max}/gün).` });
      await economy.post('/add-coin', { guildId: gid, userId: uid, amount: -bet, reason: 'blackjack_bet', sourceService: 'bot' });
      g = newGame(bet);
    } catch (err) { return interaction.editReply({ content: friendlyError(err) }); }

    if (g.done) { const bal = await settle(interaction, g); return interaction.editReply(render(interaction, g, bal)); }
    const msg = await interaction.editReply(render(interaction, g));
    const collector = msg.createMessageComponentCollector({ filter: (i) => i.user.id === uid && i.customId.startsWith('bj_'), time: 120000 });
    collector.on('collect', async (i) => {
      try {
        ui.patch(i);
        const action = i.customId.split(':')[0].replace('bj_', '');
        if (action === 'hit') hit(g);
        else if (action === 'stand') stand(g);
        else if (action === 'double' && g.player.length === 2) {
          try { await economy.post('/add-coin', { guildId: gid, userId: uid, amount: -g.bet, reason: 'blackjack_bet', sourceService: 'bot' }); }
          catch (err) { return i.reply({ content: friendlyError(err), ephemeral: true }); }
          g.total = g.bet * 2; g.doubled = true; hit(g); if (!g.done) stand(g);
        }
        const bal = g.done ? await settle(interaction, g) : null;
        await i.update(render(interaction, g, bal));
        if (g.done) collector.stop('done');
      } catch (err) { console.error('blackjack hata:', err); }
    });
    collector.on('end', async (_c, reason) => {
      if (reason === 'done' || g.done) return;
      stand(g);
      const bal = await settle(interaction, g).catch(() => null);
      interaction.editReply(render(interaction, g, bal)).catch(() => {});
    });
  }),
  __test: { newGame, hit, stand, value, payout, newDeck },
};
