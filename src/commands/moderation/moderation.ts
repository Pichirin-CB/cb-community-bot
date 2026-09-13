import {
  ChannelType,
  SlashCommandBuilder,
  type GuildMember,
  type Role,
  type TextChannel,
} from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { embeds } from "../../modules/embeds/embedService.js";
import { canActOnMember, canManageRole, isProtectedAdministrativeRole } from "../../permissions/staffLevels.js";
import {
  Native,
  UserFacingError,
  nativeMessages,
  requireBotPermission,
  requireNative,
  requirePermission,
} from "../../permissions/guards.js";
import { cleanReason } from "../../utils/validation.js";
import { DISCORD_TIMEOUT_MAX_MS, formatDuration, parseDuration } from "../../utils/time.js";

async function fetchTarget(interaction: any): Promise<GuildMember> {
  const user = interaction.options.getUser("usuario", true);
  return interaction.guild.members.fetch(user.id);
}

function botMember(interaction: any): GuildMember {
  const member = interaction.guild.members.me;
  if (!member) throw new UserFacingError("No pude resolver mi miembro dentro del servidor.");
  return member;
}

function assertTarget(actor: GuildMember, bot: GuildMember, target: GuildMember): void {
  const check = canActOnMember({
    actor: { id: actor.id, highestRolePosition: actor.roles.highest.position },
    bot: { id: bot.id, highestRolePosition: bot.roles.highest.position },
    target: {
      id: target.id,
      highestRolePosition: target.roles.highest.position,
      isOwner: target.id === target.guild.ownerId,
    },
  });
  if (!check.ok) throw new UserFacingError(check.reason);
}

export const warnCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Gestiona advertencias persistentes.")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Crea una advertencia.")
        .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true))
        .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(512)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Revoca una advertencia sin borrar historial.")
        .addIntegerOption((option) => option.setName("id").setDescription("ID interno del warning").setRequired(true).setMinValue(1))
        .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(512)),
    ),
  level: "warn",
  description: "Warnings persistentes",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "warn");
    const sub = interaction.options.getSubcommand();
    const reason = cleanReason(interaction.options.getString("motivo", true));

    if (sub === "remove") {
      const id = interaction.options.getInteger("id", true);
      const removed = context.repositories.warnings.remove(interaction.guildId!, id, interaction.user.id, reason);
      await interaction.reply({
        embeds: [
          removed
            ? embeds.success("Warning revocado", `Warning interno ${id} revocado. Motivo: ${reason}`)
            : embeds.warning("No encontrado", "No encontre un warning activo con ese ID."),
        ],
        ephemeral: true,
      });
      return;
    }

    const target = await fetchTarget(interaction);
    assertTarget(actor, botMember(interaction), target);
    const created = context.repositories.cases.create({
      guildId: interaction.guildId!,
      targetUserId: target.id,
      moderatorUserId: interaction.user.id,
      actionType: "warn",
      reason,
    });
    context.repositories.warnings.create(interaction.guildId!, created.case_id, target.id, interaction.user.id, reason);
    await context.services.logs.send(interaction.guild!, "moderation", "Warning", `${target} recibio ${created.case_id}: ${reason}`);
    await interaction.reply({
      embeds: [embeds.moderation(`Caso ${created.case_id}`, `${target} recibio una advertencia.\nMotivo: ${reason}`)],
      ephemeral: true,
    });
  },
};

export const warningsCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("Lista warnings activos de un usuario.")
    .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true)),
  level: "warn",
  description: "Consulta de warnings",
  async execute(interaction, context) {
    await requirePermission(interaction, context, "warn");
    const user = interaction.options.getUser("usuario", true);
    const rows = context.repositories.warnings.listActive(interaction.guildId!, user.id);
    const body = rows.length
      ? rows.map((row) => `#${row.id} ${row.case_id} - ${row.reason}`).join("\n")
      : "No tiene warnings activos.";
    await interaction.reply({ embeds: [embeds.info(`Warnings de ${user.username}`, body)], ephemeral: true });
  },
};

export const timeoutCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Aplica timeout a un usuario.")
    .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((option) => option.setName("duracion").setDescription("Ej: 30m, 2h, 7d").setRequired(true))
    .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(512)),
  level: "timeout",
  description: "Timeout de moderacion",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "timeout");
    requireBotPermission(botMember(interaction), Native.ModerateMembers, nativeMessages.moderateMembers);
    const target = await fetchTarget(interaction);
    assertTarget(actor, botMember(interaction), target);
    const durationMs = parseDuration(interaction.options.getString("duracion", true));
    if (durationMs > DISCORD_TIMEOUT_MAX_MS) throw new UserFacingError("Discord permite timeout maximo de 28 dias.");
    const reason = cleanReason(interaction.options.getString("motivo", true));
    await target.timeout(durationMs, reason);
    const created = context.repositories.cases.create({
      guildId: interaction.guildId!,
      targetUserId: target.id,
      moderatorUserId: interaction.user.id,
      actionType: "timeout",
      reason,
      durationMs,
      expiresAt: new Date(Date.now() + durationMs).toISOString(),
    });
    await context.services.logs.send(interaction.guild!, "moderation", "Timeout", `${target} - ${created.case_id} - ${reason}`);
    await interaction.reply({ embeds: [embeds.moderation(`Caso ${created.case_id}`, `${target} en timeout por ${formatDuration(durationMs)}.`)], ephemeral: true });
  },
};

export const untimeoutCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Retira timeout a un usuario.")
    .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setMaxLength(512)),
  level: "timeout",
  description: "Retirar timeout",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "timeout");
    requireBotPermission(botMember(interaction), Native.ModerateMembers, nativeMessages.moderateMembers);
    const target = await fetchTarget(interaction);
    assertTarget(actor, botMember(interaction), target);
    const reason = cleanReason(interaction.options.getString("motivo"));
    await target.timeout(null, reason);
    const created = context.repositories.cases.create({
      guildId: interaction.guildId!,
      targetUserId: target.id,
      moderatorUserId: interaction.user.id,
      actionType: "untimeout",
      reason,
    });
    await interaction.reply({ embeds: [embeds.success(`Caso ${created.case_id}`, `Timeout retirado a ${target}.`)], ephemeral: true });
  },
};

export const kickCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa a un usuario con confirmacion.")
    .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(512)),
  level: "kick",
  description: "Expulsion con confirmacion",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "kick");
    requireBotPermission(botMember(interaction), Native.KickMembers, nativeMessages.kickMembers);
    const target = await fetchTarget(interaction);
    assertTarget(actor, botMember(interaction), target);
    const reason = cleanReason(interaction.options.getString("motivo", true));
    await context.services.confirmations.request(interaction, `Expulsar a ${target}?\nMotivo: ${reason}`, async (button) => {
      await target.kick(reason);
      const created = context.repositories.cases.create({
        guildId: interaction.guildId!,
        targetUserId: target.id,
        moderatorUserId: interaction.user.id,
        actionType: "kick",
        reason,
      });
      await context.services.logs.send(interaction.guild!, "moderation", "Kick", `${target.user.tag} - ${created.case_id}`);
      await button.update({ embeds: [embeds.success(`Caso ${created.case_id}`, `${target.user.tag} fue expulsado.`)], components: [] });
    });
  },
};

export const banCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banea a un usuario con confirmacion.")
    .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(512))
    .addIntegerOption((option) => option.setName("borrar_dias").setDescription("Dias de mensajes a borrar").setMinValue(0).setMaxValue(7)),
  level: "ban",
  description: "Ban con confirmacion",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "ban");
    requireBotPermission(botMember(interaction), Native.BanMembers, nativeMessages.banMembers);
    const target = await fetchTarget(interaction);
    assertTarget(actor, botMember(interaction), target);
    const reason = cleanReason(interaction.options.getString("motivo", true));
    const deleteMessageSeconds = (interaction.options.getInteger("borrar_dias") ?? 0) * 86_400;
    await context.services.confirmations.request(interaction, `Banear a ${target}?\nMotivo: ${reason}`, async (button) => {
      await interaction.guild!.members.ban(target.id, { reason, deleteMessageSeconds });
      const created = context.repositories.cases.create({
        guildId: interaction.guildId!,
        targetUserId: target.id,
        moderatorUserId: interaction.user.id,
        actionType: "ban",
        reason,
      });
      await context.services.logs.send(interaction.guild!, "moderation", "Ban", `${target.user.tag} - ${created.case_id}`);
      await button.update({ embeds: [embeds.success(`Caso ${created.case_id}`, `${target.user.tag} fue baneado.`)], components: [] });
    });
  },
};

export const unbanCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Retira un ban por ID de usuario.")
    .addStringOption((option) => option.setName("usuario_id").setDescription("Discord ID").setRequired(true))
    .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setMaxLength(512)),
  level: "ban",
  description: "Retirar ban",
  async execute(interaction, context) {
    await requirePermission(interaction, context, "ban");
    requireBotPermission(botMember(interaction), Native.BanMembers, nativeMessages.banMembers);
    const userId = interaction.options.getString("usuario_id", true);
    const reason = cleanReason(interaction.options.getString("motivo"));
    await interaction.guild!.members.unban(userId, reason);
    const created = context.repositories.cases.create({
      guildId: interaction.guildId!,
      targetUserId: userId,
      moderatorUserId: interaction.user.id,
      actionType: "unban",
      reason,
    });
    await interaction.reply({ embeds: [embeds.success(`Caso ${created.case_id}`, `Ban retirado a ${userId}.`)], ephemeral: true });
  },
};

export const purgeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Limpia mensajes recientes del canal.")
    .addIntegerOption((option) => option.setName("cantidad").setDescription("Cantidad").setRequired(true).setMinValue(1).setMaxValue(100))
    .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setMaxLength(512)),
  level: "purge",
  description: "Limpieza de mensajes",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "purge");
    requireNative(actor, Native.ManageMessages, "Necesitas Gestionar mensajes.");
    requireBotPermission(botMember(interaction), Native.ManageMessages, nativeMessages.manageMessages);
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
      throw new UserFacingError("Este comando debe usarse en un canal de texto.");
    }
    const count = interaction.options.getInteger("cantidad", true);
    const deleted = await (interaction.channel as TextChannel).bulkDelete(count, true);
    const reason = cleanReason(interaction.options.getString("motivo"));
    const created = context.repositories.cases.create({
      guildId: interaction.guildId!,
      targetUserId: interaction.channel.id,
      moderatorUserId: interaction.user.id,
      actionType: "purge",
      reason,
      metadata: { count: deleted.size },
    });
    await interaction.reply({ embeds: [embeds.success(`Caso ${created.case_id}`, `Mensajes eliminados: ${deleted.size}.`)], ephemeral: true });
  },
};

export const slowmodeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Configura slowmode en el canal actual.")
    .addIntegerOption((option) => option.setName("segundos").setDescription("0 a 21600").setRequired(true).setMinValue(0).setMaxValue(21600))
    .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setMaxLength(512)),
  level: "roles",
  description: "Slowmode de canal",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "roles");
    requireNative(actor, Native.ManageChannels, "Necesitas Gestionar canales.");
    requireBotPermission(botMember(interaction), Native.ManageChannels, nativeMessages.manageChannels);
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) throw new UserFacingError("Usalo en un canal de texto.");
    const seconds = interaction.options.getInteger("segundos", true);
    await (interaction.channel as TextChannel).setRateLimitPerUser(seconds, cleanReason(interaction.options.getString("motivo")));
    await interaction.reply({ embeds: [embeds.success("Slowmode actualizado", `${seconds} segundos.`)], ephemeral: true });
  },
};

export const lockCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("lock").setDescription("Bloquea escritura para @everyone en el canal actual."),
  level: "roles",
  description: "Bloqueo de canal",
  async execute(interaction, context) {
    await requirePermission(interaction, context, "roles");
    requireBotPermission(botMember(interaction), Native.ManageChannels, nativeMessages.manageChannels);
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) throw new UserFacingError("Usalo en un canal de texto.");
    await (interaction.channel as TextChannel).permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: false });
    await interaction.reply({ embeds: [embeds.success("Canal bloqueado", "La escritura para @everyone fue desactivada.")], ephemeral: true });
  },
};

export const unlockCommand: BotCommand = {
  data: new SlashCommandBuilder().setName("unlock").setDescription("Restaura escritura para @everyone en el canal actual."),
  level: "roles",
  description: "Desbloqueo de canal",
  async execute(interaction, context) {
    await requirePermission(interaction, context, "roles");
    requireBotPermission(botMember(interaction), Native.ManageChannels, nativeMessages.manageChannels);
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) throw new UserFacingError("Usalo en un canal de texto.");
    await (interaction.channel as TextChannel).permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: null });
    await interaction.reply({ embeds: [embeds.success("Canal desbloqueado", "La escritura para @everyone fue restaurada.")], ephemeral: true });
  },
};

export const nicknameCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("nickname")
    .setDescription("Cambia o limpia el apodo de un usuario.")
    .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((option) => option.setName("apodo").setDescription("Nuevo apodo; vacio para limpiar").setMaxLength(32)),
  level: "roles",
  description: "Gestionar apodos",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "roles");
    requireBotPermission(botMember(interaction), Native.ManageNicknames, nativeMessages.manageNicknames);
    const target = await fetchTarget(interaction);
    assertTarget(actor, botMember(interaction), target);
    const nickname = interaction.options.getString("apodo") || null;
    await target.setNickname(nickname);
    await interaction.reply({ embeds: [embeds.success("Apodo actualizado", `${target} -> ${nickname ?? "sin apodo"}`)], ephemeral: true });
  },
};

export const roleCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Agrega o retira roles con validacion de jerarquia.")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Agrega un rol.")
        .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true))
        .addRoleOption((option) => option.setName("rol").setDescription("Rol").setRequired(true))
        .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(512)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Retira un rol.")
        .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true))
        .addRoleOption((option) => option.setName("rol").setDescription("Rol").setRequired(true))
        .addStringOption((option) => option.setName("motivo").setDescription("Motivo").setRequired(true).setMaxLength(512)),
    ),
  level: "roles",
  description: "Gestion de roles",
  async execute(interaction, context) {
    const actor = await requirePermission(interaction, context, "roles");
    requireBotPermission(botMember(interaction), Native.ManageRoles, nativeMessages.manageRoles);
    const target = await fetchTarget(interaction);
    assertTarget(actor, botMember(interaction), target);
    const role = interaction.options.getRole("rol", true) as Role;
    const config = context.repositories.guildConfig.ensure(interaction.guildId!);
    if (isProtectedAdministrativeRole(role.id, config)) {
      throw new UserFacingError("Ese rol interno o administrado por Discord no puede modificarse con /role.");
    }
    const check = canManageRole({
      actorHighestRolePosition: actor.roles.highest.position,
      botHighestRolePosition: botMember(interaction).roles.highest.position,
      role,
    });
    if (!check.ok) throw new UserFacingError(check.reason);
    const sub = interaction.options.getSubcommand();
    const reason = cleanReason(interaction.options.getString("motivo", true));
    await context.services.confirmations.request(interaction, `${sub === "add" ? "Agregar" : "Retirar"} ${role} a ${target}?`, async (button) => {
      if (sub === "add") await target.roles.add(role, reason);
      else await target.roles.remove(role, reason);
      const created = context.repositories.cases.create({
        guildId: interaction.guildId!,
        targetUserId: target.id,
        moderatorUserId: interaction.user.id,
        actionType: `role_${sub}`,
        reason,
        metadata: { roleId: role.id },
      });
      await context.services.logs.send(interaction.guild!, "role", `Role ${sub}`, `${role.name} -> ${target.user.tag}`);
      await button.update({ embeds: [embeds.success(`Caso ${created.case_id}`, "Cambio de rol aplicado.")], components: [] });
    });
  },
};

export const caseCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("case")
    .setDescription("Consulta un caso de moderacion.")
    .addStringOption((option) => option.setName("id").setDescription("Ej: CB-000042").setRequired(true)),
  level: "warn",
  description: "Consulta de caso",
  async execute(interaction, context) {
    await requirePermission(interaction, context, "warn");
    const row = context.repositories.cases.get(interaction.options.getString("id", true).toUpperCase());
    if (!row || row.guild_id !== interaction.guildId) throw new UserFacingError("No encontre ese caso en este servidor.");
    await interaction.reply({
      embeds: [
        embeds.moderation(`Caso ${row.case_id}`, `Usuario: <@${row.target_user_id}>\nModerador: <@${row.moderator_user_id}>\nAccion: ${row.action_type}\nDuracion: ${formatDuration(row.duration_ms)}\nMotivo: ${row.reason}\nFecha: <t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:f>`),
      ],
      ephemeral: true,
    });
  },
};

export const userHistoryCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("user-history")
    .setDescription("Consulta historial de moderacion de un usuario.")
    .addUserOption((option) => option.setName("usuario").setDescription("Usuario").setRequired(true)),
  level: "warn",
  description: "Historial de moderacion",
  async execute(interaction, context) {
    await requirePermission(interaction, context, "warn");
    const user = interaction.options.getUser("usuario", true);
    const rows = context.repositories.cases.listForUser(interaction.guildId!, user.id, 10);
    const body = rows.length ? rows.map((row) => `${row.case_id} - ${row.action_type} - ${row.reason}`).join("\n") : "Sin historial registrado.";
    await interaction.reply({ embeds: [embeds.info(`Historial de ${user.username}`, body)], ephemeral: true });
  },
};

export const moderationCommands = [
  warnCommand,
  warningsCommand,
  timeoutCommand,
  untimeoutCommand,
  kickCommand,
  banCommand,
  unbanCommand,
  purgeCommand,
  slowmodeCommand,
  lockCommand,
  unlockCommand,
  nicknameCommand,
  roleCommand,
  caseCommand,
  userHistoryCommand,
];
