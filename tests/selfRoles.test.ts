import DatabaseDriver from "better-sqlite3";
import { Collection } from "discord.js";
import { describe, expect, it } from "vitest";
import { findExistingRolePanelMessage } from "../src/commands/configuration/rolesPanel.js";
import { migrations } from "../src/database/migrations.js";
import { handleSelfRoleButton, handleSelfRoleSelect, withSelfRoleLock } from "../src/modules/selfRoles/selfRoleInteractions.js";
import {
  ensureColorPalette,
  paletteEntriesForGroup,
  readableTextColor,
  roleColorToHex,
} from "../src/modules/selfRoles/colorPaletteGenerator.js";
import {
  buildSelfRolePanelComponents,
  isProtectedSelfRole,
  plannedColorRoleChanges,
  plannedMultiRoleChanges,
} from "../src/modules/selfRoles/selfRolePresentation.js";
import { validateSelfRole } from "../src/modules/selfRoles/selfRoleSetup.js";
import { GuildConfigRepository } from "../src/repositories/guildConfigRepository.js";
import { SelfRoleRepository } from "../src/repositories/selfRoleRepository.js";

function memoryDb() {
  const db = new DatabaseDriver(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) {
    db.exec(migration.sql);
  }
  return db;
}

const config = {
  guild_id: "guild",
  welcome_channel_id: null,
  rules_channel_id: null,
  announcements_channel_id: null,
  moderation_log_channel_id: null,
  member_log_channel_id: null,
  message_log_channel_id: null,
  role_log_channel_id: null,
  bot_log_channel_id: null,
  ticket_category_id: null,
  ticket_panel_channel_id: null,
  ticket_panel_message_id: null,
  role_panel_channel_id: null,
  role_panel_message_id: null,
  member_role_id: "member",
  support_role_id: "support",
  developer_role_id: "moderator",
  administrator_role_id: "admin",
  founder_role_id: "founder",
  welcome_enabled: 1,
  goodbye_enabled: 1,
  moderation_enabled: 1,
  message_logs_enabled: 0,
  security_enabled: 0,
  welcome_dm_enabled: 0,
  presence_text: "CB Studios",
};

function botMember(position = 10) {
  return {
    id: "bot",
    permissions: { has: () => true },
    roles: {
      cache: { find: () => undefined },
      highest: { comparePositionTo: (role: any) => position - role.position },
    },
  } as any;
}

function role(input: { id: string; name: string; position?: number; managed?: boolean }) {
  return {
    id: input.id,
    name: input.name,
    position: input.position ?? 1,
    color: 0xe53935,
    managed: input.managed ?? false,
    guild: { roles: { everyone: { id: "everyone" } } },
  } as any;
}

function colorRole(input: { id: string; name: string; color: number; position?: number }) {
  return role({ id: input.id, name: input.name, position: input.position ?? 1 }) && {
    id: input.id,
    name: input.name,
    color: input.color,
    position: input.position ?? 1,
    managed: false,
    guild: { roles: { everyone: { id: "everyone" } } },
  } as any;
}

function guildWithRoles(roles: any[]) {
  const cache = new Collection<string, any>(roles.map((role) => [role.id, role]));
  return {
    id: "guild",
    roles: {
      cache,
      fetch: (id?: string) => Promise.resolve(id ? cache.get(id) ?? null : cache),
    },
    members: { me: botMember() },
  } as any;
}

describe("self roles", () => {
  it("mantiene un solo color activo y no toca tiers, miembro ni preferencias", () => {
    const current = ["member", "tier-3", "pref-carnivore", "blue"];
    const changes = plannedColorRoleChanges(current, ["blue", "red"], "red");
    expect(changes).toEqual({ add: ["red"], remove: ["blue"] });
  });

  it("no duplica el mismo color si ya esta activo", () => {
    expect(plannedColorRoleChanges(["blue"], ["blue", "red"], "blue")).toEqual({ add: [], remove: [] });
  });

  it("quita solamente roles del grupo COLOR", () => {
    const changes = plannedColorRoleChanges(["member", "tier-3", "pref", "blue", "red"], ["blue", "red"], null);
    expect(changes).toEqual({ add: [], remove: ["blue", "red"] });
  });

  it("permite multiples preferencias y cambios parciales", () => {
    const changes = plannedMultiRoleChanges(["member", "red", "herb", "carni"], ["herb", "omni", "carni"], ["herb", "omni"]);
    expect(changes).toEqual({ add: ["omni"], remove: ["carni"] });
  });

  it("permite quitar todas las preferencias sin tocar Dino Lover ni color", () => {
    const changes = plannedMultiRoleChanges(["member", "red", "herb", "omni"], ["herb", "omni", "carni"], []);
    expect(changes).toEqual({ add: [], remove: ["herb", "omni"] });
  });

  it("protege staff, Dino Lover, managed y roles superiores", () => {
    expect(isProtectedSelfRole({ roleId: "admin", roleName: "ADMIN", config })).toBe(true);
    expect(isProtectedSelfRole({ roleId: "member", roleName: "Technology Member", config })).toBe(true);
    expect(isProtectedSelfRole({ roleId: "booster", roleName: "Server Booster", config })).toBe(true);
    expect(isProtectedSelfRole({ roleId: "managed", roleName: "Integracion", config, managed: true })).toBe(true);
    expect(validateSelfRole(role({ id: "red", name: "Rojo", position: 11 }), config, botMember(10))).toContain("por encima");
  });

  it("rechaza custom_id manipulado o value no configurado con respuesta ephemeral", async () => {
    const db = memoryDb();
    const selfRoles = new SelfRoleRepository(db);
    const guildConfig = new GuildConfigRepository(db);
    guildConfig.ensure("guild");
    const replies: any[] = [];
    const interaction = {
      customId: "selfrole:color:COLOR_CLASSIC",
      values: ["unknown-role"],
      user: { id: "user", tag: "user#0001" },
      guildId: "guild",
      guild: { id: "guild", members: { me: botMember() } },
      member: { roles: { cache: new Collection() } },
      inCachedGuild: () => true,
      reply: (payload: any) => {
        replies.push(payload);
        return Promise.resolve();
      },
    } as any;

    await handleSelfRoleSelect(interaction, {
      repositories: {
        selfRoles,
        guildConfig,
        auditEvents: { create: () => undefined },
      },
    } as any);

    expect(replies[0].ephemeral).toBe(true);
    expect(replies[0].embeds[0].data.title).toContain("No pudimos");
  });

  it("detecta rol eliminado configurado sin romper la interaccion", async () => {
    const db = memoryDb();
    const selfRoles = new SelfRoleRepository(db);
    const guildConfig = new GuildConfigRepository(db);
    guildConfig.ensure("guild");
    selfRoles.ensureGroup({ guildId: "guild", groupKey: "COLOR_CLASSIC", groupType: "color", label: "Colores", sortOrder: 1 });
    selfRoles.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "red", label: "Rojo", sortOrder: 1 });
    const replies: any[] = [];
    const interaction = {
      customId: "selfrole:color:COLOR_CLASSIC",
      values: ["red"],
      user: { id: "user", tag: "user#0001" },
      guildId: "guild",
      guild: {
        id: "guild",
        roles: { cache: new Collection(), fetch: () => Promise.resolve(null) },
        members: { me: botMember() },
      },
      member: { roles: { cache: new Collection(), add: () => Promise.resolve(), remove: () => Promise.resolve() } },
      inCachedGuild: () => true,
      reply: (payload: any) => {
        replies.push(payload);
        return Promise.resolve();
      },
    } as any;

    await handleSelfRoleSelect(interaction, {
      repositories: {
        selfRoles,
        guildConfig,
        auditEvents: { create: () => undefined },
      },
    } as any);

    expect(replies[0].ephemeral).toBe(true);
    expect(replies[0].embeds[0].data.description).toContain("Contacta con el staff");
  });

  it("persiste opciones, permite desactivar y construye selectores separados", () => {
    const repo = new SelfRoleRepository(memoryDb());
    repo.ensureGroup({ guildId: "guild", groupKey: "COLOR_CLASSIC", groupType: "color", label: "Clasicos", sortOrder: 1 });
    repo.ensureGroup({ guildId: "guild", groupKey: "COLOR_PASTEL", groupType: "color", label: "Pastel", sortOrder: 2 });
    repo.ensureGroup({ guildId: "guild", groupKey: "PREFERENCES", groupType: "preferences", label: "Preferencias", sortOrder: 3 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "red", label: "Rojo", sortOrder: 1 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_PASTEL", roleId: "pink", label: "Rosa Pastel", sortOrder: 1 });
    repo.upsertOption({ guildId: "guild", groupKey: "PREFERENCES", roleId: "herb", label: "Herbivoro", sortOrder: 1 });
    expect(repo.setOptionEnabled("guild", "COLOR_PASTEL", "pink", false)).toBe(true);

    const rows = buildSelfRolePanelComponents(repo.listOptions("guild"));
    expect(rows).toHaveLength(3);
    expect(repo.listOptions("guild").map((option) => option.role_id)).toEqual(["red", "herb"]);
  });

  it("genera paleta Classic con colores reales por role ID y HEX correcto", async () => {
    const repo = new SelfRoleRepository(memoryDb());
    repo.ensureGroup({ guildId: "guild", groupKey: "COLOR_CLASSIC", groupType: "color", label: "Clasicos", sortOrder: 1 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "red", label: "Rojo", sortOrder: 1 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "blue", label: "Azul", sortOrder: 2 });
    const guild = guildWithRoles([
      colorRole({ id: "red", name: "Rojo", color: 0xe53935 }),
      colorRole({ id: "blue", name: "Azul", color: 0x1e88e5 }),
    ]);

    const entries = await paletteEntriesForGroup(guild, repo, "COLOR_CLASSIC");
    expect(entries.map((entry) => [entry.roleId, entry.hex])).toEqual([
      ["red", "#E53935"],
      ["blue", "#1E88E5"],
    ]);
    await expect(ensureColorPalette(guild, repo, "COLOR_CLASSIC", true)).resolves.toMatch(/classic-palette\.png$/);
  });

  it("genera paletas Pastel y Dark", async () => {
    const repo = new SelfRoleRepository(memoryDb());
    repo.ensureGroup({ guildId: "guild", groupKey: "COLOR_PASTEL", groupType: "color", label: "Pastel", sortOrder: 1 });
    repo.ensureGroup({ guildId: "guild", groupKey: "COLOR_DARK", groupType: "color", label: "Dark", sortOrder: 2 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_PASTEL", roleId: "pastel", label: "Rosa Pastel", sortOrder: 1 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_DARK", roleId: "dark", label: "Rojo Oscuro", sortOrder: 1 });
    const guild = guildWithRoles([
      colorRole({ id: "pastel", name: "Rosa Pastel", color: 0xf8bbd0 }),
      colorRole({ id: "dark", name: "Rojo Oscuro", color: 0x8b0000 }),
    ]);
    await expect(ensureColorPalette(guild, repo, "COLOR_PASTEL", true)).resolves.toMatch(/pastel-palette\.png$/);
    await expect(ensureColorPalette(guild, repo, "COLOR_DARK", true)).resolves.toMatch(/dark-palette\.png$/);
  });

  it("calcula contraste para muestras claras y oscuras", () => {
    expect(roleColorToHex(0)).toBe("#000000");
    expect(readableTextColor("#000000")).toBe("#F8FAFC");
    expect(readableTextColor("#FFFFFF")).toBe("#111827");
  });

  it("omite rol eliminado y opcion deshabilitada en la paleta", async () => {
    const repo = new SelfRoleRepository(memoryDb());
    repo.ensureGroup({ guildId: "guild", groupKey: "COLOR_CLASSIC", groupType: "color", label: "Clasicos", sortOrder: 1 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "red", label: "Rojo", sortOrder: 1 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "disabled", label: "Oculto", sortOrder: 2, enabled: false });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "missing", label: "Borrado", sortOrder: 3 });
    const entries = await paletteEntriesForGroup(guildWithRoles([colorRole({ id: "red", name: "Rojo", color: 0xe53935 })]), repo, "COLOR_CLASSIC");
    expect(entries.map((entry) => entry.roleId)).toEqual(["red"]);
  });

  it("confirmacion de color usa role.color y conserva preferencias al reemplazar color", async () => {
    const db = memoryDb();
    const selfRoles = new SelfRoleRepository(db);
    const guildConfig = new GuildConfigRepository(db);
    guildConfig.ensure("guild");
    selfRoles.ensureGroup({ guildId: "guild", groupKey: "COLOR_CLASSIC", groupType: "color", label: "Colores", sortOrder: 1 });
    selfRoles.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "blue", label: "Azul", sortOrder: 1 });
    selfRoles.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "red", label: "Rojo", sortOrder: 2 });
    const replies: any[] = [];
    const removed: string[][] = [];
    const added: string[][] = [];
    const rolesCache = new Collection<string, any>([
      ["blue", colorRole({ id: "blue", name: "Azul", color: 0x1e88e5 })],
      ["pref", colorRole({ id: "pref", name: "Carnivoro", color: 0x00ff00 })],
    ]);
    const interaction = {
      customId: "selfrole:color:COLOR_CLASSIC",
      values: ["red"],
      user: { id: "user", tag: "user#0001" },
      guildId: "guild",
      guild: guildWithRoles([
        colorRole({ id: "blue", name: "Azul", color: 0x1e88e5 }),
        colorRole({ id: "red", name: "Rojo", color: 0xe53935 }),
      ]),
      member: {
        roles: {
          cache: rolesCache,
          add: (ids: string[]) => {
            added.push(ids);
            return Promise.resolve();
          },
          remove: (ids: string[]) => {
            removed.push(ids);
            return Promise.resolve();
          },
        },
      },
      inCachedGuild: () => true,
      reply: (payload: any) => {
        replies.push(payload);
        return Promise.resolve();
      },
    } as any;

    await handleSelfRoleSelect(interaction, {
      repositories: {
        selfRoles,
        guildConfig,
        auditEvents: { create: () => undefined },
      },
    } as any);

    expect(removed).toEqual([["blue"]]);
    expect(added).toEqual([["red"]]);
    expect(rolesCache.has("pref")).toBe(true);
    expect(replies[0].embeds[0].data.color).toBe(0xe53935);
    expect(replies[0].embeds[0].data.description).toContain("#E53935");
  });

  it("panel principal tiene solo boton Ver paletas y Quitar mi color sin reemplazar select menus", () => {
    const repo = new SelfRoleRepository(memoryDb());
    for (const key of ["COLOR_CLASSIC", "COLOR_PASTEL", "COLOR_DARK"] as const) {
      repo.ensureGroup({ guildId: "guild", groupKey: key, groupType: "color", label: key, sortOrder: 1 });
      repo.upsertOption({ guildId: "guild", groupKey: key, roleId: key, label: key, sortOrder: 1 });
    }
    const rows = buildSelfRolePanelComponents(repo.listOptions("guild"));
    const labels = rows.at(-1)!.components.map((component: any) => component.data.label);
    expect(labels).toEqual(["Ver paletas", "Quitar mi color"]);
    expect(labels).not.toContain("Ver clasicos");
    expect(labels).not.toContain("Ver pastel");
    expect(labels).not.toContain("Ver oscuros");
    expect(rows.slice(0, 3).map((row) => (row.components[0] as any).data.custom_id)).toEqual([
      "selfrole:color:COLOR_CLASSIC",
      "selfrole:color:COLOR_PASTEL",
      "selfrole:color:COLOR_DARK",
    ]);
  });

  it("boton Ver paletas abre selector ephemeral", async () => {
    const replies: any[] = [];
    await handleSelfRoleButton(
      {
        customId: "selfrole:palettes",
        inCachedGuild: () => true,
        reply: (payload: any) => {
          replies.push(payload);
          return Promise.resolve();
        },
      } as any,
      {} as any,
    );
    expect(replies[0].ephemeral).toBe(true);
    expect(replies[0].embeds[0].data.title).toBe("🎨 VISTA DE PALETAS");
    expect(replies[0].components[0].components.map((component: any) => component.data.label)).toEqual([
      "Clasicos",
      "Pastel",
      "Oscuros",
    ]);
  });

  it("boton Clasicos muestra classic palette desde preview o panel", async () => {
    const repo = new SelfRoleRepository(memoryDb());
    repo.ensureGroup({ guildId: "guild", groupKey: "COLOR_CLASSIC", groupType: "color", label: "Clasicos", sortOrder: 1 });
    repo.upsertOption({ guildId: "guild", groupKey: "COLOR_CLASSIC", roleId: "red", label: "Rojo", sortOrder: 1 });
    const replies: any[] = [];
    await handleSelfRoleButton(
      {
        customId: "selfrole:palette:COLOR_CLASSIC",
        guild: guildWithRoles([colorRole({ id: "red", name: "Rojo", color: 0xe53935 })]),
        inCachedGuild: () => true,
        reply: (payload: any) => {
          replies.push(payload);
          return Promise.resolve();
        },
      } as any,
      { repositories: { selfRoles: repo } } as any,
    );
    expect(replies[0].ephemeral).toBe(true);
    expect(replies[0].files[0].name).toBe("classic-palette.png");
  });

  it("botones Pastel y Oscuros muestran sus paletas", async () => {
    const repo = new SelfRoleRepository(memoryDb());
    for (const key of ["COLOR_PASTEL", "COLOR_DARK"] as const) {
      repo.ensureGroup({ guildId: "guild", groupKey: key, groupType: "color", label: key, sortOrder: 1 });
      repo.upsertOption({ guildId: "guild", groupKey: key, roleId: key, label: key, sortOrder: 1 });
    }
    const guild = guildWithRoles([
      colorRole({ id: "COLOR_PASTEL", name: "Rosa Pastel", color: 0xf8bbd0 }),
      colorRole({ id: "COLOR_DARK", name: "Rojo Oscuro", color: 0x800614 }),
    ]);
    const replies: any[] = [];
    for (const customId of ["selfrole:palette:COLOR_PASTEL", "selfrole:palette:COLOR_DARK"]) {
      await handleSelfRoleButton(
        {
          customId,
          guild,
          inCachedGuild: () => true,
          reply: (payload: any) => {
            replies.push(payload);
            return Promise.resolve();
          },
        } as any,
        { repositories: { selfRoles: repo } } as any,
      );
    }
    expect(replies[0].files[0].name).toBe("pastel-palette.png");
    expect(replies[1].files[0].name).toBe("dark-palette.png");
  });

  it("fallo de imagen no rompe interaccion de paleta", async () => {
    const replies: any[] = [];
    await handleSelfRoleButton(
      {
        customId: "selfrole:palette:COLOR_FAKE",
        guild: guildWithRoles([]),
        inCachedGuild: () => true,
        reply: (payload: any) => {
          replies.push(payload);
          return Promise.resolve();
        },
      } as any,
      { repositories: { selfRoles: new SelfRoleRepository(memoryDb()) } } as any,
    );
    expect(replies[0].ephemeral).toBe(true);
    expect(replies[0].embeds[0].data.title).toContain("Paleta no disponible");
  });

  it("encuentra panel existente del bot para evitar duplicados", async () => {
    const message = {
      author: { id: "bot" },
      components: [{ components: [{ customId: "selfrole:color:COLOR_CLASSIC" }] }],
      embeds: [],
    };
    const channel = {
      messages: {
        fetch: () => Promise.resolve(new Collection([["message", message as any]])),
      },
    } as any;

    await expect(findExistingRolePanelMessage(channel, "bot")).resolves.toBe(message);
  });

  it("serializa interacciones rapidas por guild, usuario y grupo", async () => {
    const order: string[] = [];
    await Promise.all([
      withSelfRoleLock("guild:user:color", async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("first");
      }),
      withSelfRoleLock("guild:user:color", async () => {
        order.push("second");
      }),
    ]);
    expect(order).toEqual(["first", "second"]);
  });
});
