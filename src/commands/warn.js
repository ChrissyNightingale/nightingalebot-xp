import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { postModLog } from '../mod-log.js';
import { addWarning, warningCount } from '../db.js';
import { denyIfNotMod } from '../permissions.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Issue a warning to a member (tracked)')
  .addUserOption((o) =>
    o.setName('user').setDescription('Member to warn').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason (logged)').setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  if (await denyIfNotMod(interaction)) return;
  const user = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason');

  if (user.bot) {
    await interaction.reply({
      content: 'Bots can\'t be warned.',
      ephemeral: true,
    });
    return;
  }

  addWarning(user.id, interaction.user.id, reason);
  const total = warningCount(user.id);

  await postModLog(interaction.client, {
    action: 'WARN',
    target: { id: user.id, tag: user.tag, username: user.username },
    moderator: {
      id: interaction.user.id,
      tag: interaction.user.tag,
      username: interaction.user.username,
    },
    reason,
    extra: { 'Total warnings': String(total) },
  });
  await interaction.reply({
    content: `⚠️ Warned <@${user.id}>. **${total}** total.`,
    allowedMentions: { parse: [] },
  });
}
