import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { postModLog, parseDuration, humanDuration } from '../mod-log.js';
import { denyIfNotMod } from '../permissions.js';

const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord max: 28 days

export const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Time a member out (mute) for a duration')
  .addUserOption((o) =>
    o.setName('user').setDescription('Member to time out').setRequired(true)
  )
  .addStringOption((o) =>
    o
      .setName('duration')
      .setDescription('e.g. 10m, 1h, 2d (default unit = minutes; max 28d)')
      .setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('reason').setDescription('Reason (logged)').setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction) {
  if (await denyIfNotMod(interaction)) return;
  const user = interaction.options.getUser('user');
  const durationRaw = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason');

  const ms = parseDuration(durationRaw);
  if (!ms || ms > MAX_TIMEOUT_MS) {
    await interaction.reply({
      content:
        'Invalid duration. Try `10m`, `1h`, `2d` (max 28d). Bare numbers = minutes.',
      ephemeral: true,
    });
    return;
  }

  const member = await interaction.guild.members
    .fetch(user.id)
    .catch(() => null);
  if (!member) {
    await interaction.reply({
      content: `<@${user.id}> is not in this server.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (!member.moderatable) {
    await interaction.reply({
      content: `Can't time out <@${user.id}> — they outrank me.`,
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await member.timeout(ms, reason || 'No reason provided');
  await postModLog(interaction.client, {
    action: 'TIMEOUT',
    target: { id: user.id, tag: user.tag, username: user.username },
    moderator: {
      id: interaction.user.id,
      tag: interaction.user.tag,
      username: interaction.user.username,
    },
    reason,
    extra: { Duration: humanDuration(ms) },
  });
  await interaction.reply({
    content: `⏱️ Timed out <@${user.id}> for **${humanDuration(ms)}**.`,
    allowedMentions: { parse: [] },
  });
}
