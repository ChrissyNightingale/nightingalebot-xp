import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUser } from '../db.js';
import { CFG } from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('rank')
  .setDescription('Show your XP and level')
  .addUserOption((o) =>
    o
      .setName('user')
      .setDescription('Whose rank? (default: you)')
      .setRequired(false)
  );

export async function execute(interaction) {
  const target = interaction.options.getUser('user') || interaction.user;
  const u = getUser(target.id);
  const progress = u.xp % CFG.xp.pointsPerLevel;
  const next = CFG.xp.pointsPerLevel;
  const filled = Math.floor(progress / (next / 10));
  const bar = '▰'.repeat(filled) + '▱'.repeat(10 - filled);

  const emb = new EmbedBuilder()
    .setAuthor({
      name: target.username,
      iconURL: target.displayAvatarURL(),
    })
    .setTitle(`Level ${u.level}`)
    .setDescription(`**${u.xp}** XP total\n${bar}  ${progress}/${next}`)
    .setColor(0x9146ff);

  await interaction.reply({ embeds: [emb] });
}
