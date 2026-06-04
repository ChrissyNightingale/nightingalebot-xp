import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { postModLog } from '../mod-log.js';

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user from the server')
  .addUserOption((o) =>
    o.setName('user').setDescription('User to ban').setRequired(true)
  )
  .addIntegerOption((o) =>
    o
      .setName('delete_days')
      .setDescription('Delete this many days of their messages (0-7)')
      .setMinValue(0)
      .setMaxValue(7)
      .setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason (logged)').setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
  const reason = interaction.options.getString('reason');

  try {
    await interaction.guild.bans.create(user.id, {
      reason: reason || 'No reason provided',
      deleteMessageSeconds: deleteDays * 86400,
    });
  } catch (e) {
    await interaction.reply({
      content: `Ban failed: ${e.message}`,
      ephemeral: true,
    });
    return;
  }

  await postModLog(interaction.client, {
    action: 'BAN',
    target: { id: user.id, tag: user.tag, username: user.username },
    moderator: {
      id: interaction.user.id,
      tag: interaction.user.tag,
      username: interaction.user.username,
    },
    reason,
    extra: deleteDays ? { 'Message purge': `${deleteDays} day(s)` } : undefined,
  });
  await interaction.reply({
    content: `🔨 Banned <@${user.id}>.`,
    allowedMentions: { parse: [] },
  });
}
