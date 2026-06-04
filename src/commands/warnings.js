import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { listWarnings } from '../db.js';
import { denyIfNotMod } from '../permissions.js';

export const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('Show a member\'s warning history')
  .addUserOption((o) =>
    o.setName('user').setDescription('Member to look up').setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  if (await denyIfNotMod(interaction)) return;
  const user = interaction.options.getUser('user');
  const rows = listWarnings(user.id);

  if (!rows.length) {
    await interaction.reply({
      content: `<@${user.id}> has no warnings on file.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  // Show up to the 15 most recent — older ones get truncated note.
  const shown = rows.slice(0, 15);
  const lines = shown.map((w) => {
    const when = `<t:${Math.floor(w.created_at / 1000)}:R>`;
    const reason = w.reason ? `— ${w.reason}` : '— _(no reason)_';
    return `**#${w.id}** ${when} · by <@${w.moderator_id}> ${reason}`;
  });
  if (rows.length > shown.length) {
    lines.push(`_…and ${rows.length - shown.length} older_`);
  }

  const emb = new EmbedBuilder()
    .setAuthor({
      name: `${user.username} — ${rows.length} warning${rows.length === 1 ? '' : 's'}`,
      iconURL: user.displayAvatarURL(),
    })
    .setColor(0xffd166)
    .setDescription(lines.join('\n').slice(0, 4000));

  await interaction.reply({
    embeds: [emb],
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}
