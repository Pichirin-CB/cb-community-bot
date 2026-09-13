import { ChannelType, PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  buildTicketChannelName,
  buildTicketPanelEmbed,
  buildTicketPanelMenu,
  buildTicketPermissionOverwrites,
  requiredTicketConfig,
  sanitizeTicketUsername,
  ticketPanelAttachments,
  ticketCategories,
} from "../src/modules/tickets/ticketPresentation.js";
import type { GuildConfig } from "../src/repositories/guildConfigRepository.js";

function config(overrides: Partial<GuildConfig> = {}): GuildConfig {
  return {
    guild_id: "guild",
    welcome_channel_id: null,
    rules_channel_id: null,
    announcements_channel_id: null,
    moderation_log_channel_id: null,
    member_log_channel_id: null,
    message_log_channel_id: null,
    role_log_channel_id: null,
    bot_log_channel_id: null,
    ticket_category_id: "category",
    ticket_panel_channel_id: null,
    ticket_panel_message_id: null,
    role_panel_channel_id: null,
    role_panel_message_id: null,
    member_role_id: null,
    support_role_id: "support",
    developer_role_id: null,
    administrator_role_id: "admin",
    founder_role_id: "founder",
    welcome_enabled: 1,
    goodbye_enabled: 1,
    moderation_enabled: 1,
    message_logs_enabled: 0,
    security_enabled: 0,
    welcome_dm_enabled: 0,
    presence_text: "CB Studios",
    ...overrides,
  };
}

describe("ticket presentation", () => {
  it("construye el panel con banner attachment local", () => {
    const embed = buildTicketPanelEmbed().toJSON();
    const attachments = ticketPanelAttachments();
    expect(embed.title).toContain("CENTRO DE AYUDA");
    expect(embed.image?.url).toContain("cbstudios-banner.png");
    expect(attachments).toHaveLength(1);
  });

  it("define las categorias del selector dentro de limites de Discord", () => {
    const menu = buildTicketPanelMenu().components[0]!.toJSON();
    expect(ticketCategories).toHaveLength(8);
    expect(menu.placeholder).toContain("Selecciona el tipo de solicitud");
    expect(menu.options).toHaveLength(8);
    const serverRental = menu.options.find((option) => option.value === "other");
    expect(serverRental?.label).toBe("RENTA DE SERVIDORES");
    expect(serverRental?.description).toContain("renta de servidores");
    expect(menu.options.map((option) => option.label)).toEqual([
      "AYUDA GENERAL",
      "PEDIDO O COMPRA",
      "SOPORTE TECNICO",
      "PAGOS Y FACTURACION",
      "CONSULTA DE COMPRA",
      "ALIANZAS Y NEGOCIOS",
      "GARANTIAS Y REEMBOLSOS",
      "RENTA DE SERVIDORES",
    ]);
    for (const option of menu.options) {
      expect(option.label.length).toBeLessThanOrEqual(100);
      expect(option.description!.length).toBeLessThanOrEqual(100);
      expect(option.value.length).toBeLessThanOrEqual(100);
      expect(option.emoji).toBeTruthy();
    }
  });

  it("usa la categoria compatible 'other' para renta de servidores", () => {
    expect(buildTicketChannelName("other", "Cliente")).toBe("renta-servidor-cliente");
  });

  it("sanitiza nombres y evita colisiones de canales", () => {
    expect(sanitizeTicketUsername("Pichirín !!")).toBe("pichirin");
    expect(buildTicketChannelName("customer_support", "Pichirín", new Set(["pedido-pichirin"]))).toBe("pedido-pichirin-2");
  });

  it("crea permisos privados sin incluir moderador automaticamente", () => {
    const overwrites = buildTicketPermissionOverwrites({
      guild: { roles: { everyone: { id: "everyone" } } } as any,
      ownerUserId: "owner",
      botUserId: "bot",
      staffRoles: [{ id: "support" }, { id: "admin" }, { id: "founder" }] as any,
    });
    expect(overwrites.map((overwrite: any) => overwrite.id)).toEqual(["everyone", "owner", "bot", "support", "admin", "founder"]);
    expect(overwrites.some((overwrite: any) => overwrite.id === "moderator")).toBe(false);
    expect((overwrites[0] as any).deny).toContain(PermissionFlagsBits.ViewChannel);
  });

  it("reporta configuracion faltante antes de publicar o usar tickets", () => {
    expect(requiredTicketConfig(config({ support_role_id: null }))).toEqual(["support_role_id"]);
    expect(requiredTicketConfig(config({ ticket_category_id: null }))).toEqual(["ticket_category_id"]);
    expect(requiredTicketConfig(config())).toEqual([]);
  });

  it("mantiene tipos esperados para categoria eliminada o roles eliminados", () => {
    expect(ChannelType.GuildCategory).toBe(4);
    expect(requiredTicketConfig(config({ founder_role_id: null }))).toContain("founder_role_id");
  });
});
