import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { removeBirthday, getBirthday } from '../birthdays.js';

export const data = new SlashCommandBuilder()
  .setName('unset-user-birthday')
  .setDescription("Admin: remove another member's birthday")
  .addUserOption((o) =>
    o.setName('user').setDescription('Target user').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  if (!getBirthday(user.id)) {
    await interaction.reply({
      content: `<@${user.id}> has no birthday saved.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  removeBirthday(user.id);
  await interaction.reply({
    content: `🗑️ Removed birthday for <@${user.id}>.`,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}
