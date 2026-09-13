import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";

export const botInfoCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("bot-info").setDescription("Muestra estado, uptime y version del bot."),
  level: "info",
  description: "Estado del bot",
  async execute(interaction, context) {
    const uptimeMs = Date.now() - context.startedAt.getTime();
    const uptimeMinutes = Math.floor(uptimeMs / 60_000);
    await interaction.reply({
      embeds: [
        embeds.info("CB Studios Bot", "Bot central de administracion de CB Studios.").addFields(
          { name: "Discord", value: context.client.isReady() ? "Online" : "Conectando", inline: true },
          { name: "Uptime", value: `${uptimeMinutes} min`, inline: true },
          { name: "Version", value: "1.0.0", inline: true },
        ),
      ],
      ephemeral: true,
    });
  },
};
