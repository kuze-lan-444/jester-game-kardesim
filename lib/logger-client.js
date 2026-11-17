'use strict';
// lib/logger-client.js — konsola ve veritabanındaki logs tablosuna kayıt
const { run } = require('./db');

function send(level, message, opts = {}) {
  console.log(`[${level}] ${message}`);
  try {
    run('INSERT INTO logs (service_name,level,message,file_name,user_id,server_id,metadata) VALUES (?,?,?,?,?,?,?)',
      'bot', level, String(message).slice(0, 2000), opts.fileName || null, opts.userId || null, opts.serverId || null,
      opts.metadata ? JSON.stringify(opts.metadata) : null);
  } catch { /* log yazılamazsa bot çalışmaya devam eder */ }
  return Promise.resolve();
}
const logInfo = (m, o) => send('INFO', m, o);
const logWarning = (m, o) => send('WARNING', m, o);
const logCritical = (m, o) => send('CRITICAL', m, o);
function logError(err, opts = {}) {
  console.error(err);
  return send('ERROR', err?.message || String(err), { ...opts, metadata: { ...(opts.metadata || {}), stack: err?.stack || null } });
}
module.exports = { logInfo, logWarning, logError, logCritical };
