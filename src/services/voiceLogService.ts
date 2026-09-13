import { ChannelType, type Client, type TextChannel } from "discord.js";
import type { GuildConfigRepository } from "../repositories/guildConfigRepository.js";
import type { VoiceAuditEventType } from "../repositories/auditRepository.js";
import { embeds } from "../utils/responses.js";
import { logger } from "../logger.js";

export class VoiceLogService {
  constructor(
    private readonly client: Client,
    private readonly guildConfig: GuildConfigRepository,
  ) {}

  async send(input: {
    guildId: string;
    eventType: VoiceAuditEventType;
    summary: string;
    channelId?: string | null;
    actorUserId?: string | null;
    targetUserId?: string | null;
  }): Promise<void> {
    const config = this.guildConfig.ensure(input.guildId);
    if (!config.voice_log_channel_id) return;
    const channel = await this.client.channels.fetch(config.voice_log_channel_id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      logger.warn({ guildId: input.guildId, channelId: config.voice_log_channel_id }, "Canal de voice log no existe o no es de texto");
      return;
    }
    await (channel as TextChannel)
      .send({
        embeds: [
          embeds.info(
            input.eventType,
            [
              input.summary,
              input.channelId ? `Canal: <#${input.channelId}>` : null,
              input.actorUserId ? `Actor: <@${input.actorUserId}>` : null,
              input.targetUserId ? `Target: <@${input.targetUserId}>` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ],
        allowedMentions: { parse: [] },
      })
      .catch((error: unknown) => logger.warn({ error, eventType: input.eventType }, "No se pudo enviar voice log"));
  }
}
