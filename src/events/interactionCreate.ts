import { Events } from "discord.js";
import type { BotContext } from "../types/context.js";
import { replyError } from "../utils/responses.js";
import { handleTicketButton, handleTicketSelect } from "../modules/tickets/ticketInteractions.js";
import { handleSelfRoleButton, handleSelfRoleSelect } from "../modules/selfRoles/selfRoleInteractions.js";
import { handleAnnouncementButton, handleAnnouncementModal } from "../modules/announcements/announcementInteractions.js";
import { handleVoiceButton, handleVoiceModal, handleVoiceStringSelect, handleVoiceUserSelect } from "../modules/voice/voiceInteractions.js";
import { permissionMatrix, type PermissionKey } from "../permissions/staffLevels.js";
import { requirePermission } from "../permissions/guards.js";

export function registerInteractionCreate(context: BotContext): void {
  context.client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isButton()) {
        if (await handleVoiceButton(interaction, context)) return;
        if (await handleTicketButton(interaction, context)) return;
        if (await handleSelfRoleButton(interaction, context)) return;
        if (await handleAnnouncementButton(interaction, context)) return;
        if (await context.services.confirmations.handle(interaction)) return;
      }

      if (interaction.isStringSelectMenu()) {
        if (await handleVoiceStringSelect(interaction, context)) return;
        if (await handleTicketSelect(interaction, context)) return;
        if (await handleSelfRoleSelect(interaction, context)) return;
      }

      if (interaction.isUserSelectMenu()) {
        if (await handleVoiceUserSelect(interaction, context)) return;
      }

      if (interaction.isModalSubmit()) {
        if (await handleVoiceModal(interaction, context)) return;
        if (await handleAnnouncementModal(interaction, context)) return;
      }

      if (!interaction.isChatInputCommand()) return;
      const command = context.commands.get(interaction.commandName);
      if (!command) return;
      if (command.level && command.level in permissionMatrix && command.level !== "info") {
        requirePermission(interaction, context, command.level as PermissionKey);
      }
      await command.execute(interaction, context);
    } catch (error) {
      if (interaction.isRepliable()) {
        await replyError(interaction, error);
      }
    }
  });
}
