import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types/context.js";
import { embeds } from "../utils/responses.js";

export const voiceHelpCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("voice-help").setDescription("Ayuda de CB Studios Voice."),
  level: "info",
  description: "Ayuda del sistema de voz",
  async execute(interaction) {
    await interaction.reply({
      embeds: [
        embeds.info(
          "Ayuda CB Studios Voice",
          [
            "`/voice info` muestra tu sala actual.",
            "`/voice name`, `limit`, `lock`, `private`, `permit`, `block`, `transfer`, `delete` gestionan tu sala.",
            "`/voice-generator` configura generadores PUBLIC, SUPPORT y STAFF.",
            "`/voice-admin` permite intervencion staff y reconciliacion.",
          ].join("\n"),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
