import {
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Role,
  type StringSelectMenuInteraction,
  type TextChannel,
} from "discord.js";
import type { BotContext } from "../../types/context.js";
import { embeds } from "../embeds/embedService.js";
import { hasInternalPermission } from "../../permissions/staffLevels.js";
import { UserFacingError } from "../../permissions/guards.js";
import { cleanReason } from "../../utils/validation.js";
import { logger } from "../../logger.js";
import {
  buildTicketChannelName,
  buildTicketOpenEmbed,
  buildTicketPermissionOverwrites,
  closedTicketActions,
  openTicketActions,
  requiredTicketConfig,
  ticketCategory,
  ticketStaffRoleIds,
} from "./ticketPresentation.js";

type TicketInteraction = ChatInputCommandInteraction | ButtonInteraction;

function assertCachedGuild(interaction: TicketInteraction | StringSelectMenuInteraction): asserts interaction is typeof interaction & {
  guild: Guild;
  member: GuildMember;
} {
  if (!interaction.inCachedGuild()) {
    throw new UserFacingError("Esta accion solo puede usarse dentro del servidor.");
  }
}

function ensureTicketStaff(interaction: TicketInteraction, context: BotContext, permission: "tickets" | "config" = "tickets"): GuildMember {
  assertCachedGuild(interaction);
  const config = context.repositories.guildConfig.ensure(interaction.guildId!);
  if (!hasInternalPermission(interaction.member, config, permission, interaction.guild.ownerId)) {
    throw new UserFacingError(permission === "config" ? "Solo Administrator o Founder puede eliminar tickets." : "No tienes permisos internos de soporte para gestionar este ticket.");
  }
  return interaction.member;
}

async function requireConfiguredTicketSystem(guild: Guild, context: BotContext): Promise<{
  categoryId: string;
  staffRoles: Role[];
}> {
  const config = context.repositories.guildConfig.ensure(guild.id);
  const missing = requiredTicketConfig(config);
  if (missing.length > 0) {
    throw new UserFacingError(`Falta configuracion de tickets: ${missing.join(", ")}.`);
  }

  const category = await guild.channels.fetch(config.ticket_category_id!).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new UserFacingError("ticket_category_id no existe o no es una categoria.");
  }

  const staffRoles = [];
  for (const roleId of ticketStaffRoleIds(config)) {
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      throw new UserFacingError(`El rol configurado ${roleId} ya no existe.`);
    }
    staffRoles.push(role);
  }

  return { categoryId: config.ticket_category_id!, staffRoles };
}

export async function handleTicketSelect(interaction: StringSelectMenuInteraction, context: BotContext): Promise<boolean> {
  if (interaction.customId !== "ticket:create") return false;
  assertCachedGuild(interaction);

  const categoryValue = interaction.values[0] ?? "general_support";
  const existing = context.repositories.tickets.getOpenByOwnerAndCategory(interaction.guildId!, interaction.user.id, categoryValue);
  if (existing) {
    await interaction.reply({
      embeds: [embeds.warning("Ticket ya abierto", `Ya tienes un ticket abierto para esta categoria: <#${existing.channel_id}>.`)],
      ephemeral: true,
    });
    return true;
  }

  try {
    await interaction.deferReply({ ephemeral: true });
    const { categoryId, staffRoles } = await requireConfiguredTicketSystem(interaction.guild, context);
    const botMember = interaction.guild.members.me;
    if (!botMember) throw new UserFacingError("No pude resolver el miembro del bot en el servidor.");
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      throw new UserFacingError("Necesito el permiso Gestionar canales para crear tickets.");
    }

    const existingNames = new Set(interaction.guild.channels.cache.map((channel) => channel.name));
    const channelName = buildTicketChannelName(categoryValue, interaction.user.username, existingNames);
    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: buildTicketPermissionOverwrites({
        guild: interaction.guild,
        ownerUserId: interaction.user.id,
        botUserId: botMember.id,
        staffRoles,
      }),
      reason: "Ticket creado desde CB Community",
    });

    const ticket = context.repositories.tickets.create(interaction.guildId!, channel.id, interaction.user.id, categoryValue);
    await channel.send({
      content: `${interaction.user}`,
      embeds: [buildTicketOpenEmbed(ticket, interaction.member)],
      components: [openTicketActions()],
      allowedMentions: { users: [interaction.user.id] },
    });
    context.repositories.auditEvents.create({
      guildId: interaction.guildId!,
      actorUserId: interaction.user.id,
      targetUserId: interaction.user.id,
      eventType: "TICKET_CREATED",
      summary: `${ticket.ticket_code} creado en ${channel.name}`,
      details: { ticket: ticket.ticket_code, category: ticket.category, channelId: channel.id },
    });
    await interaction.editReply({ embeds: [embeds.success("Ticket creado", `Tu ticket fue creado: <#${channel.id}>.`)] });
  } catch (error) {
    logger.warn({ error, guildId: interaction.guildId, userId: interaction.user.id }, "No fue posible crear ticket");
    const message = error instanceof UserFacingError
      ? error.message
      : "No fue posible crear el ticket. Revisa la configuracion o contacta con un administrador.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [embeds.error("No fue posible crear el ticket", message)] });
    } else {
      await interaction.reply({ embeds: [embeds.error("No fue posible crear el ticket", message)], ephemeral: true });
    }
  }

  return true;
}

function ticketFromInteraction(interaction: TicketInteraction, context: BotContext) {
  const ticket = context.repositories.tickets.getByChannel(interaction.channelId);
  if (!ticket) throw new UserFacingError("Este canal no corresponde a un ticket registrado.");
  return ticket;
}

export async function claimTicket(interaction: TicketInteraction, context: BotContext): Promise<void> {
  ensureTicketStaff(interaction, context);
  const ticket = ticketFromInteraction(interaction, context);
  const ok = context.repositories.tickets.claim(interaction.channelId, interaction.user.id);
  const latest = context.repositories.tickets.getByChannel(interaction.channelId) ?? ticket;
  if (!ok) {
    const claimed = latest.claimed_by_user_id ? `<@${latest.claimed_by_user_id}>` : "otro miembro del equipo";
    await interaction.reply({ embeds: [embeds.warning("Ticket ya asignado", `Este ticket ya fue reclamado por ${claimed}.`)], ephemeral: true });
    return;
  }
  context.repositories.auditEvents.create({
    guildId: interaction.guildId!,
    actorUserId: interaction.user.id,
    targetUserId: ticket.owner_user_id,
    eventType: "TICKET_CLAIMED",
    summary: `${ticket.ticket_code} reclamado por ${interaction.user.tag}`,
    details: { ticket: ticket.ticket_code, channelId: interaction.channelId },
  });
  await interaction.reply({ embeds: [embeds.success("🛡️ TICKET ASIGNADO", `${interaction.user} se ha hecho cargo de esta solicitud.`)], ephemeral: false });
}

export async function closeTicket(interaction: TicketInteraction, context: BotContext, reasonInput?: string | null): Promise<void> {
  ensureTicketStaff(interaction, context);
  const ticket = ticketFromInteraction(interaction, context);
  const reason = cleanReason(reasonInput, "Sin motivo indicado");
  const ok = context.repositories.tickets.close(interaction.channelId, interaction.user.id, reason);
  if (!ok) {
    await interaction.reply({ embeds: [embeds.warning("Sin cambios", "El ticket ya estaba cerrado.")], ephemeral: true });
    return;
  }
  if (interaction.channel?.type === ChannelType.GuildText) {
    await (interaction.channel as TextChannel).permissionOverwrites.edit(ticket.owner_user_id, { SendMessages: false }).catch(() => undefined);
  }
  context.repositories.auditEvents.create({
    guildId: interaction.guildId!,
    actorUserId: interaction.user.id,
    targetUserId: ticket.owner_user_id,
    eventType: "TICKET_CLOSED",
    summary: `${ticket.ticket_code} cerrado por ${interaction.user.tag}`,
    details: { ticket: ticket.ticket_code, channelId: interaction.channelId, reason },
  });
  await interaction.reply({
    embeds: [embeds.warning("🔒 TICKET CERRADO", `Este ticket fue cerrado por ${interaction.user}.\nMotivo: ${reason}`)],
    components: [closedTicketActions()],
    ephemeral: false,
  });
}

export async function reopenTicket(interaction: TicketInteraction, context: BotContext): Promise<void> {
  ensureTicketStaff(interaction, context);
  const ticket = ticketFromInteraction(interaction, context);
  const ok = context.repositories.tickets.reopen(interaction.channelId);
  if (!ok) {
    await interaction.reply({ embeds: [embeds.warning("Sin cambios", "El ticket no estaba cerrado.")], ephemeral: true });
    return;
  }
  if (interaction.channel?.type === ChannelType.GuildText) {
    await (interaction.channel as TextChannel)
      .permissionOverwrites.edit(ticket.owner_user_id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
      })
      .catch(() => undefined);
  }
  context.repositories.auditEvents.create({
    guildId: interaction.guildId!,
    actorUserId: interaction.user.id,
    targetUserId: ticket.owner_user_id,
    eventType: "TICKET_REOPENED",
    summary: `${ticket.ticket_code} reabierto por ${interaction.user.tag}`,
    details: { ticket: ticket.ticket_code, channelId: interaction.channelId },
  });
  await interaction.reply({ embeds: [embeds.success("🔓 TICKET REABIERTO", "El ticket vuelve a estar activo.")], components: [openTicketActions()], ephemeral: false });
}

export async function transcriptTicket(interaction: TicketInteraction, context: BotContext): Promise<void> {
  ensureTicketStaff(interaction, context);
  const ticket = ticketFromInteraction(interaction, context);
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    throw new UserFacingError("El transcript solo puede generarse dentro del canal del ticket.");
  }
  const channel = interaction.channel as TextChannel;
  const messages = await channel.messages.fetch({ limit: 100 });
  const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const ordered = [...messages.values()].reverse();
  const participants = [...new Set(ordered.map((message) => `${message.author.tag} (${message.author.id})`))];
  const body = ordered.map((message) => `<article><header><strong>${escapeHtml(message.author.tag)}</strong> <time>${message.createdAt.toISOString()}</time></header><p>${escapeHtml(message.cleanContent || "[sin contenido de texto]")}</p></article>`).join("\n");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${ticket.ticket_code}</title><style>body{font:14px system-ui;background:#101a2e;color:#eee;max-width:960px;margin:auto;padding:24px}section,article{background:#17243d;padding:14px;margin:10px 0;border-radius:8px}time{color:#9fb3cc;font-size:12px}p{white-space:pre-wrap}</style></head><body><h1>${ticket.ticket_code}</h1><section><p>Categoría: ${escapeHtml(ticketCategory(ticket.category).title)}</p><p>Creador: ${ticket.owner_user_id}</p><p>Responsable: ${ticket.claimed_by_user_id ?? "sin asignar"}</p><p>Participantes: ${escapeHtml(participants.join(", ") || "ninguno")}</p><p>Creado: ${ticket.created_at}</p><p>Cerrado: ${ticket.closed_at ?? "no"}</p><p>Motivo de cierre: ${escapeHtml(ticket.close_reason ?? "no indicado")}</p></section>${body || "<p>Sin mensajes disponibles.</p>"}</body></html>`;
  context.repositories.auditEvents.create({
    guildId: interaction.guildId!,
    actorUserId: interaction.user.id,
    targetUserId: ticket.owner_user_id,
    eventType: "TICKET_TRANSCRIPT_CREATED",
    summary: `${ticket.ticket_code} transcript generado por ${interaction.user.tag}`,
    details: { ticket: ticket.ticket_code, channelId: interaction.channelId },
  });
  const filename = `${ticket.ticket_code.toLowerCase()}.html`;
  await context.services.logs.send(interaction.guild!, "ticket", "Transcript generado", `${ticket.ticket_code} por ${interaction.user.tag}`);
  await interaction.reply({ content: `Transcript de ${ticket.ticket_code}`, files: [new AttachmentBuilder(Buffer.from(html, "utf8"), { name: filename })], ephemeral: true });
}

export async function deleteTicket(interaction: TicketInteraction, context: BotContext): Promise<void> {
  ensureTicketStaff(interaction, context, "config");
  const ticket = ticketFromInteraction(interaction, context);
  await context.services.confirmations.request(interaction, "Eliminar definitivamente este canal de ticket?", async (button) => {
    context.repositories.tickets.markDeleted(interaction.channelId, button.user.id);
    context.repositories.auditEvents.create({
      guildId: interaction.guildId!,
      actorUserId: button.user.id,
      targetUserId: ticket.owner_user_id,
      eventType: "TICKET_DELETED",
      summary: `${ticket.ticket_code} eliminado por ${button.user.tag}`,
      details: { ticket: ticket.ticket_code, channelId: interaction.channelId },
    });
    await button.update({ embeds: [embeds.warning("Eliminando", "El canal sera eliminado.")], components: [] });
    if (interaction.channel?.type === ChannelType.GuildText) {
      await (interaction.channel as TextChannel).delete("Ticket eliminado desde CB Community");
    }
  });
}

export async function handleTicketButton(interaction: ButtonInteraction, context: BotContext): Promise<boolean> {
  if (!interaction.customId.startsWith("ticket:")) return false;
  const action = interaction.customId.split(":")[1];
  if (action === "claim") await claimTicket(interaction, context);
  else if (action === "close") await closeTicket(interaction, context);
  else if (action === "reopen") await reopenTicket(interaction, context);
  else if (action === "transcript") await transcriptTicket(interaction, context);
  else if (action === "delete") await deleteTicket(interaction, context);
  else return false;
  return true;
}
