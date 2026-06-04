import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isValidDate, setBirthday, formatDate } from '../birthdays.js';

export const data = new SlashCommandBuilder()
  .setName('set-user-birthday')
  .setDescription("Admin: add another member's birthday")
  .addUserOption((o) =>
    o.setName('user').setDescription('Target user').setRequired(true)
  )
  .addIntegerOption((o) =>
    o
      .setName('month')
      .setDescription('Month (1-12)')
      .setMinValue(1)
      .setMaxValue(12)
      .setRequired(true)
  )
  .addIntegerOption((o) =>
    o
      .setName('day')
      .setDescription('Day (1-31)')
      .setMinValue(1)
      .setMaxValue(31)
      .setRequired(true)
  )
  .addIntegerOption((o) =>
    o
      .setName('year')
      .setDescription('Birth year (optional, kept private)')
      .setMinValue(1900)
      .setMaxValue(new Date().getUTCFullYear())
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const month = interaction.options.getInteger('month');
  const day = interaction.options.getInteger('day');
  const year = interaction.options.getInteger('year') ?? null;

  if (!isValidDate(month, day)) {
    await interaction.reply({
      content: `Invalid date.`,
      ephemeral: true,
    });
    return;
  }

  setBirthday(user.id, month, day, year);
  await interaction.reply({
    content: `🎂 Saved **${formatDate({ month, day })}** for <@${user.id}>.`,
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}
