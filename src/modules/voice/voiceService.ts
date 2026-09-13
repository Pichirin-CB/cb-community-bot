import {
  ChannelType,
  type CategoryChannel,
  type GuildChannelCreateOptions,
  PermissionFlagsBits,
  PermissionsBitField,
  type Guild,
  type GuildMember,
  type TextChannel,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import { logger } from "../../logger.js";
import type { BotContext } from "../../types/context.js";
import { UserFacingError } from "../../utils/errors.js";
import type { TemporaryVoiceChannel } from "../../repositories/tempVoiceRepository.js";
import type { PrivacyMode, VoiceGenerator } from "../../repositories/voiceGeneratorRepository.js";
import { CooldownStore } from "./cooldowns.js";
import { AsyncLock } from "./locks.js";
import { fallbackRenderedNames, renderNameTemplate, sanitizeChannelName, uniqueChannelName, validateNameTemplate } from "./nameTemplate.js";
import {
  buildCreateOverwrites,
  canUseGenerator,
  chooseAutoTransferOwner,
  generatorStaffRoleIds,
  normalizeLimit,
  type PermissionOverwriteLike,
  privacyOverwriteForEveryone,
} from "./voicePolicy.js";
import { buildRoomControlEmbed, roomControlComponents, supportAlertButton, supportAlertEmbed } from "./voicePresentation.js";

const categoryCopyBlockedAllows =
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageWebhooks |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.ManageThreads |
  PermissionFlagsBits.MuteMembers |
  PermissionFlagsBits.DeafenMembers |
  PermissionFlagsBits.MoveMembers |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.BanMembers;

export class VoiceService {
  private readonly locks = new AsyncLock();
  private readonly cooldowns = new CooldownStore();
  private readonly deleteTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly context: BotContext) {}

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (newState.member?.user.bot) return;
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      await this.handleGeneratorJoin(newState).catch((error: unknown) =>
        logger.warn(
          {
            error,
            guildId: newState.guild.id,
            userId: newState.member?.id ?? newState.id,
            oldChannelId: oldState.channelId,
            newChannelId: newState.channelId,
            stage: "voice_state_update_generator",
            discordCode: (error as any)?.code,
          },
          "No se pudo procesar generador de voz",
        ),
      );
      if (this.deleteTimers.has(newState.channelId)) this.cancelDelete(newState.channelId);
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await this.handleTemporaryRoomLeave(oldState).catch((error: unknown) =>
        logger.warn({ error, guildId: oldState.guild.id }, "No se pudo procesar salida de sala temporal"),
      );
    }
  }

  async handleGeneratorJoin(state: VoiceState): Promise<void> {
    const generator = this.context.repositories.generators.getByChannel(state.guild.id, state.channelId!);
    if (!generator || !generator.enabled || !state.member) return;
    logger.info(
      {
        guildId: state.guild.id,
        userId: state.member.id,
        generatorId: generator.id,
        generatorChannelId: generator.generator_channel_id,
        targetCategoryId: generator.target_category_id,
        stage: "generator_detected",
      },
      "Generador de voz detectado",
    );
    const config = this.context.repositories.guildConfig.ensure(state.guild.id);
    const explicitRoles = this.context.repositories.generators.roles(generator.id);
    if (!canUseGenerator(generator, state.member, config, explicitRoles)) {
      await state.member.voice.disconnect("No autorizado para usar este generador de voz").catch(() => undefined);
      return;
    }
    const lockKey = `create:${state.guild.id}:${state.member.id}:${generator.id}`;
    await this.locks.run(lockKey, async () => {
      logger.info(
        {
          guildId: state.guild.id,
          userId: state.member!.id,
          generatorId: generator.id,
          generatorChannelId: generator.generator_channel_id,
          targetCategoryId: generator.target_category_id,
          stage: "lock_acquired",
        },
        "Lock de generador adquirido",
      );
      try {
        return await this.createOrMoveToRoom(state.guild, state.member!, generator);
      } finally {
        logger.info(
          {
            guildId: state.guild.id,
            userId: state.member!.id,
            generatorId: generator.id,
            generatorChannelId: generator.generator_channel_id,
            targetCategoryId: generator.target_category_id,
            stage: "lock_released",
          },
          "Lock de generador liberado",
        );
      }
    });
  }

  async createOrMoveToRoom(guild: Guild, member: GuildMember, generator: VoiceGenerator): Promise<TemporaryVoiceChannel> {
    const config = this.context.repositories.guildConfig.ensure(guild.id);
    if (config.one_room_per_user) {
      const existing = this.context.repositories.tempVoice.getActiveByOwner(guild.id, member.id, generator.id);
      if (existing) {
        const channel = await guild.channels.fetch(existing.channel_id).catch(() => null);
        if (channel?.type === ChannelType.GuildVoice) {
          await member.voice.setChannel(channel as VoiceChannel, "Sala temporal activa existente");
          return existing;
        }
        this.context.repositories.tempVoice.markDeleted(existing.channel_id);
      }
    }
    logger.info(
      {
        guildId: guild.id,
        userId: member.id,
        generatorId: generator.id,
        generatorChannelId: generator.generator_channel_id,
        targetCategoryId: generator.target_category_id,
        stage: "existing_room_checked",
      },
      "Revision de sala activa completada",
    );

    const templateError = validateNameTemplate(generator.name_template);
    if (templateError) throw new UserFacingError(templateError);

    const templateInput = {
      username: member.user.username,
      displayname: member.displayName,
      globalName: member.user.globalName,
      userId: member.id,
      counter: this.context.repositories.tempVoice.countActive(guild.id) + 1,
    };
    const renderedName = renderNameTemplate(generator.name_template, templateInput);
    const fetchedChannels = await guild.channels.fetch().catch(() => null);
    const channelValues = Array.from((fetchedChannels ?? guild.channels.cache).values()) as Array<{
      parentId: string | null;
      name: string;
    } | null>;
    const existingNames = channelValues
      .filter((channel): channel is { parentId: string | null; name: string } => channel !== null && channel.parentId === generator.target_category_id)
      .map((channel) => channel.name);
    const name = uniqueChannelName(renderedName, existingNames);
    const fallbackNames = fallbackRenderedNames(generator.name_template, templateInput)
      .map((candidate) => uniqueChannelName(candidate, existingNames))
      .filter((candidate) => candidate !== name);
    const staffRoleIds = generatorStaffRoleIds(generator, config, this.context.repositories.generators.roles(generator.id));
    const targetCategory = await this.fetchTargetCategory(guild, generator.target_category_id);
    const baseOverwrites = await this.categoryOverwrites(guild, targetCategory);
    const useCategorySyncCreate = this.hasUnmanageableRoleOverwrites(guild, targetCategory);
    logger.info(
      {
        guildId: guild.id,
        userId: member.id,
        generatorId: generator.id,
        generatorChannelId: generator.generator_channel_id,
        targetCategoryId: generator.target_category_id,
        stage: "permission_overwrites_built",
        categorySyncCreate: useCategorySyncCreate,
        permissionOverwrites: baseOverwrites.map((overwrite) => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: String((overwrite.allow as any)?.bitfield ?? overwrite.allow ?? "0"),
          deny: String((overwrite.deny as any)?.bitfield ?? overwrite.deny ?? "0"),
        })),
      },
      "Overwrites base serializados para sala temporal",
    );
    const userLimit = normalizeLimit(generator.default_user_limit, generator.max_user_limit);
    let created: VoiceChannel | null = null;
    let roomCreated = false;

    try {
      const permissionOverwrites = buildCreateOverwrites({
        guildId: guild.id,
        botUserId: guild.client.user.id,
        ownerUserId: member.id,
        privacyMode: generator.privacy_mode,
        staffRoleIds,
        baseOverwrites,
      });
      const createOptions: GuildChannelCreateOptions = {
        name,
        type: ChannelType.GuildVoice,
        parent: generator.target_category_id,
        userLimit,
        bitrate: generator.bitrate_override ?? undefined,
        permissionOverwrites: useCategorySyncCreate ? undefined : permissionOverwrites,
        reason: "CB Studios Voice temporary room",
      };
      logger.info(
        {
          guildId: guild.id,
          userId: member.id,
          generatorId: generator.id,
          generatorChannelId: generator.generator_channel_id,
          targetCategoryId: generator.target_category_id,
          stage: "channel_create_attempt",
          name,
          categorySyncCreate: useCategorySyncCreate,
          permissionOverwrites: useCategorySyncCreate
            ? "category-sync"
            : permissionOverwrites.map((overwrite: any) => ({
                id: overwrite.id,
                type: overwrite.type,
                allow: String(overwrite.allow ?? "0"),
                deny: String(overwrite.deny ?? "0"),
              })),
        },
        "Intentando crear sala temporal",
      );
      created = await this.createVoiceChannelWithFallback(guild, createOptions, fallbackNames);

      const room = this.context.repositories.tempVoice.create({
        channelId: created.id,
        guildId: guild.id,
        generatorId: generator.id,
        ownerUserId: member.id,
        privacyMode: generator.privacy_mode,
        userLimit,
        customName: created.name,
      });
      roomCreated = true;

      await member.voice.setChannel(created, "Crear sala temporal CB Studios Voice");
      await this.sendOrRefreshPanel(created, room, generator);
      await this.sendSupportAlert(guild, generator, member.id, created.id);
      await this.audit("VOICE_PERMISSION_BASE_COPIED", guild.id, created.id, member.id, null, {
        categoryId: generator.target_category_id,
        overwrites: baseOverwrites.length,
        categorySyncCreate: useCategorySyncCreate,
      });
      await this.audit("VOICE_CHANNEL_CREATED", guild.id, created.id, member.id, null, { generatorId: generator.id, type: generator.type });
      return room;
    } catch (error) {
      logger.warn(
        {
          error,
          guildId: guild.id,
          userId: member.id,
          generatorId: generator.id,
          generatorChannelId: generator.generator_channel_id,
          targetCategoryId: generator.target_category_id,
          stage: created ? "rollback_after_create" : "create_failed_before_channel",
          discordCode: (error as any)?.code,
        },
        "Fallo al crear sala temporal",
      );
      if (created && created.members.size === 0) {
        const deleted = await this.deleteDiscordChannel(created, "Rollback de sala temporal fallida");
        if (deleted) {
          if (roomCreated) this.context.repositories.tempVoice.markDeleted(created.id);
        } else if (roomCreated) {
          this.context.repositories.tempVoice.markActive(created.id);
        }
      }
      await this.audit("VOICE_ERROR", guild.id, created?.id ?? null, member.id, null, { message: error instanceof Error ? error.message : "unknown" });
      throw error;
    }
  }

  private async createVoiceChannelWithFallback(
    guild: Guild,
    options: GuildChannelCreateOptions,
    fallbackNames: string[],
  ): Promise<VoiceChannel> {
    const names = [options.name, ...fallbackNames].filter((name): name is string => Boolean(name));
    let lastError: unknown = null;
    for (const name of names) {
      try {
        return (await guild.channels.create({ ...options, name })) as unknown as VoiceChannel;
      } catch (error: any) {
        lastError = error;
        if (error?.code !== 50035) throw error;
      }
    }
    throw lastError;
  }

  async handleTemporaryRoomLeave(state: VoiceState): Promise<void> {
    const room = this.context.repositories.tempVoice.get(state.channelId!);
    if (!room || room.status !== "ACTIVE") return;
    const channel = await state.guild.channels.fetch(room.channel_id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      this.context.repositories.tempVoice.markDeleted(room.channel_id);
      return;
    }
    const voiceChannel = channel as VoiceChannel;
    if (voiceChannel.members.size === 0) {
      this.scheduleDelete(room);
      return;
    }
    if (state.id === room.owner_user_id) {
      const nextOwner = chooseAutoTransferOwner(voiceChannel, room.owner_user_id);
      if (nextOwner) {
        this.context.repositories.tempVoice.updateOwner(room.channel_id, nextOwner);
        const updated = this.context.repositories.tempVoice.get(room.channel_id)!;
        await this.sendOrRefreshPanel(voiceChannel, updated, this.context.repositories.generators.getById(updated.generator_id));
        await this.audit("VOICE_OWNER_AUTO_TRANSFERRED", state.guild.id, room.channel_id, room.owner_user_id, nextOwner);
      }
    }
  }

  scheduleDelete(room: TemporaryVoiceChannel): void {
    if (this.deleteTimers.has(room.channel_id)) return;
    const config = this.context.repositories.guildConfig.ensure(room.guild_id);
    this.context.repositories.tempVoice.markPending(room.channel_id);
    if ((config.default_empty_grace_seconds ?? 0) <= 0) {
      void this.deleteIfStillEmpty(room.channel_id);
      return;
    }
    const ms = (config.default_empty_grace_seconds ?? 0) * 1000;
    const timer = setTimeout(() => void this.deleteIfStillEmpty(room.channel_id), ms);
    this.deleteTimers.set(room.channel_id, timer);
  }

  cancelDelete(channelId: string): void {
    const timer = this.deleteTimers.get(channelId);
    if (timer) clearTimeout(timer);
    this.deleteTimers.delete(channelId);
    this.context.repositories.tempVoice.markActive(channelId);
  }

  async deleteIfStillEmpty(channelId: string): Promise<void> {
    this.deleteTimers.delete(channelId);
    const room = this.context.repositories.tempVoice.get(channelId);
    if (!room || room.status === "DELETED") return;
    const guild = await this.context.client.guilds.fetch(room.guild_id).catch(() => null);
    const channel = guild ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel) {
      this.context.repositories.tempVoice.markDeleted(channelId);
      return;
    }
    if (channel.type === ChannelType.GuildVoice && (channel as VoiceChannel).members.size > 0) {
      this.context.repositories.tempVoice.markActive(channelId);
      return;
    }
    const deleted = await this.deleteDiscordChannel(channel, "Sala temporal vacia");
    if (!deleted) {
      this.context.repositories.tempVoice.markActive(channelId);
      await this.audit("VOICE_ERROR", room.guild_id, channelId, null, null, { message: "No se pudo eliminar sala vacia" });
      return;
    }
    this.context.repositories.tempVoice.markDeleted(channelId);
    await this.audit("VOICE_CHANNEL_DELETED", room.guild_id, channelId, null, null, { reason: "empty" });
  }

  async rename(actor: GuildMember, channelId: string, newName: string): Promise<void> {
    const room = this.assertRoomOwnerOrStaff(actor, channelId);
    if (!this.cooldowns.check(`rename:${channelId}`, 10)) throw new UserFacingError("Espera antes de volver a cambiar el nombre.");
    const name = sanitizeChannelName(newName);
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    await channel.setName(name, "Owner cambio nombre de sala temporal");
    this.context.repositories.tempVoice.updateRoom(channelId, { customName: name });
    await this.sendOrRefreshPanel(channel as VoiceChannel, this.context.repositories.tempVoice.get(channelId)!, this.context.repositories.generators.getById(room.generator_id));
    await this.audit("VOICE_CHANNEL_RENAMED", actor.guild.id, channelId, actor.id, null, { name });
  }

  async setLimit(actor: GuildMember, channelId: string, limit: number): Promise<void> {
    const room = this.assertRoomOwnerOrStaff(actor, channelId);
    const generator = this.context.repositories.generators.getById(room.generator_id);
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!generator || !channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    const nextLimit = normalizeLimit(limit, generator.max_user_limit);
    await (channel as VoiceChannel).setUserLimit(nextLimit, "Owner cambio limite de sala temporal");
    this.context.repositories.tempVoice.updateRoom(channelId, { userLimit: nextLimit });
    await this.sendOrRefreshPanel(channel as VoiceChannel, this.context.repositories.tempVoice.get(channelId)!, generator);
    await this.audit("VOICE_LIMIT_CHANGED", actor.guild.id, channelId, actor.id, null, { limit: nextLimit });
  }

  async setPrivacy(actor: GuildMember, channelId: string, privacyMode: PrivacyMode): Promise<void> {
    const room = this.assertRoomOwnerOrStaff(actor, channelId);
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    this.assertCanEditOverwrites(channel as VoiceChannel);
    const generator = this.context.repositories.generators.getById(room.generator_id);
    const targetCategory = generator ? await actor.guild.channels.fetch(generator.target_category_id).catch(() => null) : null;
    const baseEveryoneOverwrite =
      targetCategory?.type === ChannelType.GuildCategory ? (targetCategory as CategoryChannel).permissionOverwrites.cache.get(actor.guild.id) : null;
    await channel.permissionOverwrites.edit(actor.guild.id, privacyOverwriteForEveryone(privacyMode, baseEveryoneOverwrite), {
      reason: "Cambio de privacidad CB Studios Voice",
    });
    this.context.repositories.tempVoice.updateRoom(channelId, { privacyMode });
    await this.sendOrRefreshPanel(channel as VoiceChannel, this.context.repositories.tempVoice.get(channelId)!, this.context.repositories.generators.getById(room.generator_id));
    await this.audit("VOICE_PRIVACY_CHANGED", actor.guild.id, channelId, actor.id, null, { privacyMode });
  }

  async permit(actor: GuildMember, channelId: string, targetUserId: string): Promise<void> {
    this.assertRoomOwnerOrStaff(actor, channelId);
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    this.assertCanEditOverwrites(channel as VoiceChannel);
    await channel.permissionOverwrites.edit(
      targetUserId,
      { ViewChannel: true, Connect: true, SendMessages: true, ReadMessageHistory: true },
      { reason: "Usuario permitido en sala temporal" },
    );
    this.context.repositories.tempVoice.setPermission(channelId, targetUserId, "ALLOW");
    await this.audit("VOICE_USER_ALLOWED", actor.guild.id, channelId, actor.id, targetUserId);
  }

  async block(actor: GuildMember, channelId: string, targetUserId: string): Promise<void> {
    this.assertRoomOwnerOrStaff(actor, channelId);
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    this.assertCanEditOverwrites(channel as VoiceChannel);
    await channel.permissionOverwrites.edit(
      targetUserId,
      { Connect: false, ViewChannel: false, SendMessages: false, ReadMessageHistory: false },
      { reason: "Usuario bloqueado de sala temporal" },
    );
    this.context.repositories.tempVoice.setPermission(channelId, targetUserId, "BLOCK");
    await this.audit("VOICE_USER_BLOCKED", actor.guild.id, channelId, actor.id, targetUserId);
  }

  async unblock(actor: GuildMember, channelId: string, targetUserId: string): Promise<void> {
    this.assertRoomOwnerOrStaff(actor, channelId);
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    this.assertCanEditOverwrites(channel as VoiceChannel);
    await channel.permissionOverwrites.delete(targetUserId, "Usuario desbloqueado de sala temporal").catch(() => undefined);
    this.context.repositories.tempVoice.removePermission(channelId, targetUserId);
    await this.audit("VOICE_USER_UNBLOCKED", actor.guild.id, channelId, actor.id, targetUserId);
  }

  async refreshPermissions(actor: GuildMember, channelId: string): Promise<void> {
    const room = this.context.repositories.tempVoice.get(channelId);
    if (!room || room.status !== "ACTIVE") throw new UserFacingError("Este canal no pertenece a una sala temporal activa.");
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    this.assertCanEditOverwrites(channel as VoiceChannel);

    try {
      const generator = this.context.repositories.generators.getById(room.generator_id);
      if (!generator) throw new UserFacingError("El generador original de esta sala ya no existe.");
      const config = this.context.repositories.guildConfig.ensure(actor.guild.id);
      const targetCategory = await this.fetchTargetCategory(actor.guild, generator.target_category_id);
      const staffRoleIds = generatorStaffRoleIds(generator, config, this.context.repositories.generators.roles(generator.id));
      const overwrites = buildCreateOverwrites({
        guildId: actor.guild.id,
        botUserId: actor.guild.client.user.id,
        ownerUserId: room.owner_user_id,
        privacyMode: room.privacy_mode,
        staffRoleIds,
        baseOverwrites: await this.categoryOverwrites(actor.guild, targetCategory),
        storedPermissions: this.context.repositories.tempVoice.permissions(channelId),
      });

      await (channel as VoiceChannel).permissionOverwrites.set(overwrites, "Refresh permisos base CB Studios Voice");
      await this.audit("VOICE_PERMISSION_REFRESHED", actor.guild.id, channelId, actor.id, null, {
        categoryId: generator.target_category_id,
        privacyMode: room.privacy_mode,
      });
    } catch (error) {
      await this.audit("VOICE_PERMISSION_REFRESH_FAILED", actor.guild.id, channelId, actor.id, null, {
        message: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  }

  async kick(actor: GuildMember, channelId: string, targetUserId: string): Promise<void> {
    this.assertRoomOwnerOrStaff(actor, channelId);
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    const target = (channel as VoiceChannel).members.get(targetUserId);
    if (!target) throw new UserFacingError("El usuario no esta dentro de la sala.");
    await target.voice.disconnect("Expulsado de sala temporal por owner/staff");
    await this.audit("VOICE_USER_REMOVED", actor.guild.id, channelId, actor.id, targetUserId);
  }

  async transfer(actor: GuildMember, channelId: string, targetUserId: string): Promise<void> {
    const room = this.assertRoomOwnerOrStaff(actor, channelId);
    const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) throw new UserFacingError("La sala ya no existe.");
    const target = (channel as VoiceChannel).members.get(targetUserId);
    if (!target || target.user.bot) throw new UserFacingError("El nuevo owner debe ser humano y estar dentro de la sala.");
    this.context.repositories.tempVoice.updateOwner(channelId, targetUserId);
    await this.sendOrRefreshPanel(channel as VoiceChannel, this.context.repositories.tempVoice.get(channelId)!, this.context.repositories.generators.getById(room.generator_id));
    await this.audit("VOICE_OWNER_TRANSFERRED", actor.guild.id, channelId, actor.id, targetUserId);
  }

  async deleteRoom(actor: GuildMember, channelId: string): Promise<void> {
    this.assertRoomOwnerOrStaff(actor, channelId);
    await this.locks.run(`delete:${channelId}`, async () => {
      const room = this.context.repositories.tempVoice.get(channelId);
      if (!room || room.status === "DELETED") return;
      this.context.repositories.tempVoice.markPending(channelId);
      const channel = await actor.guild.channels.fetch(channelId).catch(() => null);
      if (channel) {
        const deleted = await this.deleteDiscordChannel(channel, "Sala temporal eliminada por owner/staff");
        if (!deleted) {
          this.context.repositories.tempVoice.markActive(channelId);
          await this.audit("VOICE_ERROR", actor.guild.id, channelId, actor.id, null, { message: "No se pudo eliminar sala manualmente" });
          throw new UserFacingError("No pude eliminar la sala temporal. Revisa permisos del bot sobre ese canal.");
        }
      }
      this.context.repositories.tempVoice.markDeleted(channelId);
      await this.audit("VOICE_CHANNEL_DELETED", actor.guild.id, channelId, actor.id, null, { reason: "manual" });
    });
  }

  assertRoomOwnerOrStaff(actor: GuildMember, channelId: string): TemporaryVoiceChannel {
    const room = this.context.repositories.tempVoice.get(channelId);
    if (!room || room.status !== "ACTIVE") throw new UserFacingError("Este canal no pertenece a una sala temporal activa.");
    if (room.owner_user_id === actor.id) return room;
    const config = this.context.repositories.guildConfig.ensure(actor.guild.id);
    const roleIds = new Set(actor.roles.cache.keys());
    if (
      (config.founder_role_id && roleIds.has(config.founder_role_id)) ||
      (config.administrator_role_id && roleIds.has(config.administrator_role_id)) ||
      (config.developer_role_id && roleIds.has(config.developer_role_id))
    ) {
      return room;
    }
    throw new UserFacingError("Solo el owner o staff autorizado puede gestionar esta sala.");
  }

  assertCanEditOverwrites(channel: VoiceChannel): void {
    const me = channel.guild.members.me;
    if (!me || !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageRoles)) {
      throw new UserFacingError(
        "Necesito el permiso Gestionar roles en esta sala/categoria para editar permisos de privacidad, permitir o bloquear usuarios.",
      );
    }
  }

  async sendOrRefreshPanel(channel: VoiceChannel, room: TemporaryVoiceChannel, generator?: VoiceGenerator | null): Promise<void> {
    const payload = {
      embeds: [buildRoomControlEmbed(room, generator)],
      components: roomControlComponents(room.channel_id),
      allowedMentions: { parse: [] },
    };
    if (room.control_message_id) {
      const message = await (channel as any).messages?.fetch(room.control_message_id).catch(() => null);
      if (message) {
        await message.edit(payload).catch(() => undefined);
        return;
      }
    }
    if (typeof (channel as any).send !== "function") {
      logger.warn({ channelId: channel.id }, "El canal de voz no expone API de mensajes para panel de control");
      return;
    }
    const sent = await (channel as any).send(payload).catch((error: unknown) => {
      logger.warn({ error, channelId: channel.id }, "No se pudo publicar panel de control de voz");
      return null;
    });
    if (sent?.id) this.context.repositories.tempVoice.setControlMessage(channel.id, sent.id);
  }

  async sendSupportAlert(guild: Guild, generator: VoiceGenerator, userId: string, channelId: string): Promise<void> {
    if (generator.type !== "SUPPORT") return;
    const config = this.context.repositories.guildConfig.ensure(guild.id);
    const alertChannelId = generator.support_alert_channel_id ?? config.support_alert_channel_id;
    if (!alertChannelId) return;
    const channel = await guild.channels.fetch(alertChannelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    await (channel as TextChannel)
      .send({
        embeds: [supportAlertEmbed(userId, channelId)],
        components: [supportAlertButton(guild.id, channelId)],
        allowedMentions: { parse: [] },
      })
      .catch((error: unknown) => logger.warn({ error, channelId: alertChannelId }, "No se pudo enviar alerta de soporte"));
  }

  private async fetchTargetCategory(guild: Guild, categoryId: string): Promise<CategoryChannel> {
    const category = await guild.channels.fetch(categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new UserFacingError("La categoria destino del generador no existe o no es una categoria.");
    }
    return category as CategoryChannel;
  }

  private async deleteDiscordChannel(channel: { id: string; delete: (reason?: string) => Promise<unknown> }, reason: string): Promise<boolean> {
    try {
      await channel.delete(reason);
      return true;
    } catch (error: any) {
      if (error?.code === 10003) return true;
      logger.warn({ error, channelId: channel.id, discordCode: error?.code }, "No se pudo eliminar canal temporal en Discord");
      return false;
    }
  }

  private async categoryOverwrites(guild: Guild, category: CategoryChannel): Promise<PermissionOverwriteLike[]> {
    const guildPermissions = this.permissionBits(guild.members.me?.permissions.bitfield);
    const overwrites: PermissionOverwriteLike[] = [];
    for (const overwrite of category.permissionOverwrites.cache.values()) {
      if (overwrite.type === 0 && overwrite.id !== guild.id && !guild.roles.cache.has(overwrite.id)) {
        logger.warn({ guildId: guild.id, categoryId: category.id, overwriteId: overwrite.id, overwriteType: overwrite.type }, "Overwrite de categoria omitido: rol inexistente");
        continue;
      }
      if (overwrite.type === 1) {
        const member = await guild.members.fetch(overwrite.id).catch(() => null);
        if (!member) {
          logger.warn(
            { guildId: guild.id, categoryId: category.id, overwriteId: overwrite.id, overwriteType: overwrite.type },
            "Overwrite de categoria omitido: miembro inexistente",
          );
          continue;
        }
      }
      const originalAllow = this.permissionBits(overwrite.allow);
      const safeAllow = originalAllow & guildPermissions & ~categoryCopyBlockedAllows;
      const droppedAllow = originalAllow & ~guildPermissions;
      const blockedAllow = originalAllow & guildPermissions & categoryCopyBlockedAllows;
      if ((droppedAllow | blockedAllow) !== 0n) {
        logger.warn(
          {
            guildId: guild.id,
            categoryId: category.id,
            overwriteId: overwrite.id,
            overwriteType: overwrite.type,
            droppedAllow: new PermissionsBitField(droppedAllow | blockedAllow).toArray(),
          },
          "Permisos allow de categoria omitidos en create porque no son seguros para copiar a una sala temporal",
        );
      }
      overwrites.push({
        id: overwrite.id,
        type: overwrite.type,
        allow: safeAllow,
        deny: this.permissionBits(overwrite.deny),
      });
    }
    return overwrites;
  }

  private hasUnmanageableRoleOverwrites(guild: Guild, category: CategoryChannel): boolean {
    const me = guild.members.me;
    const highestPosition = me?.roles.highest.position ?? 0;
    for (const overwrite of category.permissionOverwrites.cache.values()) {
      if (overwrite.type !== 0 || overwrite.id === guild.id) continue;
      const role = guild.roles.cache.get(overwrite.id);
      if (role && role.position >= highestPosition) {
        logger.warn(
          {
            guildId: guild.id,
            categoryId: category.id,
            overwriteId: overwrite.id,
            roleName: role.name,
            rolePosition: role.position,
            botHighestPosition: highestPosition,
          },
          "Categoria contiene overwrite de rol por encima del bot; la sala se creara sincronizada con la categoria",
        );
        return true;
      }
    }
    return false;
  }

  private permissionBits(value: unknown): bigint {
    if (value === undefined || value === null) return 0n;
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string") return BigInt(value);
    if (Array.isArray(value)) return value.reduce((bits, item) => bits | this.permissionBits(item), 0n);
    if (typeof value === "object" && "bitfield" in value) return this.permissionBits((value as { bitfield: unknown }).bitfield);
    return 0n;
  }

  async audit(
    eventType: Parameters<BotContext["repositories"]["audit"]["record"]>[0]["eventType"],
    guildId: string,
    channelId?: string | null,
    actorUserId?: string | null,
    targetUserId?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.context.repositories.audit.record({ guildId, eventType, channelId, actorUserId, targetUserId, metadata });
    await this.context.services.voiceLogs.send({
      guildId,
      eventType,
      channelId,
      actorUserId,
      targetUserId,
      summary: metadata?.reason ? String(metadata.reason) : eventType,
    });
  }

  clearTimers(): void {
    for (const timer of this.deleteTimers.values()) clearTimeout(timer);
    this.deleteTimers.clear();
  }
}
