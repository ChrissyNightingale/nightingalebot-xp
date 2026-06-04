// Pure XP accounting. Inputs go in, DB rows + grant results come out. No
// Discord I/O here so unit testing stays straightforward.

import { CFG } from './config.js';
import { getUser, saveUser } from './db.js';

export function levelFor(xp) {
  return Math.floor(xp / CFG.xp.pointsPerLevel);
}

function applyGrant(userId, username, amount, opts = {}) {
  const u = getUser(userId);
  const now = Date.now();
  const enforceCooldown = opts.enforceCooldown !== false;

  if (enforceCooldown && now - u.last_xp_at < CFG.xp.cooldownMs) {
    return { skipped: 'cooldown' };
  }

  const oldLevel = u.level;
  const newXp = Math.max(0, u.xp + amount);
  const newLevel = levelFor(newXp);

  saveUser({
    user_id: userId,
    username: username || u.username,
    xp: newXp,
    level: newLevel,
    last_xp_at: enforceCooldown ? now : u.last_xp_at,
  });

  return {
    granted: amount,
    newXp,
    newLevel,
    oldLevel,
    levelUp: newLevel > oldLevel,
  };
}

export function grantMessageXp(userId, username, hasPhoto) {
  const amount = hasPhoto ? CFG.xp.photo : CFG.xp.message;
  return applyGrant(userId, username, amount);
}

export function grantReactionXp(userId, username) {
  return applyGrant(userId, username, CFG.xp.reaction);
}

// Admin grants ignore cooldown and accept negative amounts to remove XP.
export function adminGrantXp(userId, username, amount) {
  return applyGrant(userId, username, amount, { enforceCooldown: false });
}
