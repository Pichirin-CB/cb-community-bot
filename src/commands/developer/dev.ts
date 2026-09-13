import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { existsSync } from "node:fs";
import process from "node:process";
import packageJson from "../../../package.json" with { type: "json" };
import { env } from "../../config/env.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { requirePermission } from "../../permissions/guards.js";
import type { GuildConfig } from "../../repositories/guildConfigRepository.js";
import type { BotCommand } from "../../types/command.js";

const moduleKeys = ["welcome_enabled", "goodbye_enabled", "moderation_enabled", "message_logs_enabled", "security_enabled", "welcome_dm_enabled"] as const;

export function sanitizedModuleLines(config: GuildConfig): string[] {
  return moduleKeys.map((key) => `${key.replace(/_enabled$/, "")}: ${config[key] ? "enabled" : "disabled"}`);
}

function formatUptime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export const devCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("dev")
    .setDescription("Diagnostico tecnico seguro y de solo lectura.")
    .addSubcommand((sub) => sub.setName("status").setDescription("Muestra el estado tecnico sanitizado."))
    .addSubcommand((sub) => sub.setName("modules").setDescription("Muestra el estado de los modulos."))
    .addSubcommand((sub) => sub.setName("health").setDescription("Ejecuta comprobaciones internas no destructivas.")),
  level: "developer",
  description: "Diagnostico tecnico de solo lectura",
  async execute(interaction, context) {
    requirePermission(interaction, context, "developer");
    const guildId = interaction.guildId!;
    const config = context.repositories.guildConfig.ensure(guildId);
    const subcommand = interaction.options.getSubcommand();
    const modules = sanitizedModuleLines(config);
    if (subcommand === "modules") {
      await interaction.reply({ embeds: [embeds.info("Modulos CB Studios", [...modules, `system_monitor: ${env.ENABLE_SYSTEM_MONITOR ? "enabled" : "disabled"}`].join("\n"))], flags: MessageFlags.Ephemeral });
      return;
    }
    const db = context.database.health();
    const generators = context.repositories.generators.list(guildId).length;
    const rooms = context.repositories.tempVoice.listActive(guildId).length;
    const buildAvailable = existsSync("dist/src/index.js");
    if (subcommand === "health") {
      await interaction.reply({ embeds: [embeds.info("Health check", [
        `Discord: ${context.client.isReady() ? "OK" : "NOT READY"}`,
        `SQLite: ${db.ok ? "OK" : "ERROR"}`,
        `Build: ${buildAvailable ? "available" : "missing"}`,
        `Voice: ${generators} generators / ${rooms} active rooms`,
        `Monitor: ${env.ENABLE_SYSTEM_MONITOR ? "enabled" : "disabled"}`,
      ].join("\n"))], flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [embeds.info("Developer status", [
      `Version: ${packageJson.version}`,
      `Environment: ${env.NODE_ENV}`,
      `Uptime: ${formatUptime(process.uptime())}`,
      `Discord: ${context.client.isReady() ? "online" : "connecting"}`,
      `Latency: ${Math.max(0, Math.round(context.client.ws.ping))} ms`,
      `SQLite: ${db.ok ? "OK" : "ERROR"}`,
      `Commands: ${context.commands.size}`,
      `Build: ${buildAvailable ? "available" : "missing"}`,
      `Process memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
      `Voice: ${generators} generators / ${rooms} active rooms`,
      `Monitor: ${env.ENABLE_SYSTEM_MONITOR ? "enabled" : "disabled"}`,
    ].join("\n"))], flags: MessageFlags.Ephemeral });
  },
};
