import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Message,
  type TextChannel,
} from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import {
  buildSelfRolePanelComponents,
  buildSelfRolePanelEmbed,
  selfRoleCustomPrefix,
  selfRoleGroupKeys,
  selfRoleGroups,
  selfRolePanelAttachments,
} from "../../modules/selfRoles/selfRolePresentation.js";
import {
  assertValidSelfRoleGroup,
  ensureSelfRoleGroups,
  seedSelfRoles,
  validateSelfRole,
} from "../../modules/selfRoles/selfRoleSetup.js";
import { regenerateColorPalettes } from "../../modules/selfRoles/colorPaletteGenerator.js";
import { Native, UserFacingError, nativeMessages, requireNative, requirePermission } from "../../permissions/guards.js";
import type { BotContext } from "../../types/context.js";

function panelPayload(context: BotContext, guildId: string) {
  const options = context.repositories.selfRoles.listOptions(guildId);
  return {
    embeds: [buildSelfRolePanelEmbed()],
    components: buildSelfRolePanelComponents(options),
    files: selfRolePanelAttachments(),
  };
}

function assertPanelReady(context: BotContext, guildId: string): void {
  const options = context.repositories.selfRoles.listOptions(guildId);
  if (options.length === 0) {
    throw new UserFacingError("No hay roles de personalizacion configurados. Ejecuta primero /roles-panel seed.");
  }
}

async function fetchPanelMessage(channel: TextChannel, messageId: string | null): Promise<Message | null> {
  if (!messageId) return null;
  return channel.messages.fetch(messageId).catch(() => null);
}

export async function findExistingRolePanelMessage(channel: TextChannel, botUserId: string): Promise<Message | null> {
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return null;
  return (
    messages.find((message) => {
      if (message.author.id !== botUserId) return false;
      const hasPanelComponent = message.components.some((row) =>
        "components" in row &&
        row.components.some((component: any) => typeof component.customId === "string" && component.customId.startsWith(`${selfRoleCustomPrefix}:`)),
      );
      const hasPanelEmbed = message.embeds.some((embed) => embed.title?.includes("PERSONALIZA TU PERFIL"));
      return hasPanelComponent || hasPanelEmbed;
    }) ?? null
  );
}

async function resolveExistingPanelMessage(context: BotContext, guildId: string, targetChannel: TextChannel): Promise<Message | null> {
  const config = context.repositories.guildConfig.ensure(guildId);
  const configuredChannel =
    config.role_panel_channel_id && config.role_panel_message_id
      ? await targetChannel.guild.channels.fetch(config.role_panel_channel_id).catch(() => null)
      : null;
  if (configuredChannel?.type === ChannelType.GuildText || configuredChannel?.type === ChannelType.GuildAnnouncement) {
    const message = await fetchPanelMessage(configuredChannel as TextChannel, config.role_panel_message_id);
    if (message) return message;
  }
  return findExistingRolePanelMessage(targetChannel, context.client.user!.id);
}

async function publishPanel(interactionChannel: TextChannel, context: BotContext, actorUserId: string): Promise<{ message: Message; updated: boolean }> {
  assertPanelReady(context, interactionChannel.guild.id);
  const existing = await resolveExistingPanelMessage(context, interactionChannel.guild.id, interactionChannel);
  const payload = panelPayload(context, interactionChannel.guild.id);

  if (existing) {
    const message = await existing.edit(payload);
    context.repositories.guildConfig.setRolePanel(interactionChannel.guild.id, message.channelId, message.id);
    context.repositories.auditEvents.create({
      guildId: interactionChannel.guild.id,
      actorUserId,
      eventType: "ROLE_PANEL_UPDATED",
      summary: `Panel de personalizacion actualizado en ${message.channelId}`,
      details: { channelId: message.channelId, messageId: message.id },
    });
    return { message, updated: true };
  }

  const message = await interactionChannel.send(payload);
  context.repositories.guildConfig.setRolePanel(interactionChannel.guild.id, interactionChannel.id, message.id);
  context.repositories.auditEvents.create({
    guildId: interactionChannel.guild.id,
    actorUserId,
    eventType: "ROLE_PANEL_PUBLISHED",
    summary: `Panel de personalizacion publicado en ${interactionChannel.id}`,
    details: { channelId: interactionChannel.id, messageId: message.id },
  });
  return { message, updated: false };
}

function groupChoices() {
  return selfRoleGroupKeys.map((key) => ({ name: key, value: key }));
}

function roleListDescription(context: BotContext, guildId: string): string {
  const options = context.repositories.selfRoles.listOptions(guildId, true);
  if (options.length === 0) return "Sin opciones configuradas.";
  return selfRoleGroupKeys
    .map((groupKey) => {
      const rows = options
        .filter((option) => option.group_key === groupKey)
        .map((option) => `- ${option.enabled ? "ON" : "OFF"} <@&${option.role_id}> (${option.label})`);
      return rows.length > 0 ? `**${groupKey}**\n${rows.join("\n")}` : null;
    })
    .filter((row): row is string => Boolean(row))
    .join("\n\n")
    .slice(0, 3900);
}

export const rolesPanelCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("roles-panel")
    .setDescription("Gestiona el panel oficial de personalizacion de roles.")
    .addSubcommand((sub) => sub.setName("seed").setDescription("Detecta y guarda colores/preferencias existentes."))
    .addSubcommand((sub) => sub.setName("preview").setDescription("Muestra una vista previa privada del panel."))
    .addSubcommand((sub) => sub.setName("regenerate-palettes").setDescription("Regenera las imagenes de paletas de colores."))
    .addSubcommand((sub) =>
      sub
        .setName("publish")
        .setDescription("Publica o actualiza el panel en un canal.")
        .addChannelOption((option) =>
          option
            .setName("canal")
            .setDescription("Canal donde publicar o actualizar el panel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Lista las opciones configuradas."))
    .addSubcommand((sub) =>
      sub
        .setName("option-add")
        .setDescription("Agrega o actualiza una opcion del panel.")
        .addStringOption((option) =>
          option.setName("grupo").setDescription("Grupo").setRequired(true).addChoices(...groupChoices()),
        )
        .addRoleOption((option) => option.setName("rol").setDescription("Rol seleccionable").setRequired(true))
        .addStringOption((option) => option.setName("etiqueta").setDescription("Nombre mostrado").setMaxLength(100))
        .addIntegerOption((option) => option.setName("orden").setDescription("Orden visual").setMinValue(0).setMaxValue(999)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("option-remove")
        .setDescription("Quita una opcion de la configuracion.")
        .addStringOption((option) =>
          option.setName("grupo").setDescription("Grupo").setRequired(true).addChoices(...groupChoices()),
        )
        .addRoleOption((option) => option.setName("rol").setDescription("Rol").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("option-enable")
        .setDescription("Activa o desactiva una opcion.")
        .addStringOption((option) =>
          option.setName("grupo").setDescription("Grupo").setRequired(true).addChoices(...groupChoices()),
        )
        .addRoleOption((option) => option.setName("rol").setDescription("Rol").setRequired(true))
        .addBooleanOption((option) => option.setName("activo").setDescription("Estado").setRequired(true)),
    ),
  level: "config",
  description: "Panel de personalizacion de roles",
  async execute(interaction, context) {
    const member = await requirePermission(interaction, context, "config");
    requireNative(member, Native.ManageGuild, nativeMessages.manageGuild);
    const guild = interaction.guild!;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "seed") {
      const botMember = guild.members.me;
      if (!botMember) throw new UserFacingError("No pude resolver el miembro del bot en el servidor.");
      await guild.roles.fetch();
      const config = context.repositories.guildConfig.ensure(guild.id);
      const result = seedSelfRoles(context.repositories.selfRoles, guild, config, botMember);
      await regenerateColorPalettes(guild, context.repositories.selfRoles);
      await interaction.reply({
        embeds: [
          embeds.success(
            "Configuracion inicial guardada",
            [
              `Incluidos: ${result.included.length}`,
              `Excluidos: ${result.excluded.length}`,
              `No encontrados: ${result.missing.length}`,
            ].join("\n"),
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "regenerate-palettes") {
      await guild.roles.fetch();
      const result = await regenerateColorPalettes(guild, context.repositories.selfRoles);
      const generated = Object.entries(result)
        .map(([key, file]) => `${key}: ${file ? "OK" : "no disponible"}`)
        .join("\n");
      await interaction.reply({ embeds: [embeds.success("Paletas regeneradas", generated)], ephemeral: true });
      return;
    }

    if (subcommand === "preview") {
      ensureSelfRoleGroups(context.repositories.selfRoles, guild.id);
      assertPanelReady(context, guild.id);
      await interaction.reply({ ...panelPayload(context, guild.id), ephemeral: true });
      return;
    }

    if (subcommand === "publish") {
      const channel = interaction.options.getChannel("canal", true);
      if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        throw new UserFacingError("El panel debe publicarse en un canal de texto o anuncios.");
      }
      const botMember = guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.SendMessages | PermissionFlagsBits.EmbedLinks)) {
        throw new UserFacingError("Necesito permisos para enviar mensajes y embeds en el canal elegido.");
      }
      const result = await publishPanel(channel as TextChannel, context, interaction.user.id);
      await interaction.reply({
        embeds: [
          embeds.success(
            result.updated ? "Panel actualizado" : "Panel publicado",
            `Panel de personalizacion: https://discord.com/channels/${guild.id}/${result.message.channelId}/${result.message.id}`,
          ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "list") {
      await interaction.reply({ embeds: [embeds.info("Opciones de personalizacion", roleListDescription(context, guild.id))], ephemeral: true });
      return;
    }

    if (subcommand === "option-add") {
      const groupKey = interaction.options.getString("grupo", true);
      assertValidSelfRoleGroup(groupKey);
      const role = interaction.options.getRole("rol", true);
      const fullRole = await guild.roles.fetch(role.id);
      const botMember = guild.members.me;
      if (!fullRole || !botMember) throw new UserFacingError("No pude resolver el rol indicado.");
      const config = context.repositories.guildConfig.ensure(guild.id);
      const reason = validateSelfRole(fullRole, config, botMember);
      if (reason) throw new UserFacingError(reason);
      ensureSelfRoleGroups(context.repositories.selfRoles, guild.id);
      const label = interaction.options.getString("etiqueta")?.trim() || fullRole.name;
      const sortOrder = interaction.options.getInteger("orden") ?? 0;
      context.repositories.selfRoles.upsertOption({
        guildId: guild.id,
        groupKey,
        roleId: fullRole.id,
        label,
        sortOrder,
      });
      await regenerateColorPalettes(guild, context.repositories.selfRoles);
      await interaction.reply({ embeds: [embeds.success("Opcion guardada", `${selfRoleGroups[groupKey].label}: <@&${fullRole.id}>`)], ephemeral: true });
      return;
    }

    if (subcommand === "option-remove") {
      const groupKey = interaction.options.getString("grupo", true);
      assertValidSelfRoleGroup(groupKey);
      const role = interaction.options.getRole("rol", true);
      const removed = context.repositories.selfRoles.removeOption(guild.id, groupKey, role.id);
      await regenerateColorPalettes(guild, context.repositories.selfRoles);
      await interaction.reply({
        embeds: [embeds.success("Opcion actualizada", removed ? `Eliminada: <@&${role.id}>` : "No existia esa opcion.")],
        ephemeral: true,
      });
      return;
    }

    if (subcommand === "option-enable") {
      const groupKey = interaction.options.getString("grupo", true);
      assertValidSelfRoleGroup(groupKey);
      const role = interaction.options.getRole("rol", true);
      const enabled = interaction.options.getBoolean("activo", true);
      const changed = context.repositories.selfRoles.setOptionEnabled(guild.id, groupKey, role.id, enabled);
      await regenerateColorPalettes(guild, context.repositories.selfRoles);
      await interaction.reply({
        embeds: [embeds.success("Opcion actualizada", changed ? `${enabled ? "Activada" : "Desactivada"}: <@&${role.id}>` : "No existia esa opcion.")],
        ephemeral: true,
      });
    }
  },
};
