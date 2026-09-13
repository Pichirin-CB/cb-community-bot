import { ActivityType, Events } from "discord.js";
import type { BotContext } from "../types/context.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";
import { reconcileTemporaryVoiceChannels } from "../modules/voice/reconciliation.js";

export async function registerReady(context: BotContext): Promise<void> {
  context.client.once(Events.ClientReady, async (client) => {
    logger.info({ user: client.user.tag }, "CB Studios Bot online");
    await reconcileTemporaryVoiceChannels(context, client);
    for (const guild of client.guilds.cache.values()) {
      const config = context.repositories.guildConfig.ensure(guild.id);
      if (config.message_logs_enabled && !env.ENABLE_MESSAGE_CONTENT_INTENT) {
        logger.warn({ guildId: guild.id }, "Message logs activos sin Message Content; solo se registraran metadatos disponibles");
      }
      context.repositories.guildConfig.setPresence(guild.id, env.BOT_PRESENCE);
      client.user.setActivity(env.BOT_PRESENCE, { type: ActivityType.Playing });
      await context.services.logs.send(guild, "bot", "Startup", "CB Studios Bot inicio correctamente.");
    }
    if (env.ENABLE_SYSTEM_MONITOR) context.services.statusScheduler.start();
  });
}
