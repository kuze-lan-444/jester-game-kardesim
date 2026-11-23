'use strict';
// services/backup.js — yerel yedekleme (GitHub yerine data/backups klasörüne)
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR, ApiError } = require('../lib/db');

const DIR = path.join(DATA_DIR, 'backups');
const KEEP = 20;
const safeName = (n) => /^jester-[0-9T-]+\.db$/.test(n);

function runBackup(label = 'otomatik') {
  fs.mkdirSync(DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = `jester-${stamp}.db`, full = path.join(DIR, file);
  db.exec(`VACUUM INTO '${full.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(DIR).filter(safeName).sort();
  for (const old of files.slice(0, Math.max(0, files.length - KEEP))) fs.unlinkSync(path.join(DIR, old));
  return { ok: true, fileName: file, sizeBytes: fs.statSync(full).size, branch: 'yerel (data/backups)', label };
}

const routes = {
  'POST /backup/run': ({ body }) => {
    const r = runBackup(body.label || 'elle');
    require('../lib/github-backup').push('elle').catch(() => {}); // GitHub yedeği arka planda
    return r;
  },
  'GET /backup/list': ({ query }) => {
    fs.mkdirSync(DIR, { recursive: true });
    const files = fs.readdirSync(DIR).filter(safeName).sort().reverse().slice(0, Math.min(parseInt(query.limit, 10) || 15, 25));
    return { ok: true, backups: files.map(f => { const st = fs.statSync(path.join(DIR, f)); return { name: f, sha: f, message: `${(st.size / 1024).toFixed(1)} KB`, date: st.mtime.toISOString() }; }) };
  },
  'POST /backup/delete': ({ body }) => {
    if (!safeName(String(body.name || ''))) throw new ApiError('invalid_backup_name');
    const full = path.join(DIR, body.name);
    if (!fs.existsSync(full)) throw new ApiError('backup_not_found');
    fs.unlinkSync(full);
    return { ok: true };
  },
};

module.exports = { routes, runBackup };
