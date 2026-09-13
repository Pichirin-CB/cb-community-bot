import type { ButtonInteraction, ChatInputCommandInteraction, InteractionReplyOptions, RepliableInteraction } from "discord.js";
import { embeds } from "../modules/embeds/embedService.js";
export { embeds } from "../modules/embeds/embedService.js";
import { logger } from "../logger.js";
import { UserFacingError } from "../permissions/guards.js";

export async function replyOk(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  title: string,
  description: string,
  ephemeral = true,
): Promise<void> {
  const payload: InteractionReplyOptions = { embeds: [embeds.success(title, description)], ephemeral };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

export async function replyError(
  interaction: RepliableInteraction,
  error: unknown,
): Promise<void> {
  const message = error instanceof UserFacingError
    ? error.message
    : "La operacion no pudo completarse. Revisa la configuracion o contacta con un administrador.";
  logger.warn({ error }, "Error manejado en interaction");
  const payload: InteractionReplyOptions = {
    embeds: [embeds.error("No puedo realizar esta accion", message)],
    ephemeral: true,
  };
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ embeds: payload.embeds });
    } else if (interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch (replyFailure) {
    logger.warn({ error: replyFailure }, "No se pudo entregar la respuesta de error de la interaction");
  }
}
