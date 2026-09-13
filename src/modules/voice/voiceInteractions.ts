import { MessageFlags, type ButtonInteraction, type ModalSubmitInteraction, type StringSelectMenuInteraction, type UserSelectMenuInteraction } from "discord.js";
import type { BotContext } from "../../types/context.js";
import { UserFacingError } from "../../utils/errors.js";
import { embeds } from "../../utils/responses.js";
import { nameModal, limitSelect, privacyButtons, userSelect } from "./voicePresentation.js";
import type { PrivacyMode } from "../../repositories/voiceGeneratorRepository.js";

function parts(customId: string): string[] {
  return customId.split(":");
}

function member(interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction) {
  if (!interaction.inCachedGuild()) throw new UserFacingError("Accion disponible solo en el servidor.");
  return interaction.member;
}

async function ignoreDeletedInteractionMessage(action: Promise<unknown>): Promise<void> {
  await action.catch((error: any) => {
    if (error?.code === 10003 || error?.code === 10008 || error?.code === 10062) return;
    throw error;
  });
}

export async function handleVoiceButton(interaction: ButtonInteraction, context: BotContext): Promise<boolean> {
  if (!interaction.customId.startsWith("voice:")) return false;
  const [, action, channelId, privacy] = parts(interaction.customId);
  if (!channelId) throw new UserFacingError("Accion invalida.");

  if (action === "name") {
    context.services.voice.assertRoomOwnerOrStaff(member(interaction), channelId);
    await interaction.showModal(nameModal(channelId));
    return true;
  }
  if (action === "limit") {
    context.services.voice.assertRoomOwnerOrStaff(member(interaction), channelId);
    await interaction.reply({ embeds: [embeds.info("Limite de sala", "Selecciona el nuevo limite.")], components: [limitSelect(channelId)], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "privacy") {
    context.services.voice.assertRoomOwnerOrStaff(member(interaction), channelId);
    await interaction.reply({ embeds: [embeds.info("Privacidad", "Selecciona el modo de privacidad.")], components: [privacyButtons(channelId)], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "privacy-set") {
    await context.services.voice.setPrivacy(member(interaction), channelId, privacy as PrivacyMode);
    await interaction.reply({ embeds: [embeds.success("Privacidad actualizada", `Modo: ${privacy}`)], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "permit") {
    context.services.voice.assertRoomOwnerOrStaff(member(interaction), channelId);
    await interaction.reply({ embeds: [embeds.info("Permitir usuario", "Selecciona un usuario.")], components: [userSelect(`voice:permit-select:${channelId}`, "Usuario permitido")], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "block") {
    context.services.voice.assertRoomOwnerOrStaff(member(interaction), channelId);
    await interaction.reply({ embeds: [embeds.info("Bloquear usuario", "Selecciona un usuario.")], components: [userSelect(`voice:block-select:${channelId}`, "Usuario bloqueado")], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "transfer") {
    context.services.voice.assertRoomOwnerOrStaff(member(interaction), channelId);
    await interaction.reply({ embeds: [embeds.info("Transferir owner", "Selecciona el nuevo owner dentro de la sala.")], components: [userSelect(`voice:transfer-select:${channelId}`, "Nuevo owner")], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "kick") {
    context.services.voice.assertRoomOwnerOrStaff(member(interaction), channelId);
    await interaction.reply({ embeds: [embeds.info("Expulsar de la sala", "Selecciona el usuario a desconectar.")], components: [userSelect(`voice:kick-select:${channelId}`, "Usuario a expulsar")], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "delete") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await context.services.voice.deleteRoom(member(interaction), channelId);
    await ignoreDeletedInteractionMessage(interaction.editReply({ embeds: [embeds.success("Sala eliminada", "La sala temporal fue eliminada.")], components: [] }));
    return true;
  }
  return false;
}

export async function handleVoiceStringSelect(interaction: StringSelectMenuInteraction, context: BotContext): Promise<boolean> {
  if (!interaction.customId.startsWith("voice:limit-select:")) return false;
  const channelId = interaction.customId.replace("voice:limit-select:", "");
  await context.services.voice.setLimit(member(interaction), channelId, Number(interaction.values[0]));
  await interaction.reply({ embeds: [embeds.success("Limite actualizado", "La sala fue actualizada.")], flags: MessageFlags.Ephemeral });
  return true;
}

export async function handleVoiceUserSelect(interaction: UserSelectMenuInteraction, context: BotContext): Promise<boolean> {
  if (!interaction.customId.startsWith("voice:")) return false;
  const [, action, channelId] = parts(interaction.customId);
  const targetUserId = interaction.values[0];
  if (!channelId || !targetUserId) throw new UserFacingError("Seleccion invalida.");
  if (action === "permit-select") await context.services.voice.permit(member(interaction), channelId, targetUserId);
  else if (action === "block-select") await context.services.voice.block(member(interaction), channelId, targetUserId);
  else if (action === "transfer-select") await context.services.voice.transfer(member(interaction), channelId, targetUserId);
  else if (action === "kick-select") await context.services.voice.kick(member(interaction), channelId, targetUserId);
  else return false;
  await interaction.reply({ embeds: [embeds.success("Sala actualizada", "Accion aplicada correctamente.")], flags: MessageFlags.Ephemeral });
  return true;
}

export async function handleVoiceModal(interaction: ModalSubmitInteraction, context: BotContext): Promise<boolean> {
  if (!interaction.customId.startsWith("voice:name-modal:")) return false;
  const channelId = interaction.customId.replace("voice:name-modal:", "");
  await context.services.voice.rename(member(interaction), channelId, interaction.fields.getTextInputValue("name"));
  await interaction.reply({ embeds: [embeds.success("Nombre actualizado", "La sala fue renombrada.")], flags: MessageFlags.Ephemeral });
  return true;
}
