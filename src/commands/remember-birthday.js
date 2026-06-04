import { SlashCommandBuilder } from 'discord.js';
import { isValidDate, setBirthday, formatDate } from '../birthdays.js';

export const data = new SlashCommandBuilder()
  .setName('remember-birthday')
  .setDescription('Add your birthday')
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
  );

export async function execute(interaction) {
  const month = interaction.options.getInteger('month');
  const day = interaction.options.getInteger('day');
  const year = interaction.options.getInteger('year') ?? null;

  if (!isValidDate(month, day)) {
    await interaction.reply({
      content: `That date doesn't look valid. Try month 1-12 and day 1-${month === 2 ? 29 : 31}.`,
      ephemeral: true,
    });
    return;
  }

  setBirthday(interaction.user.id, month, day, year);
  await interaction.reply({
    content: `🎂 Birthday saved: **${formatDate({ month, day })}**.`,
    ephemeral: true,
  });
}
