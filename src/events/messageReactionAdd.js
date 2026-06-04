import { CFG } from '../config.js';
import { grantReactionXp } from '../xp.js';
import { handleLevelUp } from '../level-up.js';

export default async function (reaction, user) {
  if (user.bot) return;

  // Reactions on older messages arrive as partials.
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch {
      return;
    }
  }

  if (!reaction.message.guild || reaction.message.guild.id !== CFG.guildId) {
    return;
  }

  const result = grantReactionXp(user.id, user.username);
  if (result.levelUp) {
    await handleLevelUp(reaction.message.client, user, result.newLevel);
  }
}
