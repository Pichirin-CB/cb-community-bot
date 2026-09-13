import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextChannel,
} from "discord.js";
import type { BotContext } from "../../types/context.js";
import { embeds } from "../embeds/embedService.js";
import { hasInternalPermission } from "../../permissions/staffLevels.js";
import {
  buildAnnouncementPreviewPayload,
  buildAnnouncementPublishPayload,
} from "./announcementBuilder.js";
import { announcementDrafts } from "./announcementDrafts.js";

function assertCachedGuild(
  interaction: ButtonInteraction | ModalSubmitInteraction,
): asserts interaction is (ButtonInteraction | ModalSubmitInteraction) & { guild: Guild; member: GuildMember } {
  if (!interaction.inCachedGuild()) throw new Error("Esta accion solo puede usarse dentro del servidor.");
}

async function canUseAnnouncementDraft(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  context: BotContext,
  draftId: string,
) {
  assertCachedGuild(interaction);
  const draft = announcementDrafts.get(draftId);
  if (!draft) {
    await interaction.reply({ embeds: [embeds.warning("Preview expirado", "Crea un nuevo anuncio para continuar.")], ephemeral: true });
    return null;
  }
  if (draft.ownerId !== interaction.user.id) {
    await interaction.reply({ embeds: [embeds.error("Accion privada", "Solo quien creo el borrador puede usar estos botones.")], ephemeral: true });
    return null;
  }
  const config = context.repositories.guildConfig.ensure(interaction.guild.id);
  if (!hasInternalPermission(interaction.member, config, "announcements")) {
    await interaction.reply({ embeds: [embeds.error("Sin permisos", "No tienes permisos internos para publicar anuncios.")], ephemeral: true });
    return null;
  }
  return draft;
}

function parseDraftId(customId: string): { action: string; draftId: string } | null {
  const [prefix, action, draftId] = customId.split(":");
  if (prefix !== "announce" || !action || !draftId) return null;
  return { action, draftId };
}

async function showEditModal(interaction: ButtonInteraction, draftId: string, context: BotContext): Promise<void> {
  assertCachedGuild(interaction);
  const draft = await canUseAnnouncementDraft(interaction, context, draftId);
  if (!draft) return;

  const modal = new ModalBuilder().setCustomId(`announce:modal:${draft.id}`).setTitle("Editar anuncio");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Titulo")
        .setStyle(TextInputStyle.Short)
        .setValue(draft.title.slice(0, 256))
        .setRequired(true)
        .setMaxLength(256),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("content")
        .setLabel("Contenido")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(draft.content.slice(0, 4000))
        .setRequired(true)
        .setMaxLength(4000),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("cta_label")
        .setLabel("CTA label")
        .setStyle(TextInputStyle.Short)
        .setValue(draft.ctaLabel ?? "")
        .setRequired(false)
        .setMaxLength(80),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("cta_url")
        .setLabel("CTA URL")
        .setStyle(TextInputStyle.Short)
        .setValue(draft.ctaUrl ?? "")
        .setRequired(false)
        .setMaxLength(300),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("image_url")
        .setLabel("Imagen URL")
        .setStyle(TextInputStyle.Short)
        .setValue(draft.imageUrl ?? "")
        .setRequired(false)
        .setMaxLength(300),
    ),
  );
  await interaction.showModal(modal);
}

async function publishDraft(interaction: ButtonInteraction, draftId: string, context: BotContext): Promise<void> {
  assertCachedGuild(interaction);
  const draft = await canUseAnnouncementDraft(interaction, context, draftId);
  if (!draft) return;

  if (draft.mention !== "none" && !interaction.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
    await interaction.reply({
      embeds: [embeds.error("Mencion no autorizada", "Necesitas el permiso nativo Mencionar @everyone, @here y todos los roles.")],
      ephemeral: true,
    });
    return;
  }

  const channel = await interaction.guild.channels.fetch(draft.channelId).catch(() => null);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
    await interaction.reply({ embeds: [embeds.error("Canal no disponible", "El canal del anuncio ya no existe o no es valido.")], ephemeral: true });
    return;
  }

  const botMember = interaction.guild.members.me;
  const permissions = botMember ? (channel as TextChannel).permissionsFor(botMember) : null;
  if (!permissions?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks)) {
    await interaction.reply({ embeds: [embeds.error("Permisos insuficientes", "Necesito ver el canal, enviar mensajes y enviar embeds.")], ephemeral: true });
    return;
  }

  await interaction.deferUpdate();
  const state = announcementDrafts.markPublishing(draft.id);
  if (state === "already") {
    await interaction.editReply({ embeds: [embeds.warning("Ya publicado", "Este anuncio ya fue publicado.")], components: [] });
    return;
  }
  if (state === "missing") {
    await interaction.editReply({ embeds: [embeds.warning("Preview expirado", "Crea un nuevo anuncio para continuar.")], components: [] });
    return;
  }

  await (channel as TextChannel).send(buildAnnouncementPublishPayload(draft));
  context.repositories.auditEvents.create({
    guildId: interaction.guild.id,
    actorUserId: interaction.user.id,
    eventType: "ANNOUNCEMENT_PUBLISHED",
    summary: `${interaction.user.tag} publico un anuncio en ${(channel as TextChannel).name}`,
    details: { channelId: channel.id, draftId: draft.id, mention: draft.mention, kind: draft.kind },
  });
  await context.services.logs.send(interaction.guild, "bot", "Anuncio publicado", `${interaction.user.tag} publico en #${(channel as TextChannel).name}`);
  await interaction.editReply({ embeds: [embeds.success("Anuncio publicado", `Publicado en <#${channel.id}>.`)], components: [], content: "" });
}

export async function handleAnnouncementButton(interaction: ButtonInteraction, context: BotContext): Promise<boolean> {
  const parsed = parseDraftId(interaction.customId);
  if (!parsed) return false;
  if (parsed.action === "publish") await publishDraft(interaction, parsed.draftId, context);
  else if (parsed.action === "edit") await showEditModal(interaction, parsed.draftId, context);
  else if (parsed.action === "cancel") {
    const draft = await canUseAnnouncementDraft(interaction, context, parsed.draftId);
    if (!draft) return true;
    announcementDrafts.delete(draft.id);
    await interaction.update({ embeds: [embeds.info("Anuncio cancelado", "El borrador fue descartado.")], components: [], content: "" });
  } else return false;
  return true;
}

export async function handleAnnouncementModal(interaction: ModalSubmitInteraction, context: BotContext): Promise<boolean> {
  assertCachedGuild(interaction);
  const parsed = parseDraftId(interaction.customId);
  if (!parsed || parsed.action !== "modal") return false;
  const draft = await canUseAnnouncementDraft(interaction, context, parsed.draftId);
  if (!draft) return true;

  const updated = announcementDrafts.update(draft.id, {
    title: interaction.fields.getTextInputValue("title"),
    content: interaction.fields.getTextInputValue("content"),
    ctaLabel: interaction.fields.getTextInputValue("cta_label"),
    ctaUrl: interaction.fields.getTextInputValue("cta_url"),
    imageUrl: interaction.fields.getTextInputValue("image_url"),
  });
  if (!updated) {
    await interaction.reply({ embeds: [embeds.warning("Preview expirado", "Crea un nuevo anuncio para continuar.")], ephemeral: true });
    return true;
  }

  await interaction.reply({ ...buildAnnouncementPreviewPayload(updated), ephemeral: true });
  return true;
}
