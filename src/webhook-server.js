// Minimal HTTP server for inbound Fourthwall webhooks. Receives order events,
// renders an embed, posts to #sales. Listens on PORT (Fly maps the internal
// service to the public hostname nightingalebot-xp.fly.dev).

import http from 'node:http';
import { orderEmbed } from './fourthwall.js';
import { SALES_CHANNEL_ID } from './sales-recap.js';
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

function pickHeadline(eventType) {
  if (!eventType) return '🛒 Order event';
  if (/created|placed/i.test(eventType)) return '🛒 New order';
  if (/fulfilled|shipped/i.test(eventType)) return '📦 Order shipped';
  if (/refund/i.test(eventType)) return '↩️ Order refunded';
  if (/canceled|cancelled/i.test(eventType)) return '❌ Order canceled';
  return `🛒 ${eventType}`;
}

export function startWebhookServer(client) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (req.method === 'POST' && req.url === '/fw-webhook') {
      try {
        const payload = await readJson(req);
        // Fourthwall payload shape: { type, data: { ... order ... } } — exact
        // fields vary by event. We tolerate both top-level and nested order.
        const eventType = payload?.type || payload?.event || 'unknown';
        const order = payload?.data || payload?.order || payload;
        const embed = orderEmbed(order, pickHeadline(eventType));

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
