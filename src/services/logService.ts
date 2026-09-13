import type { Client, Guild } from "discord.js";
import { ChannelType } from "discord.js";
import type { AuditEventRepository } from "../repositories/auditEventRepository.js";
import type { GuildConfigRepository } from "../repositories/guildConfigRepository.js";
import { embeds } from "../modules/embeds/embedService.js";
import { logger } from "../logger.js";

type LogKind = "member" | "moderation" | "message" | "role" | "channel" | "ticket" | "bot" | "security";

const logField: Record<LogKind, string> = {
  member: "member_log_channel_id",
  moderation: "moderation_log_channel_id",
  message: "message_log_channel_id",
  role: "role_log_channel_id",
  channel: "channel_log_channel_id",
  ticket: "ticket_log_channel_id",
  bot: "bot_log_channel_id",
  security: "security_log_channel_id",
};

export class LogService {
  constructor(
    private readonly client: Client,
    private readonly configs: GuildConfigRepository,
    private readonly auditEvents: AuditEventRepository,
  ) {}

  async send(guild: Guild, kind: LogKind, title: string, description: string): Promise<void> {
    this.auditEvents.create({
      guildId: guild.id,
      eventType: kind,
      summary: `${title}: ${description}`,
    });

    const config = this.configs.ensure(guild.id);
    const channelId = config[logField[kind] as keyof typeof config] as string | null;
    if (!channelId) return;

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || channel.type !== ChannelType.GuildText || !channel.isSendable()) {
        logger.warn({ guildId: guild.id, kind, channelId }, "Canal de log configurado no existe o no es enviable");
        return;
      }
      await channel.send({ embeds: [embeds.info(title, description)] });
    } catch (error) {
      logger.warn({ error, guildId: guild.id, kind }, "No se pudo enviar log a Discord");
    }
  }
}
