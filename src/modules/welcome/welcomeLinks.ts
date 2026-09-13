import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export interface WelcomeLinkInput {
  guildId: string;
  rulesChannelId: string | null;
  rolePanelChannelId: string | null;
  rolePanelMessageId: string | null;
  rulesChannelAvailable?: boolean;
  rolePanelChannelAvailable?: boolean;
  rolePanelMessageAvailable?: boolean;
}

export interface WelcomeLinkTargets {
  rulesUrl: string | null;
  rolePanelUrl: string | null;
  warnings: string[];
}

export function discordChannelUrl(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

export function discordMessageUrl(guildId: string, channelId: string, messageId: string): string {
  return `${discordChannelUrl(guildId, channelId)}/${messageId}`;
}

export function buildWelcomeLinkTargets(input: WelcomeLinkInput): WelcomeLinkTargets {
  const warnings: string[] = [];
  const rulesUrl =
    input.rulesChannelId && input.rulesChannelAvailable !== false
      ? discordChannelUrl(input.guildId, input.rulesChannelId)
      : null;

  if (!input.rolePanelChannelId) {
    warnings.push("Panel de personalizacion sin canal configurado.");
    return { rulesUrl, rolePanelUrl: null, warnings };
  }

  if (input.rolePanelChannelAvailable === false) {
    warnings.push("Canal del panel de personalizacion no encontrado.");
    return { rulesUrl, rolePanelUrl: null, warnings };
  }

  if (input.rolePanelMessageId && input.rolePanelMessageAvailable !== false) {
    return {
      rulesUrl,
      rolePanelUrl: discordMessageUrl(input.guildId, input.rolePanelChannelId, input.rolePanelMessageId),
      warnings,
    };
  }

  if (input.rolePanelMessageId && input.rolePanelMessageAvailable === false) {
    warnings.push("Mensaje del panel de personalizacion no encontrado; usando enlace al canal.");
  }

  return {
    rulesUrl,
    rolePanelUrl: discordChannelUrl(input.guildId, input.rolePanelChannelId),
    warnings,
  };
}

export function createWelcomeActionRow(targets: WelcomeLinkTargets): ActionRowBuilder<ButtonBuilder> | null {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (targets.rulesUrl) {
    row.addComponents(
      new ButtonBuilder().setLabel("📜 Ver reglas").setStyle(ButtonStyle.Link).setURL(targets.rulesUrl),
    );
  }
  if (targets.rolePanelUrl) {
    row.addComponents(
      new ButtonBuilder().setLabel("🎨 Personalizar perfil").setStyle(ButtonStyle.Link).setURL(targets.rolePanelUrl),
    );
  }
  return row.components.length > 0 ? row : null;
}
