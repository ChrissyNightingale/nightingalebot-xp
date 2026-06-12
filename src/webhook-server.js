// Minimal HTTP server for inbound Fourthwall webhooks. Receives order events,
// renders an embed, posts to #sales. Listens on PORT (Fly maps the internal
// service to the public hostname nightingalebot-xp.fly.dev).

import http from 'node:http';
import { orderEmbed, fetchOrderById } from './fourthwall.js';
import { SALES_CHANNEL_ID, postRecap } from './sales-recap.js';
import { postMonthlyReportNow } from './monthly-report.js';
import { sendOrderEmail } from './mail.js';

const PORT = Number(process.env.PORT) || 8080;

function readJson(req, max = 1_000_000) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const chunks = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > max) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function pickHeadline(eventType, statusHint) {
  if (!eventType) return '🛒 Order event';
  if (/created|placed/i.test(eventType)) return '🛒 New order';
  if (/refund/i.test(eventType)) return '↩️ Order refunded';
  if (/canceled|cancelled/i.test(eventType)) return '❌ Order canceled';
  // ORDER_UPDATED — disambiguate by fulfillment status if we have it.
  if (/updated/i.test(eventType)) {
    const s = String(statusHint || '').toUpperCase();
    if (/SHIP/.test(s)) return '📦 Order shipped';
    if (/DELIVER/.test(s)) return '✅ Order delivered';
    if (/PROCESS/.test(s)) return '⚙️ Order processing';
    if (/CANCEL/.test(s)) return '❌ Order canceled';
    if (/RETURN/.test(s)) return '↩️ Order returned';
    return '🔄 Order updated';
  }
  if (/fulfilled|shipped/i.test(eventType)) return '📦 Order shipped';
  return `🛒 ${eventType}`;
}

// Fallback: fetch the full order by UUID when the webhook payload is sparse
// or missing friendlyId. /open-api/v1.0/order/{uuid} is the only working
// single-order lookup on the open API surface.
async function hydrateOrder(rawOrder, eventType) {
  if (!rawOrder?.id) return rawOrder;
  try {
    return await fetchOrderById(rawOrder.id);
  } catch (e) {
    console.warn(`[webhook] hydrate failed: ${e.message}`);
    return rawOrder;
  }
}

export function startWebhookServer(client) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    // Admin-triggered manual fire of the daily recap or monthly report.
    // Gated by ADMIN_KEY Bearer header.
    if (req.method === 'POST' && (req.url === '/admin/recap' || req.url === '/admin/monthly')) {
      const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!process.env.ADMIN_KEY || provided !== process.env.ADMIN_KEY) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }
      try {
        if (req.url === '/admin/recap') {
          await postRecap(client);
          console.log('[admin] daily recap fired');
        } else {
          await postMonthlyReportNow(client);
          console.log('[admin] monthly report fired');
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        console.error(`[admin] ${req.url} failed: ${e.message}`);
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/fw-webhook') {
      try {
        const payload = await readJson(req);
        // Fourthwall payload shape: { type, data: { ... order ... } } — exact
        // fields vary by event. We tolerate both top-level and nested order.
        const eventType = payload?.type || payload?.event || 'unknown';
        // Real Fourthwall webhook shape (captured 2026-06-12):
        //   { id: "weve_...", webhookId, shopId, type, apiVersion,
        //     createdAt, data: { order: { ...full order... } } }
        // The full order rides along — no API hydration needed in the
        // common case. Keep hydrate as a fallback for sparse payloads.
        const raw =
          payload?.data?.order || payload?.data || payload?.order || payload;
        // Use the inline order when it's complete (amounts + friendlyId);
        // otherwise hydrate by UUID to fill the gaps.
        const isComplete = (raw?.amounts || raw?.offers) && raw?.friendlyId;
        const order = isComplete ? raw : await hydrateOrder(raw, eventType);
        const statusHint =
          order?.status ||
          order?.fulfillment?.status ||
          raw?.status ||
          raw?.fulfillment?.status;
        const embed = orderEmbed(order, pickHeadline(eventType, statusHint));

        const ch = await client.channels
          .fetch(SALES_CHANNEL_ID)
          .catch(() => null);
        if (ch) {
          await ch
            .send({ embeds: [embed], allowedMentions: { parse: [] } })
            .catch((e) => console.error(`[webhook] post failed: ${e.message}`));
        }

        // Also email the sales + merch distribution list on new orders.
        // Skip non-order events (e.g., subscription/donation) and updates
        // to existing orders — we only want the first placement to ping.
        if (/placed|created/i.test(eventType)) {
          sendOrderEmail(order, pickHeadline(eventType))
            .then((info) =>
              console.log(`[webhook] email sent ${info.messageId || ''}`)
            )
            .catch((e) =>
              console.error(`[webhook] email failed: ${e.message}`)
            );
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        console.log(`[webhook] ${eventType} -> #sales`);
      } catch (e) {
        console.error(`[webhook] parse error: ${e.message}`);
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[webhook] HTTP listening on :${PORT}`);
  });
  return server;
}
