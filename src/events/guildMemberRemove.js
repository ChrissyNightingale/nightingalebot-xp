// Posts a leave notice to #welcome-channel when a member leaves (or is
// kicked/banned — Discord fires the same event).

import { CFG } from '../config.js';

const WELCOME_CHANNEL_ID = '1476195654761189489';

export default async function (member) {
  if (member.guild.id !== CFG.guildId) return;
  if (member.user?.bot) return;

  const name = member.user?.username || member.displayName || 'A member';
  const ch = await member.client.channels
    .fetch(WELCOME_CHANNEL_ID)
    .catch(() => null);
  if (!ch) return;

  await ch
    .send({
      content: `👋 **${name}** has left the server.`,
      allowedMentions: { parse: [] },
    })
    .catch((e) => console.error(`[leave] post failed: ${e.message}`));
  console.log(`[leave] ${member.user?.id} (${name}) left`);
}
