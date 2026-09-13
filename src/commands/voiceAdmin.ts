import { ChannelType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types/context.js";
import { requirePermission } from "../permissions/guards.js";
import type { PermissionKey } from "../permissions/staffLevels.js";
import { embeds } from "../utils/responses.js";
import { UserFacingError } from "../utils/errors.js";
import { reconcileTemporaryVoiceChannels } from "../modules/voice/reconciliation.js";

export function voiceAdminPermission(subcommand: string): PermissionKey {
  return subcommand === "cleanup" || subcommand === "reconcile" || subcommand === "refresh-permissions" ? "admin" : "moderation";
}

async function ignoreDeletedInteractionMessage(action: Promise<unknown>): Promise<void> {
  await action.catch((error: any) => {
    if (error?.code === 10003 || error?.code === 10008 || error?.code === 10062) return;
    throw error;
  });
}

export const voiceAdminCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("voice-admin")
    .setDescription("Herramientas staff para CB Studios Voice.")
    .addSubcommand((sub) => sub.setName("info").setDescription("Info de una sala.").addChannelOption((option) => option.setName("canal").setDescription("Sala.").setRequired(true).addChannelTypes(ChannelType.GuildVoice)))
    .addSubcommand((sub) => sub.setName("transfer").setDescription("Transfiere sala.").addChannelOption((option) => option.setName("canal").setDescription("Sala.").setRequired(true).addChannelTypes(ChannelType.GuildVoice)).addUserOption((option) => option.setName("usuario").setDescription("Nuevo owner.").setRequired(true)))
    .addSubcommand((sub) => sub.setName("delete").setDescription("Elimina sala temporal.").addChannelOption((option) => option.setName("canal").setDescription("Sala.").setRequired(true).addChannelTypes(ChannelType.GuildVoice)))
    .addSubcommand((sub) => sub.setName("cleanup").setDescription("Programa limpieza de salas vacias registradas."))
    .addSubcommand((sub) => sub.setName("reconcile").setDescription("Ejecuta reconciliacion manual."))
    .addSubcommand((sub) =>
      sub
        .setName("refresh-permissions")
        .setDescription("Reaplica permisos base de categoria en una sala temporal.")
        .addChannelOption((option) => option.setName("canal").setDescription("Sala temporal.").setRequired(true).addChannelTypes(ChannelType.GuildVoice)),
    )
    .addSubcommand((sub) => sub.setName("stats").setDescription("Estadisticas basicas.")),
  level: "moderation",
  description: "Administracion de salas temporales",

  async execute(interaction, context) {
    const sub = interaction.options.getSubcommand();
    const member = requirePermission(interaction, context, voiceAdminPermission(sub));

    if (sub === "info") {
      const channel = interaction.options.getChannel("canal", true);
      const room = context.repositories.tempVoice.get(channel.id);
      if (!room) throw new UserFacingError("Ese canal no pertenece a CB Studios Voice.");
      await interaction.reply({
        embeds: [embeds.info("Sala Voice", `Canal: <#${room.channel_id}>\nOwner: <@${room.owner_user_id}>\nEstado: ${room.status}\nPrivacidad: ${room.privacy_mode}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "transfer") {
      await context.services.voice.transfer(member, interaction.options.getChannel("canal", true).id, interaction.options.getUser("usuario", true).id);
      await interaction.reply({ embeds: [embeds.success("Owner transferido", "La sala fue actualizada.")], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "delete") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await context.services.voice.deleteRoom(member, interaction.options.getChannel("canal", true).id);
      await ignoreDeletedInteractionMessage(interaction.editReply({ embeds: [embeds.success("Sala eliminada", "La sala temporal fue eliminada.")], components: [] }));
      return;
    }

    if (sub === "cleanup") {
      for (const room of context.repositories.tempVoice.listActive(interaction.guildId!)) context.services.voice.scheduleDelete(room);
      await interaction.reply({ embeds: [embeds.success("Cleanup programado", "Se revisaran solo salas registradas.")], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "reconcile") {
      const report = await reconcileTemporaryVoiceChannels(context, context.client);
      await interaction.reply({ embeds: [embeds.success("Reconciliacion completa", JSON.stringify(report, null, 2))], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "refresh-permissions") {
      await context.services.voice.refreshPermissions(member, interaction.options.getChannel("canal", true).id);
      await interaction.reply({
        embeds: [embeds.success("Permisos actualizados", "La sala temporal conserva su owner, privacidad, allowlist y blocklist.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const generators = context.repositories.generators.list(interaction.guildId!);
    const rooms = context.repositories.tempVoice.listActive(interaction.guildId!);
    const createdToday = context.repositories.audit.countToday(interaction.guildId!, "VOICE_CHANNEL_CREATED");
    const deletedToday = context.repositories.audit.countToday(interaction.guildId!, "VOICE_CHANNEL_DELETED");
    await interaction.reply({
      embeds: [
        embeds.info(
          "Estadisticas Voice",
          [
            `Salas activas: ${rooms.length}`,
            `Publicas: ${rooms.filter((room) => context.repositories.generators.getById(room.generator_id)?.type === "PUBLIC").length}`,
            `Soporte: ${rooms.filter((room) => context.repositories.generators.getById(room.generator_id)?.type === "SUPPORT").length}`,
            `Staff: ${rooms.filter((room) => context.repositories.generators.getById(room.generator_id)?.type === "STAFF").length}`,
            `Usuarios en salas temporales: pendiente de gateway cache`,
            `Salas creadas hoy: ${createdToday}`,
            `Salas eliminadas hoy: ${deletedToday}`,
            `Generadores: ${generators.length}`,
          ].join("\n"),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};
