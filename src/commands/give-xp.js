import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { adminGrantXp } from '../xp.js';
import { handleLevelUp } from '../level-up.js';

export const data = new SlashCommandBuilder()
  .setName('give-xp')
  .setDescription('Admin: grant or remove XP for a user')
  .addUserOption((o) =>
    o.setName('user').setDescription('Target user').setRequired(true)
  )
  .addIntegerOption((o) =>
    o
      .setName('amount')
      .setDescription('XP to grant (negative to remove)')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  const user = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');

  const result = adminGrantXp(user.id, user.username, amount);

  if (result.levelUp) {
    await handleLevelUp(interaction.client, user, result.newLevel);
  }

  await interaction.reply({
    content: `Granted **${amount}** XP to <@${user.id}>. Now **Level ${result.newLevel}** at ${result.newXp} XP.`,
    allowedMentions: { parse: [] },
  });
}
