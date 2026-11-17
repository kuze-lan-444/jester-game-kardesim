'use strict';
// lib/levelCard.js — seviye atlayınca gönderilen görsel kart (CCG kimlik kartı şablonu)
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const fs = require('fs');

const SABLON = path.join(__dirname, '..', 'assets', 'level-card.jpg');
const CIKTI_GENISLIK = 400; // sohbette görünen kart genişliği (piksel). Küçültmek için 320, büyütmek için 500 yap.

async function levelCardOlustur(member, level, xp, sonrakiXp) {
  const sablon = await loadImage(fs.readFileSync(SABLON));
  const canvas = createCanvas(sablon.width, sablon.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sablon, 0, 0);

  // Sağdaki eski yazıları (Tom, rütbe, doğum tarihi) kapat
  ctx.fillStyle = '#dde0e1';
  ctx.fillRect(295, 95, 205, 190);

  // Üye fotoğrafı (sol kutu)
  const bx = 28, by = 102, bw = 244, bh = 342;
  const user = member.user || member;
  const url = user.displayAvatarURL({ extension: 'png', size: 512 });
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const avatar = await loadImage(buf);

  const oran = Math.max(bw / avatar.width, bh / avatar.height);
  const w = avatar.width * oran, h = avatar.height * oran;
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.clip();
  ctx.drawImage(avatar, bx + (bw - w) / 2, by + (bh - h) / 2, w, h);
  ctx.restore();

  // Yazılar
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'top';

  const isim = member.displayName || user.username;
  let size = 34;
  do { ctx.font = `bold ${size}px sans-serif`; size -= 2; }
  while (ctx.measureText(isim).width > 195 && size > 14);
  ctx.fillText(isim, 305, 105);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`Seviye: ${level}`, 305, 165);

  ctx.font = '18px sans-serif';
  ctx.fillText(`XP: ${xp} / ${sonrakiXp}`, 305, 205);

  ctx.font = '15px sans-serif';
  ctx.fillText(`ID: ${user.id.slice(-8)}`, 305, 245);

  // Sohbette daha küçük görünmesi için çıktıyı küçült
  const cw = CIKTI_GENISLIK;
  const ch = Math.round(canvas.height * (cw / canvas.width));
  const kucuk = createCanvas(cw, ch);
  const kctx = kucuk.getContext('2d');
  kctx.imageSmoothingQuality = 'high';
  kctx.drawImage(canvas, 0, 0, cw, ch);
  return kucuk.toBuffer('image/png');
}

module.exports = { levelCardOlustur };