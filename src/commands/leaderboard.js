import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { topUsers } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Top 10 by XP');

export async function execute(interaction) {
  const top = topUsers(10);
  if (!top.length) {
    await interaction.reply({ content: 'No XP earned yet.', ephemeral: true });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, i) => {
    const rank = medals[i] || `**${i + 1}.**`;
    return `${rank} <@${u.user_id}> — Level **${u.level}** · ${u.xp} XP`;
  });

  const emb = new EmbedBuilder()
    .setTitle('🏆 Leaderboard')
    .setDescription(lines.join('\n'))
    .setColor(0xffd700);

  await interaction.reply({
    embeds: [emb],
    allowedMentions: { parse: [] },
  });
}
