// Hard role gate for moderation commands. setDefaultMemberPermissions is
// just a UI hint; this is the real check. Returns true if the interaction's
// member holds any role in CFG.modRoleIds.

import { CFG } from './config.js';

export function isMod(member) {
  if (!member) return false;
  // Cache view for resolved GuildMember; falls back to roles array for raw API
  // member objects.
  const ids = member.roles?.cache
    ? [...member.roles.cache.keys()]
    : member.roles || [];
  for (const id of ids) {
    if (CFG.modRoleIds.includes(id)) return true;
  }
  return false;
}

export async function denyIfNotMod(interaction) {
  if (isMod(interaction.member)) return false;
  await interaction.reply({
    content: '🚫 Mod-only command — you need the **Admin** or **mods** role.',
    ephemeral: true,
  });
  return true;
}
