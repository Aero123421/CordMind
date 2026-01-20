import { EmbedBuilder, Guild } from "discord.js";

export const sendAuditLog = async (guild: Guild, logChannelId: string, input: {
  action: string;
  actorTag: string;
  status: "success" | "failure" | "pending";
  confirmation: string;
  message: string;
}) => {
  const channel = await guild.channels.fetch(logChannelId);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle(`AUDIT | ${input.action}`)
    .addFields(
      { name: "actor", value: input.actorTag, inline: true },
      { name: "confirmation", value: input.confirmation, inline: true },
      { name: "status", value: input.status, inline: true },
      { name: "message", value: input.message.slice(0, 900) }
    )
    .setTimestamp(new Date());

  await channel.send({ embeds: [embed] });
};
