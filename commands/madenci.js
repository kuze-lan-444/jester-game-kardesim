// commands/game/madenci.js — madencilik paneli (özgün repoda eksikti, yeniden yazıldı)
const { makeGatherCommand } = require('../lib/gather-command');
module.exports = makeGatherCommand({
  name: 'madenci', description: 'Madencilik: maden kaz, sat, işçi ve enerji yönet', title: 'Madencilik', emoji: '⛏️', color: 0x7F8C8D,
  api: '/mining', act: 'dig', btn: 'mine', itemsKey: 'ores', actLabel: 'Kaz', workerWord: 'Madenci',
});
