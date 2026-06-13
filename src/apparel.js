// Artisan apparel designer. Generates a brand-styled merch mockup (garment +
// chest graphic) as an SVG, rasterizes to PNG via resvg, and posts it to the
// configured Discord channel a few times per day. Template-based + randomized
// — zero external API cost.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { AttachmentBuilder } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_ANTON = path.join(__dirname, '..', 'fonts', 'Anton.ttf');
const FONT_OSWALD = path.join(__dirname, '..', 'fonts', 'Oswald.ttf');

const TZ = 'America/Los_Angeles';
const DROP_HOURS = [9, 14, 19]; // 3x/day PT
const STATE_PATH =
  process.env.APPAREL_STATE_PATH ||
  path.join(
    path.dirname(process.env.CRON_STATE_PATH || '/data/cron-state.json'),
    'apparel-state.json'
  );

const W = 1080;
const H = 1280;

// ---- content pools ----
const TITLES = [
  'SETTING MYSELF ON FIRE',
  'PAPER WALLS',
  'SHATTERED VEIL',
  'INTO THE BLACK',
  "I'LL BE OKAY",
  'SCREAMING SILENCE',
  'THROUGH THE STATIC',
  'SOLITUDE',
];
const PHRASES = [
  'STILL BREATHING',
  'LOUDER THAN SILENCE',
  'BURN BRIGHT',
  'NOT YOUR GHOST',
  'SCREAM IT BACK',
  'EMO NEVER DIES',
  'NIGHTINGALE NATION',
  'BREAK THE QUIET',
];
const SUBS = [
  'ALT · EMO · METALCORE',
  'NIGHTINGALE RECORDS',
  'EST. ST. LOUIS',
  'CHRISSY NIGHTINGALE',
];

// ---- colorways (match real catalog) ----
const COLORWAYS = [
  { name: 'Black', fill: '#1b1b1f', shade: '#111114', dark: true },
  { name: 'Charcoal', fill: '#3a3e45', shade: '#2c2f35', dark: true },
  { name: 'Maroon', fill: '#5a1f2b', shade: '#471823', dark: true },
  { name: 'Cream', fill: '#efe6dc', shade: '#dcd1c2', dark: false },
  { name: 'Pink', fill: '#e87fb0', shade: '#d869a1', dark: false },
  { name: 'White', fill: '#f5f5f5', shade: '#e3e3e3', dark: false },
];
const INK_DARK = ['#ffe6dc', '#ff1a66', '#f4f4f4']; // print on dark garments
const INK_LIGHT = ['#161616', '#c81d25', '#ff1a66']; // print on light garments

const GARMENTS = ['Tee', 'Crewneck', 'Hoodie'];

// ---- garment silhouette (shared body) ----
const BODY =
  'M398 250 C376 236 332 233 308 243 L226 312 C214 323 215 343 229 353 L300 312 L330 338 L330 980 C330 994 341 1005 355 1005 L725 1005 C739 1005 750 994 750 980 L750 338 L780 312 L851 353 C865 343 866 323 854 312 L772 243 C748 233 704 236 682 250 C660 296 606 320 540 320 C474 320 420 296 398 250 Z';
const HOOD =
  'M396 300 C382 196 698 196 684 300 C656 250 600 240 540 240 C480 240 424 250 396 300 Z';

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Split a phrase into <=2 lines near the middle.
function twoLines(text) {
  const words = text.split(' ');
  if (words.length === 1) return [text];
  let best = 1,
    bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    const b = words.slice(i).join(' ').length;
    if (Math.abs(a - b) < bestDiff) {
      bestDiff = Math.abs(a - b);
      best = i;
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

// Fit font-size so a line fits within maxW (Anton ~0.46 avg char width).
function fitSize(line, maxW, cap) {
  const est = (maxW / Math.max(1, line.length)) / 0.5;
  return Math.min(cap, Math.max(28, est));
}

// ---- chest graphic templates ----
// Each returns SVG centered around chest (cx=540, cy~560), within ~360px wide.
function graphicStacked(ink, accent) {
  const cx = 540;
  return {
    name: 'Stacked Wordmark',
    svg: `
      <text x="${cx}" y="500" text-anchor="middle" font-family="Anton" font-size="78" fill="${ink}" letter-spacing="2">CHRISSY</text>
      <rect x="${cx - 150}" y="516" width="300" height="6" fill="${accent}"/>
      <text x="${cx}" y="600" text-anchor="middle" font-family="Anton" font-size="64" fill="${ink}" letter-spacing="1">NIGHTINGALE</text>
      <text x="${cx}" y="640" text-anchor="middle" font-family="Oswald" font-size="22" fill="${accent}" letter-spacing="6">${esc(pick(SUBS))}</text>`,
  };
}
function graphicTitle(ink, accent) {
  const cx = 540;
  const title = pick(TITLES);
  const lines = twoLines(title);
  let y = lines.length > 1 ? 480 : 540;
  let body = '';
  for (const l of lines) {
    const fs = fitSize(l, 380, 92);
    body += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${ink}">${esc(l)}</text>`;
    y += fs + 4;
  }
  body += `<rect x="${cx - 120}" y="${y - 26}" width="240" height="5" fill="${accent}"/>`;
  body += `<text x="${cx}" y="${y + 6}" text-anchor="middle" font-family="Oswald" font-size="20" fill="${accent}" letter-spacing="5">CHRISSY NIGHTINGALE</text>`;
  return { name: `"${title}" Track Tee`, svg: body };
}
function graphicEmblem(ink, accent) {
  const cx = 540,
    cy = 560,
    r = 132;
  // simple flame motif inside a ringed badge
  const flame = `M${cx} ${cy - 34} C${cx + 26} ${cy - 6} ${cx + 16} ${cy + 26} ${cx} ${cy + 40} C${cx - 16} ${cy + 26} ${cx - 26} ${cy - 6} ${cx} ${cy - 34} Z`;
  return {
    name: 'Foundry Emblem',
    svg: `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-width="5"/>
      <circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="none" stroke="${accent}" stroke-width="2"/>
      <path d="${flame}" fill="${accent}"/>
      <text x="${cx}" y="${cy - 58}" text-anchor="middle" font-family="Oswald" font-size="20" fill="${ink}" letter-spacing="4">CHRISSY</text>
      <text x="${cx}" y="${cy + 86}" text-anchor="middle" font-family="Anton" font-size="34" fill="${ink}">NIGHTINGALE</text>`,
  };
}
function graphicPhrase(ink, accent) {
  const cx = 540;
  const phrase = pick(PHRASES);
  const lines = twoLines(phrase);
  let y = lines.length > 1 ? 500 : 560;
  let body = `<rect x="${cx - 60}" y="${y - 70}" width="120" height="5" fill="${accent}"/>`;
  for (const l of lines) {
    const fs = fitSize(l, 400, 96);
    body += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="${ink}">${esc(l)}</text>`;
    y += fs + 2;
  }
  body += `<text x="${cx}" y="${y + 4}" text-anchor="middle" font-family="Oswald" font-size="18" fill="${accent}" letter-spacing="6">CHRISSY NIGHTINGALE</text>`;
  return { name: 'Statement Print', svg: body };
}
function graphicLyric(ink, accent) {
  const cx = 540;
  const phrase = pick(PHRASES);
  const lines = twoLines(phrase);
  let y = lines.length > 1 ? 500 : 560;
  let body = `<text x="${cx - 158}" y="${y - 50}" text-anchor="middle" font-family="Anton" font-size="120" fill="${accent}" opacity="0.85">&#8220;</text>`;
  for (const l of lines) {
    const fs = fitSize(l, 360, 84);
    body += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Oswald" font-size="${fs}" font-style="italic" fill="${ink}" font-weight="600">${esc(l)}</text>`;
    y += fs + 4;
  }
  body += `<text x="${cx + 158}" y="${y + 6}" text-anchor="middle" font-family="Anton" font-size="120" fill="${accent}" opacity="0.85">&#8221;</text>`;
  body += `<text x="${cx}" y="${y + 34}" text-anchor="middle" font-family="Oswald" font-size="18" fill="${accent}" letter-spacing="6">CHRISSY NIGHTINGALE</text>`;
  return { name: 'Lyric Strip', svg: body };
}
function graphicTour(ink, accent) {
  const cx = 540;
  // shuffle a few titles as a "tour" / collection list
  const stops = [...TITLES].sort(() => Math.random() - 0.5).slice(0, 5);
  let body = `<text x="${cx}" y="450" text-anchor="middle" font-family="Anton" font-size="62" fill="${ink}">NIGHTINGALE</text>`;
  body += `<rect x="${cx - 170}" y="466" width="340" height="4" fill="${accent}"/>`;
  body += `<text x="${cx}" y="496" text-anchor="middle" font-family="Oswald" font-size="20" fill="${accent}" letter-spacing="6">THE COLLECTION</text>`;
  let y = 540;
  for (const s of stops) {
    body += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Oswald" font-size="22" fill="${ink}" letter-spacing="2">${esc(s)}</text>`;
    y += 30;
  }
  return { name: 'Collection Back-Print', svg: body };
}
function graphicOutline(ink, accent) {
  const cx = 540;
  const title = pick(TITLES);
  const lines = twoLines(title);
  let y = lines.length > 1 ? 490 : 550;
  let body = '';
  for (const l of lines) {
    const fs = fitSize(l, 380, 96);
    body += `<text x="${cx}" y="${y}" text-anchor="middle" font-family="Anton" font-size="${fs}" fill="none" stroke="${ink}" stroke-width="2.5">${esc(l)}</text>`;
    y += fs + 2;
  }
  body += `<circle cx="${cx}" cy="${y + 14}" r="5" fill="${accent}"/>`;
  body += `<text x="${cx}" y="${y + 44}" text-anchor="middle" font-family="Oswald" font-size="18" fill="${accent}" letter-spacing="5">CHRISSY NIGHTINGALE</text>`;
  return { name: 'Outline Title', svg: body };
}
const GRAPHICS = [
  graphicStacked,
  graphicTitle,
  graphicEmblem,
  graphicPhrase,
  graphicLyric,
  graphicTour,
  graphicOutline,
];

// ---- distress overlay (optional) ----
function distress(ink) {
  let s = '';
  const n = 60;
  for (let i = 0; i < n; i++) {
    const x = 360 + Math.random() * 360;
    const y = 430 + Math.random() * 260;
    const w = 6 + Math.random() * 26;
    if (Math.random() < 0.5)
      s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="2" fill="${ink}" opacity="0.5"/>`;
    else
      s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.6 + Math.random() * 1.6).toFixed(1)}" fill="${ink}" opacity="0.5"/>`;
  }
  return `<g style="mix-blend-mode:overlay">${s}</g>`;
}

// ---- compose one design ----
export function buildDesign() {
  const cw = pick(COLORWAYS);
  const garment = pick(GARMENTS);
  const inks = cw.dark ? INK_DARK : INK_LIGHT;
  const ink = inks[0];
  const accent = pick(inks.slice(1).concat(['#ff1a66']));
  const g = pick(GRAPHICS)(ink, accent);
  const useDistress = Math.random() < 0.55;

  // garment-specific overlays
  let overlays = '';
  if (garment === 'Hoodie') {
    overlays += `<path d="${HOOD}" fill="${cw.shade}"/>`;
    overlays += `<rect x="430" y="780" width="220" height="150" rx="14" fill="${cw.shade}"/>`;
    overlays += `<line x1="500" y1="320" x2="500" y2="470" stroke="${cw.shade}" stroke-width="7" stroke-linecap="round"/><line x1="580" y1="320" x2="580" y2="470" stroke="${cw.shade}" stroke-width="7" stroke-linecap="round"/>`;
    overlays += `<circle cx="500" cy="474" r="6" fill="${cw.shade}"/><circle cx="580" cy="474" r="6" fill="${cw.shade}"/>`;
  } else if (garment === 'Crewneck') {
    overlays += `<path d="M398 250 C474 296 606 296 682 250" fill="none" stroke="${cw.shade}" stroke-width="14" stroke-linecap="round"/>`;
    overlays += `<rect x="330" y="975" width="420" height="14" fill="${cw.shade}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="bg" cx="50%" cy="38%" r="75%">
        <stop offset="0%" stop-color="#15151c"/><stop offset="100%" stop-color="#08080d"/>
      </radialGradient>
      <linearGradient id="fold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="55%" stop-color="#ffffff" stop-opacity="0"/><stop offset="100%" stop-color="#000000" stop-opacity="0.18"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <!-- header -->
    <text x="${W / 2}" y="120" text-anchor="middle" font-family="Anton" font-size="46" fill="#ff1a66" letter-spacing="6">DAILY DESIGN DROP</text>
    <text x="${W / 2}" y="156" text-anchor="middle" font-family="Oswald" font-size="20" fill="#8a8f9c" letter-spacing="4">CHRISSY NIGHTINGALE · THE NIGHTINGALE WORKS</text>
    <!-- garment -->
    <path d="${BODY}" fill="${cw.fill}"/>
    ${overlays}
    <path d="${BODY}" fill="url(#fold)"/>
    <path d="${BODY}" fill="none" stroke="#000000" stroke-opacity="0.25" stroke-width="2"/>
    <!-- chest print -->
    ${g.svg}
    ${useDistress ? distress(ink) : ''}
    <!-- footer chip -->
    <rect x="${W / 2 - 250}" y="1110" width="500" height="56" rx="28" fill="#14141c" stroke="#2a2a3a"/>
    <text x="${W / 2}" y="1147" text-anchor="middle" font-family="Oswald" font-size="22" fill="#cdd6e4">${esc(cw.name)} ${esc(garment)} · ${esc(g.name)}</text>
  </svg>`;

  return {
    svg,
    meta: { colorway: cw.name, garment, design: g.name, distress: useDistress },
  };
}

export function renderPng(svg) {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: {
      fontFiles: [FONT_ANTON, FONT_OSWALD],
      loadSystemFonts: false,
      defaultFontFamily: 'Anton',
    },
    background: 'rgba(0,0,0,0)',
  });
  return r.render().asPng();
}

export async function postApparelNow(client) {
  const channelId = process.env.APPAREL_CHANNEL_ID;
  if (!channelId) {
    console.error('[apparel] APPAREL_CHANNEL_ID not set');
    return false;
  }
  const { svg, meta } = buildDesign();
  const png = renderPng(svg);
  const file = new AttachmentBuilder(Buffer.from(png), {
    name: `nightingale-${meta.garment.toLowerCase()}-${Date.now()}.png`,
  });
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch) {
    console.error(`[apparel] could not fetch channel ${channelId}`);
    return false;
  }
  await ch.send({
    content: `🧵 **Daily design drop** — *${meta.design}* on a **${meta.colorway} ${meta.garment}**`,
    files: [file],
    allowedMentions: { parse: [] },
  });
  console.log(`[apparel] posted ${meta.colorway} ${meta.garment} / ${meta.design}`);
  return true;
}

// ---- scheduler (3x/day PT, persisted) ----
function tzParts(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t) => Number(p.find((x) => x.type === t).value);
  return { year: g('year'), month: g('month'), day: g('day'), hour: g('hour') };
}
async function loadLast() {
  try {
    return JSON.parse(await fs.readFile(STATE_PATH, 'utf8'))?.last || null;
  } catch {
    return null;
  }
}
async function saveLast(key) {
  try {
    await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify({ last: key }) + '\n');
  } catch (e) {
    console.error(`[apparel] persist: ${e.message}`);
  }
}

let lastKey = null;
export function startApparelDesigner(client) {
  if (!process.env.APPAREL_CHANNEL_ID) {
    console.log('[apparel] disabled (no APPAREL_CHANNEL_ID)');
    return;
  }
  loadLast().then((k) => {
    if (k) lastKey = k;
  });
  const tick = async () => {
    try {
      const t = tzParts();
      if (!DROP_HOURS.includes(t.hour)) return;
      const key = `${t.year}-${t.month}-${t.day}-${t.hour}`;
      const onDisk = await loadLast();
      if (lastKey === key || onDisk === key) {
        if (onDisk) lastKey = onDisk;
        return;
      }
      lastKey = key;
      await saveLast(key);
      await postApparelNow(client);
    } catch (e) {
      console.error(`[apparel] tick: ${e.message}`);
    }
  };
  setInterval(tick, 60_000);
  console.log(`[apparel] designer running (tz=${TZ}, drops at ${DROP_HOURS.join(', ')})`);
}
