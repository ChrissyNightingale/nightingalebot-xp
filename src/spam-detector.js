// In-memory sliding-window spam detector. Per-user message-timestamp ring
// buffer; if too many land inside CFG.spam.windowMs, auto-timeout the user
// and log it to mod-log. State is RAM only — restarts reset the window,
// which is fine for a 5-second window.

import { CFG } from './config.js';
import { postModLog, humanDuration } from './mod-log.js';

// userId -> [timestamps]
const buffers = new Map();

// userId -> last timeout timestamp; debounces consecutive triggers so we
// don't restack on every message after the first one.
const cooldown = new Map();
const COOLDOWN_MS = 60_000;

export async function checkSpam(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Mods + admins are exempt — they can't spam themselves.
  if (message.member?.permissions?.has('ModerateMembers')) return;

  const now = Date.now();
  const userId = message.author.id;

  // Skip if we just timed this user out a moment ago.
  const lastHit = cooldown.get(userId) || 0;
  if (now - lastHit < COOLDOWN_MS) return;

  let stamps = buffers.get(userId) || [];
  stamps = stamps.filter((t) => now - t < CFG.spam.windowMs);
  stamps.push(now);
  buffers.set(userId, stamps);

  if (stamps.length < CFG.spam.messageThreshold) return;

  // Threshold breached → timeout + log.
  cooldown.set(userId, now);
  buffers.set(userId, []);

  try {
    await message.member.timeout(
      CFG.spam.timeoutMs,
      `Auto-mod: ${stamps.length} messages in ${CFG.spam.windowMs / 1000}s`
    );
  } catch (e) {
    console.error(`[spam] timeout failed for ${userId}: ${e.message}`);
    return;
  }

  await postModLog(message.client, {
    action: 'AUTO_SPAM',
    target: message.author,
    moderator: null,
    reason: `${stamps.length} messages in ${CFG.spam.windowMs / 1000}s — auto-timeout`,
    extra: {
      Channel: `<#${message.channel.id}>`,
      Duration: humanDuration(CFG.spam.timeoutMs),
    },
  });

  // Tell the user briefly in-channel.
  await message.channel
    .send({
      content: `<@${userId}> slow down — auto-timeout for ${humanDuration(
        CFG.spam.timeoutMs
      )}.`,
      allowedMentions: { users: [userId] },
    })
    .catch(() => {});
}
