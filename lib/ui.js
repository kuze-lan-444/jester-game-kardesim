'use strict';
// lib/ui.js — tüm botun ortak görünümü: renkler, ilerleme çubukları, animasyon, otomatik embed
const { EmbedBuilder } = require('discord.js');

const FAST = process.env.JESTER_FAST === '1';          // testlerde bekleme yok
const sleep = (ms) => (FAST ? Promise.resolve() : new Promise(r => setTimeout(r, ms)));
const nf = (n) => Number(n).toLocaleString('tr-TR');

const COLORS = { success: 0x2ECC71, error: 0xE74C3C, warn: 0xF1C40F, info: 0x5865F2, gold: 0xF1C40F, game: 0x9B59B6, rpg: 0xE67E22,
  love: 0xFF69B4, nature: 0x27AE60, sea: 0x3498DB, dark: 0x2C2F33, epic: 0xA335EE, legend: 0xFF8000, mythic: 0xFF3B6B };

function bar(cur, max, len = 10, full = '🟩', empty = '⬛') {
  const r = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0, f = Math.round(r * len);
  return full.repeat(f) + empty.repeat(len - f);
}
const pct = (cur, max) => (max > 0 ? Math.round(Math.max(0, Math.min(1, cur / max)) * 100) : 0);

function colorFor(text) {
  const t = String(text || '');
  if (/^[\s*]*(⛔|❌|🚫|💸|🔒)/.test(t)) return COLORS.error;
  if (/^[\s*]*(⏳|⚠️|ℹ️)/.test(t)) return COLORS.warn;
  if (/😿|💔|☠️/.test(t)) return COLORS.error;
  if (/🎉|✅|🏆|🎁/.test(t)) return COLORS.success;
  if (/💍|❤️/.test(t)) return COLORS.love;
  if (/🎰|🃏|🎲|🪙|🏇|🔢|⌨️/.test(t)) return COLORS.game;
  if (/⚔️|🗡️|🐉|🛡️/.test(t)) return COLORS.rpg;
  if (/🎣|🐟/.test(t)) return COLORS.sea;
  if (/💰|🏦/.test(t)) return COLORS.gold;
  return COLORS.info;
}

function who(interaction) {
  const u = interaction.user || {};
  return { name: (interaction.member && interaction.member.displayName) || u.username || 'Oyuncu', icon: u.displayAvatarURL ? u.displayAvatarURL({ size: 128 }) : undefined };
}

// Mevcut embed'e eksik süsleri ekler (renk, kullanıcı, alt yazı, zaman)
function decorate(e, interaction) {
  const d = e.data || {};
  if (!d.color) e.setColor(colorFor(`${d.title || ''} ${d.description || ''}`));
  if (!d.author && interaction) { const w = who(interaction); e.setAuthor({ name: w.name, iconURL: w.icon }); }
  if (!d.footer) e.setFooter({ text: '🃏 Jester Game' });
  if (!d.timestamp) e.setTimestamp();
  return e;
}

// Düz yazı yanıtını şık bir embed'e çevirir
function toEmbed(interaction, content) {
  const text = String(content);
  const lines = text.split('\n');
  let title = null, desc = text;
  if (lines.length > 1 && lines[0].length <= 90 && !/<[@#]/.test(lines[0])) { title = lines[0].replace(/\*\*/g, ''); desc = lines.slice(1).join('\n').trim(); }
  const e = new EmbedBuilder().setColor(colorFor(text)).setDescription(desc || '\u200b');
  if (title) e.setTitle(title.slice(0, 256));
  return decorate(e, interaction);
}

function style(interaction, payload) {
  if (typeof payload === 'string') payload = { content: payload };
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  if (out.embeds && out.embeds.length) {
    out.embeds = out.embeds.map(e => (e && typeof e.setColor === 'function' ? decorate(e, interaction) : e));
  } else if (out.content && !out.files && !/^\s*<@!?\d+>\s*$/.test(out.content)) {
    out.embeds = [toEmbed(interaction, out.content)];
    out.content = null;
  }
  return out;
}

// Etkileşimin reply/editReply/followUp/update çağrılarını sarar
function patch(interaction) {
  if (!interaction || interaction.__uiPatched) return interaction;
  interaction.__uiPatched = true;
  for (const m of ['reply', 'editReply', 'followUp', 'update']) {
    if (typeof interaction[m] !== 'function') continue;
    const orig = interaction[m].bind(interaction);
    interaction[m] = (payload, ...rest) => orig(style(interaction, payload), ...rest);
  }
  return interaction;
}

// Kareleri sırayla gösterir (animasyon); son kareyi çağıran gönderir
async function animate(interaction, frames, ms = 900) {
  for (const f of frames) { await interaction.editReply(f); await sleep(ms); }
}

// Elle embed kurmak için kısayol
function card(interaction, { title, description, color, fields, thumbnail, image, footer } = {}) {
  const e = new EmbedBuilder();
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (color) e.setColor(color);
  if (fields && fields.length) e.addFields(fields);
  if (thumbnail) e.setThumbnail(thumbnail);
  if (image) e.setImage(image);
  if (footer) e.setFooter({ text: footer });
  return decorate(e, interaction);
}

module.exports = { COLORS, nf, bar, pct, sleep, colorFor, style, patch, animate, card, decorate, toEmbed };

const RARITY_COLORS = { 'çöp': 0x7F8C8D, 'yaygın': 0x2ECC71, 'sıradan': 0x95A5A6, 'nadir': 0x3498DB, 'epik': 0xA335EE, 'efsanevi': 0xFF8000, 'mitik': 0xFF3B6B };
module.exports.rarityColor = (r) => RARITY_COLORS[String(r || '').toLowerCase()] || 0x95A5A6;
