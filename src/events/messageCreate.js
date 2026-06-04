import { CFG } from '../config.js';
import { grantMessageXp } from '../xp.js';
import { handleLevelUp } from '../level-up.js';
import { checkSpam } from '../spam-detector.js';

export default async function (message) {
  if (message.author.bot) return;
  if (!message.guild || message.guild.id !== CFG.guildId) return;

  // Run spam detection first so the timeout lands before XP accrues for the
  // burst that triggered it. Errors are swallowed so XP still flows.
  try {
    await checkSpam(message);
  } catch (e) {
    console.error(`[spam] ${e.message}`);
  }

  // Photo = any attachment whose contentType says image OR whose filename
  // has a common image extension (older clients sometimes omit contentType).
  const hasPhoto = message.attachments.some(
    (a) =>
      a.contentType?.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(a.name || '')
  );

  const result = grantMessageXp(
    message.author.id,
    message.author.username,
    hasPhoto
  );

  if (result.levelUp) {
    await handleLevelUp(message.client, message.author, result.newLevel);
  }
}
