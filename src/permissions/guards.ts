import { PermissionFlagsBits, type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import type { BotContext } from "../types/context.js";
import { hasInternalPermission, type PermissionKey } from "./staffLevels.js";

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function requireGuildMember(interaction: ChatInputCommandInteraction): GuildMember {
  if (!interaction.inCachedGuild()) {
    throw new UserFacingError("Este comando solo puede usarse dentro del servidor.");
  }
  return interaction.member;
}

export async function requireGuildInteraction(interaction: ChatInputCommandInteraction): Promise<GuildMember> {
  return requireGuildMember(interaction);
}

export function requirePermission(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
  permission: PermissionKey,
): GuildMember {
  const member = requireGuildMember(interaction);
  const config = context.repositories.guildConfig.ensure(interaction.guildId!);
  if (!hasInternalPermission(member, config, permission, interaction.guild?.ownerId)) {
    throw new UserFacingError("No tienes el nivel interno de CB Studios necesario para usar esta funcion.");
  }
  return member;
}

export function requireNative(member: GuildMember, permission: bigint, message: string): void {
  if (!member.permissions.has(permission)) {
    throw new UserFacingError(message);
  }
}

export function requireBotPermission(botMember: GuildMember, permission: bigint, message: string): void {
  if (!botMember.permissions.has(permission)) {
    throw new UserFacingError(message);
  }
}

export const nativeMessages = {
  moderateMembers: "Necesito el permiso nativo Moderar miembros.",
  kickMembers: "Necesito el permiso nativo Expulsar miembros.",
  banMembers: "Necesito el permiso nativo Banear miembros.",
  manageMessages: "Necesito el permiso nativo Gestionar mensajes.",
  manageRoles: "Necesito el permiso nativo Gestionar roles.",
  manageChannels: "Necesito el permiso nativo Gestionar canales.",
  manageNicknames: "Necesito el permiso nativo Gestionar apodos.",
  manageGuild: "Necesitas el permiso nativo Gestionar servidor.",
};

export const Native = PermissionFlagsBits;
