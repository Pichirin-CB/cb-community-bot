import { Collection, PermissionFlagsBits } from "discord.js";
import type { BotCommand } from "../types/command.js";
import { administrationCommands } from "./administration/index.js";
import { configurationCommands } from "./configuration/index.js";
import { generalCommands } from "./general/index.js";
import { moderationCommands } from "./moderation/index.js";
import { supportCommands } from "./support/index.js";
import { voiceAdminCommand } from "./voiceAdmin.js";
import { voiceBotInfoCommand } from "./voiceBotInfo.js";
import { voiceCommand } from "./voice.js";
import { voiceConfigCommand } from "./voiceConfig.js";
import { voiceGeneratorCommand } from "./voiceGenerator.js";
import { voiceHelpCommand } from "./voiceHelp.js";
import { monitoringCommands } from "./monitoring/index.js";
import { developerCommands } from "./developer/index.js";

export function loadCommands(): Collection<string, BotCommand> {
  const commands = new Collection<string, BotCommand>();
  for (const command of [
    ...generalCommands,
    ...configurationCommands,
    ...moderationCommands,
    ...administrationCommands,
    ...supportCommands,
    voiceHelpCommand,
    voiceBotInfoCommand,
    voiceConfigCommand,
    voiceGeneratorCommand,
    voiceCommand,
    voiceAdminCommand,
    ...monitoringCommands,
    ...developerCommands,
  ]) {
    if (commands.has(command.data.name)) {
      throw new Error(`Comando duplicado: ${command.data.name}`);
    }
    commands.set(command.data.name, command);
  }
  return commands;
}

export function commandJson() {
  return [...loadCommands().values()].map((command) => {
    const json = command.data.toJSON();
    const permission = defaultDiscordPermission(command.level);
    return permission === null ? json : { ...json, default_member_permissions: permission.toString() };
  });
}

export function defaultDiscordPermission(level?: string): bigint | null {
  if (!level || level === "info" || level === "monitoring" || level === "developer" || level === "Miembro") return null;
  if (level === "support" || level === "tickets") return PermissionFlagsBits.ManageMessages;
  if (["warn", "timeout", "kick", "purge", "moderation"].includes(level)) return PermissionFlagsBits.ModerateMembers;
  if (level === "roles") return PermissionFlagsBits.ManageRoles;
  if (level === "founder") return PermissionFlagsBits.Administrator;
  return PermissionFlagsBits.ManageGuild;
}
