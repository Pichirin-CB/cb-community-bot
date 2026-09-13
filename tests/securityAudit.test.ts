import { describe, expect, it, vi } from "vitest";
import { configRolePermission } from "../src/commands/configuration/config.js";
import { sanitizedModuleLines } from "../src/commands/developer/dev.js";
import { commandJson, loadCommands } from "../src/commands/index.js";
import { ticketSubcommandPermission } from "../src/commands/support/tickets.js";
import { buildPublicStatusEmbed } from "../src/modules/systemStatus/statusEmbed.js";
import { hasInternalPermission, isProtectedAdministrativeRole } from "../src/permissions/staffLevels.js";
import { UserFacingError } from "../src/permissions/guards.js";
import { replyError } from "../src/utils/responses.js";
import { fakeMember } from "./voiceHelpers.js";

const config = {
  founder_role_id: "founder",
  administrator_role_id: "admin",
  developer_role_id: "developer",
  support_role_id: "support",
  customer_role_id: "customer",
  member_role_id: "member",
  server_booster_role_id: "booster",
  bots_role_id: "bots",
};

function member(roles: string[], id = "user") {
  return { ...fakeMember(roles, id), permissions: { has: () => false } } as any;
}

describe("final security audit", () => {
  it("separa permisos de Support, Developer, Administrator y Founder", () => {
    expect(hasInternalPermission(member(["support"]), config as any, "tickets", "owner")).toBe(true);
    expect(hasInternalPermission(member(["support"]), config as any, "config", "owner")).toBe(false);
    expect(hasInternalPermission(member(["developer"]), config as any, "developer", "owner")).toBe(true);
    expect(hasInternalPermission(member(["developer"]), config as any, "tickets", "owner")).toBe(false);
    expect(hasInternalPermission(member(["developer"]), config as any, "moderation", "owner")).toBe(false);
    expect(hasInternalPermission(member(["admin"]), config as any, "founder", "owner")).toBe(false);
    expect(hasInternalPermission(member([], "owner"), config as any, "founder", "owner")).toBe(true);
  });

  it("reserva configuracion critica y borrado de tickets", () => {
    expect(configRolePermission("founder_role_id")).toBe("founder");
    expect(configRolePermission("administrator_role_id")).toBe("founder");
    expect(configRolePermission("support_role_id")).toBe("config");
    expect(ticketSubcommandPermission("panel")).toBe("config");
    expect(ticketSubcommandPermission("delete")).toBe("config");
    expect(ticketSubcommandPermission("close")).toBe("tickets");
  });

  it("protege roles internos, bots y Server Booster", () => {
    for (const roleId of Object.values(config)) expect(isProtectedAdministrativeRole(roleId, config as any)).toBe(true);
    expect(isProtectedAdministrativeRole("cosmetic", config as any)).toBe(false);
  });

  it("registra /dev sin exigir Manage Guild y no hereda secretos", () => {
    expect(loadCommands().has("dev")).toBe(true);
    const dev = commandJson().find((command) => command.name === "dev")!;
    expect(dev.default_member_permissions).toBeUndefined();
    const lines = sanitizedModuleLines({ welcome_enabled: 1, goodbye_enabled: 0, moderation_enabled: 1, message_logs_enabled: 0, security_enabled: 0, welcome_dm_enabled: 1 } as any);
    expect(lines.join("\n")).not.toMatch(/token|password|database_path|discord_client/i);
  });

  it("estado publico no revela metricas ni host", () => {
    const embed = buildPublicStatusEmbed({
      collectedAt: "2026-01-01T00:00:00.000Z", hostname: "SECRET-HOST", platform: "win32", distro: "Secret OS",
      uptimeSeconds: 999, cpuLoadPct: 91, ramUsedPct: 88, ramTotalBytes: 1000, ramUsedBytes: 880,
      disks: [{ label: "C:", usedPct: 93, sizeBytes: 1000, usedBytes: 930 }], network: [], botMemoryBytes: 500, botUptimeSeconds: 120,
    }, { warn_cpu_pct: 85, warn_ram_pct: 85, warn_disk_pct: 90 } as any).toJSON();
    const output = JSON.stringify(embed);
    expect(output).toContain("Degraded");
    expect(output).not.toMatch(/SECRET-HOST|Secret OS|CPU|RAM|DISCO|91%|88%|93%/i);
    expect(output).not.toContain('C:');
  });

  it("errores inesperados se sanitizan y errores de usuario se conservan", async () => {
    const reply = vi.fn();
    await replyError({ replied: false, deferred: false, reply } as any, new Error("secret stack detail"));
    expect(JSON.stringify(reply.mock.calls[0])).not.toContain("secret stack detail");
    reply.mockClear();
    await replyError({ replied: false, deferred: false, reply } as any, new UserFacingError("Mensaje seguro"));
    expect(JSON.stringify(reply.mock.calls[0])).toContain("Mensaje seguro");
  });
});
