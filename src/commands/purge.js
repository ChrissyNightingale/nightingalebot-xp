import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { postModLog } from '../mod-log.js';

export const data = new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Bulk-delete the most recent N messages in this channel')
  .addIntegerOption((o) =>
    o
      .setName('count')
      .setDescription('How many messages (1-100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true)
  )
  .addUserOption((o) =>
    o
      .setName('user')
      .setDescription('Only delete messages from this user')
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
  const count = interaction.options.getInteger('count');
  const user = interaction.options.getUser('user');
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      content: 'Use this in a regular text channel.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // Fetch a larger window when filtering by user so we have enough candidates.
  const fetchN = user ? Math.min(100, count * 4) : count;
  const msgs = await channel.messages.fetch({ limit: fetchN });
  const filtered = user
    ? [...msgs.values()].filter((m) => m.author.id === user.id).slice(0, count)
    : [...msgs.values()].slice(0, count);

  if (!filtered.length) {
    await interaction.editReply('No matching messages found.');
    return;
  }

  // bulkDelete fails on messages > 14 days; pass `true` to filter those out.
  const deleted = await channel.bulkDelete(filtered, true).catch((e) => {
    console.error(`[purge] bulkDelete: ${e.message}`);
    return null;
  });

  if (!deleted) {
    await interaction.editReply(
      'Bulk delete failed (messages too old?). Discord can\'t bulk-delete anything older than 14 days.'
    );
    return;
  }

  await postModLog(interaction.client, {
    action: 'PURGE',
    target: user
      ? { id: user.id, tag: user.tag, username: user.username }
      : null,
    moderator: {
      id: interaction.user.id,
      tag: interaction.user.tag,
      username: interaction.user.username,
    },
    reason: null,
    extra: {
      Channel: `<#${channel.id}>`,
      Deleted: `${deleted.size}`,
    },
  });
  await interaction.editReply(`🧹 Deleted **${deleted.size}** message(s).`);
}
