'use strict';
// services/levelroles.js — seviye rol ödülleri (panelden eklenir/düzenlenir/silinir)
const { get, all, run, ensureGuild } = require('../lib/db');

const SUGGESTED_LEVELS = [5, 10, 20, 30, 45, 60, 70];
const list = (g) => all('SELECT level, role_id FROM level_roles WHERE guild_id=? ORDER BY level', g).map(r => ({ level: Number(r.level), roleId: r.role_id }));
function setReward(g, level, roleId) {
  ensureGuild(g);
  run(`INSERT INTO level_roles (guild_id,level,role_id) VALUES (?,?,?)
       ON CONFLICT (guild_id,level) DO UPDATE SET role_id=excluded.role_id`, g, level, roleId);
}
const removeReward = (g, level) => run('DELETE FROM level_roles WHERE guild_id=? AND level=?', g, level).changes > 0;
const roleFor = (g, level) => get('SELECT role_id FROM level_roles WHERE guild_id=? AND level=?', g, level)?.role_id || null;

// Üyenin seviyesine göre hak ettiği rolleri verir. Eksik rolleri tamamlar (admin sonradan rol eklediyse de çalışır).
async function syncMember(member, level, keepOld = true) {
  const out = { added: [], removed: [], failed: [] };
  if (!member || !member.roles || !member.guild) return out;
  const g = member.guild.id;
  const earned = list(g).filter(r => r.level <= level);
  if (!earned.length) return out;
  const want = keepOld ? earned : [earned[earned.length - 1]];
  const unwanted = keepOld ? [] : earned.slice(0, -1);
  for (const r of want) {
    if (member.roles.cache.has(r.roleId)) continue;
    const role = member.guild.roles.cache.get(r.roleId);
    if (!role) { out.failed.push(r.roleId); continue; }
    try { await member.roles.add(role); out.added.push(role); } catch { out.failed.push(r.roleId); }
  }
  for (const r of unwanted) {
    if (!member.roles.cache.has(r.roleId)) continue;
    try { await member.roles.remove(r.roleId); out.removed.push(r.roleId); } catch { out.failed.push(r.roleId); }
  }
  return out;
}

module.exports = { SUGGESTED_LEVELS, list, setReward, removeReward, roleFor, syncMember };
