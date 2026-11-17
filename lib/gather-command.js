'use strict';
// lib/gather-command.js — /madenci ve /oduncu komutlarının ortak yapısı
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { gameCore } = require('./service-clients');
const { safeExecute, friendlyError } = require('./safe-execute');
const { logError } = require('./logger-client');
const nf = (n) => Number(n).toLocaleString('tr-TR');

function makeGatherCommand(cfg) {
  const { name, description, title, emoji, api, act, btn, itemsKey, actLabel, workerWord } = cfg;
  const id = (a, g, u) => `${btn}_${a}:${g}:${u}`;

  function buildPanel(s, guildId, userId) {
    const embed = new EmbedBuilder().setColor(cfg.color).setTitle(`${emoji} ${title}`)
      .addFields(
        { name: 'Seviye', value: `${s.level} (${s.rank})\n${nf(s.xp)}/${nf(s.xpNeeded)} XP`, inline: true },
        { name: '⚡ Enerji', value: `${s.energy}/${s.maxEnergy}`, inline: true },
        { name: `👷 ${workerWord}`, value: `${s.workers}`, inline: true },
        { name: '🎒 Envanter', value: `${nf(s.inventoryCount)} adet (~${nf(s.inventoryValue)} coin)`, inline: true },
        { name: 'Toplam', value: nf(s.total), inline: true },
        ...(s.cooldownMs > 0 ? [{ name: '⏳ Bekleme', value: `${Math.ceil(s.cooldownMs / 1000)} sn`, inline: true }] : []),
      )
      .setFooter({ text: 'Enerji zamanla yenilenir. Hızlandırmak için: /' + name + ' yemek' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(id(act === 'dig' ? 'dig' : 'chop', guildId, userId)).setLabel(actLabel).setStyle(ButtonStyle.Primary).setEmoji(emoji),
      new ButtonBuilder().setCustomId(id('sell', guildId, userId)).setLabel('Hepsini Sat').setStyle(ButtonStyle.Success).setEmoji('💰'),
      new ButtonBuilder().setCustomId(id('inv', guildId, userId)).setLabel('Envanter').setStyle(ButtonStyle.Secondary).setEmoji('🎒'),
    );
    return { embeds: [embed], components: [row] };
  }

  async function handleButton(interaction, action, guildId, userId) {
    await interaction.deferUpdate();
    try {
      if (action === `${btn}_${act === 'dig' ? 'dig' : 'chop'}`) {
        const r = await gameCore.post(`${api}/${act}`, { guildId, userId });
        const status = await gameCore.get(`${api}/status?guildId=${guildId}&userId=${userId}`);
        await interaction.editReply(buildPanel(status, guildId, userId));
        const list = r[itemsKey].map(o => `${o.emoji} ${o.name}`).join(', ');
        const mats = (r.mats || []).map(m => `${m.emoji} ${m.name} x${m.qty}`).join(', ');
        await interaction.followUp({ content: `${emoji} Elde edilenler: ${list}\n✨ +${r.xpGained} XP${mats ? `\n🧱 Craft malzemesi: ${mats}` : ''}${r.leveled ? `\n📈 Seviye atladın! (${r.newLevel})` : ''}`, ephemeral: true });
      } else if (action === `${btn}_sell`) {
        const r = await gameCore.post(`${api}/sell`, { guildId, userId });
        await interaction.followUp({ content: `💰 ${nf(r.total)} coin karşılığında satıldı! Bakiye: ${nf(r.balance)}`, ephemeral: true });
        const status = await gameCore.get(`${api}/status?guildId=${guildId}&userId=${userId}`);
        await interaction.editReply(buildPanel(status, guildId, userId));
      } else if (action === `${btn}_inv`) {
        const { inventory } = await gameCore.get(`${api}/inventory?guildId=${guildId}&userId=${userId}`);
        const key = itemsKey === 'ores' ? 'ore' : 'wood';
        await interaction.followUp({ content: `🎒 Envanter:\n${inventory.length ? inventory.map(i => `${i[key]}: ${nf(i.amount)}`).join('\n') : 'Envanter boş.'}`, ephemeral: true });
      }
    } catch (err) {
      if (!err.data) logError(err, { fileName: `commands/${name}.js`, userId, serverId: guildId });
      await interaction.followUp({ content: friendlyError(err), ephemeral: true }).catch(() => {});
    }
  }

  const data = new SlashCommandBuilder().setName(name).setDescription(description)
    .addSubcommand(s => s.setName('panel').setDescription(`${title} panelini aç`))
    .addSubcommand(s => s.setName('isci').setDescription(`${workerWord} satın al (her biri her seferde 1 ürün çıkarır)`))
    .addSubcommand(s => s.setName('kapasite').setDescription('Enerji kapasitesini artır (+10)'))
    .addSubcommand(s => s.setName('yemek').setDescription('Yemek alarak enerji doldur')
      .addStringOption(o => o.setName('tur').setDescription('Yemek').setRequired(true)
        .addChoices({ name: '🍞 Ekmek (+5 enerji, 200)', value: 'ekmek' }, { name: '🍲 Çorba (+10 enerji, 350)', value: 'corba' }, { name: '🥩 Et (+20 enerji, 600)', value: 'et' })))
    .addSubcommand(s => s.setName('doldur').setDescription('Enerjiyi tamamen doldur (eksik enerji başına 40 coin)'))
    .addSubcommand(s => s.setName('siralama').setDescription('Seviye sıralaması'));

  const execute = safeExecute(`game/${name}`, async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId, userId = interaction.user.id;
    await interaction.deferReply();
    try {
      if (sub === 'panel') return interaction.editReply(buildPanel(await gameCore.get(`${api}/status?guildId=${guildId}&userId=${userId}`), guildId, userId));
      if (sub === 'isci') { const r = await gameCore.post(`${api}/buy-worker`, { guildId, userId }); return interaction.editReply({ content: `👷 Yeni ${workerWord.toLowerCase()} alındı! Toplam: **${r.workers}** (-${nf(r.cost)} coin, bakiye: ${nf(r.balance)})` }); }
      if (sub === 'kapasite') { const r = await gameCore.post(`${api}/buy-energy-cap`, { guildId, userId }); return interaction.editReply({ content: `⚡ Enerji kapasiten **${r.maxEnergy}** oldu! (-${nf(r.cost)} coin, bakiye: ${nf(r.balance)})` }); }
      if (sub === 'yemek') { const r = await gameCore.post(`${api}/buy-food`, { guildId, userId, foodKey: interaction.options.getString('tur') }); return interaction.editReply({ content: `🍽️ Enerjin **${r.energy}/${r.maxEnergy}** oldu. (-${nf(r.cost)} coin, bakiye: ${nf(r.balance)})` }); }
      if (sub === 'doldur') { const r = await gameCore.post(`${api}/buy-energy-fill`, { guildId, userId }); return interaction.editReply({ content: `⚡ Enerjin doldu: **${r.energy}/${r.maxEnergy}** (-${nf(r.cost)} coin, bakiye: ${nf(r.balance)})` }); }
      if (sub === 'siralama') {
        const { leaderboard } = await gameCore.get(`${api}/leaderboard?guildId=${guildId}&limit=10`);
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(cfg.color).setTitle(`🏆 ${title} Sıralaması`).setDescription(leaderboard.length ? leaderboard.map((r, i) => `**${i + 1}.** <@${r.userId}> — Lv.${r.level}`).join('\n') : 'Henüz kimse yok.')] });
      }
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  });

  return { data, execute, buildPanel, handleButton };
}
module.exports = { makeGatherCommand };
