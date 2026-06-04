import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { postModLog } from '../mod-log.js';

export const data = new SlashCommandBuilder()
  .setName('untimeout')
  .setDescription('Clear a member\'s timeout early')
  .addUserOption((o) =>
    o.setName('user').setDescription('Member to release').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason (logged)').setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

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
  if (!member.isCommunicationDisabled()) {
    await interaction.reply({
      content: `<@${user.id}> is not currently timed out.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await member.timeout(null, reason || 'No reason provided');
  await postModLog(interaction.client, {
    action: 'UNTIMEOUT',
    target: { id: user.id, tag: user.tag, username: user.username },
    moderator: {
      id: interaction.user.id,
      tag: interaction.user.tag,
      username: interaction.user.username,
    },
    reason,
  });
  await interaction.reply({
    content: `🔓 Cleared timeout on <@${user.id}>.`,
    allowedMentions: { parse: [] },
  });
}
