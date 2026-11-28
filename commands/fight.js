// commands/rpg/fight.js — /fight : teklif -> kabul/red -> savaş (eski fight.js'in yerine geçer)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { gameCore } = require('../lib/service-clients');
const { safeExecute, friendlyError } = require('../lib/safe-execute');

const OFFER_WINDOW_MS = 60_000;
const busy = new Set(); // aynı anda tek düello (process-local), anahtar: guildId:userId

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fight')
    .setDescription('Bir oyuncuya düello teklif et (kaybeden coin kaybeder)')
    .addUserOption(o => o.setName('rakip').setDescription('Düello yapacağın kişi').setRequired(true)),

  execute: safeExecute('rpg/fight', async (interaction) => {
    const challenger = interaction.user;
    const opponent = interaction.options.getUser('rakip');
    const guildId = interaction.guildId;

    if (opponent.bot) return interaction.reply({ content: '🚫 Bir botla dövüşemezsin.', ephemeral: true });
    if (opponent.id === challenger.id) return interaction.reply({ content: '🚫 Kendinle dövüşemezsin.', ephemeral: true });

    const kA = `${guildId}:${challenger.id}`, kB = `${guildId}:${opponent.id}`;
    if (busy.has(kA)) return interaction.reply({ content: '⏳ Zaten aktif bir düellon var.', ephemeral: true });
    if (busy.has(kB)) return interaction.reply({ content: `⏳ ${opponent.username} şu an başka bir düelloda.`, ephemeral: true });
    busy.add(kA); busy.add(kB);
    const release = () => { busy.delete(kA); busy.delete(kB); };

    const acceptId = `duel_yes:${challenger.id}:${opponent.id}`;
    const declineId = `duel_no:${challenger.id}:${opponent.id}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(acceptId).setLabel('Kabul Et').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
      new ButtonBuilder().setCustomId(declineId).setLabel('Reddet').setStyle(ButtonStyle.Danger).setEmoji('🏳️'),
    );

    let msg;
    try {
      msg = await interaction.reply({
        content: `${opponent}, **${challenger.username}** sana düello teklif ediyor! Kaybeden coin kaybeder. 60 saniye içinde cevap ver.`,
        allowedMentions: { users: [opponent.id] },
        components: [row], fetchReply: true,
      });
    } catch (e) { release(); throw e; }

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: OFFER_WINDOW_MS });
    let answered = false;

    collector.on('collect', async (i) => {
      if (i.user.id !== opponent.id) {
        return i.reply({ content: '🚫 Bu teklif sana ait değil.', ephemeral: true });
      }
      answered = true;
      collector.stop('answered');

      if (i.customId === declineId) {
        release();
        return i.update({ content: `🏳️ **${opponent.username}**, **${challenger.username}** kişisinin düello teklifini **reddetti**.`, components: [] });
      }

      try {
        await i.update({ content: `⚔️ **${challenger.username}** vs **${opponent.username}** — düello başlıyor...`, components: [] });
        // Savaşın kendisi eski /fight ile aynı rota
        const result = await gameCore.post('/dungeon-fight/fight', {
          guildId, challengerId: challenger.id, opponentId: opponent.id,
        });
        const winner = result.winnerId === challenger.id ? challenger : opponent;

        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('⚔️ Düello Sonucu')
          .setDescription(`${challenger} vs ${opponent}\n\n🏆 Kazanan: **${winner.username}**`)
          .addFields(
            { name: 'Kazanma Şansı', value: `%${result.challengerChance} (meydan okuyan)`, inline: true },
            { name: 'Çalınan Coin', value: `${(result.stolen ?? 0).toLocaleString('tr-TR')}`, inline: true },
          );
        await msg.edit({
          content: `${challenger} ${opponent}`,
          embeds: [embed],
          allowedMentions: { users: [challenger.id, opponent.id] },
        });
      } catch (err) {
        await msg.edit({ content: `⚠️ Düello başarısız: ${friendlyError(err)}`, embeds: [], components: [] }).catch(() => {});
      } finally {
        release();
      }
    });

    collector.on('end', async () => {
      if (answered) return;
      release();
      await msg.edit({ content: `⌛ **${opponent.username}** teklife cevap vermedi, düello iptal edildi.`, components: [] }).catch(() => {});
    });
  }),
};