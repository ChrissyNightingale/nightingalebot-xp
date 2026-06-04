import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getBirthday, formatDate, daysUntil } from '../birthdays.js';

export const data = new SlashCommandBuilder()
  .setName('birthday')
  .setDescription('Show your birthday or another member\'s birthday')
  .addUserOption((o) =>
    o
      .setName('user')
      .setDescription('Whose birthday? (default: you)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const b = getBirthday(target.id);
  if (!b) {
    await interaction.reply({
      content:
        target.id === interaction.user.id
          ? 'You have no birthday saved. Use `/remember-birthday`.'
          : `<@${target.id}> has no birthday saved.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const days = daysUntil(b.month, b.day);
  const when =
    days === 0 ? '🎉 **TODAY!**' : days === 1 ? 'tomorrow' : `in ${days} days`;

  // Year, if stored, is private — never echoed back.
  const dateNoYear = formatDate({ month: b.month, day: b.day });

  const emb = new EmbedBuilder()
    .setAuthor({
      name: target.username,
      iconURL: target.displayAvatarURL(),
    })
    .setTitle('🎂 Birthday')
    .setDescription(`**${dateNoYear}** — ${when}`)
    .setColor(0xff66cc);

  await interaction.reply({ embeds: [emb] });
}
