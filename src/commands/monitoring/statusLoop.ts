import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { Native, UserFacingError, requireNative, requirePermission } from "../../permissions/guards.js";
import type { StatusMessageMode } from "../../repositories/systemStatusRepository.js";
import { env } from "../../config/env.js";

function modeText(mode: string): string {
  return mode === "post" ? "mensaje nuevo cada intervalo" : "editar un solo mensaje";
}

export const statusLoopCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("status-loop")
    .setDescription("Controla la publicacion automatica del estado.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("activar")
        .setDescription("Activa el status automatico.")
        .addIntegerOption((option) =>
          option
            .setName("intervalo_minutos")
            .setDescription("Cada cuantos minutos se actualiza")
            .setMinValue(1)
            .setMaxValue(1440),
        )
        .addStringOption((option) =>
          option
            .setName("modo")
            .setDescription("Como publica el bot")
            .addChoices({ name: "editar", value: "edit" }, { name: "publicar", value: "post" }),
        ),
    )
    .addSubcommand((sub) => sub.setName("apagar").setDescription("Apaga el status automatico."))
    .addSubcommand((sub) => sub.setName("publicar").setDescription("Publica el estado una vez en el canal configurado."))
    .addSubcommand((sub) => sub.setName("ver").setDescription("Muestra la configuracion actual.")),
  level: "monitoring_admin",
  description: "Loop de status VPS",
  async execute(interaction, context) {
    const member = await requirePermission(interaction, context, "monitoring_admin");
    requireNative(member, Native.ManageGuild, "Necesitas Gestionar servidor para configurar el monitor.");
    if (!env.ENABLE_SYSTEM_MONITOR) throw new UserFacingError("System Monitor esta deshabilitado en el entorno.");
    const guildId = interaction.guildId!;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "activar") {
      const current = context.repositories.systemStatus.ensure(guildId);
      if (!current.channel_id) throw new UserFacingError("Primero configura un canal con /status-channel.");
      const minutes = interaction.options.getInteger("intervalo_minutos") ?? Math.round(current.interval_seconds / 60);
      const mode = (interaction.options.getString("modo") ?? current.mode) as StatusMessageMode;
      const config = context.repositories.systemStatus.setLoop(guildId, true, minutes * 60, mode);
      context.repositories.auditEvents.create({
        actorUserId: interaction.user.id,
        guildId,
        eventType: "status_loop_enabled",
        summary: `Status automatico activado por ${interaction.user.tag}`,
        details: {
          actor_id: interaction.user.id,
          channel_id: config.channel_id,
          interval_seconds: config.interval_seconds,
          mode: config.mode,
        },
      });
      context.services.statusScheduler.restartGuild(guildId);
      await interaction.reply({
        embeds: [
          embeds.success(
            "Status automatico activo",
            `Canal: <#${config.channel_id}>\nIntervalo: ${minutes} min\nModo: ${modeText(config.mode)}`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "apagar") {
      const config = context.repositories.systemStatus.setLoop(guildId, false);
      context.repositories.auditEvents.create({
        actorUserId: interaction.user.id,
        guildId,
        eventType: "status_loop_disabled",
        summary: `Status automatico apagado por ${interaction.user.tag}`,
        details: {
          actor_id: interaction.user.id,
          channel_id: config.channel_id,
        },
      });
      context.services.statusScheduler.restartGuild(guildId);
      await interaction.reply({ embeds: [embeds.success("Status automatico apagado", "No se publicaran actualizaciones automaticas.")], ephemeral: true });
      return;
    }

    if (subcommand === "publicar") {
      await interaction.deferReply({ ephemeral: true });
      const channelId = await context.services.statusScheduler.publishNow(guildId);
      context.repositories.auditEvents.create({
        actorUserId: interaction.user.id,
        guildId,
        eventType: "status_published_once",
        summary: `Status publicado manualmente por ${interaction.user.tag}`,
        details: {
          actor_id: interaction.user.id,
          channel_id: channelId,
        },
      });
      await interaction.editReply({ embeds: [embeds.success("Status publicado", `Publicado en <#${channelId}>.`)] });
      return;
    }

    const config = context.repositories.systemStatus.ensure(guildId);
    await interaction.reply({
      embeds: [
        embeds.info(
          "Configuracion de status",
          [
            `canal: ${config.channel_id ? `<#${config.channel_id}>` : "sin configurar"}`,
            `activo: ${config.enabled ? "si" : "no"}`,
            `intervalo: ${Math.round(config.interval_seconds / 60)} min`,
            `modo: ${modeText(config.mode)}`,
          ].join("\n"),
        ),
      ],
      ephemeral: true,
    });
  },
};
