import { ChannelType, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { Native, UserFacingError, nativeMessages, requireNative, requirePermission } from "../../permissions/guards.js";
import {
  configurableChannelKeys,
  configurableRoleKeys,
  configurableToggleKeys,
  type ChannelConfigKey,
  type RoleConfigKey,
  type ToggleConfigKey,
} from "../../repositories/guildConfigRepository.js";

export function assertConfigChannelType(key: ChannelConfigKey | "ticket_category_id", type: ChannelType): void {
  if (key === "ticket_category_id") {
    if (type !== ChannelType.GuildCategory) {
      throw new Error("ticket_category_id debe ser una categoria.");
    }
    return;
  }

  if (type !== ChannelType.GuildText && type !== ChannelType.GuildAnnouncement) {
    throw new Error(`${key} debe ser un canal de texto o anuncios.`);
  }
}

export function configRolePermission(key: RoleConfigKey): "config" | "founder" {
  return key === "founder_role_id" || key === "administrator_role_id" ? "founder" : "config";
}

export function formatConfigValue(key: string, value: unknown): string {
  if (key.endsWith("_enabled")) return value ? "enabled" : "disabled";
  if (value === null || value === undefined || value === "") return "not configured";
  if (key.endsWith("_channel_id") || key === "ticket_category_id") return `<#${String(value)}>`;
  if (key.endsWith("_role_id")) return `<@&${String(value)}>`;
  return String(value);
}

function cleanMessageId(value: string | null): string | null | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{17,20}$/.test(trimmed)) {
    throw new UserFacingError("mensaje_id debe ser un snowflake valido de Discord.");
  }
  return trimmed;
}

export const configCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configura CB Community para este servidor.")
    .addSubcommand((sub) =>
      sub
        .setName("channel")
        .setDescription("Configura un canal.")
        .addStringOption((option) =>
          option
            .setName("clave")
            .setDescription("Campo de canal")
            .setRequired(true)
            .addChoices(
              ...[...configurableChannelKeys, "ticket_category_id"].map((key) => ({ name: key, value: key })),
            ),
        )
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildCategory),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("role")
        .setDescription("Configura un rol interno.")
        .addStringOption((option) =>
          option
            .setName("clave")
            .setDescription("Campo de rol")
            .setRequired(true)
            .addChoices(...configurableRoleKeys.map((key) => ({ name: key, value: key }))),
        )
        .addRoleOption((option) => option.setName("rol").setDescription("Rol")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("Activa o desactiva un modulo.")
        .addStringOption((option) =>
          option
            .setName("clave")
            .setDescription("Modulo")
            .setRequired(true)
            .addChoices(...configurableToggleKeys.map((key) => ({ name: key, value: key }))),
        )
        .addBooleanOption((option) => option.setName("activo").setDescription("Estado").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("presence")
        .setDescription("Configura la presencia inicial.")
        .addStringOption((option) =>
          option.setName("texto").setDescription("Texto de presencia").setRequired(true).setMaxLength(80),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("role-panel")
        .setDescription("Configura el panel de personalizacion.")
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal donde esta publicado el panel")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) =>
          option
            .setName("mensaje_id")
            .setDescription("ID del mensaje del panel; vacio para enlazar solo al canal")
            .setMinLength(17)
            .setMaxLength(20),
        )
        .addBooleanOption((option) => option.setName("limpiar_mensaje").setDescription("Quita el enlace directo al mensaje")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("status-thresholds")
        .setDescription("Configura umbrales publicos del monitor VPS.")
        .addIntegerOption((option) => option.setName("cpu").setDescription("Alerta de CPU (%)").setMinValue(1).setMaxValue(100))
        .addIntegerOption((option) => option.setName("ram").setDescription("Alerta de RAM (%)").setMinValue(1).setMaxValue(100))
        .addIntegerOption((option) => option.setName("disco").setDescription("Alerta de disco (%)").setMinValue(1).setMaxValue(100)),
    )
    .addSubcommand((sub) => sub.setName("show").setDescription("Muestra la configuracion actual.")),
  level: "config",
  description: "Configuracion persistente",
  async execute(interaction, context) {
    const member = await requirePermission(interaction, context, "config");
    requireNative(member, Native.ManageGuild, nativeMessages.manageGuild);
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "channel") {
      const key = interaction.options.getString("clave", true) as ChannelConfigKey | "ticket_category_id";
      const channel = interaction.options.getChannel("canal");
      if (channel) assertConfigChannelType(key, channel.type);
      context.repositories.guildConfig.setChannel(guildId, key, channel?.id ?? null);
      await interaction.reply({
        embeds: [embeds.success("Configuracion actualizada", `${key}: ${channel ? `<#${channel.id}>` : "sin configurar"}`)],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "role") {
      const key = interaction.options.getString("clave", true) as RoleConfigKey;
      requirePermission(interaction, context, configRolePermission(key));
      const role = interaction.options.getRole("rol");
      context.repositories.guildConfig.setRole(guildId, key, role?.id ?? null);
      await interaction.reply({
        embeds: [embeds.success("Configuracion actualizada", `${key}: ${role ? `<@&${role.id}>` : "sin configurar"}`)],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "toggle") {
      const key = interaction.options.getString("clave", true) as ToggleConfigKey;
      const enabled = interaction.options.getBoolean("activo", true);
      context.repositories.guildConfig.setToggle(guildId, key, enabled);
      await interaction.reply({
        embeds: [embeds.success("Configuracion actualizada", `${key}: ${enabled ? "activo" : "inactivo"}`)],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "presence") {
      const text = interaction.options.getString("texto", true);
      context.repositories.guildConfig.setPresence(guildId, text);
      await interaction.client.user?.setActivity(text);
      await interaction.reply({
        embeds: [embeds.success("Presencia actualizada", text)],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "role-panel") {
      const channel = interaction.options.getChannel("canal");
      const messageId = cleanMessageId(interaction.options.getString("mensaje_id"));
      const clearMessage = interaction.options.getBoolean("limpiar_mensaje") ?? false;

      if (!channel && messageId === undefined && !clearMessage) {
        const config = context.repositories.guildConfig.ensure(guildId);
        await interaction.reply({
          embeds: [
            embeds.info(
              "Panel de personalizacion",
              [
                `canal: ${config.role_panel_channel_id ? `<#${config.role_panel_channel_id}>` : "sin configurar"}`,
                `mensaje_id: ${config.role_panel_message_id ?? "sin configurar"}`,
              ].join("\n"),
            ),
          ],
          ephemeral: true,
        });
        return;
      }

      context.repositories.guildConfig.setRolePanel(
        guildId,
        channel?.id,
        clearMessage ? null : channel && messageId === undefined ? null : messageId,
      );
      const config = context.repositories.guildConfig.ensure(guildId);
      await interaction.reply({
        embeds: [
          embeds.success(
            "Panel de personalizacion actualizado",
            [
              `canal: ${config.role_panel_channel_id ? `<#${config.role_panel_channel_id}>` : "sin configurar"}`,
              `mensaje_id: ${config.role_panel_message_id ?? "sin configurar"}`,
            ].join("\n"),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "status-thresholds") {
      const cpu = interaction.options.getInteger("cpu");
      const ram = interaction.options.getInteger("ram");
      const disk = interaction.options.getInteger("disco");
      if (cpu === null && ram === null && disk === null) {
        throw new UserFacingError("Indica al menos un umbral: cpu, ram o disco.");
      }
      const status = context.repositories.systemStatus.setThresholds(guildId, {
        warn_cpu_pct: cpu ?? undefined,
        warn_ram_pct: ram ?? undefined,
        warn_disk_pct: disk ?? undefined,
      });
      await interaction.reply({
        embeds: [embeds.success("Umbrales actualizados", `CPU: ${status.warn_cpu_pct}%\nRAM: ${status.warn_ram_pct}%\nDisco: ${status.warn_disk_pct}%`)],
        ephemeral: true,
      });
      return;
    }

    const config = context.repositories.guildConfig.ensure(guildId);
    const status = context.repositories.systemStatus.ensure(guildId);
    const rows = Object.entries(config)
      .filter(([key]) => key !== "guild_id")
      .map(([key, value]) => `${key}: ${formatConfigValue(key, value)}`)
      .join("\n");

    const monitorRows = [
      `status_channel: ${status.channel_id ? `<#${status.channel_id}>` : "sin configurar"}`,
      `status_loop: ${status.enabled ? "activo" : "apagado"}`,
      `status_interval: ${Math.round(status.interval_seconds / 60)} min`,
      `status_mode: ${status.mode}`,
      `status_thresholds: CPU ${status.warn_cpu_pct}% / RAM ${status.warn_ram_pct}% / Disco ${status.warn_disk_pct}%`,
    ].join("\n");
    await interaction.reply({ embeds: [embeds.info("Configuracion", `${rows}\n\n${monitorRows}`)], ephemeral: true });
  },
};
