// commands/admin/setup.js — MERKEZİ YÖNETİM PANELİ
// Botun tüm sistemleri (ekonomi, görevler, çalma, madencilik, odunculuk, kapışma, at yarışı, seviye...) buradan yönetilir.
// Her ayarın tanımı services/config.js içindedir; panel o tanımlardan otomatik oluşturulur.
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { safeExecute } = require('../lib/safe-execute');
const { card, COLORS } = require('../lib/ui');
const { run } = require('../lib/db');
const config = require('../services/config');
const levelRoles = require('../services/levelroles');

const { SECTIONS, cfg } = config;
const GUIDE = '**Nasıl kullanılır?**\n1️⃣ Aşağıdaki menüden bir kategori seç\n2️⃣ **✏️ Düzenle** ile sayıları/yazıları değiştir, 🟢🔴 düğmelerle sistemi aç/kapat\n3️⃣ Değişiklik **anında** geçerli olur, botu yeniden başlatmana gerek yok';

const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const editable = (s) => s.settings.filter(d => d.type !== 'bool');
const toggles = (s) => s.settings.filter(d => d.type === 'bool');
const findSection = (k) => SECTIONS.find(s => s.key === k);
const isAdmin = (i) => !!(i.memberPermissions && (i.memberPermissions.has(PermissionFlagsBits.Administrator) || i.memberPermissions.has(PermissionFlagsBits.ManageGuild)));
const deny = (i) => i.reply({ content: '🚫 Bu panel sadece **yönetici** yetkisi olanlar içindir.', ephemeral: true });

// ── Görünüm ──────────────────────────────────────────────────────────────
function menuRow(current) {
  const opts = [{ label: 'Ana Sayfa', value: 'home', emoji: { name: '🏠' }, description: 'Tüm sistemlerin genel durumu', default: current === 'home' }]
    .concat(SECTIONS.map(s => ({ label: s.label.slice(0, 100), value: s.key, emoji: { name: s.emoji }, description: s.desc.split('\n')[0].replace(/[`*]/g, '').slice(0, 95), default: s.key === current })));
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('setup_sec').setPlaceholder('📂 Yönetmek istediğin sistemi seç...').addOptions(opts));
}

function statusOf(g, s) {
  const bools = toggles(s).filter(d => /\.(enabled|spam_enabled)$/.test(d.key));
  if (!bools.length) return '⚙️';
  return bools.map(d => (cfg(g, d.key) ? '🟢' : '🔴')).join('');
}

function homePage(i) {
  const g = i.guildId;
  const lines = SECTIONS.map(s => `${s.emoji} **${s.label}** ${statusOf(g, s)}`);
  const half = Math.ceil(lines.length / 2);
  return { embeds: [card(i, { title: '🛠️ Jester Game — Yönetim Paneli', color: COLORS.info,
    description: `Botun **bütün sistemlerini** buradan yönetebilirsin: ödüller, bekleme süreleri, fiyatlar, bahis sınırları, seviye rolleri ve daha fazlası.\n\n${GUIDE}`,
    fields: [{ name: '📋 Sistemler', value: lines.slice(0, half).join('\n'), inline: true }, { name: '\u200b', value: lines.slice(half).join('\n'), inline: true },
      { name: '🔎 Gösterge', value: '🟢 açık • 🔴 kapalı • ⚙️ ayar bölümü', inline: false }],
    footer: 'Sadece yöneticiler kullanabilir' })],
  components: [menuRow('home')] };
}

function levelRolesField(g) {
  const have = new Map(levelRoles.list(g).map(r => [r.level, r.roleId]));
  const levels = [...new Set([...levelRoles.SUGGESTED_LEVELS, ...have.keys()])].sort((a, b) => a - b);
  return { name: '🎭 Seviye Rolleri', value: levels.map(l => `Seviye **${l}** → ${have.has(l) ? `<@&${have.get(l)}>` : '*tanımlı değil*'}`).join('\n').slice(0, 1024) };
}

function valueText(def, g) {
  const v = cfg(g, def.key);
  if (def.key === 'level.channel') return v ? `<#${v}>` : '*mesajın atıldığı kanal*';
  if (def.type === 'text') return v ? '`' + String(v).replace(/`/g, "'").slice(0, 200) + '`' : '*(boş)*';
  return `**${config.format(def, v)}**`;
}

function sectionPage(i, key) {
  const s = findSection(key), g = i.guildId;
  if (!s) return homePage(i);
  const fields = s.settings.map(d => ({ name: d.label, value: `${valueText(d, g)}${d.desc ? `\n*${d.desc}*` : ''}`.slice(0, 1024), inline: d.type !== 'text' }));
  if (s.tools === 'level') fields.push(levelRolesField(g));
  const rows = [menuRow(key)];
  const edits = chunks(editable(s), 5);
  if (edits.length) rows.push(new ActionRowBuilder().addComponents(...edits.map((c, n) => new ButtonBuilder().setCustomId(`setup_edit:${key}:${n}`)
    .setLabel(edits.length > 1 ? `Düzenle ${n + 1}/${edits.length}` : 'Ayarları Düzenle').setEmoji('✏️').setStyle(ButtonStyle.Primary))));
  for (const group of chunks(toggles(s), 5)) {
    rows.push(new ActionRowBuilder().addComponents(...group.map(d => new ButtonBuilder().setCustomId(`setup_tog:${key}:${d.key}`)
      .setLabel(d.label.slice(0, 80)).setEmoji(cfg(g, d.key) ? '🟢' : '🔴').setStyle(cfg(g, d.key) ? ButtonStyle.Success : ButtonStyle.Secondary))));
  }
  const extra = [new ButtonBuilder().setCustomId(`setup_reset:${key}`).setLabel('Varsayılana Dön').setEmoji('♻️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('setup_home').setLabel('Ana Sayfa').setEmoji('🏠').setStyle(ButtonStyle.Secondary)];
  if (s.tools === 'level') extra.push(new ButtonBuilder().setCustomId('setup_lvl_add').setLabel('Rol Ödülü Ekle / Düzenle').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('setup_lvl_del').setLabel('Rol Ödülü Sil').setEmoji('🗑️').setStyle(ButtonStyle.Secondary));
  if (s.tools === 'gather') extra.push(new ButtonBuilder().setCustomId(`setup_gather_reset:${s.toolPrefix}`).setLabel('Oyuncu Verisini Sıfırla').setEmoji('👤').setStyle(ButtonStyle.Secondary));
  rows.push(new ActionRowBuilder().addComponents(...extra));
  return { embeds: [card(i, { title: `${s.emoji} ${s.label}`, color: COLORS.info, description: s.desc, fields, footer: 'Değişiklikler anında geçerli olur' })], components: rows };
}

// ── Formlar (modal) ──────────────────────────────────────────────────────
function input(def, g) {
  const cur = cfg(g, def.key);
  const t = new TextInputBuilder().setCustomId(def.key).setLabel(def.label.slice(0, 45))
    .setStyle(def.multiline ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!def.optional);
  if (def.type === 'text') { t.setMaxLength(def.maxLen); if (cur) t.setValue(String(cur)); t.setPlaceholder(String(def.def || def.desc || '').slice(0, 100)); }
  else { t.setMaxLength(14).setValue(String(cur)).setPlaceholder(`${def.min} - ${def.max}${def.unit ? ' ' + def.unit : ''}`); }
  return new ActionRowBuilder().addComponents(t);
}
function editModal(i, key, n) {
  const s = findSection(key), group = chunks(editable(s), 5)[n];
  const total = chunks(editable(s), 5).length;
  return new ModalBuilder().setCustomId(`setup_modal:${key}:${n}`).setTitle(`${s.emoji} ${s.label}${total > 1 ? ` (${n + 1}/${total})` : ''}`.slice(0, 45))
    .addComponents(...group.map(d => input(d, i.guildId)));
}
const simpleInput = (id, label, placeholder, required = true) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label.slice(0, 45)).setStyle(TextInputStyle.Short).setPlaceholder(placeholder.slice(0, 100)).setRequired(required));

// ── Etkileşim yöneticileri (events/interactionCreate.js çağırır) ─────────
async function handleSelect(i) {
  if (!isAdmin(i)) return deny(i);
  await i.update(i.values[0] === 'home' ? homePage(i) : sectionPage(i, i.values[0]));
}

async function handleButton(i) {
  if (!isAdmin(i)) return deny(i);
  const [action, a, b] = i.customId.split(':');
  const g = i.guildId;
  if (action === 'setup_home') return i.update(homePage(i));
  if (action === 'setup_edit') return i.showModal(editModal(i, a, Number(b)));
  if (action === 'setup_tog') { config.set(g, b, !cfg(g, b)); return i.update(sectionPage(i, a)); }
  if (action === 'setup_reset') { config.resetSection(g, a); await i.update(sectionPage(i, a)); return i.followUp({ content: '♻️ Bu bölümün ayarları **varsayılana** döndürüldü.', ephemeral: true }); }
  if (action === 'setup_lvl_add') return i.showModal(new ModalBuilder().setCustomId('setup_lvl_add_modal').setTitle('➕ Seviye Rol Ödülü')
    .addComponents(simpleInput('lvl', 'Seviye', 'Örn: 5, 10, 20, 30, 45, 60, 70 (veya başka bir seviye)'), simpleInput('role', 'Rol ID veya @rol', 'Rolün ID\'si (sağ tık → ID\'yi kopyala)')));
  if (action === 'setup_lvl_del') return i.showModal(new ModalBuilder().setCustomId('setup_lvl_del_modal').setTitle('🗑️ Seviye Rol Ödülü Sil').addComponents(simpleInput('lvl', 'Silinecek seviye', 'Örn: 30')));
  if (action === 'setup_gather_reset') return i.showModal(new ModalBuilder().setCustomId(`setup_gather_modal:${a}`).setTitle(`👤 ${a === 'mining' ? 'Madencilik' : 'Odunculuk'} verisini sıfırla`)
    .addComponents(simpleInput('user', 'Oyuncu ID', 'Sıfırlanacak oyuncunun kullanıcı ID\'si')));
}

async function handleModal(i) {
  if (!isAdmin(i)) return deny(i);
  const g = i.guildId, [action, a, b] = i.customId.split(':');

  if (action === 'setup_modal') {
    const s = findSection(a), group = chunks(editable(s), 5)[Number(b)];
    const values = [], errors = [];
    for (const d of group) {
      const res = config.validate(d.key, i.fields.getTextInputValue(d.key));
      if (res.ok) values.push([d.key, res.value]); else errors.push(`• ${res.error}`);
    }
    if (errors.length) return i.reply({ content: `⚠️ **Hiçbir değişiklik kaydedilmedi.** Şunları düzelt:\n${errors.join('\n')}`, ephemeral: true });
    // Tutarlılık: en az XP, en çok XP'den büyük olamaz
    const get = (k) => (values.find(v => v[0] === k) || [k, cfg(g, k)])[1];
    if (group.some(d => d.key === 'level.xp_min' || d.key === 'level.xp_max') && get('level.xp_min') > get('level.xp_max')) return i.reply({ content: '⚠️ **En az XP**, **en çok XP**\'ten büyük olamaz. Hiçbir değişiklik kaydedilmedi.', ephemeral: true });
    if (group.some(d => d.key === 'horse.min_bet' || d.key === 'horse.max_bet') && get('horse.min_bet') > get('horse.max_bet')) return i.reply({ content: '⚠️ En düşük bahis, en yüksek bahisten büyük olamaz.', ephemeral: true });
    for (const [k, v] of values) config.set(g, k, v);
    return i.update(sectionPage(i, a));
  }

  if (action === 'setup_lvl_add_modal') {
    const lvl = Number(String(i.fields.getTextInputValue('lvl')).trim());
    const m = String(i.fields.getTextInputValue('role')).match(/(\d{15,22})/);
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 1000) return i.reply({ content: '⚠️ Seviye 1 ile 1000 arasında bir tam sayı olmalı.', ephemeral: true });
    if (!m) return i.reply({ content: '⚠️ Geçerli bir **rol ID**\'si gir (sadece rakamlardan oluşan uzun sayı).', ephemeral: true });
    const role = i.guild && i.guild.roles && i.guild.roles.cache ? i.guild.roles.cache.get(m[1]) : null;
    if (i.guild && i.guild.roles && !role) return i.reply({ content: '⚠️ Bu ID\'ye sahip bir rol bu sunucuda bulunamadı.', ephemeral: true });
    if (role && (role.id === g || role.managed)) return i.reply({ content: '⚠️ `@everyone` ya da bot/entegrasyon rolleri verilemez. Başka bir rol seç.', ephemeral: true });
    const existed = levelRoles.roleFor(g, lvl);
    levelRoles.setReward(g, lvl, m[1]);
    await i.update(sectionPage(i, 'level'));
    const warn = role && role.editable === false ? '\n⚠️ **Botun rolü bu rolün altında!** Sunucu Ayarları → Roller\'de botun rolünü bu rolün üstüne taşı, yoksa rol verilemez.' : '';
    return i.followUp({ content: `✅ Seviye **${lvl}** için ödül ${existed ? 'güncellendi' : 'eklendi'}: <@&${m[1]}>\nÜyeler bir sonraki mesajlarında rollerini otomatik alır.${warn}`, ephemeral: true });
  }

  if (action === 'setup_lvl_del_modal') {
    const lvl = Number(String(i.fields.getTextInputValue('lvl')).trim());
    if (!Number.isInteger(lvl) || !levelRoles.removeReward(g, lvl)) return i.reply({ content: '⚠️ Bu seviye için tanımlı bir rol ödülü yok.', ephemeral: true });
    await i.update(sectionPage(i, 'level'));
    return i.followUp({ content: `🗑️ Seviye **${lvl}** rol ödülü silindi. (Üyelerin mevcut rolleri otomatik alınmaz, elle kaldırabilirsin.)`, ephemeral: true });
  }

  if (action === 'setup_gather_modal') {
    const uid = String(i.fields.getTextInputValue('user')).match(/(\d{15,22})/);
    if (!uid) return i.reply({ content: '⚠️ Geçerli bir kullanıcı ID\'si gir.', ephemeral: true });
    const t = a === 'mining' ? ['mining_data', 'mining_inventory'] : ['woodcutting_data', 'woodcutting_inventory'];
    run(`DELETE FROM ${t[0]} WHERE guild_id=? AND user_id=?`, g, uid[1]);
    run(`DELETE FROM ${t[1]} WHERE guild_id=? AND user_id=?`, g, uid[1]);
    run('DELETE FROM cooldowns WHERE guild_id=? AND user_id=? AND key=?', g, uid[1], 'gather:' + a);
    return i.reply({ content: `👤 <@${uid[1]}> kullanıcısının ${a === 'mining' ? 'madencilik' : 'odunculuk'} verisi sıfırlandı.`, ephemeral: true });
  }
}

module.exports = {
  data: new SlashCommandBuilder().setName('setup').setDescription('[Yönetici] Botun merkezi yönetim paneli').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  execute: safeExecute('admin/setup', async (interaction) => {
    if (!isAdmin(interaction)) return deny(interaction);
    await interaction.reply({ ...homePage(interaction), ephemeral: true });
  }),
  handleSelect, handleButton, handleModal,
  __test: { homePage, sectionPage, editModal },
};
