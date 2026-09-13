import { ChannelType, PermissionFlagsBits, type Client } from "discord.js";
import { logger } from "../../logger.js";
import type { SystemStatusConfig, SystemStatusRepository } from "../../repositories/systemStatusRepository.js";
import { collectMetrics } from "./metricsCollector.js";
import { buildPublicStatusEmbed } from "./statusEmbed.js";

export class StatusScheduler {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly client: Client,
    private readonly configs: SystemStatusRepository,
  ) {}

  start(): void {
    this.stop();
    for (const config of this.configs.allEnabled()) {
      this.schedule(config);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }

  restartGuild(guildId: string): void {
    const timer = this.timers.get(guildId);
    if (timer) clearInterval(timer);
    this.timers.delete(guildId);
    const config = this.configs.get(guildId);
    if (config?.enabled && config.channel_id) this.schedule(config);
  }

  async publishNow(guildId: string): Promise<string> {
    const config = this.configs.ensure(guildId);
    if (!config.channel_id) throw new Error("Primero configura un canal con /status-channel.");
    await this.publish(config);
    return config.channel_id;
  }

  private schedule(config: SystemStatusConfig): void {
    const intervalMs = Math.max(60, config.interval_seconds) * 1000;
    void this.publish(config).catch((error) => logger.warn({ error, guildId: config.guild_id }, "Fallo publicando status inicial"));
    const timer = setInterval(() => {
      const latest = this.configs.get(config.guild_id);
      if (!latest?.enabled || !latest.channel_id) {
        this.restartGuild(config.guild_id);
        return;
      }
      void this.publish(latest).catch((error) => logger.warn({ error, guildId: latest.guild_id }, "Fallo publicando status"));
    }, intervalMs);
    this.timers.set(config.guild_id, timer);
  }

  private getMissingPermissions(channel: any): string[] | null {
    const perms = channel.permissionsFor?.(this.client.user?.id) ?? null;
    if (!perms) return null;
    const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    return required.filter((p: bigint) => !perms.has(p)).map((p: bigint) => String(p));
  }

  private async publish(config: SystemStatusConfig): Promise<void> {
    const channel = await this.client.channels.fetch(config.channel_id!);
    const allowedChannel =
      channel &&
      "type" in channel &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) &&
      channel.isSendable();
    if (!allowedChannel) {
      throw new Error("El canal configurado no es un canal de texto enviable.");
    }

    const metrics = await collectMetrics();
    const embed = buildPublicStatusEmbed(metrics, config);
    const sendable = channel as any;

    if (config.mode === "edit" && config.message_id) {
      const message = await sendable.messages.fetch(config.message_id).catch(() => null);
      if (message) {
        try {
          await message.edit({ embeds: [embed] });
          return;
        } catch (error: any) {
          if (error?.code === 10008 || error?.code === 50005 || error?.status === 404) {
            logger.warn(
              { guildId: config.guild_id, messageId: config.message_id, discordCode: error?.code },
              "Mensaje de status anterior no es editable, se publicara uno nuevo",
            );
            this.configs.setMessageId(config.guild_id, null);
          } else if (error?.code === 50013 || error?.status === 403) {
            logger.warn(
              {
                error,
                guildId: config.guild_id,
                missingPermissions: this.getMissingPermissions(channel),
              },
              "Faltan permisos al editar el status, se desactiva el loop",
            );
            this.configs.setLoop(config.guild_id, false);
            this.configs.setMessageId(config.guild_id, null);
            return;
          } else {
            throw error;
          }
        }
      } else {
        this.configs.setMessageId(config.guild_id, null);
      }
    }

    try {
      const sent = await sendable.send({ embeds: [embed] });
      if (config.mode === "edit") this.configs.setMessageId(config.guild_id, sent.id);
    } catch (error: any) {
      if (error?.code === 50013 || error?.status === 403) {
        logger.warn(
          {
            error,
            guildId: config.guild_id,
            missingPermissions: this.getMissingPermissions(channel),
          },
          "Faltan permisos al enviar el status, se desactiva el loop",
        );
        this.configs.setLoop(config.guild_id, false);
        this.configs.setMessageId(config.guild_id, null);
        return;
      }
      throw error;
    }
  }
}
