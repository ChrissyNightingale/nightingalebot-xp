// NightingaleBot XP — persistent Discord gateway listener. Tracks XP and
// levels, posts level-up announcements in #welcome-channel, and exposes
// /rank, /leaderboard, /give-xp slash commands.

import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes,
} from 'discord.js';
import { CFG } from './config.js';
import messageCreate from './events/messageCreate.js';
import messageReactionAdd from './events/messageReactionAdd.js';
import messageReactionRemove from './events/messageReactionRemove.js';
import * as rank from './commands/rank.js';
import * as leaderboard from './commands/leaderboard.js';
import * as giveXp from './commands/give-xp.js';
import * as rememberBirthday from './commands/remember-birthday.js';
import * as forgetBirthday from './commands/forget-birthday.js';
import * as birthday from './commands/birthday.js';
import * as nextBirthdays from './commands/next-birthdays.js';
import * as setUserBirthday from './commands/set-user-birthday.js';
import * as unsetUserBirthday from './commands/unset-user-birthday.js';
import * as kick from './commands/kick.js';
import * as ban from './commands/ban.js';
import * as unban from './commands/unban.js';
import * as timeoutCmd from './commands/timeout.js';
import * as untimeout from './commands/untimeout.js';
import * as warn from './commands/warn.js';
import * as warnings from './commands/warnings.js';
import * as clearWarnings from './commands/clear-warnings.js';
import * as purge from './commands/purge.js';
import { startBirthdayWatcher } from './birthdays.js';
import { startCronLoop } from './cron-loop.js';

const token = process.env.NIGHTINGALE_DISCORD_BOT_TOKEN;
if (!token) {
  console.error('Missing NIGHTINGALE_DISCORD_BOT_TOKEN env var');
  process.exit(1);
}

const commands = new Collection();
for (const c of [
  rank,
  leaderboard,
  giveXp,
  rememberBirthday,
  forgetBirthday,
  birthday,
  nextBirthdays,
  setUserBirthday,
  unsetUserBirthday,
  kick,
  ban,
  unban,
  timeoutCmd,
  untimeout,
  warn,
  warnings,
  clearWarnings,
  purge,
]) {
  commands.set(c.data.name, c);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
  // Partials so reactions on older messages still fire messageReactionAdd.
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once('clientReady', async (c) => {
  console.log(`logged in as ${c.user.tag} (${c.user.id})`);

  // Guild-scoped registration = instant propagation, no global 1h wait.
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationGuildCommands(c.user.id, CFG.guildId),
      {
        body: [...commands.values()].map((cmd) => cmd.data.toJSON()),
      }
    );
    console.log(
      `slash commands registered for guild ${CFG.guildId} (${commands.size} cmds)`
    );
  } catch (e) {
    console.error(`slash command registration failed: ${e.message}`);
  }

  startBirthdayWatcher(c);

  // Music/video/Twitch/Merch polling + reactive guild checks. Was a GH
  // Actions cron at */30 (cost $0 but 30-min lag). Now in-process every 5
  // min — same cost, 6x tighter detection.
  const cronIntervalMs = Number(process.env.CRON_INTERVAL_MS) || 5 * 60 * 1000;
  startCronLoop(cronIntervalMs);
});

client.on('messageCreate', messageCreate);
client.on('messageReactionAdd', messageReactionAdd);
client.on('messageReactionRemove', messageReactionRemove);

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (e) {
    console.error(`[/${interaction.commandName}] ${e.message}`);
    const replyOpts = { content: `Error: ${e.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOpts).catch(() => {});
    } else {
      await interaction.reply(replyOpts).catch(() => {});
    }
  }
});

client.on('error', (e) => console.error(`client error: ${e.message}`));
process.on('unhandledRejection', (e) =>
  console.error(`unhandledRejection: ${e?.message || e}`)
);

client.login(token);
