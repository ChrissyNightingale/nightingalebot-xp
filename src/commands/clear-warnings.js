import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { postModLog } from '../mod-log.js';
import { clearWarnings, warningCount } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('clear-warnings')
  .setDescription('Wipe all warnings for a member')
  .addUserOption((o) =>
    o.setName('user').setDescription('Member to clear').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason (logged)').setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');
  const before = warningCount(user.id);

  if (!before) {
    await interaction.reply({
      content: `<@${user.id}> has no warnings to clear.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  clearWarnings(user.id);
  await postModLog(interaction.client, {
    action: 'CLEAR_WARNINGS',
    target: { id: user.id, tag: user.tag, username: user.username },
    moderator: {
      id: interaction.user.id,
      tag: interaction.user.tag,
      username: interaction.user.username,
    },
    reason,
    extra: { Cleared: String(before) },
  });
  await interaction.reply({
    content: `🧹 Cleared **${before}** warning(s) for <@${user.id}>.`,
    allowedMentions: { parse: [] },
  });
}
