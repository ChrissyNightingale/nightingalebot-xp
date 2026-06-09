// Fourthwall Open API client + sales reporting helpers.
//
// Base: https://api.fourthwall.com/open-api/v1.0
// Auth: Basic FW_API_USER:FW_API_PASS

const BASE = 'https://api.fourthwall.com/open-api/v1.0';

function authHeader() {
  const u = process.env.FW_API_USER;
  const p = process.env.FW_API_PASS;
  if (!u || !p) throw new Error('Missing FW_API_USER / FW_API_PASS');
  const b64 = Buffer.from(`${u}:${p}`).toString('base64');
  return `Basic ${b64}`;
}

async function fwGet(path, query = '') {
  const url = `${BASE}${path}${query}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Fourthwall ${path} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Pull every order, paginating until exhaustion or maxPages cap. Fourthwall
// returns ~200 per page; cap defaults to 50 pages (10k orders) to bound the
// work in a single call.
export async function fetchAllOrders(maxPages = 50) {
  const all = [];
  let page = 0;
  let offset = 0;
  while (page < maxPages) {
    const q = `?limit=200&offset=${offset}`;
    const data = await fwGet('/order', q);
    const items = data.results || [];
    all.push(...items);
    if (items.length < 200) break;
    offset += 200;
    page++;
  }
  return all;
}

export async function fetchOrderByFriendlyId(friendlyId) {
  return fwGet(`/order/friendly/${friendlyId}`);
}

export async function fetchOrderById(id) {
  return fwGet(`/order/${id}`);
}

export async function fetchProducts() {
  return fwGet('/products');
}

// In dollars (the API returns decimal strings — sum carefully).
function orderTotal(o) {
  return Number(o?.amounts?.total?.value || 0);
}

function orderUnits(o) {
  return (o?.offers || []).reduce((n, off) => n + (off?.quantity || 1), 0);
}

function orderItems(o) {
  return (o?.offers || []).map((off) => off?.variant?.name).filter(Boolean);
}

// Customer email — what they checked out with.
function orderEmail(o) {
  return o?.email || o?.customer?.email || '—';
}

function inWindow(o, sinceMs, untilMs) {
  const t = new Date(o.createdAt).getTime();
  return t >= sinceMs && t < untilMs;
}

// Sales summary for a window.
export function summarize(orders, sinceMs, untilMs) {
  const win = orders.filter((o) => inWindow(o, sinceMs, untilMs));
  const total = win.reduce((s, o) => s + orderTotal(o), 0);
  const units = win.reduce((s, o) => s + orderUnits(o), 0);

  // Top SKU by units in window.
  const skuUnits = new Map();
  const skuRev = new Map();
  for (const o of win) {
    const r = orderTotal(o);
    for (const off of o.offers || []) {
      const name = off?.variant?.name || off?.product?.name || 'unknown';
      const q = off?.quantity || 1;
      skuUnits.set(name, (skuUnits.get(name) || 0) + q);
      // Revenue per offer: amount.value if present, else split order total
      const offerRev = Number(off?.price?.value || 0);
      skuRev.set(name, (skuRev.get(name) || 0) + offerRev);
    }
  }
  const topByUnits = [...skuUnits.entries()].sort((a, b) => b[1] - a[1])[0];
  const topByRev = [...skuRev.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    orderCount: win.length,
    revenue: total,
    units,
    topByUnits: topByUnits ? { name: topByUnits[0], units: topByUnits[1] } : null,
    topByRev: topByRev ? { name: topByRev[0], revenue: topByRev[1] } : null,
    sample: win.slice(0, 5).map((o) => ({
      friendlyId: o.friendlyId,
      total: orderTotal(o),
      city:
        o?.shipping?.address?.city || o?.billing?.address?.city || '—',
      items: orderItems(o).join(', '),
    })),
  };
}

// Helper for new-order embeds (webhook path).
export function orderEmbed(order, headline = '🛒 New order') {
  const total = orderTotal(order);
  const items = orderItems(order).join(', ') || '—';
  const city =
    order?.shipping?.address?.city || order?.billing?.address?.city || '—';
  const state =
    order?.shipping?.address?.state || order?.billing?.address?.state || '';
  return {
    title: `${headline} · ${order.friendlyId || order.id}`,
    color: 0xff9f1c,
    description: items.slice(0, 1900),
    fields: [
      { name: 'Email', value: orderEmail(order), inline: true },
      { name: 'Total', value: `$${total.toFixed(2)}`, inline: true },
      { name: 'Where', value: `${city}${state ? ', ' + state : ''}`, inline: true },
    ],
    timestamp: order.createdAt || new Date().toISOString(),
    footer: { text: 'Fourthwall' },
  };
}
