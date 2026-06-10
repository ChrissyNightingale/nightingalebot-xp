// Live member-count channels. Renames two voice channels to show the
// current human count and online count. Discord rate-limits channel renames
// to 2 per 10 minutes per channel, so we update at most every 10 minutes
// and skip the API call when the value hasn't changed.

import { CFG } from './config.js';

const HUMANS_CHANNEL_ID = '1476737678551683072';
const ONLINE_CHANNEL_ID = '1476737736055455754';
const UPDATE_EVERY_MS = 10 * 60 * 1000;

let lastHumans = null;
let lastOnline = null;

async function updateStats(client) {
  const guild = await client.guilds.fetch(CFG.guildId).catch(() => null);
  if (!guild) return;

  // Full member fetch — populates cache including presence (requires the
  // GuildPresences intent + Presence Intent enabled in the dev portal).
  const members = await guild.members.fetch({ withPresences: true }).catch((e) => {
    console.error(`[stats] member fetch failed: ${e.message}`);
    return null;
  });
  if (!members) return;

  const humans = members.filter((m) => !m.user.bot);
  const online = humans.filter(
    (m) => m.presence && m.presence.status !== 'offline'
  );

  const humanCount = humans.size;
  const onlineCount = online.size;

  if (humanCount !== lastHumans) {
    const ch = await client.channels.fetch(HUMANS_CHANNEL_ID).catch(() => null);
    if (ch) {
      await ch
        .setName(`Humans: ${humanCount}`)
        .then(() => {
          lastHumans = humanCount;
          console.log(`[stats] humans -> ${humanCount}`);
        })
        .catch((e) => console.error(`[stats] humans rename: ${e.message}`));
    }
  }

  if (onlineCount !== lastOnline) {
    const ch = await client.channels.fetch(ONLINE_CHANNEL_ID).catch(() => null);
    if (ch) {
      await ch
        .setName(`Online Members: ${onlineCount}`)
        .then(() => {
          lastOnline = onlineCount;
          console.log(`[stats] online -> ${onlineCount}`);
        })
        .catch((e) => console.error(`[stats] online rename: ${e.message}`));
    }
  }
}

export function startStatsChannels(client) {
  const tick = () =>
    updateStats(client).catch((e) => console.error(`[stats] ${e.message}`));
  tick(); // once on boot
  setInterval(tick, UPDATE_EVERY_MS);
  console.log('[stats] member-count channels updating every 10 min');
}
