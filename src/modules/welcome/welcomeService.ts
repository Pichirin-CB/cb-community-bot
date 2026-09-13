import type { GuildMember, PartialGuildMember } from "discord.js";
import type { BotContext } from "../../types/context.js";
import { embeds } from "../embeds/embedService.js";
import { canManageRole } from "../../permissions/staffLevels.js";
import { logger } from "../../logger.js";
import type { GuildConfig } from "../../repositories/guildConfigRepository.js";
import { buildWelcomeLinkTargets, createWelcomeActionRow, type WelcomeLinkTargets } from "./welcomeLinks.js";

async function messageExists(channel: unknown, messageId: string): Promise<boolean> {
  if (typeof channel !== "object" || channel === null || !("messages" in channel)) return false;
  const messages = (channel as { messages?: { fetch?: (id: string) => Promise<unknown> } }).messages;
  if (!messages?.fetch) return false;
  const message = await messages.fetch(messageId).catch(() => null);
  return Boolean(message);
}

async function resolveWelcomeLinks(member: GuildMember, config: GuildConfig): Promise<WelcomeLinkTargets> {
  const rulesChannel = config.rules_channel_id
    ? await member.client.channels.fetch(config.rules_channel_id).catch(() => null)
    : null;
  const rolePanelChannel = config.role_panel_channel_id
    ? await member.client.channels.fetch(config.role_panel_channel_id).catch(() => null)
    : null;
  const rolePanelMessageAvailable =
    rolePanelChannel && config.role_panel_message_id
      ? await messageExists(rolePanelChannel, config.role_panel_message_id)
      : undefined;

  return buildWelcomeLinkTargets({
    guildId: member.guild.id,
    rulesChannelId: config.rules_channel_id,
    rolePanelChannelId: config.role_panel_channel_id,
    rolePanelMessageId: config.role_panel_message_id,
    rulesChannelAvailable: config.rules_channel_id ? Boolean(rulesChannel) : undefined,
    rolePanelChannelAvailable: config.role_panel_channel_id ? Boolean(rolePanelChannel) : undefined,
    rolePanelMessageAvailable,
  });
}

export async function handleMemberJoin(member: GuildMember, context: BotContext): Promise<void> {
  const config = context.repositories.guildConfig.ensure(member.guild.id);
  await context.services.logs.send(member.guild, "member", "Entrada", `${member.user.tag} entro al servidor.`);
  let memberRoleName: string | null = null;

  if (config.member_role_id) {
    const role = await member.guild.roles.fetch(config.member_role_id).catch(() => null);
    memberRoleName = role?.name ?? null;
    const bot = member.guild.members.me;
    if (role && bot) {
      const check = canManageRole({
        actorHighestRolePosition: Number.MAX_SAFE_INTEGER,
        botHighestRolePosition: bot.roles.highest.position,
        role,
      });
      if (check.ok) {
        await member.roles.add(role, "Autorole CB Community").catch((error) => {
          logger.warn({ error, guildId: member.guild.id, userId: member.id }, "Fallo asignando autorole");
        });
      } else {
        await context.services.logs.send(member.guild, "bot", "Autorole omitido", check.reason);
      }
    }
  }

  if (config.welcome_enabled && config.welcome_channel_id) {
    const channel = await member.client.channels.fetch(config.welcome_channel_id).catch(() => null);
    if (channel?.isSendable()) {
      const links = await resolveWelcomeLinks(member, config);
      for (const warning of links.warnings) {
        logger.warn({ guildId: member.guild.id }, warning);
      }
      const row = createWelcomeActionRow(links);
      await channel.send({
        embeds: [
          embeds.welcome(member, {
            rulesChannelId: links.rulesUrl ? config.rules_channel_id : null,
            rolePanelUrl: links.rolePanelUrl,
            memberRoleName,
          }),
        ],
        components: row ? [row] : [],
        files: embeds.officialBannerFiles(),
        allowedMentions: { users: [member.id] },
      }).catch((error: unknown) => {
        logger.warn({ error, guildId: member.guild.id }, "Fallo enviando bienvenida");
      });
    }
  }

  if (config.welcome_dm_enabled) {
    const links = await resolveWelcomeLinks(member, config);
    const row = createWelcomeActionRow(links);
    await member.send({
      embeds: [
        embeds.welcome(member, {
          rulesChannelId: links.rulesUrl ? config.rules_channel_id : null,
          rolePanelUrl: links.rolePanelUrl,
          memberRoleName,
        }),
      ],
      components: row ? [row] : [],
      files: embeds.officialBannerFiles(),
    }).catch(() => undefined);
  }
}

export async function handleMemberLeave(member: GuildMember | PartialGuildMember, context: BotContext): Promise<void> {
  const config = context.repositories.guildConfig.ensure(member.guild.id);
  if (!config.goodbye_enabled) return;
  const joined = member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "desconocido";
  await context.services.logs.send(member.guild, "member", "Salida", `${member.user.tag} salio del servidor. Permanencia: ${joined}.`);
}
