import { SlashCommandBuilder, type Role } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { requireGuildInteraction } from "../../permissions/guards.js";

export const roleInfoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("role-info")
    .setDescription("Muestra informacion de un rol.")
    .addRoleOption((option) => option.setName("rol").setDescription("Rol").setRequired(true)),
  level: "info",
  description: "Informacion de rol",
  async execute(interaction) {
    await requireGuildInteraction(interaction);
    const role = interaction.options.getRole("rol", true) as Role;
    await interaction.reply({
      embeds: [
        embeds.info("Rol", `${role}`).addFields(
          { name: "ID", value: role.id, inline: true },
          { name: "Miembros", value: `${role.members.size}`, inline: true },
          { name: "Posicion", value: `${role.position}`, inline: true },
        ),
      ],
      ephemeral: true,
    });
  },
};

export const channelInfoCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("channel-info")
    .setDescription("Muestra informacion de un canal.")
    .addChannelOption((option) => option.setName("canal").setDescription("Canal").setRequired(true)),
  level: "info",
  description: "Informacion de canal",
  async execute(interaction) {
    await requireGuildInteraction(interaction);
    const channel = interaction.options.getChannel("canal", true);
    await interaction.reply({
      embeds: [
        embeds.info("Canal", `${channel}`).addFields(
          { name: "ID", value: channel.id, inline: true },
          { name: "Tipo", value: `${channel.type}`, inline: true },
        ),
      ],
      ephemeral: true,
    });
  },
};
