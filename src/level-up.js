// Shared post-level-up plumbing: grant any earned level reward roles, then
// announce in the dedicated channel.

import { CFG } from './config.js';

export async function handleLevelUp(client, user, newLevel) {
  const guild = await client.guilds.fetch(CFG.guildId).catch(() => null);
  if (!guild) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (member) {
    // Sort thresholds ascending so we can pick the highest the user qualifies
    // for. Only that one role stays; lower-tier level roles get stripped.
    const tiers = Object.entries(CFG.levelRoles)
      .map(([lvl, roleId]) => ({ lvl: Number(lvl), roleId }))
      .sort((a, b) => a.lvl - b.lvl);

    const earned = [...tiers].reverse().find((t) => newLevel >= t.lvl);
    const earnedRoleId = earned?.roleId;

    if (earnedRoleId && !member.roles.cache.has(earnedRoleId)) {
      await member.roles
        .add(earnedRoleId, `Level ${earned.lvl} reward`)
        .catch((e) => console.error(`level-role add ${earnedRoleId}: ${e.message}`));
    }

    // Strip every other tier's role this member happens to hold — keeps the
    // user in exactly one tier role at a time.
    for (const t of tiers) {
      if (t.roleId === earnedRoleId) continue;
      if (member.roles.cache.has(t.roleId)) {
        await member.roles
          .remove(t.roleId, `Superseded by Level ${earned?.lvl ?? '?'}`)
          .catch((e) =>
            console.error(`level-role remove ${t.roleId}: ${e.message}`)
          );
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
