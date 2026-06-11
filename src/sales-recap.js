// Daily sales recap. Fires once per day at 09:00 America/Chicago. Pulls
// Fourthwall orders, computes prior-day totals, posts a summary embed to
// the #daily-recap channel.

import fs from 'node:fs/promises';
import path from 'node:path';
import { EmbedBuilder } from 'discord.js';
import { fetchAllOrders, summarize } from './fourthwall.js';

// Persist "last posted day" so a deploy/restart within the recap hour doesn't
// re-fire. Lives on the Fly volume next to cron-state.json.
const RECAP_STATE_PATH =
  process.env.RECAP_STATE_PATH ||
  path.join(
    path.dirname(process.env.CRON_STATE_PATH || '/data/cron-state.json'),
    'recap-state.json'
  );

async function loadLastPosted() {
  try {
    const s = JSON.parse(await fs.readFile(RECAP_STATE_PATH, 'utf8'));
    return s?.lastPosted || null;
  } catch {
    return null;
  }
}
async function saveLastPosted(key) {
  try {
    await fs.mkdir(path.dirname(RECAP_STATE_PATH), { recursive: true });
    await fs.writeFile(
      RECAP_STATE_PATH,
      JSON.stringify({ lastPosted: key }, null, 2) + '\n'
    );
  } catch (e) {
    console.error(`[sales] persist failed: ${e.message}`);
  }
}

const DAILY_RECAP_CHANNEL_ID = '1513725119531319367';
const SALES_CHANNEL_ID = '1513725077504397372';

const RECAP_TZ = 'America/Los_Angeles';
const RECAP_HOUR = 9; // 09:00 PT — the morning recap

// Returns { year, month, day, hour, minute } for the configured TZ.
function tzParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: RECAP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const pick = (t) => Number(parts.find((p) => p.type === t).value);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
  };
}

// Local-midnight epoch for the given date (in the recap TZ). Computed by
// formatting then parsing as if local — close enough for daily granularity
// even across DST.
function localMidnight(dateParts) {
  const iso = `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}-${String(dateParts.day).padStart(2, '0')}T00:00:00`;
  // Find UTC equivalent: try parsing as UTC then adjusting by formatter delta.
  // Simpler: walk back ~12h chunks and snap. Good enough at daily granularity.
  return new Date(iso + 'Z').getTime() - tzOffsetMs(dateParts);
}

// Approx offset (ms) for RECAP_TZ on the given date — UTC minus local.
function tzOffsetMs(dateParts) {
  const probe = new Date(
    `${dateParts.year}-${String(dateParts.month).padStart(2, '0')}-${String(dateParts.day).padStart(2, '0')}T12:00:00Z`
  );
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: RECAP_TZ,
    hour: '2-digit',
    hour12: false,
  }).format(probe);
  const localHour = Number(local);
  // UTC noon was localHour local. Offset = (12 - localHour) hours, in ms.
  return (12 - localHour) * 3600 * 1000;
}

function fmtUSD(n) {
  return `$${n.toFixed(2)}`;
}

async function postRecap(client) {
  const orders = await fetchAllOrders();
  const now = tzParts();
  const today = localMidnight(now);
  const yesterday = today - 86400_000;
  const sevenDaysAgo = today - 7 * 86400_000;
  const fourteenDaysAgo = today - 14 * 86400_000;

  const yest = summarize(orders, yesterday, today);
  const prev7 = summarize(orders, sevenDaysAgo, today);
  const priorPrev7 = summarize(orders, fourteenDaysAgo, sevenDaysAgo);

  const sample = yest.sample
    .map(
      (o) =>
        `\`${o.friendlyId}\` · ${fmtUSD(o.total)} · ${o.city} · ${o.items.slice(0, 60)}${
          o.items.length > 60 ? '…' : ''
        }`
    )
    .join('\n') || '_(no orders yesterday)_';

  const wowPct =
    priorPrev7.revenue > 0
      ? ((prev7.revenue - priorPrev7.revenue) / priorPrev7.revenue) * 100
      : null;

  const emb = new EmbedBuilder()
    .setTitle(`📊 Sales recap — ${now.month}/${now.day - 1}/${now.year}`)
    .setColor(0xff66cc)
    .setDescription(
      [
        `**Yesterday:** ${yest.orderCount} orders · ${yest.units} units · **${fmtUSD(
          yest.revenue
        )}** cash` +
          (yest.credits > 0.005
            ? ` · ${fmtUSD(yest.grossRetail)} gross retail (${fmtUSD(yest.credits)} in credits)`
            : ''),
        `**Last 7d:** ${prev7.orderCount} orders · ${prev7.units} units · **${fmtUSD(
          prev7.revenue
        )}** cash` +
          (prev7.credits > 0.005
            ? ` · ${fmtUSD(prev7.grossRetail)} gross retail (${fmtUSD(prev7.credits)} in credits)`
            : '') +
          (wowPct === null
            ? ''
            : ` · ${wowPct >= 0 ? '▲' : '▼'} ${Math.abs(wowPct).toFixed(1)}% vs prior 7d`),
      ].join('\n')
    )
    .addFields(
      {
        name: 'Top SKU (units, yesterday)',
        value: yest.topByUnits
          ? `${yest.topByUnits.name} (${yest.topByUnits.units})`
          : '—',
        inline: true,
      },
      {
        name: 'Top SKU (revenue, last 7d)',
        value: prev7.topByRev
          ? `${prev7.topByRev.name} (${fmtUSD(prev7.topByRev.revenue)})`
          : '—',
        inline: true,
      },
      {
        name: "Yesterday's orders",
        value: sample.slice(0, 1024),
      }
    )
    .setFooter({ text: 'Fourthwall · Nightingale ecosystem' });

  const ch = await client.channels.fetch(DAILY_RECAP_CHANNEL_ID);
  await ch.send({ embeds: [emb], allowedMentions: { parse: [] } });
}

// Schedule: tick every minute, fire when local time crosses RECAP_HOUR:00
// for a day we haven't yet posted. The "last posted day" key is persisted
// on the Fly volume so deploys/restarts during the recap hour don't refire.
let lastPostedKey = null;

export function startSalesRecap(client) {
  // Warm the cache from disk so we don't refire on startup.
  loadLastPosted().then((key) => {
    if (key) {
      lastPostedKey = key;
      console.log(`[sales] last recap on record: ${key}`);
    }
  });

  const tick = async () => {
    try {
      const t = tzParts();
      const todayKey = `${t.year}-${t.month}-${t.day}`;
      if (t.hour !== RECAP_HOUR) return;
      // Defensive double-read of disk in case multiple instances race.
      const onDisk = await loadLastPosted();
      if (lastPostedKey === todayKey || onDisk === todayKey) {
        if (onDisk && lastPostedKey !== onDisk) lastPostedKey = onDisk;
        return;
      }
      lastPostedKey = todayKey;
      await saveLastPosted(todayKey);
      await postRecap(client);
      console.log(`[sales] daily recap posted for ${todayKey}`);
    } catch (e) {
      console.error(`[sales] recap tick: ${e.message}`);
    }
  };
  setInterval(tick, 60_000);
  console.log(`[sales] recap scheduler running (tz=${RECAP_TZ}, hour=${RECAP_HOUR})`);
}

export { DAILY_RECAP_CHANNEL_ID, SALES_CHANNEL_ID, postRecap };
