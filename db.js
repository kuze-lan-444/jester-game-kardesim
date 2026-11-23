'use strict';
// lib/db.js — Tek dosyalı SQLite veritabanı (Node.js'in dahili node:sqlite modülü).
// Ek kurulum gerekmez; veriler data/jester.db dosyasında saklanır.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'jester.db');

// Veritabanı dosyası yoksa (Render'da yeni deploy/yeniden başlatma) ve GitHub yedeği tanımlıysa önce oradan geri yükle
if (!fs.existsSync(DB_PATH)) require('./github-backup').restoreSync(DB_PATH);

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const cache = new Map();
function prep(sql) {
  let st = cache.get(sql);
  if (!st) { st = db.prepare(sql); cache.set(sql, st); }
  return st;
}
const get = (sql, ...p) => prep(sql).get(...p);
const all = (sql, ...p) => prep(sql).all(...p);
const run = (sql, ...p) => prep(sql).run(...p);

// İç içe çağrılabilen işlem (transaction). Hata olursa her şey geri alınır.
let depth = 0;
function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* zaten geri alınmış */ }
    throw err;
  } finally { depth--; }
}

function ensureGuild(guildId) {
  run('INSERT OR IGNORE INTO servers (guild_id) VALUES (?)', guildId);
}

// Türkiye saatine göre gün (YYYY-MM-DD) — günlük limitler gece 00:00'da sıfırlanır.
function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

class ApiError extends Error {
  constructor(code, extra = {}, status = 400) {
    super(code);
    this.status = status;
    this.data = { ok: false, error: code, ...extra };
  }
}

function checkCooldown(guildId, userId, key) {
  const row = get('SELECT until_ms FROM cooldowns WHERE guild_id=? AND user_id=? AND key=?', guildId, userId, key);
  const left = row ? Number(row.until_ms) - Date.now() : 0;
  return left > 0 ? left : 0;
}
// Kalan bekleme, panelde ayarlı süreden uzun olamaz: yönetici süreyi kısaltırsa değişiklik anında geçerli olur.
function cooldownLeft(guildId, userId, key, configuredMs) {
  const left = checkCooldown(guildId, userId, key);
  return Math.min(left, Math.max(0, configuredMs));
}
function setCooldown(guildId, userId, key, ms) {
  run(`INSERT INTO cooldowns (guild_id,user_id,key,until_ms) VALUES (?,?,?,?)
       ON CONFLICT (guild_id,user_id,key) DO UPDATE SET until_ms=excluded.until_ms`, guildId, userId, key, Date.now() + ms);
}

module.exports = { db, DB_PATH, DATA_DIR, get, all, run, tx, ensureGuild, today, ApiError, checkCooldown, cooldownLeft, setCooldown };
