import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { upcomingBirthdays, formatDate } from '../birthdays.js';

export const data = new SlashCommandBuilder()
  .setName('next-birthdays')
  .setDescription('List up to 10 upcoming birthdays');

export async function execute(interaction) {
  const list = upcomingBirthdays(10);
  if (!list.length) {
    await interaction.reply({
      content: 'No birthdays saved yet. Be the first — `/remember-birthday`.',
      ephemeral: true,
    });
    return;
  }

  const lines = list.map((b) => {
    const when =
      b.daysAway === 0
        ? '🎉 today'
        : b.daysAway === 1
        ? 'tomorrow'
        : `in ${b.daysAway} days`;
    return `• <@${b.user_id}> — **${formatDate({ month: b.month, day: b.day })}** (${when})`;
  });

  const emb = new EmbedBuilder()
    .setTitle('🎂 Upcoming birthdays')
    .setDescription(lines.join('\n'))
    .setColor(0xff66cc);

  await interaction.reply({
    embeds: [emb],
    allowedMentions: { parse: [] },
  });
}
