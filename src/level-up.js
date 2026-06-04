// Shared post-level-up plumbing: grant any earned level reward roles, then
// announce in the dedicated channel.

import { CFG } from './config.js';

export async function handleLevelUp(client, user, newLevel) {
  const guild = await client.guilds.fetch(CFG.guildId).catch(() => null);
  if (!guild) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (member) {
    for (const [lvl, roleId] of Object.entries(CFG.levelRoles)) {
      if (newLevel >= Number(lvl) && !member.roles.cache.has(roleId)) {
        await member.roles
          .add(roleId, `Level ${lvl} reward`)
          .catch((e) => console.error(`level-role add ${roleId}: ${e.message}`));
      }
    }
  }

  const ch = await client.channels.fetch(CFG.levelUpChannelId).catch(() => null);
  if (!ch) return;
  await ch
    .send({
      content: `🎉 Congrats <@${user.id}>! You just reached **Level ${newLevel}**!`,
      allowedMentions: { users: [user.id] },
    })
    .catch((e) => console.error(`level-up post: ${e.message}`));
}
