'use strict';
// lib/github-backup.js — Veritabanını özel bir GitHub reposuna yedekler ve açılışta oradan geri yükler.
// Render ücretsiz planda disk silindiği için veri kaybolmasın diye kullanılır.
//
// Gerekli ortam değişkenleri (Render > Environment):
//   GITHUB_BACKUP_TOKEN = github_pat_...   (sadece yedek reposuna "Contents: Read and write" izni olan token)
//   GITHUB_BACKUP_REPO  = kullanici/repo-adi   (örn. kuze-lan-444/jester-game-yedek)
// İsteğe bağlı: GITHUB_BACKUP_BRANCH (boşsa reponun varsayılan dalı kullanılır)
//
// Bu iki değişken yoksa sistem tamamen kapalıdır, bot eskisi gibi çalışır.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const FILE = 'jester.db.gz';
const API = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
const enabled = () => !!(process.env.GITHUB_BACKUP_TOKEN && process.env.GITHUB_BACKUP_REPO);

function call(method, urlPath, { body, raw } = {}) {
  const branch = process.env.GITHUB_BACKUP_BRANCH;
  const qs = method === 'GET' && branch ? `?ref=${encodeURIComponent(branch)}` : '';
  return fetch(`${API}/repos/${process.env.GITHUB_BACKUP_REPO}/contents/${urlPath}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_BACKUP_TOKEN}`,
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jester-game-bot',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Geri yükleme (açılışta, veritabanı dosyası yoksa) ----
// Dönüş: 'restored' | 'none' (repoda yedek yok) | 'failed' | 'disabled'
async function restore(dbPath) {
  if (!enabled()) return 'disabled';
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await call('GET', FILE, { raw: true });
      if (res.status === 404) return 'none';
      if (!res.ok) throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const gz = Buffer.from(await res.arrayBuffer());
      const buf = zlib.gunzipSync(gz);
      if (buf.subarray(0, 15).toString('latin1') !== 'SQLite format 3') throw new Error('Yedek dosyası geçerli bir SQLite dosyası değil');
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, buf);
      for (const ext of ['-wal', '-shm']) fs.rmSync(dbPath + ext, { force: true });
      console.log(`✅ GitHub yedeğinden veri geri yüklendi (${(buf.length / 1024).toFixed(0)} KB)`);
      return 'restored';
    } catch (e) {
      lastErr = e;
      console.error(`⚠️ Geri yükleme denemesi ${i}/3 başarısız: ${e.message}`);
      if (i < 3) await sleep(2000 * i);
    }
  }
  console.error('⛔ GitHub yedeği okunamadı:', lastErr && lastErr.message);
  return 'failed';
}

// lib/db.js veritabanını açmadan önce senkron çağırır (ayrı bir node süreci başlatır).
function restoreSync(dbPath) {
  if (!enabled()) { process.env.JG_RESTORE_STATUS = 'disabled'; return 'disabled'; }
  const r = spawnSync(process.execPath, [path.join(__dirname, 'github-restore-cli.js'), dbPath], { stdio: 'inherit', timeout: 120000, env: process.env });
  const status = r.status === 0 ? 'restored' : r.status === 3 ? 'none' : 'failed';
  process.env.JG_RESTORE_STATUS = status;
  if (status === 'failed') console.error('⛔ Geri yükleme başarısız: bot boş veriyle açılacak ama yedek reposunun üzerine YAZILMAYACAK (veri korunur).');
  return status;
}

// ---- Yedekleme ----
let lastHash = null;
let pushing = false;

// Dönüş: { ok, skipped?, reason? }
async function push(label = 'otomatik') {
  if (!enabled()) return { ok: false, reason: 'disabled' };
  if (process.env.JG_RESTORE_STATUS === 'failed') return { ok: false, reason: 'restore_failed' }; // boş veriyle eski yedeği ezme
  if (pushing) return { ok: false, reason: 'busy' };
  pushing = true;
  const { db, DATA_DIR } = require('./db');
  const tmp = path.join(DATA_DIR, 'github-snapshot.tmp.db');
  try {
    fs.rmSync(tmp, { force: true });
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const buf = fs.readFileSync(tmp);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    if (hash === lastHash) return { ok: true, skipped: true };
    const content = zlib.gzipSync(buf, { level: 9 }).toString('base64');

    for (let attempt = 1; attempt <= 3; attempt++) {
      let sha;
      const cur = await call('GET', FILE);
      if (cur.ok) sha = (await cur.json()).sha;
      else if (cur.status !== 404) throw new Error(`GitHub ${cur.status}: ${(await cur.text()).slice(0, 200)}`);
      const body = { message: `yedek (${label}) ${new Date().toISOString()}`, content, ...(sha ? { sha } : {}) };
      if (process.env.GITHUB_BACKUP_BRANCH) body.branch = process.env.GITHUB_BACKUP_BRANCH;
      const res = await call('PUT', FILE, { body });
      if (res.ok) { lastHash = hash; console.log(`☁️ GitHub yedeği alındı (${label}, ${(content.length * 0.75 / 1024).toFixed(0)} KB)`); return { ok: true }; }
      if ((res.status === 409 || res.status === 422) && attempt < 3) { await sleep(1000); continue; }
      throw new Error(`GitHub ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (e) {
    console.error('⚠️ GitHub yedeği alınamadı:', e.message);
    return { ok: false, reason: e.message };
  } finally {
    pushing = false;
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { enabled, restore, restoreSync, push };
