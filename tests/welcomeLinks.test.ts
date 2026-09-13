import { describe, expect, it } from "vitest";
import {
  buildWelcomeLinkTargets,
  createWelcomeActionRow,
  discordChannelUrl,
  discordMessageUrl,
} from "../src/modules/welcome/welcomeLinks.js";

const guildId = "100000000000000001";
const rulesChannelId = "100000000000000002";
const panelChannelId = "100000000000000003";
const panelMessageId = "100000000000000004";

describe("welcome links", () => {
  it("incluye reglas y panel configurados con enlace directo al mensaje", () => {
    const targets = buildWelcomeLinkTargets({
      guildId,
      rulesChannelId,
      rolePanelChannelId: panelChannelId,
      rolePanelMessageId: panelMessageId,
    });

    expect(targets.rulesUrl).toBe(discordChannelUrl(guildId, rulesChannelId));
    expect(targets.rolePanelUrl).toBe(discordMessageUrl(guildId, panelChannelId, panelMessageId));
    expect(createWelcomeActionRow(targets)?.components).toHaveLength(2);
  });

  it("incluye solo reglas cuando el panel no esta configurado", () => {
    const targets = buildWelcomeLinkTargets({
      guildId,
      rulesChannelId,
      rolePanelChannelId: null,
      rolePanelMessageId: null,
    });

    expect(targets.rulesUrl).toBe(discordChannelUrl(guildId, rulesChannelId));
    expect(targets.rolePanelUrl).toBeNull();
    expect(targets.warnings).toContain("Panel de personalizacion sin canal configurado.");
    expect(createWelcomeActionRow(targets)?.components).toHaveLength(1);
  });

  it("incluye solo panel cuando no hay reglas configuradas", () => {
    const targets = buildWelcomeLinkTargets({
      guildId,
      rulesChannelId: null,
      rolePanelChannelId: panelChannelId,
      rolePanelMessageId: null,
    });

    expect(targets.rulesUrl).toBeNull();
    expect(targets.rolePanelUrl).toBe(discordChannelUrl(guildId, panelChannelId));
    expect(createWelcomeActionRow(targets)?.components).toHaveLength(1);
  });

  it("no crea botones cuando no hay reglas ni panel", () => {
    const targets = buildWelcomeLinkTargets({
      guildId,
      rulesChannelId: null,
      rolePanelChannelId: null,
      rolePanelMessageId: null,
    });

    expect(targets.rulesUrl).toBeNull();
    expect(targets.rolePanelUrl).toBeNull();
    expect(createWelcomeActionRow(targets)).toBeNull();
  });

  it("usa el canal cuando el mensaje del panel fue eliminado", () => {
    const targets = buildWelcomeLinkTargets({
      guildId,
      rulesChannelId: null,
      rolePanelChannelId: panelChannelId,
      rolePanelMessageId: panelMessageId,
      rolePanelMessageAvailable: false,
    });

    expect(targets.rolePanelUrl).toBe(discordChannelUrl(guildId, panelChannelId));
    expect(targets.warnings).toContain("Mensaje del panel de personalizacion no encontrado; usando enlace al canal.");
  });

  it("omite el panel cuando su canal fue eliminado", () => {
    const targets = buildWelcomeLinkTargets({
      guildId,
      rulesChannelId: rulesChannelId,
      rolePanelChannelId: panelChannelId,
      rolePanelMessageId: panelMessageId,
      rolePanelChannelAvailable: false,
    });

    expect(targets.rulesUrl).toBe(discordChannelUrl(guildId, rulesChannelId));
    expect(targets.rolePanelUrl).toBeNull();
    expect(targets.warnings).toContain("Canal del panel de personalizacion no encontrado.");
  });

  it("genera URLs canonicas de canal y mensaje", () => {
    expect(discordChannelUrl(guildId, panelChannelId)).toBe(
      "https://discord.com/channels/100000000000000001/100000000000000003",
    );
    expect(discordMessageUrl(guildId, panelChannelId, panelMessageId)).toBe(
      "https://discord.com/channels/100000000000000001/100000000000000003/100000000000000004",
    );
  });
});
