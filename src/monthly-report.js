// Monthly sales report. Fires on the 1st of each month at 09:00 America/
// Chicago. Pulls all orders for the prior month, builds a CSV + summary
// embed, posts to #daily-recap with the CSV as an attachment.

import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { fetchAllOrders } from './fourthwall.js';
import { DAILY_RECAP_CHANNEL_ID } from './sales-recap.js';

const REPORT_TZ = 'America/Chicago';
const REPORT_HOUR = 9;

function tzParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const pick = (t) => Number(parts.find((p) => p.type === t).value);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
  };
}

// UTC bounds for the calendar month that ended just before `now` (in TZ).
// e.g. if today is 2026-08-03 local, this returns the [July 1 00:00, Aug 1
// 00:00) range in UTC.
function priorMonthBounds(now) {
  let y = now.year;
  let m = now.month - 1;
  if (m < 1) { m = 12; y -= 1; }
  const startStr = `${y}-${String(m).padStart(2, '0')}-01T00:00:00`;
  const endY = m === 12 ? y + 1 : y;
  const endM = m === 12 ? 1 : m + 1;
  const endStr = `${endY}-${String(endM).padStart(2, '0')}-01T00:00:00`;
  return {
    year: y,
    month: m,
    start: tzLocalToUtcMs(startStr),
    end: tzLocalToUtcMs(endStr),
  };
}

// Convert a "YYYY-MM-DDTHH:MM:SS" local-time string in REPORT_TZ to a UTC
// epoch ms. Uses an iterative approach to handle DST cleanly.
function tzLocalToUtcMs(localStr) {
  // Treat the local string AS IF utc; that gives the "naive UTC" value.
  let naiveUtc = new Date(localStr + 'Z').getTime();
  // Now figure out what TZ thinks that instant looks like; the delta back
  // to the original string is our offset.
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: REPORT_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(naiveUtc));
    const pick = (t) => parts.find((p) => p.type === t).value.padStart(2, '0');
    const seen = `${pick('year')}-${pick('month')}-${pick('day')}T${pick(
      'hour'
    )}:${pick('minute')}:${pick('second')}`;
    const targetMs = new Date(localStr + 'Z').getTime();
    const seenMs = new Date(seen + 'Z').getTime();
    naiveUtc += targetMs - seenMs;
  }
  return naiveUtc;
}

function orderTotal(o) {
  return Number(o?.amounts?.total?.value || 0);
}
function orderUnits(o) {
  return (o?.offers || []).reduce((n, off) => n + (off?.quantity || 1), 0);
}
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(orders) {
  const head = [
    'friendlyId',
    'createdAt',
    'status',
    'total_usd',
    'units',
    'items',
    'customer_email',
    'city',
    'state',
    'country',
  ];
  const rows = orders.map((o) => {
    const items = (o.offers || [])
      .map((off) => `${off?.variant?.name || off?.product?.name} x${off?.quantity || 1}`)
      .join(' | ');
    return [
      o.friendlyId,
      o.createdAt,
      o.status || o?.fulfillment?.status || '',
      orderTotal(o).toFixed(2),
      orderUnits(o),
      items,
      o?.email || o?.customer?.email || '',
      o?.shipping?.address?.city || '',
      o?.shipping?.address?.state || '',
      o?.shipping?.address?.country || '',
    ]
      .map(csvEscape)
      .join(',');
  });
  return head.join(',') + '\n' + rows.join('\n') + '\n';
}

function fmtUSD(n) {
  return `$${n.toFixed(2)}`;
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function buildAndPost(client) {
  const orders = await fetchAllOrders();
  const now = tzParts();
  const { year, month, start, end } = priorMonthBounds(now);

  const monthOrders = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= start && t < end;
  });

  const revenue = monthOrders.reduce((s, o) => s + orderTotal(o), 0);
  const units = monthOrders.reduce((s, o) => s + orderUnits(o), 0);

  // Per-SKU breakdown
  const skuUnits = new Map();
  const skuRev = new Map();
  for (const o of monthOrders) {
    for (const off of o.offers || []) {
      const name = off?.variant?.name || off?.product?.name || 'unknown';
      const q = off?.quantity || 1;
      skuUnits.set(name, (skuUnits.get(name) || 0) + q);
      const offerRev = Number(off?.price?.value || 0) * q;
      skuRev.set(name, (skuRev.get(name) || 0) + offerRev);
    }
  }

  // Geo
  const stateCounts = new Map();
  for (const o of monthOrders) {
    const k = o?.shipping?.address?.state || '—';
    stateCounts.set(k, (stateCounts.get(k) || 0) + 1);
  }

  // Top customers by spend
  const custSpend = new Map();
  for (const o of monthOrders) {
    const k = o?.email || o?.customer?.email || 'unknown';
    custSpend.set(k, (custSpend.get(k) || 0) + orderTotal(o));
  }

  const csv = buildCsv(monthOrders);
  const fileName = `nightingale-sales-${year}-${String(month).padStart(2, '0')}.csv`;
  const attachment = new AttachmentBuilder(Buffer.from(csv, 'utf8'), {
    name: fileName,
  });

  const monthName = new Date(Date.UTC(year, month - 1, 1)).toLocaleString(
    'en-US',
    { month: 'long', timeZone: 'UTC' }
  );

  const lines = (entries, fmt) =>
    entries.length
      ? entries.map(([k, v]) => `• ${k} — ${fmt(v)}`).join('\n')
      : '—';

  const emb = new EmbedBuilder()
    .setTitle(`📈 Monthly report — ${monthName} ${year}`)
    .setColor(0xff66cc)
    .setDescription(
      `**${monthOrders.length}** orders · **${units}** units · **${fmtUSD(revenue)}** gross`
    )
    .addFields(
      {
        name: 'Top SKUs (units)',
        value: lines(topN(skuUnits, 5), (n) => `${n} units`),
        inline: true,
      },
      {
        name: 'Top SKUs (revenue)',
        value: lines(topN(skuRev, 5), fmtUSD),
        inline: true,
      },
      {
        name: 'Top states',
        value: lines(topN(stateCounts, 5), (n) => `${n} orders`),
        inline: false,
      },
      {
        name: 'Top customers (spend)',
        value: lines(topN(custSpend, 5), fmtUSD),
        inline: false,
      }
    )
    .setFooter({ text: 'Fourthwall · attached CSV has every order' });

  const ch = await client.channels.fetch(DAILY_RECAP_CHANNEL_ID);
  await ch.send({
    embeds: [emb],
    files: [attachment],
    allowedMentions: { parse: [] },
  });
}

let lastPostedKey = null;

export function startMonthlyReport(client) {
  const tick = async () => {
    try {
      const t = tzParts();
      // Only on the 1st at the recap hour.
      if (t.day !== 1 || t.hour !== REPORT_HOUR) return;
      const key = `${t.year}-${t.month}`;
      if (lastPostedKey === key) return;
      lastPostedKey = key;
      await buildAndPost(client);
      console.log(`[monthly] report posted for ${key}`);
    } catch (e) {
      console.error(`[monthly] tick: ${e.message}`);
    }
  };
  setInterval(tick, 60_000);
  console.log(
    `[monthly] scheduler running (tz=${REPORT_TZ}, day=1, hour=${REPORT_HOUR})`
  );
}

// Exposed for one-off testing — call buildAndPost(client) manually from a
// future slash command if needed.
export { buildAndPost as postMonthlyReportNow };
