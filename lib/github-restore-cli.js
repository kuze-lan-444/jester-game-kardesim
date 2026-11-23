'use strict';
// lib/github-restore-cli.js — github-backup.restoreSync tarafından ayrı süreç olarak çalıştırılır.
// Çıkış kodu: 0 = geri yüklendi, 3 = repoda yedek yok, 1 = hata
const { restore } = require('./github-backup');
restore(process.argv[2]).then((s) => process.exit(s === 'restored' ? 0 : s === 'none' ? 3 : 1)).catch((e) => { console.error(e); process.exit(1); });
