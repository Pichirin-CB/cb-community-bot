import { ChannelType, SlashCommandBuilder, type Message, type TextChannel } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import type { PermissionKey } from "../../permissions/staffLevels.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { UserFacingError, requirePermission } from "../../permissions/guards.js";
import {
  claimTicket,
  closeTicket,
  deleteTicket,
  reopenTicket,
  transcriptTicket,
} from "../../modules/tickets/ticketInteractions.js";
import {
  buildTicketPanelEmbed,
  buildTicketPanelMenu,
  requiredTicketConfig,
  ticketPanelAttachments,
} from "../../modules/tickets/ticketPresentation.js";

async function fetchPanelMessage(channel: TextChannel, messageId: string | null): Promise<Message | null> {
  if (!messageId) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

export function ticketSubcommandPermission(subcommand: string): PermissionKey {
  return subcommand === "panel" || subcommand === "delete" ? "config" : "tickets";
}

export const ticketCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Gestiona tickets de soporte.")
    .addSubcommand((sub) =>
      sub
        .setName("panel")
        .setDescription("Publica o actualiza el panel de tickets.")
        .addChannelOption((option) => option.setName("canal").setDescription("Canal").setRequired(true).addChannelTypes(ChannelType.GuildText)),
    )
    .addSubcommand((sub) => sub.setName("claim").setDescription("Reclama el ticket actual."))
    .addSubcommand((sub) =>
      sub
        .setName("close")
        .setDescription("Cierra el ticket actual.")
        .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setMaxLength(512)),
    )
    .addSubcommand((sub) => sub.setName("reopen").setDescription("Reabre el ticket actual."))
    .addSubcommand((sub) => sub.setName("transcript").setDescription("Genera un transcript basico del ticket actual."))
    .addSubcommand((sub) => sub.setName("delete").setDescription("Elimina el canal del ticket actual.")),
  level: "tickets",
  description: "Tickets de soporte",
  async execute(interaction, context) {
    const sub = interaction.options.getSubcommand();
    await requirePermission(interaction, context, ticketSubcommandPermission(sub));

    if (sub === "panel") {
      await interaction.deferReply({ ephemeral: true });
      const config = context.repositories.guildConfig.ensure(interaction.guildId!);
      const missing = requiredTicketConfig(config);
      if (missing.length > 0) {
        throw new UserFacingError(`Falta configuracion de tickets: ${missing.join(", ")}.`);
      }

      const channel = interaction.options.getChannel("canal", true);
      if (channel.type !== ChannelType.GuildText) throw new UserFacingError("El panel debe publicarse en un canal de texto.");
      const targetChannel = channel as TextChannel;
      const existingChannel =
        config.ticket_panel_channel_id && config.ticket_panel_message_id
          ? await interaction.guild!.channels.fetch(config.ticket_panel_channel_id).catch(() => null)
          : null;
      const existingMessage =
        existingChannel?.type === ChannelType.GuildText
          ? await fetchPanelMessage(existingChannel as TextChannel, config.ticket_panel_message_id)
          : null;
      const payload = {
        embeds: [buildTicketPanelEmbed()],
        components: [buildTicketPanelMenu()],
        files: ticketPanelAttachments(),
      };

      if (existingMessage) {
        await existingMessage.edit(payload);
        await interaction.editReply({
          embeds: [embeds.success("Panel actualizado", `Panel existente actualizado en <#${existingMessage.channelId}>.`)],
        });
        return;
      }

      const message = await targetChannel.send(payload);
      context.repositories.guildConfig.setTicketPanel(interaction.guildId!, targetChannel.id, message.id);
      context.repositories.auditEvents.create({
        guildId: interaction.guildId!,
        actorUserId: interaction.user.id,
        eventType: "TICKET_PANEL_PUBLISHED",
        summary: `Panel de tickets publicado en ${targetChannel.name}`,
        details: { channelId: targetChannel.id, messageId: message.id },
      });
      await interaction.editReply({ embeds: [embeds.success("Panel publicado", `Publicado en <#${targetChannel.id}>.`)] });
      return;
    }

    if (sub === "claim") {
      await claimTicket(interaction, context);
      return;
    }

    if (sub === "close") {
      await closeTicket(interaction, context, interaction.options.getString("motivo"));
      return;
    }

    if (sub === "reopen") {
      await reopenTicket(interaction, context);
      return;
    }

    if (sub === "transcript") {
      await transcriptTicket(interaction, context);
      return;
    }

    if (sub === "delete") {
      await deleteTicket(interaction, context);
    }
  },
};

export const supportCommands = [ticketCommand];
