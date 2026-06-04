import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { postModLog } from '../mod-log.js';

export const data = new SlashCommandBuilder()
  .setName('kick')
  .setDescription('Kick a member from the server')
  .addUserOption((o) =>
    o.setName('user').setDescription('Member to kick').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason (logged)').setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);

  if (!member) {
    await interaction.reply({
      content: `<@${user.id}> is not in this server.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (!member.kickable) {
    await interaction.reply({
      content:
        `Can't kick <@${user.id}> — they may have a higher role than me, or own the server.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await member.kick(reason || 'No reason provided');
  await postModLog(interaction.client, {
    action: 'KICK',
    target: { id: user.id, tag: user.tag, username: user.username },
    moderator: {
      id: interaction.user.id,
      tag: interaction.user.tag,
      username: interaction.user.username,
    },
    reason,
  });
  await interaction.reply({
    content: `👢 Kicked <@${user.id}>.`,
    allowedMentions: { parse: [] },
  });
}
