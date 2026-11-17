'use strict';
// lib/service-clients.js
// Orijinal bot 7 ayrı servisle HTTP üzerinden konuşuyordu. Bu sürümde hepsi TEK süreçte çalışır:
// komutlar aynı `economy.get(...)` / `gameCore.post(...)` çağrılarını yapar, ama istekler ağa çıkmadan
// doğrudan services/ klasöründeki fonksiyonlara yönlendirilir.
const { ApiError } = require('./db');

const economySvc = require('../services/economy');
const userSvc = require('../services/user');
const voiceSvc = require('../services/voice');
const moderationSvc = require('../services/moderation');
const backupSvc = require('../services/backup');
const mmoSvc = require('../services/mmo');
const petsSvc = require('../services/pets');
const rpgSvc = require('../services/rpg');
const gatherSvc = require('../services/gather');
const questSvc = require('../services/quests');
const fishingSvc = require('../services/fishing');

function prefixed(prefix, routes) {
  const out = {};
  for (const [k, fn] of Object.entries(routes)) { const [m, p] = k.split(' '); out[`${m} ${prefix}${p}`] = fn; }
  return out;
}

const TABLES = {
  economy: { ...economySvc.routes, ...questSvc.routes },
  user: userSvc.routes,
  voice: voiceSvc.routes,
  moderation: moderationSvc.routes,
  background: backupSvc.routes,
  gameCore: {
    ...prefixed('/mmo-equipment', mmoSvc.routes),
    ...prefixed('/pets-relics-antiques', petsSvc.routes),
    ...rpgSvc.routes,
    ...gatherSvc.routes,
    ...fishingSvc.routes,
  },
};

function makeClient(name) {
  async function call(method, fullPath, body) {
    const [path, qs] = fullPath.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const handler = TABLES[name][`${method} ${path}`];
    if (!handler) throw new ApiError('not_found', { path }, 404);
    const result = await handler({ query, body: body ? JSON.parse(JSON.stringify(body)) : {} });
    return JSON.parse(JSON.stringify(result === undefined ? { ok: true } : result));
  }
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b) };
}

module.exports = {
  gameCore: makeClient('gameCore'),
  economy: makeClient('economy'),
  user: makeClient('user'),
  voice: makeClient('voice'),
  moderation: makeClient('moderation'),
  background: makeClient('background'),
};
