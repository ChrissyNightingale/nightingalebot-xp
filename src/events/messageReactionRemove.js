// Gateway listener for un-reactions. Drives real-time role revocation on
// reaction-role messages (instruments + notifications). No XP penalty for
// unreacting.

import { onReactionRemove as reactionRoleRemove } from '../reaction-roles-realtime.js';

export default async function (reaction, user) {
  try {
    await reactionRoleRemove(reaction, user);
  } catch (e) {
    console.error(`[react-] ${e.message}`);
  }
}
