import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type { TemporaryVoiceChannel } from "../../repositories/tempVoiceRepository.js";
import type { VoiceGenerator } from "../../repositories/voiceGeneratorRepository.js";

const color = 0x2f6f61;

export function buildRoomControlEmbed(room: TemporaryVoiceChannel, generator?: VoiceGenerator | null): EmbedBuilder {
  const privacy = room.privacy_mode === "PUBLIC" ? "Publica" : room.privacy_mode === "LOCKED" ? "Bloqueada" : "Privada";
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("🎙️ TU SALA TEMPORAL")
    .setDescription("Controla esta sala desde los botones. El owner solo gestiona su sala.")
    .addFields(
      { name: "Propietario", value: `<@${room.owner_user_id}>`, inline: true },
      { name: "Estado", value: privacy, inline: true },
      { name: "Limite", value: room.user_limit === 0 ? "Sin limite" : String(room.user_limit), inline: true },
      { name: "Tipo", value: generator?.type ?? "Temporal", inline: true },
      { name: "Creada", value: `<t:${Math.floor(new Date(room.created_at).getTime() / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: "CB Studios Voice" })
    .setTimestamp();
}

export function roomControlComponents(channelId: string) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`voice:name:${channelId}`).setLabel("✏️ Nombre").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`voice:limit:${channelId}`).setLabel("👥 Límite").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`voice:privacy:${channelId}`).setLabel("🔒 Privacidad").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`voice:permit:${channelId}`).setLabel("✅ Permitir").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`voice:block:${channelId}`).setLabel("🚫 Bloquear").setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`voice:transfer:${channelId}`).setLabel("👑 Transferir").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`voice:kick:${channelId}`).setLabel("👢 Expulsar").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`voice:delete:${channelId}`).setLabel("🗑️ Eliminar").setStyle(ButtonStyle.Danger),
    ),
  ];
}

export function nameModal(channelId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`voice:name-modal:${channelId}`)
    .setTitle("Cambiar nombre")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Nuevo nombre")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(80)
          .setRequired(true),
      ),
    );
}

export function limitSelect(channelId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`voice:limit-select:${channelId}`)
      .setPlaceholder("Selecciona limite")
      .addOptions(
        [0, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25].map((limit) => ({
          label: limit === 0 ? "Sin limite" : `${limit} usuarios`,
          value: String(limit),
        })),
      ),
  );
}

export function privacyButtons(channelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`voice:privacy-set:${channelId}:PUBLIC`).setLabel("Publica").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`voice:privacy-set:${channelId}:LOCKED`).setLabel("Bloqueada").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`voice:privacy-set:${channelId}:PRIVATE`).setLabel("Privada").setStyle(ButtonStyle.Secondary),
  );
}

export function userSelect(customId: string, placeholder: string): ActionRowBuilder<UserSelectMenuBuilder> {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1),
  );
}

export function supportAlertEmbed(userId: string, channelId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xd0a84f)
    .setTitle("🎧 NUEVA SOLICITUD DE SOPORTE POR VOZ")
    .addFields(
      { name: "Usuario", value: `<@${userId}>`, inline: true },
      { name: "Sala", value: `<#${channelId}>`, inline: true },
      { name: "Hora", value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: false },
    )
    .setFooter({ text: "CB Studios Voice" })
    .setTimestamp();
}

export function supportAlertButton(guildId: string, channelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel("🔊 Entrar a la sala").setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${guildId}/${channelId}`),
  );
}
