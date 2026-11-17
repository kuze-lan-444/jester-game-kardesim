// commands/misc/yardim.js — kategori menülü yardım
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { safeExecute } = require('../lib/safe-execute');
const { card, COLORS } = require('../lib/ui');

const CATS = {
  ozet: { emoji: '📖', label: 'Genel Bakış', color: COLORS.info, text: 'Aşağıdaki menüden bir kategori seç!\n\n💰 **Ekonomi** — para kazan, bankala, ticaret yap\n🎲 **Oyunlar** — slot, blackjack, at yarışı...\n⛏️ **Üretim** — maden, ağaç, balık\n⚔️ **RPG** — zindanlar, silah, zırh, petler\n🐾 **Pet/Antika/Relik** — kalıcı bonuslar\n💍 **Evlilik** — evlen, eşinle bağ kur\n🪪 **Profil** — seviyen, görevlerin, günlük ödül\n🛠️ **Yönetici** — sunucu ayarları\n\n🔰 **Yeni başlıyorsan:** `/gunluk` → `/gorevler` → `/madenci panel` → `/sinif` → `/zindan goblin`' },
  ekonomi: { emoji: '💰', label: 'Ekonomi', color: COLORS.gold, text: '`/gunluk` — günlük ödül + seri bonusu\n`/gorevler` — günlük görevler\n`/bakiye` `/banka` `/transfer` — para işlemleri\n`/siralama` — coin/seviye/ses sıralaması\n`/market` `/renk` — rol & renk rolü satın al\n`/pazar` — oyuncular arası ticaret (malzeme/yumurta/sandık)\n`/mulk` `/mulk-siralama` — kraliyet unvanları\n`/xpboost` — kalıcı +%50 XP' },
  oyunlar: { emoji: '🎲', label: 'Oyunlar', color: COLORS.game, text: '`/slot` — animasyonlu slot makinesi\n`/blackjack` — düğmeli gerçek blackjack\n`/atyarisi` — canlı at yarışı (Valkyre, Slver Bullet, Slow Dancer, Ghost Rder)\n`/zar` `/yazitura` `/tahmin` — hızlı şans oyunları\n`/oyunlar sanskutusu` — günlük şans kutusu\n`/yazioyunu` — yazı yazma yarışı\n`/çal` — başkasından para çal\n`/kalkan` — hırsızlığa karşı 24 saat koruma' },
  uretim: { emoji: '⛏️', label: 'Üretim', color: COLORS.nature, text: '`/madenci` — maden kaz, işçi tut, craft malzemesi bul\n`/oduncu` — ağaç kes ve sat\n`/balik` — olta at, nadir balıkları yakala\nEnerji zamanla dolar; `yemek` ve `doldur` ile hızlandırabilirsin.' },
  rpg: { emoji: '⚔️', label: 'RPG', color: COLORS.rpg, text: '`/sinif` — Şövalye / Nişancı / Büyücü seç\n`/stat` `/rpg` — karakterini geliştir\n`/zindan` — canlı savaşlı 7 zindan\n`/fight` — oyuncu düellosu\n`/craft` `/yukselt` `/parcala` — silah & zırh\n`/yumurta` `/sandik` — animasyonlu açılış\n`/rpg-pet` — savaş petleri\n`/envanter` `/relic-set`' },
  pet: { emoji: '🐾', label: 'Pet / Antika / Relik', color: COLORS.epic, text: '`/petmarket` — Kedi (+XP), Köpek (+coin), Baykuş (+günlük)\n`/pet` — aktif peti seç\n`/antika` — her gün 2 yeni antika\n`/relik` — kalıcı relik bonusları\n`/gelistir` — pet/antika seviye atlat' },
  evlilik: { emoji: '💍', label: 'Evlilik', color: COLORS.love, text: '`/evlilik yuzuk-al` — yüzük satın al\n`/evlen` — evlenme teklifi et\n`/esim` `/evlilik yuzugum` `/evlilik liste`\n`/evlilik bosan`' },
  profil: { emoji: '🪪', label: 'Profil', color: COLORS.gold, text: '`/profil` — her şeyin bir arada olduğu kart\n`/hakkimda` — seviye ve istatistik\n`/sohbet` — mesaj sıralaması\n`/xp` — xp bilgisi' },
  admin: { emoji: '🛠️', label: 'Yönetici', color: COLORS.dark, text: '**`/setup` — Merkezi Yönetim Paneli**\nTüm sistemlerin ödüllerini, bekleme sürelerini, fiyatlarını, bahis sınırlarını, at isimlerini, seviye sistemini ve seviye rollerini buradan ayarlarsın.\n\n`/market-yonet` `/renkrolekle` — rol marketi\n`/ekonomi ver` — coin ver/al\n`/statsifirla` `/sohbet sifirla` `/ses sifirla`\n`/verikaydet` `/backuplist` `/backupsil` — yedekleme' },
};

function menu(guildId, userId, current) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`yardim_select:${guildId}:${userId}`).setPlaceholder('📂 Bir kategori seç...')
    .addOptions(Object.entries(CATS).map(([value, c]) => ({ label: c.label, value, emoji: { name: c.emoji }, default: value === current }))));
}
function page(interaction, key) {
  const c = CATS[key] || CATS.ozet;
  return { embeds: [card(interaction, { title: `${c.emoji} Jester Game — ${c.label}`, color: c.color, description: c.text, footer: '🃏 Jester Game • kategoriyi menüden değiştir' })],
    components: [menu(interaction.guildId, interaction.user.id, key)] };
}

module.exports = {
  data: new SlashCommandBuilder().setName('yardim').setDescription('Kategori menülü yardım'),
  execute: safeExecute('misc/yardim', async (interaction) => { await interaction.reply(page(interaction, 'ozet')); }),
  async handleSelect(interaction) { await interaction.update(page(interaction, interaction.values[0])); },
};
