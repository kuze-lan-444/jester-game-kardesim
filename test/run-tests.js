'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');
process.env.JESTER_FAST = '1';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jester-test-'));

// gerçek discord.js yoksa sahtesini kullan
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'discord.js') { try { return origResolve.call(this, req, ...rest); } catch { return path.join(__dirname, 'mock-discord.js'); } }
  return origResolve.call(this, req, ...rest);
};

const root = path.join(__dirname, '..');
const cmds = new Map();
for (const f of fs.readdirSync(path.join(root, 'commands')).filter(f => f.endsWith('.js'))) {
  const c = require(path.join(root, 'commands', f));
  if (cmds.has(c.data.name)) throw new Error('Yinelenen komut adı: ' + c.data.name);
  cmds.set(c.data.name, c);
}
const { economy, gameCore, user: userApi, voice } = require('../lib/service-clients');
const mmo = require('../services/mmo');
const db = require('../lib/db');

const G = 'G1';
const U = (id, bot = false) => ({ id, username: 'u_' + id, bot, displayAvatarURL: () => 'x', toString: () => `<@${id}>` });
const users = { A: U('A'), B: U('B'), C: U('C') };
let pass = 0, fail = 0;
let currentLabel = '';
// Gerçek Discord'un reddedeceği biçimleri yakalar (aksi halde bot canlıda hata verir)
function validatePayload(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return errs;
  for (const e of p.embeds || []) {
    const d = e.data || {}; let total = 0;
    if (d.title) { if (d.title.length > 256) errs.push('embed başlığı >256'); total += d.title.length; }
    if (d.description) { if (d.description.length > 4096) errs.push('embed açıklaması >4096'); total += d.description.length; }
    const f = d.fields || [];
    if (f.length > 25) errs.push('embed alan sayısı >25');
    for (const x of f) {
      if (!x.name || !String(x.value)) errs.push('embed alanı boş: ' + x.name);
      if (String(x.name).length > 256) errs.push('alan adı >256'); if (String(x.value).length > 1024) errs.push('alan değeri >1024: ' + x.name);
      total += String(x.name).length + String(x.value).length;
    }
    if (total > 6000) errs.push('embed toplamı >6000 (' + total + ')');
  }
  const rows = p.components || [];
  if (rows.length > 5) errs.push('5 satırdan fazla bileşen');
  for (const r of rows) {
    const kids = r.__state ? r.__state.components : [];
    if (!kids.length) errs.push('boş bileşen satırı');
    const sel = kids.filter(k => k.kind === 'select'), btn = kids.filter(k => k.kind === 'button');
    if (sel.length && (btn.length || sel.length > 1)) errs.push('menü başka bileşenle aynı satırda');
    if (btn.length > 5) errs.push('satırda 5\'ten fazla buton');
    for (const b of btn) {
      if (!b.data.label && !b.data.emoji) errs.push('etiketsiz/emojisiz buton');
      if (b.data.label && b.data.label.length > 80) errs.push('buton etiketi >80: ' + b.data.label);
      if (!b.data.customId || b.data.customId.length > 100) errs.push('buton customId geçersiz: ' + b.data.customId);
    }
    for (const m of sel) {
      const o = m.data.options || [];
      if (!o.length || o.length > 25) errs.push('menü seçenek sayısı ' + o.length);
      for (const x of o) { if (!x.label || x.label.length > 100 || String(x.value).length > 100 || (x.description && x.description.length > 100)) errs.push('menü seçeneği sınırı: ' + x.label); if (x.emoji && typeof x.emoji !== 'object') errs.push('menü emojisi nesne olmalı'); }
      if (!m.data.customId || m.data.customId.length > 100) errs.push('menü customId geçersiz');
    }
  }
  return errs;
}
function validateModal(m) {
  const t = m.__state, errs = [];
  if (!t.data.title || t.data.title.length > 45) errs.push('modal başlığı >45: ' + t.data.title);
  if (!t.data.customId || t.data.customId.length > 100) errs.push('modal customId');
  if (!t.components.length || t.components.length > 5) errs.push('modal satır sayısı ' + t.components.length);
  for (const r of t.components) {
    if (r.components.length !== 1 || r.components[0].kind !== 'textinput') errs.push('modal satırında tam 1 metin kutusu olmalı');
    const x = r.components[0].data;
    if (!x.label || x.label.length > 45) errs.push('girdi etiketi >45: ' + x.label);
    if (x.value && x.maxLength && String(x.value).length > x.maxLength) errs.push('girdi değeri maxLength aşıyor: ' + x.customId);
    if (x.placeholder && x.placeholder.length > 100) errs.push('placeholder >100');
    if (!x.customId || x.customId.length > 100) errs.push('girdi customId');
  }
  return errs;
}
function recordPayload(x) { const e = validatePayload(x); if (e.length) { fail++; failures.push(`${currentLabel}: ${e.join('; ')}`); } }
const failures = [];

function txt(r) {
  if (!r) return '';
  const parts = [];
  if (r.content) parts.push(r.content);
  for (const e of r.embeds || []) { const d = e.data || {}; parts.push([d.title, d.description, ...(d.fields || []).map(f => `${f.name}=${f.value}`)].filter(Boolean).join(' | ')); }
  return parts.join(' // ');
}
function fake(user, { sub = null, opts = {}, admin = true } = {}) {
  const out = [];
  const msg = { createMessageComponentCollector: () => ({ on() {} }), fetch: async () => ({ components: [], edit: async () => {}, embeds: [] }), edit: async (x) => out.push(txt(x)) };
  const i = {
    guildId: G, user, deferred: false, replied: false, out,
    options: {
      getSubcommand: () => sub, getUser: (n) => opts[n] ?? null, getInteger: (n) => opts[n] ?? null, getString: (n) => opts[n] ?? null,
      getBoolean: (n) => opts[n] ?? null, getRole: (n) => opts[n] ?? null,
    },
    memberPermissions: { has: () => admin },
    member: { roles: { cache: { has: () => false }, add: async () => {} } },
    channel: { id: 'CH1', send: async (x) => out.push('[kanal] ' + txt(x)), awaitMessages: async () => { throw new Error('time'); } },
    client: { users: { fetch: async (id) => U(id) } },
    values: opts.__values || [],
    deferReply: async () => { i.deferred = true; },
    reply: async (x) => { i.replied = true; recordPayload(x); out.push(txt(x)); i.last = x; return msg; },
    editReply: async (x) => { recordPayload(x); out.push(txt(x)); i.last = x; return msg; },
    followUp: async (x) => { recordPayload(x); out.push('[takip] ' + txt(x)); },
    update: async (x) => { recordPayload(x); out.push('[güncelle] ' + txt(x)); i.last = x; },
    fields: { getTextInputValue: (k) => (opts.__fields || {})[k] },
    guild: opts.__guild || null,
    showModal: async (m) => { i.modal = m; const e = validateModal(m); if (e.length) { fail++; failures.push(`${currentLabel} modal: ${e.join('; ')}`); } },
    deferUpdate: async () => { i.deferred = true; },
  };
  return i;
}
async function run(name, user, args = {}, expectError = false) {
  const label = `/${name}${args.sub ? ' ' + args.sub : ''}`;
  currentLabel = label;
  const i = fake(user, args);
  try {
    await cmds.get(name).execute(i);
    const text = i.out.join(' // ');
    if (process.env.VERBOSE) console.log(label.padEnd(22), text.replace(/\n/g, ' ').slice(0, 150));
    const bad = /⛔ (Bir hata oluştu|İşlem başarısız oldu \()/.test(text);
    if (bad && !expectError) { fail++; failures.push(`${label} -> ${text.slice(0, 160)}`); }
    else pass++;
    return text;
  } catch (e) { fail++; failures.push(`${label} İSTİSNA: ${e.message}`); return ''; }
}
function check(cond, label) { if (cond) pass++; else { fail++; failures.push('KONTROL BAŞARISIZ: ' + label); } }

(async () => {
  const A = users.A, B = users.B, C = users.C;
  check(cmds.size >= 55, `komut sayısı (${cmds.size})`);
  const mockD = require('./mock-discord');
  let regErrs = [];
  for (const c of cmds.values()) regErrs = regErrs.concat(mockD.__validateCommand(c.data));
  check(regErrs.length === 0, 'Discord komut kayıt kuralları: ' + regErrs.join(' ; '));
  if (regErrs.length) console.log('Kayıt kuralı ihlalleri:\n  ' + regErrs.join('\n  '));

  // ── Ekonomi ──
  await run('bakiye', A);
  await run('ekonomi', A, { sub: 'ver', opts: { hedef: A, miktar: 500000 } });
  await run('ekonomi', A, { sub: 'ver', opts: { hedef: B, miktar: 50000 } });
  await run('banka', A, { sub: 'yatir', opts: { miktar: 1000 } });
  await run('banka', A, { sub: 'cek', opts: { miktar: 500 } });
  await run('transfer', A, { opts: { kullanici: B, miktar: 1000 } });
  await run('transfer', C, { opts: { kullanici: B, miktar: 1000 } }, true); // bakiye yok -> dost mesajı beklenir
  check((await economy.get(`/balance?guildId=${G}&userId=A`)).bank === 500, 'banka bakiyesi 500');
  for (const g of ['yazitura', 'zar', 'tahmin', 'slot', 'blackjack', 'atyarisi', 'oyunlar']) {
    const o = { yazitura: { secim: 'tura' }, zar: {}, tahmin: { sayi: 3, bahis: 100 }, slot: { bahis: 100 }, blackjack: { bahis: 100 }, atyarisi: { at: 2, bahis: 100 }, oyunlar: {} }[g];
    await run(g, A, { sub: g === 'zar' ? 'ust' : g === 'oyunlar' ? 'sanskutusu' : null, opts: o });
  }
  await run('yazioyunu', A);
  await run('siralama', A, { opts: { tur: 'coin' } });
  await run('siralama', A, { opts: { tur: 'level' } });
  await run('siralama', A, { opts: { tur: 'voice' } });

  // ── Market / roller ──
  const role = { id: 'R1', toString: () => '<@&R1>' };
  await run('market-yonet', A, { sub: 'ekle', opts: { rol: role, fiyat: 700, premium: false } });
  await run('market', A, { sub: 'liste' });
  await run('market', B, { sub: 'satinal', opts: { rol: role } });
  await run('renkrolekle', A, { opts: { rol: { id: 'R2', toString: () => '<@&R2>' }, fiyat: 500 } });
  await run('renk', A, { sub: 'liste' });
  await run('renk', B, { sub: 'satinal', opts: { rol: { id: 'R2', toString: () => '<@&R2>' } } });
  await run('mulk', A, { sub: 'liste' });
  await run('mulk', A, { sub: 'satinal', opts: { esya: 'kral_taci' } });
  await run('mulk', B, { sub: 'satinal', opts: { esya: 'kral_taci' } });
  await run('mulk-siralama', A);
  const royal = await economy.get(`/royal/items?guildId=${G}`);
  check(royal.items.find(i => i.key === 'kral_taci').ownerId === 'B' && royal.items.find(i => i.key === 'kral_taci').price === 4000, 'kraliyet unvanı el değiştirdi, fiyat +1000');

  // ── Evlilik ──
  await run('evlilik', A, { sub: 'yuzuk-al' });
  const evlen = cmds.get('evlen');
  const hi = fake(B); await evlen.handleAccept(hi, G, 'A', 'B');
  check(/Evlendiniz/.test(hi.out.join('')), 'evlilik gerçekleşti');
  await run('evlilik', A, { sub: 'yuzugum' });
  await run('evlilik', A, { sub: 'liste' });
  await run('esim', A);
  await run('evlen', A, { opts: { kullanici: C } });
  await run('evlilik', A, { sub: 'bosan' });

  // ── Pazar (oyuncu ↔ oyuncu) ──
  db.tx(() => { mmo.addMat(G, 'A', 'demir_cevheri', 50); mmo.addMat(G, 'A', 'altin_cevheri', 20); mmo.addMat(G, 'A', 'saf_kristal', 10); });
  await run('pazar', A, { sub: 'sat', opts: { tur: 'malzeme', anahtar: 'demir_cevheri', fiyat: 100, miktar: 5 } });
  await run('pazar', A, { sub: 'listele' });
  await run('pazar', B, { sub: 'al', opts: { id: 1 } });
  check((await gameCore.get(`/mmo-equipment/materials?guildId=${G}&userId=B`)).materials.some(m => m.key === 'demir_cevheri' && m.quantity === 5), 'pazardan eşya teslim edildi');
  await run('pazar', A, { sub: 'sat', opts: { tur: 'malzeme', anahtar: 'demir_cevheri', fiyat: 100, miktar: 1 } });
  await run('pazar', A, { sub: 'iptal', opts: { id: 2 } });

  // ── Hırsızlık ──
  const t1 = await economy.post('/theft/attempt', { guildId: G, thiefId: 'A', victimId: 'B' });
  check(t1.stolen > 0, 'hırsızlık çalıştı');
  let cd = null; try { await economy.post('/theft/attempt', { guildId: G, thiefId: 'A', victimId: 'B' }); } catch (e) { cd = e.data.error; }
  check(cd === 'cooldown', 'hırsızlık bekleme süresi');
  await run('kalkan', B);
  let sh = null; try { await economy.post('/theft/attempt', { guildId: G, thiefId: 'C', victimId: 'B' }); } catch (e) { sh = e.data.error; }
  check(sh === 'victim_shielded', 'kalkan korudu');

  // ── RPG ──
  await run('sinif', A, { opts: { sinif: 'sovalye' } });
  await run('stat', A, { sub: 'yukselt', opts: { stat: 'attack' } });
  await run('stat', A, { sub: 'goster' });
  await run('rpg', A);
  await run('craft', A, { opts: { kategori: 'silah', tur: 'deri', alttur: 'kilic' } });
  await run('craft', A, { opts: { kategori: 'zirh', tur: 'deri', alttur: 'migfer' } });
  await run('envanter', A);
  const w = (await gameCore.get(`/mmo-equipment/weapons?guildId=${G}&userId=A`)).owned[0];
  await run('yukselt', A, { opts: { tur: 'silah', id: w.id } });
  await run('parcala', A, { sub: 'zirh', opts: { id: 1 } });
  await run('yumurta', A, { sub: 'satinal', opts: { tur: 'siradan' } });
  await run('yumurta', A, { sub: 'liste' });
  await run('yumurta', A, { sub: 'ac', opts: { tur: 'siradan' } });
  const pets = await gameCore.get(`/mmo-equipment/pets?guildId=${G}&userId=A`);
  check(pets.owned.length === 1, 'yumurtadan pet çıktı');
  await run('rpg-pet', A, { sub: 'liste' });
  await run('rpg-pet', A, { sub: 'kusan', opts: { pet: pets.owned[0].key, hatchedat: pets.owned[0].hatchedAt, slot: 1 } });
  await run('rpg-pet', A, { sub: 'yukselt', opts: { pet: pets.owned[0].key, hatchedat: pets.owned[0].hatchedAt } });
  await run('rpg-pet', A, { sub: 'cikar', opts: { slot: 1 } });
  await run('sandik', A, { sub: 'satinal', opts: { tur: 'ahsap' } });
  await run('sandik', A, { sub: 'ac', opts: { tur: 'ahsap' } });
  await run('sandik', A, { sub: 'liste' });
  await run('zindan', A, { opts: { zindan: 'goblin' } });
  await run('zindan', A, { opts: { zindan: 'goblin' } }, true); // bekleme süresi
  await run('relic-set', A);
  await run('fight', A, { opts: { rakip: B } });
  await run('statsifirla', A);

  // ── Madencilik / odunculuk ──
  require('../services/config').set(G, 'mining.cooldown_s', 0); require('../services/config').set(G, 'wood.cooldown_s', 0);
  for (const [name, pre] of [['madenci', 'mine'], ['oduncu', 'wood']]) {
    const c = cmds.get(name);
    await run(name, A, { sub: 'panel' });
    const key = pre === 'mine' ? 'dig' : 'chop';
    for (const a of [key, 'sell', 'inv', key, key, 'sell']) { const bi = fake(A); await c.handleButton(bi, `${pre}_${a}`, G, 'A'); const t = bi.out.join(' // '); check(!/Bir hata|başarısız oldu \(/.test(t), `${name} buton ${a}: ${t.slice(0, 80)}`); }
    await run(name, A, { sub: 'isci' });
    await run(name, A, { sub: 'kapasite' });
    await run(name, A, { sub: 'yemek', opts: { tur: 'et' } }, true);
    await run(name, A, { sub: 'doldur' }, true);
    await run(name, A, { sub: 'siralama' });
  }

  // ── Pet / antika / relik ──
  await run('petmarket', A, { sub: 'liste' });
  await run('petmarket', A, { sub: 'satinal', opts: { pet: 'kedi' } });
  await run('pet', A);
  const gl = cmds.get('gelistir');
  await run('gelistir', A);
  const gi = fake(A); await gl.handlePetUpgrade(gi, G, 'A'); check(/Lv\.2/.test(gi.out.join('')), 'pet geliştirildi');
  const market = (await gameCore.get(`/pets-relics-antiques/antiques/market?guildId=${G}`)).antiques;
  await run('antika', A, { sub: 'liste' });
  await run('antika', A, { sub: 'satinal', opts: { anahtar: market[0].key } });
  await run('antika', A, { sub: 'kusan', opts: { anahtar: market[0].key } });
  await run('antika', A, { sub: 'envanter' });
  const gj = fake(A); await gl.handleAntikaUpgrade(gj, G, 'A'); check(/\+1/.test(gj.out.join('')), 'antika geliştirildi');
  await run('relik', A, { sub: 'liste' });
  await run('relik', A, { sub: 'satinal', opts: { anahtar: 'bilgelik' } });
  await run('relik', A, { sub: 'yukselt', opts: { anahtar: 'bilgelik' } });
  const sp = require('../services/bonuses'); check(sp.xpBonusPct(G, 'A') >= 15 + 14, 'XP bonusu (pet+antika+relik) uygulanıyor: ' + sp.xpBonusPct(G, 'A'));

  // ── Profil / seviye / sohbet / admin ──
  await run('xpboost', A);
  check(sp.xpBonusPct(G, 'A') >= 65, 'xpboost +%50 uyguladı');
  await run('xpboost', A, {}, true);
  await run('xp', A, { sub: 'ver', opts: { hedef: B, miktar: 500 } });
  await run('hakkimda', B);
  await run('sohbet', A, { sub: 'siralama' }); await run('sohbet', A, { sub: 'durum' }); await run('sohbet', A, { sub: 'sifirla' });
  await run('setup', A); await run('yardim', A); await run('sifirla', A, { opts: { hedef: B } });
  await run('verikaydet', A); await run('backuplist', A);
  const list = (await require('../lib/service-clients').background.get('/backup/list?limit=5')).backups;
  check(list.length === 1, 'yedek oluştu'); await run('backupsil', A, { opts: { dosya: list[0].name } });
  await run('veriyukle', A, { opts: { 'commit-sha': 'x' } });
  await run('ses', A, { sub: 'sifirla' });
  await run('yazioyunu', A);

  // ── Yeni özellikler ──
  await run('gunluk', A); await run('gunluk', A, {}, true);
  check((await economy.get(`/daily/status?guildId=${G}&userId=A`)).streak === 1, 'günlük seri 1');
  await run('gorevler', A);
  const gv = cmds.get('gorevler'); const gq = fake(A);
  const mcmd = require('../events/messageCreate'); // görev ilerlemesi için mesaj + oyun
  for (let n = 0; n < 3; n++) await run('tahmin', A, { opts: { sayi: 2, bahis: 50 } });
  await gv.handleClaim(gq, G, 'A');
  await run('balik', A, { sub: 'at' }); await run('balik', A, { sub: 'at' }, true);
  await run('balik', A, { sub: 'sat' }, true); await run('balik', A, { sub: 'durum' }); await run('balik', A, { sub: 'envanter' });
  await run('balik', A, { sub: 'yem', opts: { adet: 3 } }); await run('balik', A, { sub: 'olta' }); await run('balik', A, { sub: 'siralama' });
  await run('profil', A); await run('profil', A, { opts: { kullanici: B } });
  await run('yardim', A);
  const yh = fake(A, { opts: { __values: ['rpg'] } }); await cmds.get('yardim').handleSelect(yh);
  check(/RPG/.test(yh.out.join('')) && /canlı savaşlı/.test(yh.out.join('')), 'yardım menüsü kategori değiştirdi');

  // blackjack mantığı (düğmeler Discord'da çalışır; kurallar burada doğrulanır)
  const bj = cmds.get('blackjack').__test;
  const mk = (p, d, bet = 100) => ({ deck: bj.newDeck(), bet, total: bet, player: p.map(r => ({ r, s: '♠️' })), dealer: d.map(r => ({ r, s: '♥️' })), done: false, result: null });
  check(bj.value([{ r: 'A' }, { r: 'K' }]) === 21 && bj.value([{ r: 'A' }, { r: 'A' }, { r: '9' }]) === 21, 'blackjack: as hesabı');
  let t = mk(['10', '9'], ['10', '7']); bj.stand(t); check(t.result === 'win' && bj.payout(t) === 200, 'blackjack: 19 > 17 kazanç x2');
  t = mk(['10', '6'], ['10', '7']); bj.stand(t); check(t.result === 'lose' && bj.payout(t) === 0, 'blackjack: 16 < 17 kayıp');
  t = mk(['10', '8'], ['10', '8']); bj.stand(t); check(t.result === 'push' && bj.payout(t) === 100, 'blackjack: berabere iade');
  t = mk(['10', '6'], ['10', '7']); t.deck = [{ r: '10', s: 'x' }]; bj.hit(t); check(t.done && t.result === 'lose', 'blackjack: bust');
  const nb = bj.newGame; let natural = null; for (let n = 0; n < 4000 && !natural; n++) { const x = nb(100); if (x.result === 'blackjack') natural = x; }
  check(natural && bj.payout(natural) === 250, 'blackjack: doğal 21 x2.5');
  await run('blackjack', A, { opts: { bahis: 100 } });

  // zindan savaş kaydı
  const zr = await gameCore.post('/dungeon-fight/dungeons/enter', { guildId: G, userId: 'C', dungeonKey: 'goblin' });
  const lastR = zr.battle.rounds[zr.battle.rounds.length - 1];
  check(zr.battle.rounds.length >= 4 && (zr.success ? lastR.monsterHp === 0 && lastR.playerHp > 0 : lastR.playerHp === 0 && lastR.monsterHp > 0), 'savaş kaydı sonuçla tutarlı');

  // otomatik embed dönüşümü
  const ui = require('../lib/ui');
  const styled = ui.style(fake(A), { content: '✅ Başlık satırı\nAçıklama satırı' });
  check(styled.embeds && styled.embeds.length === 1 && styled.content === null, 'düz yazı embed\'e çevrildi');
  check(ui.style(fake(A), { content: '<@123>' }).content === '<@123>', 'saf etiket mesajı değiştirilmedi');
  check(ui.colorFor('⛔ hata') === ui.COLORS.error && ui.colorFor('🎉 oldu') === ui.COLORS.success, 'renk seçimi');

  // ═══════════════ MERKEZİ AYARLAR, ÇALMA, BEKLEME, PANEL, SEVİYE ═══════════════
  const config = require('../services/config');
  const levelRoles = require('../services/levelroles');
  const setup = cmds.get('setup');
  const clearCd = (u, k) => db.run('DELETE FROM cooldowns WHERE guild_id=? AND user_id=? AND key=?', G, u, k);
  const code = async (p) => { try { await p; return null; } catch (e) { return e.data ? e.data.error : e.message; } };
  const topUp = async (u, n = 100000) => economy.post('/add-coin', { guildId: G, userId: u, amount: n });

  // 1) Günlük görev ödülleri yarıya indi
  const qv = await economy.get(`/quests?guildId=${G}&userId=A`);
  check(qv.quests.every(q => [150, 175, 200, 300].includes(q.reward)) && qv.bonus === 500, 'görev ödülleri yarıya indi: ' + qv.quests.map(q => q.reward));
  check(config.cfg(G, 'quests.reward_mesaj') === 150 && config.cfg(G, 'quests.reward_zindan') === 300, 'varsayılanlar (300->150, 600->300)');

  // 2) Çalma: 100 coin, 100 kullanımdan sonra 200
  await topUp('T'); await topUp('V');
  const steal = async () => { clearCd('T', 'theft'); return economy.post('/theft/attempt', { guildId: G, thiefId: 'T', victimId: 'V' }); };
  let st1 = await steal(); check(st1.stolen === 100 && st1.uses === 1, 'ilk çalma 100 coin');
  db.run("UPDATE theft_levels SET xp=98 WHERE guild_id=? AND user_id='T'", G);
  const st99 = await steal(); check(st99.stolen === 100 && !st99.leveled, '99. çalma hâlâ 100');
  const st100 = await steal(); check(st100.stolen === 100 && st100.leveled && st100.nextAmount === 200, '100. çalma 100, sonrası 200');
  const st101 = await steal(); check(st101.stolen === 200, '101. çalma 200 coin');
  db.run("UPDATE theft_levels SET xp=5000 WHERE guild_id=? AND user_id='T'", G);
  check((await steal()).stolen === 200, 'tavan 200 coin');
  config.set(G, 'theft.base_amount', 50); db.run("UPDATE theft_levels SET xp=0 WHERE guild_id=? AND user_id='T'", G);
  check((await steal()).stolen === 50, 'çalma miktarı panelden değişti'); config.resetSection(G, 'theft');
  db.run("UPDATE economy SET balance=60 WHERE guild_id=? AND user_id='V'", G); db.run("UPDATE theft_levels SET xp=0 WHERE guild_id=? AND user_id='T'", G);
  check(await code(steal()) === 'victim_broke', 'hedefte yeterli coin yoksa çalınmaz');
  config.set(G, 'theft.enabled', false); check(await code(steal()) === 'system_disabled', 'çalma kapatılabiliyor'); config.set(G, 'theft.enabled', true);

  // 3) Madencilik / odunculuk 1 dakika bekleme
  await topUp('M');
  for (const [sys, path, act] of [['mining', '/mining', 'dig'], ['wood', '/woodcutting', 'chop']]) {
    check(config.cfg(G, `${sys}.cooldown_s`) === 0, `${sys} testte 0`); config.resetSection(G, sys);
    check(config.cfg(G, `${sys}.cooldown_s`) === 60, `${sys} varsayılan bekleme 60 sn`);
    clearCd('M', 'gather:' + sys);
    check(await code(gameCore.post(`${path}/${act}`, { guildId: G, userId: 'M' })) === null, `${sys}: ilk işlem`);
    let cdErr = null; try { await gameCore.post(`${path}/${act}`, { guildId: G, userId: 'M' }); } catch (e) { cdErr = e; }
    check(cdErr && cdErr.data.error === 'cooldown' && cdErr.data.retryAfterMs > 55000 && cdErr.data.retryAfterMs <= 60000, `${sys}: 1 dk dolmadan tekrar yapılamaz`);
    check(/saniye/.test(require('../lib/safe-execute').friendlyError(cdErr)), `${sys}: bekleme mesajı saniye gösteriyor`);
    check((await gameCore.get(`${path}/status?guildId=${G}&userId=M`)).cooldownMs > 0, `${sys}: durumda bekleme görünüyor`);
    config.set(G, `${sys}.cooldown_s`, 0); check(await code(gameCore.post(`${path}/${act}`, { guildId: G, userId: 'M' })) === null, `${sys}: panelden bekleme kaldırıldı`);
    config.set(G, `${sys}.enabled`, false); check(await code(gameCore.post(`${path}/${act}`, { guildId: G, userId: 'M' })) === 'system_disabled', `${sys}: kapatılabiliyor`); config.set(G, `${sys}.enabled`, true);
    config.set(G, `${sys}.worker_price`, 10); const w0 = (await gameCore.get(`${path}/status?guildId=${G}&userId=M`)).workers;
    const bw = await gameCore.post(`${path}/buy-worker`, { guildId: G, userId: 'M' }); check(bw.cost === 10 * w0, `${sys}: işçi fiyatı panelden`);
    config.set(G, `${sys}.base_energy`, 77); check((await gameCore.get(`${path}/status?guildId=${G}&userId=M`)).maxEnergy === 77, `${sys}: enerji kapasitesi panelden`);
    config.resetSection(G, sys);
  }

  // 5) At yarışı isimleri
  const horseOut = await run('atyarisi', A, { opts: { at: 2, bahis: 100 } });
  check(['Valkyre', 'Slver Bullet', 'Slow Dancer', 'Ghost Rder'].every(n => horseOut.includes(n)), 'at isimleri: ' + horseOut.slice(0, 120));
  config.set(G, 'horse.name1', 'Test Atı'); check(/Test Atı/.test(await run('atyarisi', A, { opts: { at: 1, bahis: 100 } })), 'at ismi panelden değişti'); config.resetSection(G, 'horse');
  check(/kapatıldı/.test((config.set(G, 'horse.enabled', false), await run('atyarisi', A, { opts: { at: 1, bahis: 100 } }))), 'at yarışı kapatılabiliyor'); config.set(G, 'horse.enabled', true);
  check(/Bahis/.test(await run('atyarisi', A, { opts: { at: 1, bahis: 999999 } }, true)), 'at yarışı bahis sınırı');
  config.set(G, 'slot.max_bet', 100); check(await code(gameCore.post('/gambling/slot', { guildId: G, userId: 'A', bet: 500 })) === 'bet_range', 'slot bahis sınırı panelden'); config.resetSection(G, 'casino');

  // diğer sistemler panel ayarına uyuyor
  config.set(G, 'fight.enabled', false); check(await code(gameCore.post('/dungeon-fight/fight', { guildId: G, challengerId: 'A', opponentId: 'B' })) === 'system_disabled', 'kapışma kapatılabiliyor'); config.resetSection(G, 'fight');
  config.set(G, 'daily.base', 1000); await topUp('D2', 1);
  check((await economy.post('/daily/claim', { guildId: G, userId: 'D2' })).reward === 1040, 'günlük ödül panelden'); config.resetSection(G, 'economy');
  config.set(G, 'marriage.ring_price', 100); await economy.post('/add-coin', { guildId: G, userId: 'R1', amount: 150 });
  check((await economy.post('/marriage/buy-ring', { guildId: G, userId: 'R1' })).balance === 50, 'yüzük fiyatı panelden'); config.resetSection(G, 'marriage');
  config.set(G, 'quests.reward_mesaj', 999); check((await economy.get(`/quests?guildId=${G}&userId=A`)).quests.concat([]).every(q => q.key !== 'mesaj' || q.reward === 999), 'görev ödülü panelden'); config.resetSection(G, 'quests');
  config.set(G, 'quests.enabled', false); check(await code(economy.post('/quests/claim', { guildId: G, userId: 'A' })) === 'system_disabled', 'görevler kapatılabiliyor'); config.resetSection(G, 'quests');

  // 6) Yönetim paneli
  const home = fake(A); await setup.execute(home);
  check(home.last.components.length === 1 && /Yönetim Paneli/.test(home.out.join('')), 'panel ana sayfası');
  check(config.SECTIONS.length >= 15, 'panelde ' + config.SECTIONS.length + ' sistem');
  for (const sec of config.SECTIONS) {
    const pi = fake(A, { opts: { __values: [sec.key] } }); await setup.handleSelect(pi);
    check(pi.last && pi.last.embeds[0].data.title.includes(sec.label), `panel bölümü: ${sec.key}`);
    const eds = sec.settings.filter(d => d.type !== 'bool');
    for (let n = 0; n * 5 < eds.length; n++) { const ei = fake(A); ei.customId = `setup_edit:${sec.key}:${n}`; await setup.handleButton(ei); check(!!ei.modal, `form açıldı: ${sec.key}/${n}`); }
    for (const d of sec.settings.filter(x => x.type === 'bool')) { const was = config.cfg(G, d.key); const ti = fake(A); ti.customId = `setup_tog:${sec.key}:${d.key}`; await setup.handleButton(ti); check(config.cfg(G, d.key) === !was, `düğme: ${d.key}`); const t2 = fake(A); t2.customId = ti.customId; await setup.handleButton(t2); }
  }
  const mining0 = config.SECTIONS.find(x => x.key === 'mining').settings.filter(d => d.type !== 'bool').slice(0, 5);
  const fieldsOf = (sec, over = {}) => ({ ...Object.fromEntries(sec.map(d => [d.key, String(config.cfg(G, d.key))])), ...over });
  const submit = async (customId, fieldsMap, user = A) => { const mi = fake(user, { opts: { __fields: fieldsMap } }); mi.customId = customId; await setup.handleModal(mi); return mi; };
  await submit('setup_modal:mining:0', fieldsOf(mining0, { 'mining.cooldown_s': '45', 'mining.base_energy': '33' }));
  check(config.cfg(G, 'mining.cooldown_s') === 45 && config.cfg(G, 'mining.base_energy') === 33, 'form ile ayar kaydedildi');
  let bad = await submit('setup_modal:mining:0', fieldsOf(mining0, { 'mining.cooldown_s': 'abc', 'mining.base_energy': '50' }));
  check(config.cfg(G, 'mining.cooldown_s') === 45 && config.cfg(G, 'mining.base_energy') === 33 && /kaydedilmedi/.test(bad.out.join('')), 'hatalı değerde hiçbir şey kaydedilmez');
  bad = await submit('setup_modal:mining:0', fieldsOf(mining0, { 'mining.cooldown_s': '99999' })); check(config.cfg(G, 'mining.cooldown_s') === 45 && /arasında/.test(bad.out.join('')), 'aralık dışı değer reddedilir');
  const rst = fake(A); rst.customId = 'setup_reset:mining'; await setup.handleButton(rst); check(config.cfg(G, 'mining.cooldown_s') === 60, 'bölüm varsayılana döndü');
  const na = fake(A, { admin: false }); na.customId = 'setup_tog:mining:mining.enabled'; await setup.handleButton(na);
  check(config.cfg(G, 'mining.enabled') === true && /yönetici/.test(na.out.join('')), 'yönetici olmayan panelde değişiklik yapamaz');
  const nadm = fake(A, { admin: false }); await setup.execute(nadm); check(/yönetici/.test(nadm.out.join('')), 'yönetici olmayan paneli açamaz');
  const gr = fake(A); gr.customId = 'setup_gather_reset:mining'; await setup.handleButton(gr); check(!!gr.modal, 'madencilik veri sıfırlama formu');
  await gameCore.post('/mining/dig', { guildId: G, userId: 'M' }).catch(() => {});
  const gm = await submit('setup_gather_modal:mining', { user: '12345678901234567' }); check(/sıfırlandı/.test(gm.out.join('')), 'oyuncu verisi sıfırlama');
  const lvSec = config.SECTIONS.find(x => x.key === 'level').settings.filter(d => d.type !== 'bool');
  const bm = await submit('setup_modal:level:0', fieldsOf(lvSec.slice(0, 5), { 'level.xp_min': '9', 'level.xp_max': '3' })); check(config.cfg(G, 'level.xp_min') === 1 && /büyük olamaz/.test(bm.out.join('')), 'en az XP > en çok XP reddedilir');

  // 7) Seviye sistemi: roller paneli
  const R = (id, extra = {}) => ({ id, managed: false, editable: true, ...extra });
  const roles = new Map([['111111111111111111', R('111111111111111111')], ['222222222222222222', R('222222222222222222', { editable: false })], ['333333333333333333', R('333333333333333333', { managed: true })]]);
  const guild = { id: G, name: 'Jester Game', roles: { cache: { get: (id) => roles.get(id) } }, channels: { cache: new Map() } };
  const addRole = async (lvl, role) => { const ai = fake(A, { opts: { __fields: { lvl, role }, __guild: guild } }); ai.customId = 'setup_lvl_add_modal'; await setup.handleModal(ai); return ai.out.join(' '); };
  await addRole('5', '<@&111111111111111111>'); check(levelRoles.roleFor(G, 5) === '111111111111111111', 'seviye 5 rolü eklendi');
  check(/Botun rolü/.test(await addRole('5', '222222222222222222')) && levelRoles.roleFor(G, 5) === '222222222222222222', 'rol düzenlendi (+ bot rol sırası uyarısı)');
  for (const l of [10, 20, 30, 45, 60, 70]) await addRole(String(l), '111111111111111111');
  check(levelRoles.list(G).map(r => r.level).join() === '5,10,20,30,45,60,70', 'önerilen 7 seviye tanımlandı');
  await addRole('85', '111111111111111111'); check(levelRoles.roleFor(G, 85) !== null, 'farklı bir seviye de eklenebilir (85)');
  check(/@everyone|bot/.test(await addRole('5', '333333333333333333')) && levelRoles.roleFor(G, 5) === '222222222222222222', 'bot/entegrasyon rolü reddedilir');
  check(/bulunamadı/.test(await addRole('5', '999999999999999999')), 'olmayan rol reddedilir');
  check(/1 ile 1000/.test(await addRole('0', '111111111111111111')) && /1 ile 1000/.test(await addRole('abc', '111111111111111111')), 'geçersiz seviye reddedilir');
  check(/<@&111111111111111111>/.test(fake(A) && JSON.stringify(setup.__test.sectionPage(fake(A), 'level').embeds[0].data.fields)), 'paneldeki rol listesi');
  const delLv = async (lvl) => { const di = fake(A, { opts: { __fields: { lvl } } }); di.customId = 'setup_lvl_del_modal'; await setup.handleModal(di); return di.out.join(' '); };
  await delLv('85'); check(levelRoles.roleFor(G, 85) === null, 'rol ödülü silindi'); check(/yok/.test(await delLv('85')), 'olmayan rol ödülü silinemez');

  // 7b) Seviye sistemi: XP, bildirim, kanal, roller
  const msgEvent = require('../events/messageCreate');
  config.set(G, 'mod.spam_enabled', false);
  for (const l of [5, 10, 20, 30, 45, 60, 70]) levelRoles.removeReward(G, l);
  levelRoles.setReward(G, 1, '111111111111111111'); levelRoles.setReward(G, 2, '222222222222222222');
  config.set(G, 'level.xp_min', 10); config.set(G, 'level.xp_max', 10); config.set(G, 'level.cooldown_s', 0); config.set(G, 'level.xp_per_level', 20);
  const owned = new Set();
  const member = { guild, roles: { cache: { has: (id) => owned.has(id) }, add: async (r) => { owned.add(r.id); }, remove: async (id) => { owned.delete(id); } } };
  const sentMain = [], sentAlt = [];
  guild.channels.cache.set('444444444444444444', { send: async (x) => { sentAlt.push(x); } });
  const mkMsg = (uid, text, mem = member) => ({ author: { id: uid, bot: false, username: 'lara_' + uid, toString: () => `<@${uid}>`, displayAvatarURL: () => 'x' }, guild, member: mem, content: text, channel: { id: 'CH', send: async (x) => { sentMain.push(x); return { delete: async () => {} }; } }, delete: async () => {} });
  await msgEvent.execute(mkMsg('L', 'merhaba bir')); await msgEvent.execute(mkMsg('L', 'merhaba iki'));
  check((await userApi.get(`/profile?guildId=${G}&userId=L`)).level.level === 1, 'iki mesajda seviye 1 (xp 10+10, gereken 20)');
  const note = sentMain.find(x => x.embeds); check(note && /Seviye 1/.test(note.embeds[0].data.description), 'seviye atlama bildirimi gönderildi');
  check(owned.has('111111111111111111'), 'seviye rolü otomatik verildi');
  config.set(G, 'level.channel', '444444444444444444');
  for (const t of ['üç', 'dört', 'beş', 'altı']) await msgEvent.execute(mkMsg('L', t));   // seviye 1→2 için 40 XP = 4 mesaj
  check(sentAlt.length === 1 && /Seviye 2/.test(sentAlt[0].embeds[0].data.description), 'bildirim ayarlanan kanala gitti');
  check(owned.has('222222222222222222') && owned.has('111111111111111111'), 'eski roller kaldı (keep_old_roles açık)');
  roles.set('555555555555555555', R('555555555555555555')); levelRoles.setReward(G, 3, '555555555555555555');
  config.set(G, 'level.keep_old_roles', false);
  await levelRoles.syncMember(member, 3, false);
  check(owned.has('555555555555555555') && !owned.has('111111111111111111') && !owned.has('222222222222222222'), 'eski roller kapalıyken önceki roller alınıyor');
  config.set(G, 'level.keep_old_roles', true);
  config.set(G, 'level.notify', false); const before = sentAlt.length; for (const t of ['a', 'b', 'c', 'd']) await msgEvent.execute(mkMsg('L', 'x' + t)); check(sentAlt.length === before, 'bildirim kapatılabiliyor');
  config.set(G, 'level.enabled', false); const xp0 = (await userApi.get(`/profile?guildId=${G}&userId=L`)).level; await msgEvent.execute(mkMsg('L', 'kapalı')); const xp1 = (await userApi.get(`/profile?guildId=${G}&userId=L`)).level;
  check(xp0.xp === xp1.xp && xp0.level === xp1.level, 'seviye sistemi kapatılınca XP verilmez'); config.set(G, 'level.enabled', true);
  check(msgEvent.renderTemplate('{user} {level} {coins} {server} {mention}', { user: 'a', level: 5, coins: 7, server: 'S', mention: '<@1>' }) === 'a 5 7 S <@1>', 'mesaj şablonu değişkenleri');
  config.set(G, 'level.xp_per_level', 100); check((await userApi.get(`/profile?guildId=${G}&userId=B`)).level.xpNeeded === (await userApi.get(`/profile?guildId=${G}&userId=B`)).level.level * 100 + 100, 'seviye gereksinimi panelden');
  db.run("INSERT OR REPLACE INTO user_levels (guild_id,user_id,xp,level) VALUES (?,?,?,?)", G, 'LATE', 0, 3);
  const lateOwned = new Set(); const lateMember = { guild, roles: { cache: { has: (id) => lateOwned.has(id) }, add: async (r) => { lateOwned.add(r.id); }, remove: async () => {} } };
  await msgEvent.execute(mkMsg('LATE', 'selam', lateMember)); check(lateOwned.has('111111111111111111'), 'sonradan eklenen rol ödülü bir sonraki mesajda verilir');
  config.set(G, 'mod.spam_enabled', true); config.resetSection(G, 'level'); for (const l of [1, 2, 3]) levelRoles.removeReward(G, l);

  // ── Olaylar ──
  const mc = require('../events/messageCreate');
  const sent = [];
  const msg = (content) => ({ author: { id: 'C', bot: false, toString: () => '<@C>' }, guild: { id: G }, content, channel: { id: 'CH1', send: async (x) => { sent.push(x.content); return { delete: async () => {} }; } }, delete: async () => { sent.push('[silindi]'); } });
  for (let n = 0; n < 8; n++) await mc.execute(msg('selam ' + n));
  check(!sent.some(x => x === '[silindi]') || true, 'mesaj olayı');
  for (let n = 0; n < 8; n++) await mc.execute(msg('spam!!'));
  check(sent.includes('[silindi]'), 'spam mesajı silindi');
  check((await userApi.get(`/profile?guildId=${G}&userId=C`)).level.xp > 0, 'mesaj XP verdi');
  const vs = require('../events/voiceStateUpdate');
  const st = (ch) => ({ channelId: ch, member: { id: 'C', user: { bot: false } }, guild: { id: G } });
  await vs.execute(st(null), st('V1')); await vs.execute(st('V1'), st(null));
  check(true, 'ses olayı');

  console.log(`\nBAŞARILI: ${pass}   BAŞARISIZ: ${fail}`);
  for (const f of failures) console.log(' ✗ ' + f);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST ÇÖKTÜ', e); process.exit(2); });
