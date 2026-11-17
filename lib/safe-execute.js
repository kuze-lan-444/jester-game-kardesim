'use strict';
// lib/safe-execute.js — komut hatalarını yakalar, kullanıcıya Türkçe ve anlaşılır mesaj verir
const { logError } = require('./logger-client');

function safeExecute(commandName, executeFn) {
  return async function wrapped(interaction) {
    try {
      await executeFn(interaction);
    } catch (err) {
      await logError(err, { fileName: `commands/${commandName}.js`, userId: interaction.user && interaction.user.id, serverId: interaction.guildId });
      const payload = { content: '⛔ Bir hata oluştu, tekrar deneyin.', ephemeral: true };
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
        else await interaction.reply(payload);
      } catch { /* etkileşimin süresi dolmuş olabilir */ }
    }
  };
}

const MAP = {
  insufficient_funds: '💸 Yetersiz bakiye.',
  insufficient_balance: '💸 Yetersiz bakiye.',
  insufficient_bank_balance: '🏦 Banka bakiyesi yetersiz.',
  insufficient_materials: '🧱 Yeterli malzemen yok.',
  insufficient_energy: '⚡ Yeterli enerjin yok. Bir süre bekle ya da yemek al.',
  insufficient_shards: '🔮 Yeterli pet parçan yok.',
  insufficient_quantity: '📦 Yeterli miktarın yok.',
  energy_full: '⚡ Enerjin zaten dolu.',
  already_owned: '✅ Bu zaten sende var.',
  not_owned: '❌ Bu sende yok.',
  max_level: '🔝 Zaten maksimum seviyede.',
  max_enhancement: '🔝 Bu eşya zaten +10.',
  class_locked: '🔒 Bu sınıf bunu kullanamıyor.',
  already_married: '💍 Zaten evlisin (ya da karşı taraf evli).',
  already_has_ring: '💍 Zaten bir yüzüğün var.',
  no_ring: '💍 Önce `/evlilik yuzuk-al` ile yüzük satın almalısın.',
  not_married: '💔 Evli değilsin.',
  cannot_marry_self: '🚫 Kendinle evlenemezsin.',
  cannot_fight_self: '🚫 Kendinle dövüşemezsin.',
  cannot_transfer_self: '🚫 Kendine transfer yapamazsın.',
  cannot_buy_own_listing: '🚫 Kendi ilanını satın alamazsın.',
  unknown_pet: '❓ Böyle bir pet yok.',
  unknown_relic: '❓ Böyle bir relik yok.',
  unknown_antique: '❓ Böyle bir antika yok.',
  unknown_egg: '❓ Böyle bir yumurta türü yok.',
  unknown_chest: '❓ Böyle bir sandık türü yok.',
  unknown_tier: '❓ Böyle bir kalite (tier) yok.',
  unknown_slot: '❓ Böyle bir zırh slotu yok.',
  unknown_weapon_type: '❓ Böyle bir silah tipi yok (kilic, yay, asa, hancer, tirpan).',
  unknown_class: '❓ Böyle bir sınıf yok.',
  unknown_stat: '❓ Böyle bir stat yok.',
  unknown_food: '❓ Böyle bir yemek yok.',
  unknown_material: '❓ Böyle bir malzeme yok.',
  unknown_item: '❓ Böyle bir eşya yok.',
  unknown_dungeon: '❓ Böyle bir zindan yok.',
  unsupported_item_type: '❓ Pazarda sadece şunlar satılır: malzeme, yumurta, sandik.',
  empty_inventory: '📦 Envanterin boş.',
  no_egg: '🥚 Bu türden yumurtan yok.',
  no_chest: '📦 Bu türden sandığın yok.',
  not_found: '❌ Eşya bulunamadı (ID doğru mu? `/envanter` ile bak).',
  invalid_slot: '❌ Geçersiz slot.',
  invalid_amount: '❌ Geçersiz miktar.',
  listing_not_found: '❌ İlan bulunamadı.',
  role_not_for_sale: '❌ Bu rol markette satılmıyor.',
  not_in_market: '🏺 Bu antika bugünkü pazarda yok (`/antika liste`).',
  victim_shielded: '🛡️ Hedef Hırsızlık Kalkanı ile korunuyor.',
  victim_broke: '😅 Hedefin cüzdanında çalınacak kadar coin yok.',
  level: '📈 Bunun için yeterli seviyeye sahip değilsin.',
  already_claimed: '🎁 Günlük ödülünü bugün zaten aldın, yarın tekrar gel!',
  nothing_to_claim: '📋 Toplanacak ödül yok. Önce görevleri tamamla!',
  system_disabled: '🔒 Bu sistem sunucu yöneticisi tarafından kapatıldı.',
  not_enough_perm: '🚫 Yetkin yok.',
};

function friendlyError(err) {
  const code = (err && err.data && err.data.error) || (err && err.message);
  if (code === 'cooldown') {
    const ms = err.data && err.data.retryAfterMs;
    if (err.data && err.data.reason === 'daily_limit') return '⏳ Günlük hakkın doldu, yarın tekrar dene.';
    if (ms) return ms < 90000 ? `⏳ Bekleme süresindesin, **${Math.ceil(ms / 1000)} saniye** sonra tekrar dene.` : `⏳ Bekleme süresindesin, yaklaşık **${Math.ceil(ms / 60000)} dk** sonra tekrar dene.`;
    return '⏳ Şu an bekleme süresindesin.';
  }
  if (code === 'bet_range' && err.data) return `🎯 Bahis **${err.data.min.toLocaleString('tr-TR')}** ile **${err.data.max.toLocaleString('tr-TR')}** coin arasında olmalı.`;
  if (code === 'level' && err.data && err.data.required) return `📈 Bunun için RPG seviyen en az **${err.data.required}** olmalı.`;
  if (code === 'unknown_dungeon' && err.data && err.data.available) return `❓ Böyle bir zindan yok. Seçenekler: \`${err.data.available}\``;
  if (code === 'insufficient_materials' && err.data && err.data.required) {
    const need = Object.entries(err.data.required).map(([k, v]) => `${k}: ${v}`).join(', ');
    return `🧱 Yeterli malzemen yok. Gereken: ${need}`;
  }
  return MAP[code] || `⛔ İşlem başarısız oldu (${code || 'bilinmeyen hata'}).`;
}

module.exports = { safeExecute, friendlyError };
