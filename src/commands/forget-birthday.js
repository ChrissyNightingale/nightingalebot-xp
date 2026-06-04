import { SlashCommandBuilder } from 'discord.js';
import { removeBirthday, getBirthday } from '../birthdays.js';

export const data = new SlashCommandBuilder()
  .setName('forget-birthday')
  .setDescription('Remove your birthday');

export async function execute(interaction) {
  const existing = getBirthday(interaction.user.id);
  if (!existing) {
    await interaction.reply({
      content: 'You have no birthday saved.',
      ephemeral: true,
    });
    return;
  }
  removeBirthday(interaction.user.id);
  await interaction.reply({
    content: '🗑️ Birthday removed.',
    ephemeral: true,
  });
}
