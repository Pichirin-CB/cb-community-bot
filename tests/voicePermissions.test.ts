import { describe, expect, it } from "vitest";
import { fakeMember } from "./voiceHelpers.js";
import { hasInternalPermission, resolveStaffLevel, StaffLevel } from "../src/permissions/staffLevels.js";
import { voiceConfigPermission } from "../src/commands/voiceConfig.js";
import { voiceGeneratorPermission } from "../src/commands/voiceGenerator.js";
import { voiceAdminPermission } from "../src/commands/voiceAdmin.js";

const emptyConfig = {
  guild_id: "guild",
  voice_log_channel_id: null,
  support_alert_channel_id: null,
  support_role_id: null,
  developer_role_id: null,
  administrator_role_id: null,
  founder_role_id: null,
  default_empty_grace_seconds: 5,
  one_room_per_user: 1,
  created_at: "",
  updated_at: "",
};

const configured = {
  ...emptyConfig,
  founder_role_id: "founder",
  administrator_role_id: "admin",
  developer_role_id: "mod",
  support_role_id: "support",
};

describe("internal permission bootstrap", () => {
  it("Guild Owner puede usar /voice-config con DB sin configurar", () => {
    expect(hasInternalPermission(fakeMember([], "owner"), emptyConfig, "config", "owner")).toBe(true);
    expect(hasInternalPermission(fakeMember([], "owner"), emptyConfig, "founder", "owner")).toBe(true);
  });

  it("un usuario normal no puede hacer bootstrap", () => {
    expect(hasInternalPermission(fakeMember([], "member"), emptyConfig, "config", "owner")).toBe(false);
  });

  it("Discord Administrator sin ser Guild Owner y sin rol configurado no hace bootstrap", () => {
    expect(hasInternalPermission(fakeMember(["discord-admin"], "admin-user"), emptyConfig, "config", "owner")).toBe(false);
  });

  it("founder_role_id configurado obtiene FUNDADOR", () => {
    expect(resolveStaffLevel(fakeMember(["founder"], "user"), configured, "owner")).toBe(StaffLevel.Founder);
  });

  it("administrator_role_id configurado obtiene ADMIN", () => {
    expect(resolveStaffLevel(fakeMember(["admin"], "user"), configured, "owner")).toBe(StaffLevel.Administrator);
  });

  it("developer_role_id configurado obtiene MODERADOR", () => {
    expect(resolveStaffLevel(fakeMember(["mod"], "user"), configured, "owner")).toBe(StaffLevel.Developer);
  });

  it("support_role_id configurado obtiene SOPORTE", () => {
    expect(resolveStaffLevel(fakeMember(["support"], "user"), configured, "owner")).toBe(StaffLevel.Support);
  });

  it("miembro normal sigue bloqueado", () => {
    expect(resolveStaffLevel(fakeMember([], "user"), configured, "owner")).toBe(StaffLevel.Member);
    expect(hasInternalPermission(fakeMember([], "user"), configured, "admin", "owner")).toBe(false);
  });

  it("Support no puede escalar privilegios", () => {
    const support = fakeMember(["support"], "support-user");
    expect(hasInternalPermission(support, configured, "tickets", "owner")).toBe(true);
    expect(hasInternalPermission(support, configured, "roles", "owner")).toBe(false);
    expect(hasInternalPermission(support, configured, "config", "owner")).toBe(false);
    expect(hasInternalPermission(support, configured, "moderation", "owner")).toBe(false);
  });

  it("Developer no hereda moderacion, tickets ni configuracion sensible", () => {
    const developer = fakeMember(["mod"], "developer-user");
    expect(hasInternalPermission(developer, configured, "developer", "owner")).toBe(true);
    expect(hasInternalPermission(developer, configured, "tickets", "owner")).toBe(false);
    expect(hasInternalPermission(developer, configured, "roles", "owner")).toBe(false);
    expect(hasInternalPermission(developer, configured, "config", "owner")).toBe(false);
    expect(hasInternalPermission(developer, configured, "ban", "owner")).toBe(false);
  });

  it("/voice-config role requiere FUNDADOR", () => {
    expect(voiceConfigPermission("role")).toBe("founder");
    expect(voiceConfigPermission("channel")).toBe("config");
    expect(voiceConfigPermission("settings")).toBe("config");
    expect(voiceConfigPermission("show")).toBe("config");
  });

  it("/voice-generator create permite ADMIN/FUNDADOR", () => {
    const permission = voiceGeneratorPermission("create");
    expect(permission).toBe("generator");
    expect(hasInternalPermission(fakeMember(["admin"], "user"), configured, permission, "owner")).toBe(true);
    expect(hasInternalPermission(fakeMember(["founder"], "user"), configured, permission, "owner")).toBe(true);
    expect(hasInternalPermission(fakeMember(["mod"], "user"), configured, permission, "owner")).toBe(false);
  });

  it("operaciones peligrosas de /voice-admin requieren ADMIN/FUNDADOR", () => {
    expect(voiceAdminPermission("cleanup")).toBe("admin");
    expect(voiceAdminPermission("reconcile")).toBe("admin");
    expect(voiceAdminPermission("refresh-permissions")).toBe("admin");
    expect(voiceAdminPermission("info")).toBe("moderation");
    expect(hasInternalPermission(fakeMember(["mod"], "user"), configured, voiceAdminPermission("cleanup"), "owner")).toBe(false);
    expect(hasInternalPermission(fakeMember(["admin"], "user"), configured, voiceAdminPermission("cleanup"), "owner")).toBe(true);
  });
});
