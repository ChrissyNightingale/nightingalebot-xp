// Outbound transactional mail via Gmail SMTP using an App Password.
//
// Required env:
//   SMTP_USER  — full Gmail address (chrissy@chrissynightingale.com)
//   SMTP_PASS  — 16-char Google App Password
//   SMTP_FROM  — From address (usually same as SMTP_USER)

import nodemailer from 'nodemailer';

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error('Missing SMTP_USER / SMTP_PASS');
  }
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass },
  });
  return transporter;
}

// Distribution list for order notifications.
const ORDER_RECIPIENTS = [
  'sales@chrissynightingale.com',
  'merch@chrissynightingale.com',
];

function orderTotal(o) {
  return Number(o?.amounts?.total?.value || 0);
}

function fmtAddress(addr) {
  if (!addr) return '—';
  const lines = [
    [addr.firstName, addr.lastName].filter(Boolean).join(' '),
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.zipCode].filter(Boolean).join(', '),
    addr.country,
  ].filter(Boolean);
  return lines.join('\n');
}

function buildOrderHtml(order, headline) {
  const fid = order.friendlyId || order.id || '—';
  const total = orderTotal(order).toFixed(2);
  const items = (order.offers || [])
    .map((off) => {
      const name = off?.variant?.name || off?.product?.name || 'item';
      const qty = off?.quantity || 1;
      const price = Number(off?.price?.value || 0).toFixed(2);
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${escapeHtml(
        name
      )}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${qty}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${price}</td></tr>`;
    })
    .join('');
  const shipping = order?.shipping?.address;
  const email = order?.email || order?.customer?.email || '—';
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;color:#111;max-width:640px;margin:0 auto;padding:24px">
  <h1 style="color:#ff1a66;margin:0 0 12px">${escapeHtml(headline)}</h1>
  <p style="margin:0 0 16px;color:#555">Order <code style="background:#f5f5f5;padding:2px 6px;border-radius:4px">${escapeHtml(
    fid
  )}</code> · ${escapeHtml(new Date(order.createdAt || Date.now()).toLocaleString('en-US'))}</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;background:#fafafa">
    <thead><tr style="background:#f0f0f0"><th style="padding:8px 12px;text-align:left">Item</th><th style="padding:8px 12px">Qty</th><th style="padding:8px 12px;text-align:right">Price</th></tr></thead>
    <tbody>${items}</tbody>
    <tfoot><tr><td colspan="2" style="padding:8px 12px;text-align:right;font-weight:bold">Total</td><td style="padding:8px 12px;text-align:right;font-weight:bold">$${total}</td></tr></tfoot>
  </table>

  <h3 style="margin:16px 0 4px">Customer</h3>
  <p style="margin:0;color:#555">${escapeHtml(email)}</p>

  <h3 style="margin:16px 0 4px">Ship to</h3>
  <pre style="white-space:pre-wrap;background:#fafafa;padding:12px;border-radius:6px;margin:0;font-family:inherit">${escapeHtml(
    fmtAddress(shipping)
  )}</pre>

  <p style="margin-top:24px;color:#aaa;font-size:12px">Auto-sent by NightingaleBot.</p>
</body></html>`;
}

function buildOrderText(order, headline) {
  const fid = order.friendlyId || order.id || '—';
  const total = orderTotal(order).toFixed(2);
  const items = (order.offers || [])
    .map((off) => {
      const name = off?.variant?.name || off?.product?.name || 'item';
      const qty = off?.quantity || 1;
      const price = Number(off?.price?.value || 0).toFixed(2);
      return `  ${name} x${qty} — $${price}`;
    })
    .join('\n');
  const shipping = order?.shipping?.address;
  return [
    headline,
    '',
    `Order: ${fid}`,
    `Placed: ${new Date(order.createdAt || Date.now()).toLocaleString('en-US')}`,
    `Customer: ${order?.email || order?.customer?.email || '—'}`,
    '',
    'Items:',
    items,
    '',
    `Total: $${total}`,
    '',
    'Ship to:',
    fmtAddress(shipping),
  ].join('\n');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Public: send the order notification to the standing distribution list.
// Returns the SMTP response or throws.
export async function sendOrderEmail(order, headline) {
  const t = getTransporter();
  const fid = order.friendlyId || order.id || 'unknown';
  const subject = `${headline} · ${fid} · $${orderTotal(order).toFixed(2)}`;
  return t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: ORDER_RECIPIENTS.join(', '),
    subject,
    text: buildOrderText(order, headline),
    html: buildOrderHtml(order, headline),
  });
}

export { ORDER_RECIPIENTS };
