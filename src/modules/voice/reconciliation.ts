import { ChannelType, type Client, type VoiceChannel } from "discord.js";
import { logger } from "../../logger.js";
import type { BotContext } from "../../types/context.js";

export type ReconciliationReport = {
  loaded: number;
  orphanRecordsRemoved: number;
  emptyRoomsCleaned: number;
  activeRoomsRecovered: number;
};

export async function reconcileTemporaryVoiceChannels(context: BotContext, client: Client): Promise<ReconciliationReport> {
  const activeRooms = context.repositories.tempVoice.listActive();
  const report: ReconciliationReport = {
    loaded: activeRooms.length,
    orphanRecordsRemoved: 0,
    emptyRoomsCleaned: 0,
    activeRoomsRecovered: 0,
  };

  const guildIds = new Set(activeRooms.map((room) => room.guild_id));
  for (const guildId of guildIds) {
    context.repositories.audit.record({
      guildId,
      eventType: "VOICE_RECONCILIATION_STARTED",
      metadata: { activeRooms: activeRooms.filter((room) => room.guild_id === guildId).length },
    });
  }

  for (const room of activeRooms) {
    const guild = await client.guilds.fetch(room.guild_id).catch(() => null);
    const channel = guild ? await guild.channels.fetch(room.channel_id).catch(() => null) : null;
    if (!channel) {
      context.repositories.tempVoice.markDeleted(room.channel_id);
      report.orphanRecordsRemoved += 1;
      continue;
    }
    if (channel.type !== ChannelType.GuildVoice) {
      context.repositories.tempVoice.markDeleted(room.channel_id);
      report.orphanRecordsRemoved += 1;
      continue;
    }
    if ((channel as VoiceChannel).members.size === 0) {
      context.services.voice.scheduleDelete(room);
      report.emptyRoomsCleaned += 1;
      continue;
    }
    context.repositories.tempVoice.markActive(room.channel_id);
    report.activeRoomsRecovered += 1;
  }

  for (const guildId of guildIds) {
    context.repositories.audit.record({
      guildId,
      eventType: "VOICE_RECONCILIATION_COMPLETED",
      metadata: report,
    });
  }

  logger.info(report, "Reconciliacion de salas temporales completada");
  return report;
}
