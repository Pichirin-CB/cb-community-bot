import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types/context.js";
import { embeds } from "../utils/responses.js";
import packageJson from "../../package.json" with { type: "json" };

export const voiceBotInfoCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("voice-bot-info").setDescription("Estado de CB Studios Voice."),
  level: "info",
  description: "Estado del sistema de voz",
  async execute(interaction, context) {
    const guildId = interaction.guildId!;
    await interaction.reply({
      embeds: [
        embeds.info(
          "CB Studios Voice",
          [
            "Online: si",
            `Uptime: ${Math.floor(process.uptime())}s`,
            `Generadores: ${context.repositories.generators.list(guildId).length}`,
            `Salas temporales: ${context.repositories.tempVoice.listActive(guildId).length}`,
            `Version: ${packageJson.version}`,
          ].join("\n"),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
