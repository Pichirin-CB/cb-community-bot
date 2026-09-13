import { ChannelType, MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types/context.js";
import type { PrivacyMode } from "../repositories/voiceGeneratorRepository.js";
import { requireGuildMember } from "../permissions/guards.js";
import { UserFacingError } from "../utils/errors.js";
import { embeds } from "../utils/responses.js";

function currentVoiceChannelId(interaction: any): string {
  const member = requireGuildMember(interaction);
  const channelId = member.voice.channelId;
  if (!channelId) throw new UserFacingError("Debes estar dentro de tu sala temporal.");
  return channelId;
}

export const voiceCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Gestiona tu sala temporal.")
    .addSubcommand((sub) => sub.setName("info").setDescription("Muestra informacion de tu sala."))
    .addSubcommand((sub) =>
      sub
        .setName("name")
        .setDescription("Cambia el nombre de tu sala.")
        .addStringOption((option) => option.setName("nombre").setDescription("Nuevo nombre.").setRequired(true).setMaxLength(80)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("limit")
        .setDescription("Cambia el limite de usuarios.")
        .addIntegerOption((option) => option.setName("limite").setDescription("0 = sin limite.").setRequired(true).setMinValue(0).setMaxValue(99)),
    )
    .addSubcommand((sub) => sub.setName("lock").setDescription("Bloquea entrada publica."))
    .addSubcommand((sub) => sub.setName("unlock").setDescription("Vuelve publica la sala."))
    .addSubcommand((sub) => sub.setName("private").setDescription("Oculta la sala al publico."))
    .addSubcommand((sub) => sub.setName("public").setDescription("Hace publica la sala."))
    .addSubcommand((sub) =>
      sub.setName("permit").setDescription("Permite un usuario.").addUserOption((option) => option.setName("usuario").setDescription("Usuario.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("block").setDescription("Bloquea un usuario.").addUserOption((option) => option.setName("usuario").setDescription("Usuario.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("unblock").setDescription("Quita bloqueo/permiso especial.").addUserOption((option) => option.setName("usuario").setDescription("Usuario.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("kick").setDescription("Saca un usuario de tu sala.").addUserOption((option) => option.setName("usuario").setDescription("Usuario.").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName("transfer").setDescription("Transfiere owner a un usuario dentro de la sala.").addUserOption((option) => option.setName("usuario").setDescription("Usuario.").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("delete").setDescription("Elimina tu sala temporal.")),
  level: "info",
  description: "Gestiona tu sala temporal",

  async execute(interaction, context) {
    const member = requireGuildMember(interaction);
    const channelId = currentVoiceChannelId(interaction);
    const sub = interaction.options.getSubcommand();

    if (sub === "delete") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await context.services.voice.deleteRoom(member, channelId);
      await interaction.editReply({ embeds: [embeds.success("Sala eliminada", "La sala temporal fue eliminada.")], components: [] });
      return;
    }

    if (sub === "info") {
      const room = context.repositories.tempVoice.get(channelId);
      if (!room) throw new UserFacingError("Este canal no pertenece a CB Studios Voice.");
      const generator = context.repositories.generators.getById(room.generator_id);
      const channel = await interaction.guild!.channels.fetch(channelId).catch(() => null);
      const members = channel?.type === ChannelType.GuildVoice ? channel.members.size : 0;
      await interaction.reply({
        embeds: [
          embeds.info(
            "Sala temporal",
            [
              `Canal: <#${room.channel_id}>`,
              `Owner: <@${room.owner_user_id}>`,
              `Tipo: ${generator?.type ?? "desconocido"}`,
              `Estado: ${room.status}`,
              `Privacidad: ${room.privacy_mode}`,
              `Limite: ${room.user_limit === 0 ? "sin limite" : room.user_limit}`,
              `Miembros: ${members}`,
              `Creada: <t:${Math.floor(new Date(room.created_at).getTime() / 1000)}:R>`,
            ].join("\n"),
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "name") await context.services.voice.rename(member, channelId, interaction.options.getString("nombre", true));
    if (sub === "limit") await context.services.voice.setLimit(member, channelId, interaction.options.getInteger("limite", true));
    if (sub === "lock") await context.services.voice.setPrivacy(member, channelId, "LOCKED");
    if (sub === "unlock" || sub === "public") await context.services.voice.setPrivacy(member, channelId, "PUBLIC");
    if (sub === "private") await context.services.voice.setPrivacy(member, channelId, "PRIVATE");
    if (sub === "permit") await context.services.voice.permit(member, channelId, interaction.options.getUser("usuario", true).id);
    if (sub === "block") await context.services.voice.block(member, channelId, interaction.options.getUser("usuario", true).id);
    if (sub === "unblock") await context.services.voice.unblock(member, channelId, interaction.options.getUser("usuario", true).id);
    if (sub === "kick") await context.services.voice.kick(member, channelId, interaction.options.getUser("usuario", true).id);
    if (sub === "transfer") await context.services.voice.transfer(member, channelId, interaction.options.getUser("usuario", true).id);
    await interaction.reply({ embeds: [embeds.success("Sala actualizada", "Accion aplicada correctamente.")], flags: MessageFlags.Ephemeral });
  },
};

export function parsePrivacyMode(value: string): PrivacyMode {
  if (value === "PUBLIC" || value === "LOCKED" || value === "PRIVATE") return value;
  throw new UserFacingError("Privacidad invalida.");
}
