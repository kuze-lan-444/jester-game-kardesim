'use strict';
// services/config.js — MERKEZİ AYAR SİSTEMİ
// Botun tüm ayarları burada tanımlıdır (varsayılan, sınır, açıklama). Değerler sunucu bazlı olarak
// server_settings tablosunda saklanır ve /setup paneli üzerinden değiştirilir. Kod içinde sayı değiştirmek gerekmez.
const { get, all, run, ensureGuild, ApiError } = require('../lib/db');

const I = (key, label, def, min, max, desc, unit = '') => ({ key, label, type: 'int', def, min, max, desc, unit });
const F = (key, label, def, min, max, desc, unit = '') => ({ key, label, type: 'float', def, min, max, desc, unit });
const B = (key, label, def = true, desc = '') => ({ key, label, type: 'bool', def, desc });
const T = (key, label, def, maxLen, desc, opts = {}) => ({ key, label, type: 'text', def, maxLen, desc, ...opts });

// Madencilik ve odunculuk aynı yapıda; sadece ön ek ve varsayılanlar farklı
const gatherSettings = (p, name, workers) => [
  B(`${p}.enabled`, `${name} açık`, true, `${name} sistemini aç/kapat`),
  I(`${p}.cooldown_s`, 'Bekleme süresi', 60, 0, 3600, `Her ${name.toLowerCase()} işlemi arasındaki bekleme`, 'sn'),
  I(`${p}.base_energy`, 'Başlangıç enerjisi', 20, 1, 1000, 'Her oyuncunun en baştaki enerji kapasitesi'),
  I(`${p}.energy_per_tier`, 'Kapasite artışı', 10, 1, 1000, 'Her kapasite yükseltmesinin eklediği enerji'),
  I(`${p}.regen_min`, 'Enerji yenilenme', 3, 1, 600, '1 enerjinin dolma süresi', 'dk'),
  I(`${p}.worker_price`, `${workers} fiyatı`, 1000, 0, 10000000, `Fiyat = bu değer × mevcut ${workers.toLowerCase()} sayısı`, 'coin'),
  I(`${p}.max_workers`, `En fazla ${workers.toLowerCase()}`, 20, 1, 1000, `Bir oyuncunun alabileceği en çok ${workers.toLowerCase()}`),
  I(`${p}.cap_price`, 'Kapasite fiyatı', 1500, 0, 10000000, 'Fiyat = bu değer × (yükseltme sayısı + 1)', 'coin'),
  I(`${p}.max_cap_tier`, 'En fazla kapasite yükseltmesi', 10, 0, 1000, 'Kaç kez enerji kapasitesi yükseltilebilir'),
  I(`${p}.sell_pct`, 'Satış kazancı', 100, 1, 1000, 'Satış gelirinin çarpanı (100 = normal)', '%'),
  I(`${p}.xp_pct`, 'XP kazancı', 100, 1, 1000, 'Kazanılan XP çarpanı (100 = normal)', '%'),
  I(`${p}.food_pct`, 'Yemek fiyatları', 100, 1, 1000, 'Yemek fiyatı çarpanı (100 = normal)', '%'),
  I(`${p}.fill_cost`, 'Doldurma ücreti', 40, 0, 100000, 'Eksik her enerji için ödenen coin', 'coin'),
];

const SECTIONS = [
  { key: 'economy', emoji: '💰', label: 'Ekonomi & Günlük Ödül', desc: 'Günlük ödülün büyüklüğü ve seri sistemi. Ödül = (başlangıç + seri × artış) × pet/antika bonusu.', settings: [
    B('daily.enabled', 'Günlük ödül açık', true, '/gunluk komutunu aç/kapat'),
    I('daily.base', 'Başlangıç ödülü', 250, 0, 1000000, 'Serinin ilk gününde verilen coin', 'coin'),
    I('daily.per_streak', 'Seri başına artış', 40, 0, 100000, 'Her seri gününde eklenen coin', 'coin'),
    I('daily.max_streak', 'Seri tavanı', 30, 1, 3650, 'Bu günden sonra ödül artmaz', 'gün'),
  ] },
  { key: 'market', emoji: '🛒', label: 'Market & Fiyatlar', desc: 'Satın alınabilir ürünlerin fiyatları. Rol marketi için `/market-yonet`, renk rolleri için `/renkrolekle` komutları kullanılır.', settings: [
    I('market.xpboost_price', 'XP Boost fiyatı', 4000, 0, 10000000, '/xpboost (kalıcı +%50 XP)', 'coin'),
    I('market.shield_price', 'Hırsızlık kalkanı fiyatı', 3000, 0, 10000000, '/kalkan', 'coin'),
    I('market.shield_hours', 'Kalkan süresi', 24, 1, 720, 'Kalkanın korunma süresi', 'saat'),
    I('market.tax_pct', 'Pazar vergisi', 5, 0, 90, 'Oyuncu pazarı satışlarından kesilen oran', '%'),
    I('market.color_price', 'Renk rolü varsayılan fiyatı', 4000, 0, 10000000, '/renkrolekle ile fiyat yazılmazsa kullanılır', 'coin'),
  ] },
  { key: 'quests', emoji: '📋', label: 'Günlük Görevler', desc: 'Her gün 3 görev verilir. Burada her görevin ödülünü ve tüm görevleri bitirme bonusunu ayarlarsın.', settings: [
    B('quests.enabled', 'Görevler açık', true, '/gorevler sistemini aç/kapat'),
    I('quests.reward_mesaj', '💬 Sohbet Kurdu ödülü', 150, 0, 1000000, '20 mesaj yazma görevi', 'coin'),
    I('quests.reward_madencilik', '⛏️ Madenci ödülü', 200, 0, 1000000, '5 kez maden kazma görevi', 'coin'),
    I('quests.reward_odunculuk', '🪓 Oduncu ödülü', 200, 0, 1000000, '5 kez ağaç kesme görevi', 'coin'),
    I('quests.reward_zindan', '🗡️ Zindan Avcısı ödülü', 300, 0, 1000000, '1 zindan kazanma görevi', 'coin'),
    I('quests.reward_oyun', '🎲 Şanslı El ödülü', 175, 0, 1000000, '3 şans oyunu oynama görevi', 'coin'),
    I('quests.reward_balik', '🎣 Balıkçı ödülü', 200, 0, 1000000, '5 balık tutma görevi', 'coin'),
    I('quests.bonus', '🏆 Hepsini bitirme bonusu', 500, 0, 10000000, '3 görevi de bitirince verilen ek coin', 'coin'),
  ] },
  { key: 'theft', emoji: '🥷', label: 'Çalma (/çal)', desc: 'Her başarılı çalmada sabit miktar alınır. Oyuncu belirli sayıda çalmaya ulaşınca miktar artar.\nÖrnek (varsayılan): 0-99. çalma = 100 coin, 100. çalmadan sonra = 200 coin.', settings: [
    B('theft.enabled', 'Çalma açık', true, '/çal komutunu aç/kapat'),
    I('theft.base_amount', 'Başlangıç miktarı', 100, 1, 10000000, 'Her çalmada alınan coin', 'coin'),
    I('theft.tier_uses', 'Kademe için çalma sayısı', 100, 1, 1000000, 'Kaç çalmada bir miktar artar', 'kez'),
    I('theft.tier_increment', 'Kademe artışı', 100, 0, 10000000, 'Her kademede eklenen coin', 'coin'),
    I('theft.max_amount', 'En yüksek miktar', 200, 1, 10000000, 'Bundan fazla çalınamaz', 'coin'),
    I('theft.cooldown_s', 'Bekleme süresi', 900, 0, 86400, 'İki çalma arasındaki bekleme', 'sn'),
  ] },
  { key: 'mining', emoji: '⛏️', label: 'Madencilik', desc: 'Madenci komutlarının tüm ayarları. Yeni bir ayar yazınca anında geçerli olur.', settings: gatherSettings('mining', 'Madencilik', 'Madenci'), tools: 'gather', toolPrefix: 'mining' },
  { key: 'wood', emoji: '🪓', label: 'Odunculuk', desc: 'Oduncu komutlarının tüm ayarları.', settings: gatherSettings('wood', 'Odunculuk', 'Oduncu'), tools: 'gather', toolPrefix: 'wood' },
  { key: 'fishing', emoji: '🎣', label: 'Balıkçılık', desc: 'Olta, yem ve satış ayarları.', settings: [
    B('fishing.enabled', 'Balıkçılık açık', true, '/balik sistemini aç/kapat'),
    I('fishing.cooldown_s', 'Bekleme süresi', 15, 0, 3600, 'İki olta atışı arası', 'sn'),
    I('fishing.bait_price', 'Yem fiyatı', 150, 0, 1000000, 'Tanesi', 'coin'),
    I('fishing.sell_pct', 'Satış kazancı', 100, 1, 1000, 'Satış geliri çarpanı', '%'),
    I('fishing.xp_pct', 'XP kazancı', 100, 1, 1000, 'XP çarpanı', '%'),
    I('fishing.rod_cost_pct', 'Olta yükseltme fiyatı', 100, 1, 1000, 'Olta geliştirme fiyatı çarpanı', '%'),
  ] },
  { key: 'fight', emoji: '⚔️', label: 'Kapışma (/fight)', desc: 'Oyuncular arası düello ayarları. Kazanan, kaybedenin cüzdanından belirtilen oranda coin alır.', settings: [
    B('fight.enabled', 'Kapışma açık', true, '/fight komutunu aç/kapat'),
    I('fight.cooldown_s', 'Bekleme süresi', 120, 0, 86400, 'Meydan okuyan için bekleme', 'sn'),
    I('fight.steal_pct', 'Ganimet oranı', 5, 0, 100, 'Kaybedenin cüzdanından alınan oran', '%'),
    I('fight.steal_max', 'En yüksek ganimet', 2000, 0, 10000000, 'Bir düelloda alınabilecek üst sınır', 'coin'),
    I('fight.min_chance', 'En düşük kazanma şansı', 10, 1, 49, 'Zayıf oyuncunun bile sahip olacağı şans', '%'),
    I('fight.max_chance', 'En yüksek kazanma şansı', 90, 51, 99, 'Güçlü oyuncunun şans tavanı', '%'),
  ] },
  { key: 'dungeon', emoji: '🗡️', label: 'Zindan & RPG', desc: 'Zindan ödülleri, bekleme süreleri ve stat geliştirme maliyeti.', settings: [
    B('dungeon.enabled', 'Zindanlar açık', true, '/zindan komutunu aç/kapat'),
    I('dungeon.xp_pct', 'XP ödülü', 100, 1, 1000, 'Zindan XP çarpanı', '%'),
    I('dungeon.coin_pct', 'Coin ödülü', 100, 1, 1000, 'Zindan coin çarpanı', '%'),
    I('dungeon.cooldown_pct', 'Bekleme süresi', 100, 0, 1000, 'Zindan bekleme çarpanı (0 = bekleme yok)', '%'),
    I('rpg.stat_cost_pct', 'Stat yükseltme fiyatı', 100, 1, 1000, 'Stat geliştirme maliyeti çarpanı', '%'),
  ] },
  { key: 'horse', emoji: '🏇', label: 'At Yarışı', desc: 'Atların isimleri, ödeme oranı ve bahis sınırları.', settings: [
    B('horse.enabled', 'At yarışı açık', true, '/atyarisi komutunu aç/kapat'),
    T('horse.name1', '1. atın adı', 'Valkyre', 24, 'Yarıştaki 1. at'),
    T('horse.name2', '2. atın adı', 'Slver Bullet', 24, 'Yarıştaki 2. at'),
    T('horse.name3', '3. atın adı', 'Slow Dancer', 24, 'Yarıştaki 3. at'),
    T('horse.name4', '4. atın adı', 'Ghost Rder', 24, 'Yarıştaki 4. at'),
    F('horse.payout', 'Ödeme çarpanı', 3.5, 1.1, 50, 'Kazanınca bahsin kaç katı ödenir', 'x'),
    I('horse.min_bet', 'En düşük bahis', 50, 1, 10000000, '', 'coin'),
    I('horse.max_bet', 'En yüksek bahis', 5000, 1, 100000000, '', 'coin'),
  ] },
  { key: 'casino', emoji: '🎰', label: 'Slot & Blackjack', desc: 'Kumar oyunlarının bahis sınırları ve günlük oynama hakları.', settings: [
    B('slot.enabled', 'Slot açık', true, '/slot'),
    B('blackjack.enabled', 'Blackjack açık', true, '/blackjack'),
    I('slot.min_bet', 'Slot en düşük bahis', 50, 1, 10000000, '', 'coin'),
    I('slot.max_bet', 'Slot en yüksek bahis', 5000, 1, 100000000, '', 'coin'),
    I('slot.daily_limit', 'Slot günlük hak', 10, 1, 1000, 'Günde kaç kez oynanabilir', 'kez'),
    I('blackjack.min_bet', 'Blackjack en düşük bahis', 50, 1, 10000000, '', 'coin'),
    I('blackjack.max_bet', 'Blackjack en yüksek bahis', 5000, 1, 100000000, '', 'coin'),
    I('blackjack.daily_limit', 'Blackjack günlük hak', 8, 1, 1000, 'Günde kaç el oynanabilir', 'kez'),
  ] },
  { key: 'quickgames', emoji: '🎲', label: 'Zar, Yazı-Tura & Tahmin', desc: 'Hızlı şans oyunlarının kazanç ve kayıp miktarları.', settings: [
    B('zar.enabled', 'Zar açık', true, '/zar'),
    B('yazitura.enabled', 'Yazı-Tura açık', true, '/yazitura'),
    B('tahmin.enabled', 'Tahmin açık', true, '/tahmin'),
    I('zar.win', 'Zar kazanç', 30, 0, 1000000, '', 'coin'),
    I('zar.lose', 'Zar kayıp', 10, 0, 1000000, '', 'coin'),
    I('yazitura.win', 'Yazı-Tura kazanç', 20, 0, 1000000, '', 'coin'),
    I('yazitura.lose', 'Yazı-Tura kayıp', 10, 0, 1000000, '', 'coin'),
    I('tahmin.payout', 'Tahmin ödeme çarpanı', 5, 2, 100, 'Doğru bilince bahsin kaç katı ödenir', 'x'),
    I('tahmin.min_bet', 'Tahmin en düşük bahis', 50, 1, 10000000, '', 'coin'),
    I('tahmin.max_bet', 'Tahmin en yüksek bahis', 2000, 1, 100000000, '', 'coin'),
    I('tahmin.daily_limit', 'Tahmin günlük hak', 15, 1, 1000, '', 'kez'),
  ] },
  { key: 'marriage', emoji: '💍', label: 'Evlilik', desc: 'Evlilik sistemi ayarları.', settings: [
    B('marriage.enabled', 'Evlilik açık', true, '/evlilik ve /evlen'),
    I('marriage.ring_price', 'Yüzük fiyatı', 5000, 0, 10000000, '', 'coin'),
  ] },
  { key: 'voice', emoji: '🎙️', label: 'Ses Kanalı', desc: 'Ses kanalında geçirilen süreye göre ödül.', settings: [
    B('voice.enabled', 'Ses ödülü açık', true, 'Sesli sohbet ödülünü aç/kapat'),
    I('voice.reward_coin', 'Ödül', 50, 0, 1000000, 'Her aralık için verilen coin', 'coin'),
    I('voice.interval_min', 'Ödül aralığı', 60, 1, 1440, 'Kaç dakikada bir ödül', 'dk'),
  ] },
  { key: 'moderation', emoji: '🛡️', label: 'Moderasyon', desc: 'Spam koruması ve yasaklı kelime filtresi.', settings: [
    B('mod.spam_enabled', 'Spam koruması açık', true, 'Spam mesajları otomatik sil'),
    I('mod.spam_burst_count', 'Spam: mesaj sayısı', 6, 2, 50, 'Bu kadar mesaj...'),
    I('mod.spam_burst_seconds', 'Spam: süre', 6, 1, 120, '...bu süre içinde atılırsa spam', 'sn'),
    I('mod.repeat_count', 'Tekrar eden mesaj sayısı', 3, 2, 20, '15 sn içinde aynı mesaj bu kadar tekrarlanırsa spam'),
    T('mod.banned_words', 'Yasaklı kelimeler', '', 1000, 'Virgülle ayır: kelime1, kelime2', { multiline: true, optional: true }),
  ] },
  { key: 'level', emoji: '📈', label: 'Seviye Sistemi', desc: 'Mesaj XP\'si, seviye gereksinimleri, bildirimler ve seviye rolleri.\nBildirim mesajında kullanılabilir: `{mention}` `{user}` `{level}` `{coins}` `{server}` `{role}`', tools: 'level', settings: [
    B('level.enabled', 'Seviye sistemi açık', true, 'Kapalıyken mesajlardan XP verilmez'),
    B('level.notify', 'Seviye bildirimi açık', true, 'Seviye atlayınca mesaj gönder'),
    B('level.keep_old_roles', 'Eski seviye rolleri kalsın', true, 'Kapalıyken yeni rol gelince öncekiler alınır'),
    I('level.xp_min', 'Mesaj başına en az XP', 1, 0, 10000, ''),
    I('level.xp_max', 'Mesaj başına en çok XP', 3, 0, 10000, ''),
    I('level.cooldown_s', 'XP bekleme süresi', 30, 0, 3600, 'Bu süre içinde atılan mesajlar XP vermez', 'sn'),
    I('level.xp_per_level', 'Seviye başına XP', 78, 1, 1000000, 'Gereken XP = (seviye + 1) × bu değer', 'XP'),
    I('level.max_level', 'En yüksek seviye', 100, 1, 1000, ''),
    I('level.coin_reward_pct', 'Seviye coin ödülü', 100, 0, 1000, 'Seviye atlayınca verilen coin çarpanı (0 = ödül yok)', '%'),
    T('level.channel', 'Bildirim kanalı ID', '', 25, 'Boşsa mesajın atıldığı kanala gönderilir', { optional: true }),
    T('level.message', 'Bildirim mesajı', '🎉 {mention} **Seviye {level}** oldu!', 300, 'Seviye atlama mesajı şablonu', { multiline: true }),
  ] },
];

const DEFS = {};
for (const s of SECTIONS) for (const d of s.settings) DEFS[d.key] = { ...d, section: s.key };

// ── Okuma / yazma ────────────────────────────────────────────────────────
const cache = new Map(); // guild -> Map(key -> ham değer)
function load(g) {
  let m = cache.get(g);
  if (!m) {
    m = new Map();
    for (const r of all("SELECT key, value FROM server_settings WHERE guild_id=? AND key LIKE 'cfg:%'", g)) m.set(r.key.slice(4), r.value);
    cache.set(g, m);
  }
  return m;
}
function parse(def, raw) {
  if (raw === undefined || raw === null) return def.def;
  if (def.type === 'bool') return raw === '1' || raw === 'true';
  if (def.type === 'int') { const n = Number(raw); return Number.isFinite(n) ? Math.trunc(n) : def.def; }
  if (def.type === 'float') { const n = Number(raw); return Number.isFinite(n) ? n : def.def; }
  return String(raw);
}
function cfg(g, key) {
  const def = DEFS[key];
  if (!def) throw new Error('Bilinmeyen ayar: ' + key);
  return parse(def, load(g).get(key));
}
const isEnabled = (g, key) => !!cfg(g, key);

// Kullanıcıdan gelen değeri doğrular; { ok, value } veya { ok:false, error } döner
function validate(key, input) {
  const def = DEFS[key];
  if (!def) return { ok: false, error: 'Bilinmeyen ayar.' };
  const s = String(input ?? '').trim();
  if (def.type === 'bool') return { ok: true, value: /^(1|true|evet|açık|acik|on)$/i.test(s) };
  if (def.type === 'text') {
    if (!s && !def.optional) return { ok: false, error: `**${def.label}** boş olamaz.` };
    if (s.length > def.maxLen) return { ok: false, error: `**${def.label}** en fazla ${def.maxLen} karakter olabilir.` };
    if (key === 'level.channel' && s && !/^\d{15,22}$/.test(s.replace(/[<>#]/g, ''))) return { ok: false, error: '**Bildirim kanalı** bir kanal ID\'si olmalı (sadece rakamlar).' };
    return { ok: true, value: key === 'level.channel' ? s.replace(/[<>#]/g, '') : s };
  }
  const n = Number(s.replace(',', '.').replace(/\s/g, ''));
  if (!s || !Number.isFinite(n)) return { ok: false, error: `**${def.label}** bir sayı olmalı.` };
  if (def.type === 'int' && !Number.isInteger(n)) return { ok: false, error: `**${def.label}** tam sayı olmalı.` };
  if (n < def.min || n > def.max) return { ok: false, error: `**${def.label}** ${def.min} ile ${def.max} arasında olmalı.` };
  return { ok: true, value: n };
}
function set(g, key, value) {
  const def = DEFS[key];
  if (!def) throw new Error('Bilinmeyen ayar: ' + key);
  ensureGuild(g);
  const raw = def.type === 'bool' ? (value ? '1' : '0') : String(value);
  run(`INSERT INTO server_settings (guild_id,key,value) VALUES (?,?,?)
       ON CONFLICT (guild_id,key) DO UPDATE SET value=excluded.value`, g, 'cfg:' + key, raw);
  load(g).set(key, raw);
}
function resetSection(g, sectionKey) {
  const s = SECTIONS.find(x => x.key === sectionKey);
  if (!s) return;
  for (const d of s.settings) { run('DELETE FROM server_settings WHERE guild_id=? AND key=?', g, 'cfg:' + d.key); load(g).delete(d.key); }
}
function format(def, value) {
  if (def.type === 'bool') return value ? '🟢 Açık' : '🔴 Kapalı';
  if (def.type === 'text') return value ? (value.length > 60 ? value.slice(0, 57) + '...' : value) : '*(boş)*';
  const num = def.type === 'float' ? String(value) : Number(value).toLocaleString('tr-TR');
  return `${num}${def.unit ? (def.unit === '%' || def.unit === 'x' ? '' : ' ') + def.unit : ''}`;
}

// Sistem kapalıysa hata fırlatır (servisler için)
function assertEnabled(g, key) { if (!cfg(g, key)) throw new ApiError('system_disabled'); }
// Komutlar için: kapalıysa kullanıcıya mesaj gönderir ve true döner
async function gate(interaction, key) {
  if (cfg(interaction.guildId, key)) return false;
  const payload = { content: '🔒 Bu sistem sunucu yöneticisi tarafından kapatıldı.', ephemeral: true };
  if (interaction.deferred || interaction.replied) await interaction.editReply({ content: payload.content });
  else await interaction.reply(payload);
  return true;
}

module.exports = { SECTIONS, DEFS, cfg, isEnabled, validate, set, resetSection, format, assertEnabled, gate };
