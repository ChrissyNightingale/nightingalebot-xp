// SQLite-backed XP store. File lives on the Fly volume mounted at /data so
// state survives restarts and deploys. The DB_PATH env var lets local dev
// point somewhere else.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH || './data/xp.sqlite';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id    TEXT    PRIMARY KEY,
    username   TEXT,
    xp         INTEGER NOT NULL DEFAULT 0,
    level      INTEGER NOT NULL DEFAULT 0,
    last_xp_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);

  CREATE TABLE IF NOT EXISTS birthdays (
    user_id              TEXT PRIMARY KEY,
    month                INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
    day                  INTEGER NOT NULL CHECK(day BETWEEN 1 AND 31),
    year                 INTEGER,
    last_announced_year  INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_birthdays_md ON birthdays(month, day);
`);

const upsert = db.prepare(`
  INSERT INTO users (user_id, username, xp, level, last_xp_at)
  VALUES (@user_id, @username, @xp, @level, @last_xp_at)
  ON CONFLICT(user_id) DO UPDATE SET
    username   = excluded.username,
    xp         = excluded.xp,
    level      = excluded.level,
    last_xp_at = excluded.last_xp_at
`);

const getStmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
const topStmt = db.prepare('SELECT * FROM users ORDER BY xp DESC LIMIT ?');

export function getUser(userId) {
  return (
    getStmt.get(userId) || {
      user_id: userId,
      username: null,
      xp: 0,
      level: 0,
      last_xp_at: 0,
    }
  );
}

export function saveUser(u) {
  upsert.run(u);
}

export function topUsers(limit = 10) {
  return topStmt.all(limit);
}
