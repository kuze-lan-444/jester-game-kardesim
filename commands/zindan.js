// commands/rpg/zindan.js — canlı, tur tur savaş anlatımlı zindan
const { SlashCommandBuilder } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');
const { card, animate, bar, COLORS, nf } = require('../lib/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('zindan')
    .setDescription('Bir zindana girer')
    .addStringOption(o => o.setName('zindan').setDescription('Zindan anahtarı (goblin, iskelet, buzul, lav, golge, ejder, kaos)').setRequired(true)),

  execute: safeExecute('rpg/zindan', async (interaction) => {
    const dungeonKey = interaction.options.getString('zindan');
    await interaction.deferReply();
    try {
      const r = await gameCore.post('/dungeon-fight/dungeons/enter', { guildId: interaction.guildId, userId: interaction.user.id, dungeonKey });
      const b = r.battle, d = r.dungeon;
      if (b) {
        const hp = (cur, max, icon) => `${bar(cur, max, 10, icon, '⬛')} **${nf(cur)}**/${nf(max)}`;
        const intro = { embeds: [card(interaction, { title: `${d.emoji} ${d.name}`, color: COLORS.dark, description: `Karanlık koridora adım atıyorsun...\n\n${b.monster.emoji} **${b.monster.name}** karşına çıktı!\n\n🧑 ${hp(b.playerMax, b.playerMax, '🟩')}\n${b.monster.emoji} ${hp(b.monsterMax, b.monsterMax, '🟥')}` })] };
        const frames = b.rounds.map(rd => ({ embeds: [card(interaction, {
          title: `⚔️ ${d.name} — Tur ${rd.n}/${b.rounds.length}`, color: COLORS.rpg,
          description: `${rd.crit ? '💥 **KRİTİK VURUŞ!** ' : '⚔️ '}${b.monster.name}'a **${nf(rd.dealt)}** hasar verdin!\n🩸 **${nf(rd.taken)}** hasar aldın.\n\n🧑 **Sen**\n${hp(rd.playerHp, b.playerMax, '🟩')}\n\n${b.monster.emoji} **${b.monster.name}**\n${hp(rd.monsterHp, b.monsterMax, '🟥')}` })] }));
        await animate(interaction, [intro, ...frames], 1400);
      }
      const fields = [
        { name: '✨ XP', value: `+${nf(r.xp)}`, inline: true },
        { name: '💰 Coin', value: `+${nf(r.coin)}`, inline: true },
        { name: '🎯 Başarı Şansı', value: `%${r.successChance}`, inline: true },
      ];
      if (r.isCrit) fields.push({ name: '💥 Kritik!', value: 'x1.5 ödül', inline: true });
      if (r.leveled) fields.push({ name: '📈 Seviye Atladın!', value: `RPG seviyen: **${r.newLevel}**`, inline: true });
      if (r.drops && r.drops.length) fields.push({ name: '🎁 Düşenler', value: r.drops.map(x => `${x.emoji || '🔹'} ${x.name}${x.qty ? ` x${x.qty}` : ''}`).join('\n') });
      await interaction.editReply({ embeds: [card(interaction, {
        title: `${d.emoji} ${d.name} — ${r.success ? '🏆 ZAFER!' : '💀 YENİLGİ'}`, color: r.success ? COLORS.success : COLORS.error,
        description: r.success ? `**${b ? b.monster.name : 'Canavar'}** yere serildi!` : `**${b ? b.monster.name : 'Canavar'}** seni yendi. Daha güçlenip tekrar dene! (\`/rpg\`, \`/craft\`, \`/stat\`)`, fields })] });
    } catch (err) { await interaction.editReply({ content: friendlyError(err) }); }
  }),
};
