'use strict';
// Gerçek discord.js yüklü olmadan komutları sınamak için sahte (mock) discord.js.
// Ayrıca Discord'un slash komut KAYIT kurallarını denetler (aksi halde deploy-commands.js hata verir).
function chain(kind) {
  const st = { kind, data: {}, children: [], components: [] };
  const proxy = new Proxy(st, {
    get(t, p) {
      if (p === 'data') return t.data;
      if (p === 'name') return t.data.name;
      if (p === '__state') return t;
      if (p === 'toJSON') return () => ({ name: t.data.name, kind });
      if (typeof p === 'symbol' || p === 'then') return undefined;
      return (...a) => {
        if (p === 'setName') t.data.name = a[0];
        else if (p === 'setDescription') t.data.description = a[0];
        else if (p === 'setRequired') t.data.required = !!a[0];
        else if (p === 'setTitle') t.data.title = a[0];
        else if (['setLabel', 'setCustomId', 'setPlaceholder', 'setStyle', 'setValue', 'setMaxLength', 'setEmoji', 'setDisabled', 'setColor'].includes(p)) t.data[p.slice(3, 4).toLowerCase() + p.slice(4)] = a[0];
        else if (p === 'addComponents') { for (const c of a.flat()) t.components.push(c.__state); }
        else if (p === 'addOptions') { t.data.options = (t.data.options || []).concat(a.flat()); }
        else if (p === 'addFields') t.data.fields = (t.data.fields || []).concat(a.flat());
        else if (p === 'addChoices') t.data.choices = (t.data.choices || []).concat(a.flat());
        else if (/^add.*Option$/.test(p) || p === 'addSubcommand') {
          const child = chain(p === 'addSubcommand' ? 'sub' : 'option');
          if (typeof a[0] === 'function') a[0](child);
          t.children.push(child.__state);
        }
        return proxy;
      };
    },
  });
  return proxy;
}
function validate(t, path, errs, top) {
  const d = t.data, here = path + '/' + d.name;
  if (!d.name || !/^[\p{Ll}\p{Lo}\p{N}_-]{1,32}$/u.test(d.name)) errs.push(`${here}: geçersiz ad "${d.name}"`);
  if (t.kind !== 'embed' && (!d.description || d.description.length < 1 || d.description.length > 100)) errs.push(`${here}: açıklama ${d.description ? d.description.length : 0} karakter (1-100 olmalı)`);
  if (t.children.length > 25) errs.push(`${here}: 25'ten fazla seçenek`);
  if (d.choices) { if (d.choices.length > 25) errs.push(`${here}: 25'ten fazla seçim`); for (const c of d.choices) if (!c.name || c.name.length > 100) errs.push(`${here}: seçim adı çok uzun`); }
  let seenOptional = false;
  for (const c of t.children) {
    if (c.kind === 'option') { if (c.data.required && seenOptional) errs.push(`${here}: zorunlu seçenek "${c.data.name}" isteğe bağlıdan sonra geliyor`); if (!c.data.required) seenOptional = true; }
    validate(c, here, errs, false);
  }
  const subs = t.children.filter(c => c.kind === 'sub').length, opts = t.children.filter(c => c.kind === 'option').length;
  if (subs && opts) errs.push(`${here}: alt komut ile seçenek karışık kullanılamaz`);
}
const builder = (k) => function () { return chain(k); };
const Slash = function () { return chain('command'); };
module.exports = {
  SlashCommandBuilder: Slash, EmbedBuilder: builder('embed'), ActionRowBuilder: builder('row'),
  ButtonBuilder: builder('button'), StringSelectMenuBuilder: builder('select'), ModalBuilder: builder('modal'), TextInputBuilder: builder('textinput'),
  TextInputStyle: { Short: 1, Paragraph: 2 },
  ButtonStyle: { Primary: 1, Secondary: 2, Success: 3, Danger: 4 }, ComponentType: { Button: 2 },
  PermissionFlagsBits: { Administrator: 8n, ManageGuild: 32n },
  REST: class {}, Routes: {}, Collection: Map, Partials: {}, GatewayIntentBits: {}, Client: class {},
  __validateCommand: (proxy) => { const errs = []; validate(proxy.__state, '', errs, true); return errs; },
};
