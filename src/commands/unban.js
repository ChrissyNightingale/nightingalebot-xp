import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { postModLog } from '../mod-log.js';

export const data = new SlashCommandBuilder()
  .setName('unban')
  .setDescription('Unban a user by ID')
  .addStringOption((o) =>
    o
      .setName('user_id')
      .setDescription('Discord user ID (snowflake)')
      .setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason (logged)').setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction) {
  const userId = interaction.options.getString('user_id').trim();
  const reason = interaction.options.getString('reason');

  if (!/^\d{15,25}$/.test(userId)) {
    await interaction.reply({
      content: 'That doesn\'t look like a valid user ID.',
      ephemeral: true,
    });
    return;
  }

  try {
    await interaction.guild.bans.remove(userId, reason || 'No reason provided');
  } catch (e) {
    await interaction.reply({
      content: `Unban failed: ${e.message}`,
      ephemeral: true,
    });
    return;
  }

  const user = await interaction.client.users.fetch(userId).catch(() => null);
  await postModLog(interaction.client, {
    action: 'UNBAN',
    target: user
      ? { id: user.id, tag: user.tag, username: user.username }
      : { id: userId },
    moderator: {
      id: interaction.user.id,
      tag: interaction.user.tag,
      username: interaction.user.username,
    },
    reason,
  });
  await interaction.reply({
    content: `🔓 Unbanned \`${userId}\`.`,
    allowedMentions: { parse: [] },
  });
}
