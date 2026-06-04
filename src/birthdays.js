// Birthday store + announcement loop. Storage lives in the same SQLite file
// as the XP tables. Announcements fire from a 60s interval that checks the
// local date in CFG.birthdayTz and posts to #general for each match it hasn't
// yet announced this calendar year.

import Database from 'better-sqlite3';
import { CFG } from './config.js';

// Re-open the same DB the rest of the app uses. better-sqlite3 is safe to
// open multiple times against one file thanks to WAL.
const dbPath = process.env.DB_PATH || './data/xp.sqlite';
const db = new Database(dbPath);

const upsert = db.prepare(`
  INSERT INTO birthdays (user_id, month, day, year, last_announced_year)
  VALUES (@user_id, @month, @day, @year, 0)
  ON CONFLICT(user_id) DO UPDATE SET
    month = excluded.month,
    day   = excluded.day,
    year  = excluded.year
`);

const remove = db.prepare('DELETE FROM birthdays WHERE user_id = ?');
const getStmt = db.prepare('SELECT * FROM birthdays WHERE user_id = ?');
const allStmt = db.prepare('SELECT * FROM birthdays');
const todayStmt = db.prepare(
  'SELECT * FROM birthdays WHERE month = ? AND day = ? AND last_announced_year != ?'
);
const markStmt = db.prepare(
  'UPDATE birthdays SET last_announced_year = ? WHERE user_id = ?'
);

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isValidDate(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > DAYS_IN_MONTH[month - 1]) return false;
  return true;
}

export function setBirthday(userId, month, day, year = null) {
  upsert.run({ user_id: userId, month, day, year });
}

export function removeBirthday(userId) {
  remove.run(userId);
}

export function getBirthday(userId) {
  return getStmt.get(userId) || null;
}

export function allBirthdays() {
  return allStmt.all();
}

// Returns today's date as { year, month, day } in the configured time zone.
export function todayInTz(tz = CFG.birthdayTz, ref = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(ref);
  const pick = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

// Number of days from `from` until next occurrence of {month, day}. 0 if
// today; otherwise positive integer < 366. Handles wrap-around to next year.
export function daysUntil(month, day, from = todayInTz()) {
  const cur = new Date(Date.UTC(from.year, from.month - 1, from.day));
  let next = new Date(Date.UTC(from.year, month - 1, day));
  if (next < cur) next = new Date(Date.UTC(from.year + 1, month - 1, day));
  return Math.round((next - cur) / 86_400_000);
}

export function upcomingBirthdays(limit = 10) {
  const t = todayInTz();
  return allBirthdays()
    .map((b) => ({ ...b, daysAway: daysUntil(b.month, b.day, t) }))
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, limit);
}

// Helpers for the watcher loop.
export function birthdaysDueToday() {
  const t = todayInTz();
  // Feb 29 born + non-leap year: also fire on Feb 28 so they still get one.
  const matches = todayStmt.all(t.month, t.day, t.year);
  const isLeap =
    (t.year % 4 === 0 && t.year % 100 !== 0) || t.year % 400 === 0;
  if (t.month === 2 && t.day === 28 && !isLeap) {
    matches.push(...todayStmt.all(2, 29, t.year));
  }
  return matches;
}

export function markAnnounced(userId, year) {
  markStmt.run(year, userId);
}

export function formatDate(b) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const suffix = (d) => {
    if (d >= 11 && d <= 13) return 'th';
    return ({ 1: 'st', 2: 'nd', 3: 'rd' })[d % 10] || 'th';
  };
  return `${months[b.month - 1]} ${b.day}${suffix(b.day)}` +
    (b.year ? `, ${b.year}` : '');
}

// Polls every minute. When a date crosses local midnight, any matching
// birthdays get a Happy Birthday post in #general.
export function startBirthdayWatcher(client) {
  const tick = async () => {
    const due = birthdaysDueToday();
    if (!due.length) return;
    const ch = await client.channels
      .fetch(CFG.generalChannelId)
      .catch(() => null);
    if (!ch) {
      console.error(`[birthdays] could not fetch #general (${CFG.generalChannelId})`);
      return;
    }
    const t = todayInTz();
    for (const b of due) {
      try {
        await ch.send({
          content: `🎂 Happy Birthday <@${b.user_id}>! 🎉`,
          allowedMentions: { users: [b.user_id] },
        });
        markAnnounced(b.user_id, t.year);
        console.log(`[birthdays] announced ${b.user_id}`);
      } catch (e) {
        console.error(`[birthdays] post failed for ${b.user_id}: ${e.message}`);
      }
    }
  };
  // Run once on boot (catches missed days if the bot was down), then on a
  // 60s interval.
  tick().catch((e) => console.error(`[birthdays] tick: ${e.message}`));
  setInterval(
    () =>
      tick().catch((e) => console.error(`[birthdays] tick: ${e.message}`)),
    60_000
  );
  console.log(`[birthdays] watcher running (tz=${CFG.birthdayTz})`);
}
