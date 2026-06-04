// Static config — guild + channel + role IDs and XP rules. All values come
// from the cron NightingaleBot's existing config so the two bots stay in
// lockstep.

export const CFG = {
  guildId: '1475433665537511536',
  levelUpChannelId: '1476195654761189489',

  xp: {
    // Per-event grants.
    message: 10,
    photo: 15, // replaces the message grant when a message has any image attachment
    reaction: 5,

    // Per-user cooldown across all XP grants. Stops trivial farming.
    cooldownMs: 30_000,

    // Linear leveling: every 100 XP is one level.
    pointsPerLevel: 100,
  },

  // Auto-grant these roles when the user hits the matching level. Once
  // granted they stick — we never remove level rewards.
  levelRoles: {
    5: '1476427364232859832',
    10: '1476427226361762030',
    15: '1476427142869946418',
  },

  // Birthday announcements fire when the local date in this time zone matches
  // a stored birthday. Chrissy + most of the fanbase are US Central, so we
  // anchor there. Override via env if needed.
  birthdayTz: process.env.BIRTHDAY_TZ || 'America/Chicago',
  generalChannelId: '1475433666682290240',

  // Moderation log — every kick/ban/timeout/warn/purge/auto-mod hit posts an
  // embed here for audit. Action embeds are color-coded by severity.
  modLogChannelId: '1476427994082840737',

  // Hard gate on moderation commands. Only members holding one of these roles
  // can run /kick, /ban, /timeout, /warn, /purge, etc. Discord's command
  // permission flags ride alongside but this check is the actual enforcement.
  modRoleIds: [
    '1476196796358463553', // Admin
    '1476427492389556387', // mods
  ],

  // Passive spam detector: if a user sends >= `messageThreshold` messages in
  // `windowMs` they're auto-timed-out for `timeoutMs` and logged.
  spam: {
    windowMs: 5_000,
    messageThreshold: 8,
    timeoutMs: 5 * 60 * 1_000,
  },
};
