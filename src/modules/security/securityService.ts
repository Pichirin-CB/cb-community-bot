import type { Message } from "discord.js";
import type { BotContext } from "../../types/context.js";

const recentMessages = new Map<string, Array<{ at: number; content: string }>>();

export async function inspectMessage(message: Message, context: BotContext): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const config = context.repositories.guildConfig.ensure(message.guild.id);
  if (!config.security_enabled) return;

  const content = message.content ?? "";
  const now = Date.now();
  const key = `${message.guild.id}:${message.author.id}`;
  const entries = (recentMessages.get(key) ?? []).filter((entry) => now - entry.at < 10_000);
  entries.push({ at: now, content });
  recentMessages.set(key, entries);

  const events: string[] = [];
  if (entries.length >= 6) events.push("posible flood");
  if (content && entries.filter((entry) => entry.content === content).length >= 4) events.push("mensajes repetidos");
  if (message.mentions.users.size + message.mentions.roles.size >= 6 || message.mentions.everyone) events.push("menciones masivas");
  if (/discord\.gg\/|discord\.com\/invite\//i.test(content)) events.push("invite de Discord");

  for (const event of events) {
    await context.services.logs.send(message.guild, "bot", "Evento de seguridad", `${message.author.tag}: ${event}`);
  }
}
