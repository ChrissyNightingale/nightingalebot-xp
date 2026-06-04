# NightingaleBot XP

Persistent Discord gateway listener for **Chrissy Nightingale**'s server.
Tracks XP per user, auto-grants level reward roles, posts level-up
announcements, exposes `/rank`, `/leaderboard`, `/give-xp`.

Companion to the cron-based **NightingaleBot** (which handles
music/video/Twitch/merch posts + joins/verified welcomes + reaction roles).

## Scoring

| Event | XP |
|------:|---:|
| Message | 10 |
| Image post | 15 (replaces message grant) |
| Reaction (to reactor) | 5 |
| Per-user cooldown | 30 s |

100 XP per level. Linear.

## Level rewards

| Level | Role |
|------:|------|
| 5  | @Level 5 |
| 10 | @Level 10 |
| 15 | @Level 15 |

Granted once on reach. Never auto-removed.

## Slash commands

- `/rank [user]` — show level + XP + progress bar.
- `/leaderboard` — top 10.
- `/give-xp user amount` — admin only (Manage Server). Negative amount removes XP.

## Discord setup

1. NightingaleBot must have **MESSAGE CONTENT** and **SERVER MEMBERS** privileged intents enabled.
2. Re-invite the bot with the `applications.commands` scope so slash commands register. Use OAuth2 URL Generator with `bot` + `applications.commands`.
3. Bot role must sit **above** Level 5/10/15 roles in the hierarchy so it can grant them.

## Deploy (Fly.io)

```powershell
# from this directory
fly auth login

# create the app (one-time)
fly launch --no-deploy --copy-config --name nightingalebot-xp --region iad

# create the persistent volume for the SQLite DB
fly volumes create xpdata --size 1 --region iad

# inject the bot token
fly secrets set NIGHTINGALE_DISCORD_BOT_TOKEN=<your-bot-token>

# ship it
fly deploy

# watch live logs
fly logs
```

## Local dev

```powershell
$env:NIGHTINGALE_DISCORD_BOT_TOKEN = "<token>"
$env:DB_PATH = "./data/xp.sqlite"
npm install
node src/index.js
```
