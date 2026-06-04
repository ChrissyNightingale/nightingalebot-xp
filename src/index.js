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
import * as rank from './commands/rank.js';
import * as leaderboard from './commands/leaderboard.js';
import * as giveXp from './commands/give-xp.js';

const token = process.env.NIGHTINGALE_DISCORD_BOT_TOKEN;
if (!token) {
  console.error('Missing NIGHTINGALE_DISCORD_BOT_TOKEN env var');
  process.exit(1);
}

const commands = new Collection();
for (const c of [rank, leaderboard, giveXp]) {
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
        body: [
          rank.data.toJSON(),
          leaderboard.data.toJSON(),
          giveXp.data.toJSON(),
        ],
      }
    );
    console.log(`slash commands registered for guild ${CFG.guildId}`);
  } catch (e) {
    console.error(`slash command registration failed: ${e.message}`);
  }
});

client.on('messageCreate', messageCreate);
client.on('messageReactionAdd', messageReactionAdd);

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
