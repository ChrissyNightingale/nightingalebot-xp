// Posts a standardized mod-action embed to the configured mod-log channel.
// All commands + the auto-mod spam detector funnel through this so the audit
// trail is consistent.

import { EmbedBuilder } from 'discord.js';
import { CFG } from './config.js';

// Action -> hex color. Severity loosely encoded by hue.
const COLORS = {
  WARN: 0xffd166,
  TIMEOUT: 0xff9f1c,
  UNTIMEOUT: 0x8ed081,
  KICK: 0xff6b6b,
  BAN: 0xc81d25,
  UNBAN: 0x4daa57,
  PURGE: 0x6c757d,
  AUTO_SPAM: 0xff4081,
  CLEAR_WARNINGS: 0x9caec5,
};

export async function postModLog(client, {
  action,
  target,
  moderator,
  reason,
  extra,
}) {
  if (!CFG.modLogChannelId) return;
  const ch = await client.channels
    .fetch(CFG.modLogChannelId)
    .catch(() => null);
  if (!ch) {
    console.error(
      `[mod-log] could not fetch mod-log channel ${CFG.modLogChannelId}`
    );
    return;
  }

  const targetLine = target
    ? `<@${target.id}> · \`${target.tag || target.username || target.id}\` · \`${target.id}\``
    : '—';
  const modLine = moderator
    ? `<@${moderator.id}> · \`${moderator.tag || moderator.username || moderator.id}\``
    : '_(system)_';

  const fields = [
    { name: 'User', value: targetLine, inline: false },
    { name: 'Moderator', value: modLine, inline: false },
    {
      name: 'Reason',
      value: reason ? String(reason).slice(0, 1000) : '_No reason provided_',
      inline: false,
    },
  ];
  if (extra) {
    for (const [name, value] of Object.entries(extra)) {
      fields.push({ name, value: String(value).slice(0, 1000), inline: true });
    }
  }

  const emb = new EmbedBuilder()
    .setTitle(`🛡️ ${action.replace(/_/g, ' ')}`)
    .setColor(COLORS[action] ?? 0x808080)
    .addFields(fields)
    .setTimestamp(new Date());

  await ch
    .send({ embeds: [emb], allowedMentions: { parse: [] } })
    .catch((e) => console.error(`[mod-log] post failed: ${e.message}`));
}

// Parse "10m", "1h", "30", "2d" into milliseconds. Returns null on garbage.
// Defaults bare numbers to minutes — matches how mods usually type durations.
export function parseDuration(input) {
  if (typeof input !== 'string') return null;
  const m = input.trim().match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day|days)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] || 'm').toLowerCase();
  const ms =
    unit.startsWith('s')
      ? n * 1_000
      : unit.startsWith('h')
      ? n * 60 * 60 * 1_000
      : unit.startsWith('d')
      ? n * 24 * 60 * 60 * 1_000
      : n * 60 * 1_000; // minutes default
  return ms;
}

export function humanDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
