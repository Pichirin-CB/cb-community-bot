import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { Native, UserFacingError, requireNative, requirePermission } from "../../permissions/guards.js";
import { env } from "../../config/env.js";

export const statusChannelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("status-channel")
    .setDescription("Configura el canal publico donde se publicara el estado de la VPS.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("canal")
        .setDescription("Canal de texto")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
  level: "monitoring_admin",
  description: "Canal publico de estado",
  async execute(interaction, context) {
    const member = await requirePermission(interaction, context, "monitoring_admin");
    requireNative(member, Native.ManageGuild, "Necesitas Gestionar servidor para configurar el canal.");
    if (!env.ENABLE_SYSTEM_MONITOR) throw new UserFacingError("System Monitor esta deshabilitado en el entorno.");
    const channel = interaction.options.getChannel("canal");
    const previous = context.repositories.systemStatus.ensure(interaction.guildId!);
    const config = context.repositories.systemStatus.setChannel(interaction.guildId!, channel?.id ?? null);
    context.repositories.auditEvents.create({
      actorUserId: interaction.user.id,
      guildId: interaction.guildId!,
      eventType: "status_channel_updated",
      summary: `Canal de status actualizado por ${interaction.user.tag}`,
      details: {
        actor_id: interaction.user.id,
        previous_channel_id: previous.channel_id,
        new_channel_id: config.channel_id,
      },
    });
    context.services.statusScheduler.restartGuild(interaction.guildId!);
    await interaction.reply({
      embeds: [
        embeds.success(
          "Canal actualizado",
          `status_channel: ${config.channel_id ? `<#${config.channel_id}>` : "sin configurar"}`,
        ),
      ],
      ephemeral: true,
    });
  },
};
