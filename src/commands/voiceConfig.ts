import { ChannelType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types/context.js";
import { configChannelKeys, configRoleKeys } from "../repositories/guildConfigRepository.js";
import { requirePermission } from "../permissions/guards.js";
import type { PermissionKey } from "../permissions/staffLevels.js";
import { embeds } from "../utils/responses.js";

export function voiceConfigPermission(subcommand: string): PermissionKey {
  return subcommand === "role" ? "founder" : "config";
}

export const voiceConfigCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("voice-config")
    .setDescription("Configura CB Studios Voice.")
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Configura canales del sistema Voice.")
        .addStringOption((option) =>
          option
            .setName("clave")
            .setDescription("Campo a configurar.")
            .setRequired(true)
            .addChoices(...configChannelKeys.map((key) => ({ name: key, value: key }))),
        )
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal de texto.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("role")
        .setDescription("Configura roles internos de Voice.")
        .addStringOption((option) =>
          option
            .setName("clave")
            .setDescription("Campo a configurar.")
            .setRequired(true)
            .addChoices(...configRoleKeys.map((key) => ({ name: key, value: key }))),
        )
        .addRoleOption((option) => option.setName("rol").setDescription("Rol a guardar.")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("settings")
        .setDescription("Configura ajustes generales.")
        .addIntegerOption((option) =>
          option
            .setName("empty_grace_seconds")
            .setDescription("Segundos antes de borrar una sala vacia.")
            .setMinValue(0)
            .setMaxValue(300),
        )
        .addBooleanOption((option) =>
          option.setName("one_room_per_user").setDescription("Un owner solo puede tener una sala activa por generador."),
        ),
    )
    .addSubcommand((sub) => sub.setName("show").setDescription("Muestra la configuracion actual.")),
  level: "config",
  description: "Configuracion del sistema de voz",

  async execute(interaction, context) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();
    requirePermission(interaction, context, voiceConfigPermission(sub));

    if (sub === "channel") {
      const key = interaction.options.getString("clave", true) as (typeof configChannelKeys)[number];
      const channel = interaction.options.getChannel("canal", false);
      context.repositories.guildConfig.setChannel(guildId, key, channel?.id ?? null);
      await interaction.reply({
        embeds: [embeds.success("Configuracion actualizada", `${key}: ${channel ? `<#${channel.id}>` : "sin configurar"}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "role") {
      const key = interaction.options.getString("clave", true) as (typeof configRoleKeys)[number];
      const role = interaction.options.getRole("rol", false);
      context.repositories.guildConfig.setRole(guildId, key, role?.id ?? null);
      await interaction.reply({
        embeds: [embeds.success("Configuracion actualizada", `${key}: ${role ? `<@&${role.id}>` : "sin configurar"}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "settings") {
      const grace = interaction.options.getInteger("empty_grace_seconds", false) ?? undefined;
      const oneRoom = interaction.options.getBoolean("one_room_per_user", false) ?? undefined;
      context.repositories.guildConfig.setSettings(guildId, {
        default_empty_grace_seconds: grace,
        one_room_per_user: oneRoom,
      });
      await interaction.reply({ embeds: [embeds.success("Ajustes actualizados", "Configuracion general guardada.")], flags: MessageFlags.Ephemeral });
      return;
    }

    const config = context.repositories.guildConfig.ensure(guildId);
    const rows = Object.entries(config)
      .filter(([key]) => !["created_at", "updated_at"].includes(key))
      .map(([key, value]) => `${key}: ${value ?? "sin configurar"}`)
      .join("\n");
    await interaction.reply({ embeds: [embeds.info("Configuracion Voice", rows)], flags: MessageFlags.Ephemeral });
  },
};
