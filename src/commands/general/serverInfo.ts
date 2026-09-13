import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { requireGuildInteraction } from "../../permissions/guards.js";

export const serverInfoCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("server-info").setDescription("Muestra informacion general del servidor."),
  level: "info",
  description: "Informacion del servidor",
  async execute(interaction) {
    await requireGuildInteraction(interaction);
    const guild = interaction.guild!;
    await interaction.reply({
      embeds: [
        embeds.info("Servidor", `${guild.name}`).addFields(
          { name: "ID", value: guild.id, inline: true },
          { name: "Miembros", value: `${guild.memberCount}`, inline: true },
          { name: "Creado", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        ),
      ],
      ephemeral: true,
    });
  },
};
