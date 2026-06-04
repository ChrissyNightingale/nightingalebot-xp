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
};
