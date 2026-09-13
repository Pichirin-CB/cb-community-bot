import { Collection, PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { fakeMember, generator } from "./voiceHelpers.js";
import {
  buildCreateOverwrites,
  canUseGenerator,
  chooseAutoTransferOwner,
  defaultNameTemplate,
  defaultPrivacy,
  generatorStaffRoleIds,
  normalizeLimit,
  privacyOverwriteForEveryone,
} from "../src/modules/voice/voicePolicy.js";
import {
  fallbackRenderedNames,
  renderNameTemplate,
  sanitizeChannelName,
  uniqueChannelName,
  validateNameTemplate,
} from "../src/modules/voice/nameTemplate.js";

const config = {
  guild_id: "guild",
  voice_log_channel_id: null,
  support_alert_channel_id: null,
  support_role_id: "support",
  developer_role_id: "mod",
  administrator_role_id: "admin",
  founder_role_id: "founder",
  default_empty_grace_seconds: 5,
  one_room_per_user: 1,
  created_at: "",
  updated_at: "",
};

function overwrite(id: string, list: any[]) {
  return list.find((entry) => entry.id === id) as any;
}

function bits(value: any): bigint {
  if (!value) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  if (Array.isArray(value)) return value.reduce((acc, item) => acc | bits(item), 0n);
  if ("bitfield" in value) return bits(value.bitfield);
  return 0n;
}

function allows(id: string, list: any[], permission: bigint): boolean {
  return (bits(overwrite(id, list)?.allow) & permission) === permission;
}

function denies(id: string, list: any[], permission: bigint): boolean {
  return (bits(overwrite(id, list)?.deny) & permission) === permission;
}

describe("voice policy", () => {
  it("renderiza y sanitiza nombres de canal", () => {
    expect(renderNameTemplate("Sala de {displayname} #{counter}", { username: "User", displayname: "Pichirin CB", userId: "1", counter: 7 })).toBe("Sala de Pichirin CB #7");
    expect(sanitizeChannelName("   \n\t   ")).toBe("");
    expect(validateNameTemplate("sala-{bad}")).toContain("Variable no soportada");
  });

  it("prefiere displayName normal sobre username", () => {
    expect(
      renderNameTemplate("🔊・{displayname}", {
        displayname: "Pichirin",
        username: "pichirin_cb",
        userId: "1073087824913502268",
        counter: 1,
      }),
    ).toBe("🔊・Pichirin");
  });

  it("prefiere displayName Unicode con emoji y no usa username tecnico", () => {
    const result = renderNameTemplate("🔊・{displayname}", {
      displayname: "Ｐｉｃｈｉｒｉｎ ❄️🇨🇺",
      username: "pichirin_cb",
      userId: "1073087824913502268",
      counter: 1,
    });
    expect(result).toContain("Ｐｉｃｈｉｒｉｎ");
    expect(result).toContain("❄️");
    expect(result).toContain("🇨🇺");
    expect(result).not.toContain("pichirin_cb");
  });

  it("fallback a globalName cuando displayName queda vacio", () => {
    expect(
      renderNameTemplate("🔊・{displayname}", {
        displayname: " \n ",
        globalName: "Global User",
        username: "pichirin_cb",
        userId: "1073087824913502268",
        counter: 1,
      }),
    ).toBe("🔊・Global User");
  });

  it("fallback a username cuando displayName y globalName quedan vacios", () => {
    expect(
      renderNameTemplate("🔊・{displayname}", {
        displayname: "",
        globalName: "",
        username: "pichirin_cb",
        userId: "1073087824913502268",
        counter: 1,
      }),
    ).toBe("🔊・pichirin_cb");
  });

  it("fallback final a user short id", () => {
    expect(
      renderNameTemplate("🔊・{displayname}", {
        displayname: "",
        globalName: "",
        username: "",
        userId: "1073087824913502268",
        counter: 1,
      }),
    ).toBe("🔊・user-502268");
  });

  it("agrega sufijo si hay colision", () => {
    expect(uniqueChannelName("🔊・Ｐｉｃｈｉｒｉｎ", ["🔊・Ｐｉｃｈｉｒｉｎ"])).toBe("🔊・Ｐｉｃｈｉｒｉｎ-2");
  });

  it("respeta longitud maxima", () => {
    expect(sanitizeChannelName("x".repeat(120))).toHaveLength(100);
    expect(uniqueChannelName("x".repeat(100), ["x".repeat(100)])).toHaveLength(100);
  });

  it("limpia caracteres problematicos sin destruir unicode valido", () => {
    expect(sanitizeChannelName("Ｐｉ/ｃｈ\\@everyone")).toBe("Ｐｉ-ｃｈ-everyone");
  });

  it("genera candidatos fallback ordenados", () => {
    expect(
      fallbackRenderedNames("🔊・{displayname}", {
        displayname: "",
        globalName: "Global",
        username: "User",
        userId: "123456",
        counter: 1,
      }),
    ).toEqual(["🔊・Global", "🔊・User", "🔊・user-123456"]);
  });

  it("normaliza limites sin superar maximo", () => {
    expect(normalizeLimit(25, 10)).toBe(10);
    expect(normalizeLimit(-1, 10)).toBe(0);
  });

  it("configura public creation sin cerrar al publico", () => {
    const overwrites = buildCreateOverwrites({ guildId: "guild", botUserId: "bot", ownerUserId: "owner", privacyMode: "PUBLIC", staffRoleIds: [] });
    expect(allows("guild", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
    expect(allows("guild", overwrites, PermissionFlagsBits.ReadMessageHistory)).toBe(true);
    expect(allows("owner", overwrites, PermissionFlagsBits.Connect)).toBe(true);
    expect(allows("owner", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
  });

  it("configura support creation privada desde el inicio", () => {
    const overwrites = buildCreateOverwrites({
      guildId: "guild",
      botUserId: "bot",
      ownerUserId: "owner",
      privacyMode: "PRIVATE",
      staffRoleIds: ["support", "admin", "founder"],
    });
    expect(denies("guild", overwrites, PermissionFlagsBits.ViewChannel)).toBe(true);
    expect(allows("support", overwrites, PermissionFlagsBits.Connect)).toBe(true);
  });

  it("copia overwrites base de categoria para public sin duplicar ids", () => {
    const overwrites = buildCreateOverwrites({
      guildId: "guild",
      botUserId: "bot",
      ownerUserId: "owner",
      privacyMode: "PUBLIC",
      staffRoleIds: [],
      baseOverwrites: [
        { id: "guild", deny: [PermissionFlagsBits.SendMessages] },
        { id: "member-role", allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.Speak] },
        { id: "member-role", allow: [PermissionFlagsBits.Connect] },
      ],
    });
    expect(overwrites.filter((entry: any) => entry.id === "member-role")).toHaveLength(1);
    expect(allows("guild", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
    expect(allows("member-role", overwrites, PermissionFlagsBits.ViewChannel)).toBe(true);
    expect(allows("member-role", overwrites, PermissionFlagsBits.Connect)).toBe(true);
    expect(denies("member-role", overwrites, PermissionFlagsBits.Speak)).toBe(true);
  });

  it("genera payload de create valido sin valores undefined", () => {
    const overwrites = buildCreateOverwrites({
      guildId: "guild",
      botUserId: "bot",
      ownerUserId: "owner",
      privacyMode: "PUBLIC",
      staffRoleIds: [],
      baseOverwrites: [{ id: "guild", type: 0, allow: 0n, deny: PermissionFlagsBits.SendMessages }],
    }) as any[];
    expect(overwrites.every((entry) => typeof entry.id === "string" && (entry.type === 0 || entry.type === 1))).toBe(true);
    expect(overwrites.every((entry) => entry.allow !== undefined && entry.deny !== undefined)).toBe(true);
    expect(overwrites.map((entry) => `${entry.type}:${entry.id}`)).toEqual([...new Set(overwrites.map((entry) => `${entry.type}:${entry.id}`))]);
  });

  it("support conserva base y agrega privacidad/staff sin borrar otros permisos", () => {
    const overwrites = buildCreateOverwrites({
      guildId: "guild",
      botUserId: "bot",
      ownerUserId: "owner",
      privacyMode: "PRIVATE",
      staffRoleIds: ["support", "admin"],
      baseOverwrites: [
        { id: "guild", type: 0, allow: [PermissionFlagsBits.SendMessages] },
        { id: "visitor-role", type: 0, allow: [PermissionFlagsBits.ReadMessageHistory] },
      ],
    });
    expect(allows("guild", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
    expect(denies("guild", overwrites, PermissionFlagsBits.ViewChannel)).toBe(true);
    expect(allows("support", overwrites, PermissionFlagsBits.Connect)).toBe(true);
    expect(allows("support", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
    expect(allows("admin", overwrites, PermissionFlagsBits.ViewChannel)).toBe(true);
    expect(allows("visitor-role", overwrites, PermissionFlagsBits.ReadMessageHistory)).toBe(true);
  });

  it("staff conserva base y autoriza roles staff", () => {
    const roles = generatorStaffRoleIds(generator({ type: "STAFF" }), config, []);
    const overwrites = buildCreateOverwrites({
      guildId: "guild",
      botUserId: "bot",
      ownerUserId: "owner",
      privacyMode: "PRIVATE",
      staffRoleIds: roles,
      baseOverwrites: [{ id: "guild", deny: [PermissionFlagsBits.SendMessages] }],
    });
    expect(roles.every((roleId) => allows(roleId, overwrites, PermissionFlagsBits.Connect))).toBe(true);
    expect(allows("support", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
  });

  it("refresh preserva owner privacidad allowlist y blocklist sobre base actual", () => {
    const overwrites = buildCreateOverwrites({
      guildId: "guild",
      botUserId: "bot",
      ownerUserId: "owner",
      privacyMode: "LOCKED",
      staffRoleIds: ["support"],
      baseOverwrites: [{ id: "guild", type: 0, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] }],
      storedPermissions: [
        { user_id: "allowed", permission_type: "ALLOW" },
        { user_id: "blocked", permission_type: "BLOCK" },
      ],
    });
    expect(allows("guild", overwrites, PermissionFlagsBits.ViewChannel)).toBe(true);
    expect(denies("guild", overwrites, PermissionFlagsBits.Connect)).toBe(true);
    expect(allows("guild", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
    expect(allows("owner", overwrites, PermissionFlagsBits.Connect)).toBe(true);
    expect(allows("owner", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
    expect(allows("allowed", overwrites, PermissionFlagsBits.ViewChannel)).toBe(true);
    expect(allows("allowed", overwrites, PermissionFlagsBits.ReadMessageHistory)).toBe(true);
    expect(denies("blocked", overwrites, PermissionFlagsBits.Connect)).toBe(true);
    expect(denies("blocked", overwrites, PermissionFlagsBits.SendMessages)).toBe(true);
    expect(allows("support", overwrites, PermissionFlagsBits.Connect)).toBe(true);
  });

  it("missing category base produce overwrites internos seguros", () => {
    const overwrites = buildCreateOverwrites({
      guildId: "guild",
      botUserId: "bot",
      ownerUserId: "owner",
      privacyMode: "PUBLIC",
      staffRoleIds: [],
      baseOverwrites: [],
    });
    expect(allows("bot", overwrites, PermissionFlagsBits.ManageChannels)).toBe(true);
    expect(allows("owner", overwrites, PermissionFlagsBits.Connect)).toBe(true);
  });

  it("configura staff creation privada para staff autorizado", () => {
    const roles = generatorStaffRoleIds(generator({ type: "STAFF" }), config, []);
    expect(roles).toEqual(["support", "mod", "admin", "founder"]);
  });

  it("support no incluye moderador automaticamente", () => {
    const roles = generatorStaffRoleIds(generator({ type: "SUPPORT" }), config, []);
    expect(roles).toEqual(["support", "admin", "founder"]);
  });

  it("usa roles explicitos del generador cuando existen", () => {
    const roles = generatorStaffRoleIds(generator({ type: "STAFF" }), config, ["custom"]);
    expect(roles).toEqual(["custom"]);
  });

  it("autoriza public y protege staff/support", () => {
    expect(canUseGenerator(generator({ type: "PUBLIC" }), fakeMember([]), config, [])).toBe(true);
    expect(canUseGenerator(generator({ type: "STAFF" }), fakeMember(["mod"]), config, [])).toBe(true);
    expect(canUseGenerator(generator({ type: "SUPPORT" }), fakeMember(["mod"]), config, [])).toBe(false);
  });

  it("distingue public locked private", () => {
    expect(privacyOverwriteForEveryone("PUBLIC")).toEqual({
      ViewChannel: null,
      Connect: null,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    expect(privacyOverwriteForEveryone("PUBLIC", { id: "guild", allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.Connect] })).toEqual({
      ViewChannel: true,
      Connect: false,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    expect(privacyOverwriteForEveryone("LOCKED")).toEqual({
      ViewChannel: true,
      Connect: false,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    expect(privacyOverwriteForEveryone("PRIVATE")).toEqual({
      ViewChannel: false,
      Connect: false,
      SendMessages: null,
      ReadMessageHistory: null,
    });
  });

  it("elige auto transfer para humano mas antiguo e ignora bots", () => {
    const members = new Collection<string, any>();
    members.set("owner", { id: "owner", user: { bot: false }, joinedTimestamp: 1, voice: { channel: { members } } });
    members.set("bot", { id: "bot", user: { bot: true }, joinedTimestamp: 2, voice: { channel: { members } } });
    members.set("human", { id: "human", user: { bot: false }, joinedTimestamp: 3, voice: { channel: { members } } });
    expect(chooseAutoTransferOwner({ members } as any, "owner")).toBe("human");
  });

  it("define defaults para generadores iniciales", () => {
    expect(defaultNameTemplate("PUBLIC")).toBe("🔊・{displayname}");
    expect(defaultNameTemplate("SUPPORT")).toBe("🆘・soporte-{displayname}");
    expect(defaultNameTemplate("STAFF")).toBe("🛡️・staff-{displayname}");
    expect(defaultPrivacy("SUPPORT")).toBe("PRIVATE");
    expect(defaultPrivacy("STAFF")).toBe("PRIVATE");
  });
});
