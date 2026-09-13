import { Events, type Message } from "discord.js";
import type { BotContext } from "../types/context.js";
import { inspectMessage } from "../modules/security/securityService.js";
import { logger } from "../logger.js";

export function registerMessageEvents(context: BotContext): void {
  context.client.on(Events.MessageCreate, async (message) => {
    try {
      await inspectMessage(message as Message, context);
    } catch (error) {
      logger.warn({ error, guildId: message.guildId }, "Fallo en seguridad de mensajes");
    }
  });

  context.client.on(Events.MessageDelete, async (message) => {
    try {
      if (!message.guild) return;
      const config = context.repositories.guildConfig.ensure(message.guild.id);
      if (!config.message_logs_enabled) return;
      await context.services.logs.send(message.guild, "message", "Mensaje eliminado", `Canal: <#${message.channelId}> Autor: ${message.author?.tag ?? "desconocido"}`);
    } catch (error) {
      logger.warn({ error, guildId: message.guildId }, "Fallo registrando mensaje eliminado");
    }
  });

  context.client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
    try {
      if (!newMessage.guild) return;
      const config = context.repositories.guildConfig.ensure(newMessage.guild.id);
      if (!config.message_logs_enabled) return;
      await context.services.logs.send(newMessage.guild, "message", "Mensaje editado", `Canal: <#${newMessage.channelId}> Autor: ${newMessage.author?.tag ?? "desconocido"}`);
    } catch (error) {
      logger.warn({ error, guildId: newMessage.guildId }, "Fallo registrando mensaje editado");
    }
  });
}
