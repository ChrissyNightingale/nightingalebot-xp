// Real-time reaction-role grant/revoke driven by the Discord gateway.
//
// Mirror of the cron-loop's reaction-role config, but applied per event
// instead of per 5-min poll. The cron-loop's polling remains as a backstop
// for events the bot might have missed while offline.
//
// Tracked message IDs come from the cron-loop's state file at runtime so
// re-posting a reaction-role message (which rotates the stored ID) is
// picked up without redeploying.

import fs from 'node:fs/promises';

const STATE_PATH = process.env.CRON_STATE_PATH || '/data/cron-state.json';
const GUILD_ID = '1475433665537511536';
const VERIFIED_ROLE_ID = '1476268190454513898';
const RULES_EMOJI = '✅';

// Emoji -> role mapping per group. Custom emojis are stored as "name:id"
// to match what we get from the gateway (and what the cron-loop uses).
const GROUPS = {
  instruments: [
    { emoji: '🎤', roleId: '1476730635220549832', label: 'Vocalist' },
    { emoji: '🎸', roleId: '1476730673531195482', label: 'Guitar/Bass' },
    { emoji: '🥁', roleId: '1476730675888652409', label: 'Drummer' },
    { emoji: '🎻', roleId: '1476730677922889862', label: 'Strings' },
    { emoji: '🎺', roleId: '1476730683316768848', label: 'Brass' },
    { emoji: '🪈', roleId: '1520965562480721930', label: 'Woodwind' },
    { emoji: '🎹', roleId: '1476732023803740180', label: 'Piano/Keys' },
    { emoji: '🎵', roleId: '1476823177643429898', label: 'Vibes' },
  ],
  notifications: [
    { emoji: '📣', roleId: '1507600835146682439', label: 'Announcements' },
    { emoji: 'youtube:1511979995461980160', roleId: '1508008798927847425', label: 'YouTube' },
    { emoji: 'twitch:1511979942135599177', roleId: '1507600833645121606', label: 'Livestreams' },
    { emoji: '🚀', roleId: '1507600825688527019', label: 'Product Updates' },
  ],
};

// Cache state for ~5s so a burst of reactions doesn't re-parse JSON on
// every event. State changes from the cron-loop will be picked up within
// that window.
let cached = null;
let cachedAt = 0;
const STATE_TTL_MS = 5_000;

async function readState() {
  if (cached && Date.now() - cachedAt < STATE_TTL_MS) return cached;
  try {
    cached = JSON.parse(await fs.readFile(STATE_PATH, 'utf8'));
    cachedAt = Date.now();
    return cached;
  } catch {
    return null;
  }
}

// Gateway emoji shape: { name: '🎤', id: null } for unicode, { name: 'youtube',
// id: '1511...' } for custom. Normalize to the "name" / "name:id" form the
// rest of the codebase uses as a key.
function emojiKey(emoji) {
  return emoji.id ? `${emoji.name}:${emoji.id}` : emoji.name;
}

// Find a (group, role) match for a reaction on a message we track.
function findMatch(state, messageId, key) {
  for (const [groupKey, entries] of Object.entries(GROUPS)) {
    const groupState = state.reactionRoles?.[groupKey];
    if (groupState?.messageId !== messageId) continue;
    const entry = entries.find((e) => e.emoji === key);
    if (entry) return { groupKey, ...entry };
  }
  return null;
}

async function safeRoleAdd(member, roleId, reason) {
  if (member.roles.cache.has(roleId)) return false;
  try {
    await member.roles.add(roleId, reason);
    return true;
  } catch (e) {
    console.error(`[react+] role.add(${roleId}) failed: ${e.message}`);
    return false;
  }
}

async function safeRoleRemove(member, roleId, reason) {
  if (!member.roles.cache.has(roleId)) return false;
  try {
    await member.roles.remove(roleId, reason);
    return true;
  } catch (e) {
    console.error(`[react-] role.remove(${roleId}) failed: ${e.message}`);
    return false;
  }
}

// Gateway: messageReactionAdd. Real-time grant on react.
export async function onReactionAdd(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }
  const msg = reaction.message;
  if (!msg.guild || msg.guild.id !== GUILD_ID) return;

  const state = await readState();
  if (!state) return;

  const key = emojiKey(reaction.emoji);
  const member = await msg.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  // Rules message + green checkmark = grant @Verified (one-shot, no removal
  // on unreact — per the original product decision).
  if (state.rules?.messageId === msg.id && key === RULES_EMOJI) {
    const added = await safeRoleAdd(member, VERIFIED_ROLE_ID, 'Reacted to rules');
    if (added) console.log(`[react+] verified ${user.id}`);
    return;
  }

  // Reaction-role group match.
  const match = findMatch(state, msg.id, key);
  if (!match) return;
  const added = await safeRoleAdd(member, match.roleId, `Reacted ${match.label}`);
  if (added) console.log(`[react+] ${match.label} -> ${user.id}`);
}

// Gateway: messageReactionRemove. Real-time revoke on unreact.
export async function onReactionRemove(reaction, user) {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }
  if (reaction.message.partial) {
    try { await reaction.message.fetch(); } catch { return; }
  }
  const msg = reaction.message;
  if (!msg.guild || msg.guild.id !== GUILD_ID) return;

  const state = await readState();
  if (!state) return;

  const key = emojiKey(reaction.emoji);

  // Unreacting from the rules message does NOT revoke @Verified.
  if (state.rules?.messageId === msg.id && key === RULES_EMOJI) return;

  const match = findMatch(state, msg.id, key);
  if (!match) return;

  const member = await msg.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const removed = await safeRoleRemove(
    member,
    match.roleId,
    `Unreacted ${match.label}`
  );
  if (removed) console.log(`[react-] ${match.label} <- ${user.id}`);
}
