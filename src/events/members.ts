import { Events } from "discord.js";
import type { BotContext } from "../types/context.js";
import { handleMemberJoin, handleMemberLeave } from "../modules/welcome/welcomeService.js";
import { logger } from "../logger.js";

export function registerMemberEvents(context: BotContext): void {
  context.client.on(Events.GuildMemberAdd, async (member) => {
    try {
      await handleMemberJoin(member, context);
    } catch (error) {
      logger.warn({ error, guildId: member.guild.id }, "Fallo manejando entrada");
    }
  });

  context.client.on(Events.GuildMemberRemove, async (member) => {
    try {
      await handleMemberLeave(member, context);
    } catch (error) {
      logger.warn({ error, guildId: member.guild.id }, "Fallo manejando salida");
    }
  });

  context.client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const oldRoles = new Set(oldMember.roles.cache.keys());
      const added = newMember.roles.cache.filter((role) => !oldRoles.has(role.id));
      const removed = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
      if (added.size > 0) await context.services.logs.send(newMember.guild, "role", "Roles agregados", `${newMember.user.tag}: ${added.map((role) => role.name).join(", ")}`);
      if (removed.size > 0) await context.services.logs.send(newMember.guild, "role", "Roles retirados", `${newMember.user.tag}: ${removed.map((role) => role.name).join(", ")}`);
    } catch (error) {
      logger.warn({ error, guildId: newMember.guild.id }, "Fallo registrando cambios de roles");
    }
  });
}
