import { ChannelType } from "discord.js";
import { describe, expect, it } from "vitest";
import { assertConfigChannelType, configRolePermission, formatConfigValue } from "../src/commands/configuration/config.js";

describe("config command validation", () => {
  it("acepta canales de texto o anuncios para campos de canal", () => {
    expect(() => assertConfigChannelType("welcome_channel_id", ChannelType.GuildText)).not.toThrow();
    expect(() => assertConfigChannelType("announcements_channel_id", ChannelType.GuildAnnouncement)).not.toThrow();
  });

  it("rechaza categorias para campos de canal", () => {
    expect(() => assertConfigChannelType("welcome_channel_id", ChannelType.GuildCategory)).toThrow(
      "welcome_channel_id debe ser un canal de texto o anuncios.",
    );
  });

  it("acepta solo categorias para ticket_category_id", () => {
    expect(() => assertConfigChannelType("ticket_category_id", ChannelType.GuildCategory)).not.toThrow();
    expect(() => assertConfigChannelType("ticket_category_id", ChannelType.GuildText)).toThrow(
      "ticket_category_id debe ser una categoria.",
    );
  });

  it("reserva roles criticos para Founder", () => {
    expect(configRolePermission("founder_role_id")).toBe("founder");
    expect(configRolePermission("administrator_role_id")).toBe("founder");
    expect(configRolePermission("support_role_id")).toBe("config");
  });

  it("presenta configuracion con estados claros y sin secretos", () => {
    expect(formatConfigValue("welcome_enabled", 1)).toBe("enabled");
    expect(formatConfigValue("message_logs_enabled", 0)).toBe("disabled");
    expect(formatConfigValue("support_role_id", "123")).toBe("<@&123>");
    expect(formatConfigValue("welcome_channel_id", null)).toBe("not configured");
  });
});
