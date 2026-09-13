import {
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Role,
  type StringSelectMenuInteraction,
} from "discord.js";
import { logger } from "../../logger.js";
import type { BotContext } from "../../types/context.js";
import { embeds } from "../embeds/embedService.js";
import {
  colorGroupKeys,
  isColorGroupKey,
  isSelfRoleGroupKey,
  plannedColorRoleChanges,
  plannedMultiRoleChanges,
  preferenceGroupKey,
  selfRoleCustomPrefix,
  selfRoleGroups,
} from "./selfRolePresentation.js";
import { validateSelfRole } from "./selfRoleSetup.js";
import { paletteAttachmentForGroup, roleColorToHex } from "./colorPaletteGenerator.js";

const locks = new Map<string, Promise<void>>();
const genericError = "No pudimos aplicar esa seleccion. Contacta con el staff si el problema continua.";

export function withSelfRoleLock(key: string, task: () => Promise<void>): Promise<void> {
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  locks.set(key, next);
  return next.finally(() => {
    if (locks.get(key) === next) locks.delete(key);
  });
}

function assertCachedGuild(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
): asserts interaction is (StringSelectMenuInteraction | ButtonInteraction) & { guild: Guild; member: GuildMember } {
  if (!interaction.inCachedGuild()) {
    throw new Error("Esta accion solo puede usarse dentro del servidor.");
  }
}

async function fetchManagedRole(guild: Guild, roleId: string): Promise<Role | null> {
  return guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
}

async function ensureRolesManageable(input: {
  guild: Guild;
  roleIds: string[];
  context: BotContext;
  botMember: GuildMember;
}): Promise<Role[]> {
  const config = input.context.repositories.guildConfig.ensure(input.guild.id);
  const roles: Role[] = [];
  for (const roleId of input.roleIds) {
    const role = await fetchManagedRole(input.guild, roleId);
    if (!role) {
      logger.warn({ guildId: input.guild.id, roleId }, "Self-role configurado ya no existe");
      throw new Error(genericError);
    }
    const reason = validateSelfRole(role, config, input.botMember);
    if (reason) {
      logger.warn({ guildId: input.guild.id, roleId, reason }, "Self-role no administrable");
      throw new Error(genericError);
    }
    roles.push(role);
  }
  return roles;
}

function configuredColorRoleIds(context: BotContext, guildId: string): string[] {
  return colorGroupKeys.flatMap((groupKey) =>
    context.repositories.selfRoles.listOptionsByGroup(guildId, groupKey, true).map((option) => option.role_id),
  );
}

function colorConfirmationEmbed(label: string, color: number): EmbedBuilder {
  const hex = roleColorToHex(color);
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("✅ COLOR ACTUALIZADO")
    .setDescription(["Tu nuevo color es:", "", `**${label}**`, hex].join("\n"));
}

function colorRemovedEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x2f5d3a)
    .setTitle("🎨 COLOR ELIMINADO")
    .setDescription("Ya no tienes un color personalizado activo.");
}

async function applyColor(interaction: StringSelectMenuInteraction, context: BotContext, roleId: string): Promise<void> {
  assertCachedGuild(interaction);
  const groupKey = interaction.customId.split(":")[2] ?? "";
  if (!isSelfRoleGroupKey(groupKey) || !isColorGroupKey(groupKey)) throw new Error(genericError);
  const option = context.repositories.selfRoles.getOption(interaction.guild.id, groupKey, roleId);
  if (!option || option.enabled !== 1) throw new Error(genericError);
  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error(genericError);
  let selectedRoleColor: number | null = null;

  await withSelfRoleLock(`${interaction.guildId}:${interaction.user.id}:color`, async () => {
    const colorRoleIds = configuredColorRoleIds(context, interaction.guild.id);
    const changes = plannedColorRoleChanges(interaction.member.roles.cache.keys(), colorRoleIds, roleId);
    const manageable = await ensureRolesManageable({
      guild: interaction.guild,
      roleIds: [...new Set([...changes.remove, ...changes.add, roleId])],
      context,
      botMember,
    });
    selectedRoleColor = manageable.find((role) => role.id === roleId)?.color ?? null;
    if (changes.remove.length > 0) await interaction.member.roles.remove(changes.remove, "Cambio de color desde panel CB Studios Bot");
    if (changes.add.length > 0) await interaction.member.roles.add(changes.add, "Cambio de color desde panel CB Studios Bot");
    context.repositories.auditEvents.create({
      guildId: interaction.guild.id,
      actorUserId: interaction.user.id,
      targetUserId: interaction.user.id,
      eventType: "SELF_ROLE_COLOR_CHANGED",
      summary: `${interaction.user.tag} cambio su color a ${option.label}`,
      details: { groupKey, addedRoleId: roleId, removedRoleIds: changes.remove },
    });
  });

  if (selectedRoleColor === null) throw new Error(genericError);
  await interaction.reply({ embeds: [colorConfirmationEmbed(option.label, selectedRoleColor)], ephemeral: true });
}

async function removeColor(interaction: ButtonInteraction, context: BotContext): Promise<void> {
  assertCachedGuild(interaction);
  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error(genericError);

  await withSelfRoleLock(`${interaction.guildId}:${interaction.user.id}:color`, async () => {
    const colorRoleIds = configuredColorRoleIds(context, interaction.guild.id);
    const changes = plannedColorRoleChanges(interaction.member.roles.cache.keys(), colorRoleIds, null);
    await ensureRolesManageable({ guild: interaction.guild, roleIds: changes.remove, context, botMember });
    if (changes.remove.length > 0) await interaction.member.roles.remove(changes.remove, "Color retirado desde panel CB Studios Bot");
    context.repositories.auditEvents.create({
      guildId: interaction.guild.id,
      actorUserId: interaction.user.id,
      targetUserId: interaction.user.id,
      eventType: "SELF_ROLE_COLOR_REMOVED",
      summary: `${interaction.user.tag} retiro su color personalizado`,
      details: { removedRoleIds: changes.remove },
    });
  });

  await interaction.reply({
    embeds: [colorRemovedEmbed()],
    ephemeral: true,
  });
}

async function showPalette(interaction: ButtonInteraction, context: BotContext): Promise<void> {
  assertCachedGuild(interaction);
  const groupKey = interaction.customId.split(":")[2] ?? "";
  const attachment = await paletteAttachmentForGroup(interaction.guild, context.repositories.selfRoles, groupKey);
  if (!attachment) {
    await interaction.reply({
      embeds: [embeds.warning("Paleta no disponible", "⚠️ No se pudo generar la vista previa de esta paleta.")],
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({
    embeds: [
      embeds
        .official(
          attachment.title,
          [
            "Usa esta imagen como referencia visual.",
            "",
            "Selecciona el color que quieras desde el menu correspondiente del panel.",
          ].join("\n"),
          "info",
        )
        .setImage(`attachment://${attachment.file.name}`),
    ],
    files: [attachment.file],
    ephemeral: true,
  });
}

async function showPaletteMenu(interaction: ButtonInteraction): Promise<void> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${selfRoleCustomPrefix}:palette:COLOR_CLASSIC`)
      .setLabel("Clasicos")
      .setEmoji(selfRoleGroups.COLOR_CLASSIC.emoji)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${selfRoleCustomPrefix}:palette:COLOR_PASTEL`)
      .setLabel("Pastel")
      .setEmoji(selfRoleGroups.COLOR_PASTEL.emoji)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${selfRoleCustomPrefix}:palette:COLOR_DARK`)
      .setLabel("Oscuros")
      .setEmoji(selfRoleGroups.COLOR_DARK.emoji)
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    embeds: [
      embeds.official(
        "🎨 VISTA DE PALETAS",
        "Selecciona que grupo quieres visualizar.",
        "info",
      ),
    ],
    components: [row],
    ephemeral: true,
  });
}

async function applyPreferences(interaction: StringSelectMenuInteraction, context: BotContext): Promise<void> {
  assertCachedGuild(interaction);
  const groupKey = interaction.customId.split(":")[2] ?? "";
  if (groupKey !== preferenceGroupKey) throw new Error(genericError);

  const enabledOptions = context.repositories.selfRoles.listOptionsByGroup(interaction.guild.id, preferenceGroupKey);
  const enabledRoleIds = new Set(enabledOptions.map((option) => option.role_id));
  if (interaction.values.some((roleId) => !enabledRoleIds.has(roleId))) throw new Error(genericError);

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error(genericError);

  await withSelfRoleLock(`${interaction.guildId}:${interaction.user.id}:preferences`, async () => {
    const configuredRoleIds = context.repositories.selfRoles
      .listOptionsByGroup(interaction.guild.id, preferenceGroupKey, true)
      .map((option) => option.role_id);
    const changes = plannedMultiRoleChanges(interaction.member.roles.cache.keys(), configuredRoleIds, interaction.values);
    await ensureRolesManageable({
      guild: interaction.guild,
      roleIds: [...changes.remove, ...changes.add],
      context,
      botMember,
    });
    if (changes.remove.length > 0) await interaction.member.roles.remove(changes.remove, "Preferencias actualizadas desde panel CB Studios Bot");
    if (changes.add.length > 0) await interaction.member.roles.add(changes.add, "Preferencias actualizadas desde panel CB Studios Bot");
    context.repositories.auditEvents.create({
      guildId: interaction.guild.id,
      actorUserId: interaction.user.id,
      targetUserId: interaction.user.id,
      eventType: "SELF_ROLE_PREFERENCES_CHANGED",
      summary: `${interaction.user.tag} actualizo sus preferencias`,
      details: { addedRoleIds: changes.add, removedRoleIds: changes.remove, selectedRoleIds: interaction.values },
    });
  });

  await interaction.reply({
    embeds: [embeds.success("Preferencias actualizadas", "⚙️ Tus preferencias fueron actualizadas.")],
    ephemeral: true,
  });
}

async function safeSelfRoleReply(interaction: StringSelectMenuInteraction | ButtonInteraction, error: unknown): Promise<void> {
  logger.warn({ error }, "Fallo aplicando self-role");
  await interaction.reply({ embeds: [embeds.error("No pudimos aplicar esa seleccion", genericError)], ephemeral: true });
}

export async function handleSelfRoleSelect(interaction: StringSelectMenuInteraction, context: BotContext): Promise<boolean> {
  if (!interaction.customId.startsWith(`${selfRoleCustomPrefix}:`)) return false;
  try {
    const action = interaction.customId.split(":")[1];
    if (action === "color") {
      const roleId = interaction.values[0];
      if (!roleId || interaction.values.length !== 1) throw new Error(genericError);
      await applyColor(interaction, context, roleId);
    } else if (action === "preferences") {
      await applyPreferences(interaction, context);
    } else {
      throw new Error(genericError);
    }
  } catch (error) {
    await safeSelfRoleReply(interaction, error);
  }
  return true;
}

export async function handleSelfRoleButton(interaction: ButtonInteraction, context: BotContext): Promise<boolean> {
  if (!interaction.customId.startsWith(`${selfRoleCustomPrefix}:`)) return false;
  try {
    if (interaction.customId === `${selfRoleCustomPrefix}:color:remove`) {
      await removeColor(interaction, context);
    } else if (interaction.customId === `${selfRoleCustomPrefix}:palettes`) {
      await showPaletteMenu(interaction);
    } else if (interaction.customId.startsWith(`${selfRoleCustomPrefix}:palette:`)) {
      await showPalette(interaction, context);
    } else {
      throw new Error(genericError);
    }
  } catch (error) {
    if (interaction.customId.startsWith(`${selfRoleCustomPrefix}:palette:`)) {
      logger.warn({ error }, "No se pudo generar paleta de self-role");
      await interaction.reply({
        embeds: [embeds.warning("Paleta no disponible", "⚠️ No se pudo generar la vista previa de esta paleta.")],
        ephemeral: true,
      });
    } else {
      await safeSelfRoleReply(interaction, error);
    }
  }
  return true;
}
