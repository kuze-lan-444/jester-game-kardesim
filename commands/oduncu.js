// commands/game/oduncu.js — odunculuk paneli (özgün repoda eksikti, yeniden yazıldı)
const { makeGatherCommand } = require('../lib/gather-command');
module.exports = makeGatherCommand({
  name: 'oduncu', description: 'Odunculuk: ağaç kes, sat, işçi ve enerji yönet', title: 'Odunculuk', emoji: '🪓', color: 0x27AE60,
  api: '/woodcutting', act: 'chop', btn: 'wood', itemsKey: 'logs', actLabel: 'Kes', workerWord: 'Oduncu',
});
