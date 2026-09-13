import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { requireGuildInteraction, requirePermission } from "../../permissions/guards.js";
import { collectMetrics } from "../../modules/systemStatus/metricsCollector.js";
import { buildAdminStatusEmbed, buildPublicStatusEmbed } from "../../modules/systemStatus/statusEmbed.js";
import { env } from "../../config/env.js";
import { UserFacingError } from "../../permissions/guards.js";

export const statusCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Muestra el estado de la VPS.")
    .addStringOption((option) =>
      option
        .setName("detalle")
        .setDescription("Nivel de detalle")
        .addChoices({ name: "publico", value: "publico" }, { name: "admin", value: "admin" }),
    ),
  level: "monitoring",
  description: "Estado actual de la VPS",
  async execute(interaction, context) {
    await requireGuildInteraction(interaction);
    if (!env.ENABLE_SYSTEM_MONITOR) throw new UserFacingError("System Monitor no esta habilitado en este bot.");
    await interaction.deferReply({ ephemeral: true });
    const detail = interaction.options.getString("detalle") || "publico";
    if (detail === "admin") await requirePermission(interaction, context, "monitoring_admin");
    const config = context.repositories.systemStatus.ensure(interaction.guildId!);
    const metrics = await collectMetrics();
    await interaction.editReply({
      embeds: [detail === "admin" ? buildAdminStatusEmbed(metrics, config) : buildPublicStatusEmbed(metrics, config)],
    });
  },
};
