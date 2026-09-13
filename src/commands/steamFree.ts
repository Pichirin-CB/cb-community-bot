import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "../types/command.js";
import { embeds } from "../modules/embeds/embedService.js";
import {
  Native,
  requireNative,
  requirePermission,
} from "../permissions/guards.js";

export const steamFreeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("steamfree")
    .setDescription("Gestiona las promociones gratuitas de Steam.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("channel")
        .setDescription("Configura el canal donde se publicaran los juegos gratis.")
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal de texto donde se publicaran las promociones.")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Muestra la configuracion actual de Steam Free."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("check")
        .setDescription("Comprueba ahora las promociones de Steam."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("enable")
        .setDescription("Activa las publicaciones automaticas de Steam Free."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("disable")
        .setDescription("Desactiva las publicaciones automaticas de Steam Free."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("interval")
        .setDescription("Configura cada cuantos minutos se revisara Steam.")
        .addIntegerOption((option) =>
          option
            .setName("minutos")
            .setDescription("Intervalo entre comprobaciones, de 5 a 1440 minutos.")
            .setMinValue(5)
            .setMaxValue(1440)
            .setRequired(true),
        ),
    ),
  level: "monitoring_admin",
  description: "Gestion de Steam Free Games",

  async execute(interaction, context) {
    const member = await requirePermission(
      interaction,
      context,
      "monitoring_admin",
    );

    requireNative(
      member,
      Native.ManageGuild,
      "Necesitas Gestionar servidor para administrar Steam Free.",
    );

    const guildId = interaction.guildId;

    if (!guildId) {
      throw new Error("Este comando solo puede utilizarse dentro de un servidor.");
    }

    const subcommand = interaction.options.getSubcommand();

    context.repositories.guildConfig.ensure(guildId);

    const config = context.repositories.steamFree.ensure(guildId);

    if (subcommand === "channel") {
      const channel = interaction.options.getChannel("canal", true);

      const updated = context.repositories.steamFree.setChannel(
        guildId,
        channel.id,
      );

      context.services.steamFreeScheduler.restartGuild(guildId);

      await interaction.reply({
        embeds: [
          embeds.success(
            "Steam Free · Canal configurado",
            [
              `Canal: <#${updated.channel_id}>`,
              "",
              "Las promociones nuevas se publicaran en este canal cuando Steam Free este activado.",
            ].join("\n"),
          ),
        ],
        ephemeral: true,
      });

      return;
    }

    if (subcommand === "status") {
      const channelText = config.channel_id
        ? `<#${config.channel_id}>`
        : "No configurado";

      const enabledText = config.enabled ? "🟢 Activado" : "🔴 Desactivado";

      await interaction.reply({
        embeds: [
          embeds.info(
            "Steam Free · Estado",
            [
              `Estado: ${enabledText}`,
              `Canal: ${channelText}`,
              `Intervalo: ${config.check_interval_minutes} minutos`,
              `Free to Keep: ${config.free_to_keep_enabled ? "Sí" : "No"}`,
              `Free Weekend: ${config.free_weekend_enabled ? "Sí" : "No"}`,
              `DLC: ${config.dlc_enabled ? "Sí" : "No"}`,
            ].join("\n"),
          ),
        ],
        ephemeral: true,
      });

      return;
    }

    if (subcommand === "enable") {
      if (!config.channel_id) {
        await interaction.reply({
          embeds: [
            embeds.error(
              "Steam Free · Falta el canal",
              "Primero configura un canal con `/steamfree channel`.",
            ),
          ],
          ephemeral: true,
        });

        return;
      }

      const updated = context.repositories.steamFree.setEnabled(
        guildId,
        true,
      );

      context.services.steamFreeScheduler.restartGuild(guildId);

      await interaction.reply({
        embeds: [
          embeds.success(
            "Steam Free · Activado",
            [
              "Las comprobaciones automaticas estan activadas.",
              `Canal: <#${updated.channel_id}>`,
              `Intervalo: cada ${updated.check_interval_minutes} minutos.`,
            ].join("\n"),
          ),
        ],
        ephemeral: true,
      });

      return;
    }

    if (subcommand === "disable") {
      const updated = context.repositories.steamFree.setEnabled(
        guildId,
        false,
      );

      context.services.steamFreeScheduler.stopGuild(guildId);

      await interaction.reply({
        embeds: [
          embeds.success(
            "Steam Free · Desactivado",
            "Las comprobaciones automaticas han sido detenidas.",
          ),
        ],
        ephemeral: true,
      });

      return;
    }

    if (subcommand === "interval") {
      const minutes = interaction.options.getInteger("minutos", true);

      const updated = context.repositories.steamFree.setInterval(
        guildId,
        minutes,
      );

      context.services.steamFreeScheduler.restartGuild(guildId);

      await interaction.reply({
        embeds: [
          embeds.success(
            "Steam Free · Intervalo actualizado",
            `Steam se comprobara cada **${updated.check_interval_minutes} minutos**.`,
          ),
        ],
        ephemeral: true,
      });

      return;
    }

    if (subcommand === "check") {
      await interaction.deferReply({ ephemeral: true });

      try {
        const result = await context.services.steamFreeScheduler.checkNow(
          guildId,
        );

        await interaction.editReply({
          embeds: [
            embeds.success(
              "Steam Free · Comprobacion completada",
              [
                `Detectadas: **${result.detected}**`,
                `Publicadas: **${result.published}**`,
                `Omitidas: **${result.skipped}**`,
              ].join("\n"),
            ),
          ],
        });
      } catch (error) {
        await interaction.editReply({
          embeds: [
            embeds.error(
              "Steam Free · Error",
              "No se pudo completar la comprobacion de Steam en este momento.",
            ),
          ],
        });

        throw error;
      }

      return;
    }
  },
};