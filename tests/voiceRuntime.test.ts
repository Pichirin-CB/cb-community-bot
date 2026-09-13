import { ChannelType, PermissionFlagsBits } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { AsyncLock } from "../src/modules/voice/locks.js";
import { CooldownStore } from "../src/modules/voice/cooldowns.js";
import { repositories } from "./voiceHelpers.js";
import { VoiceService } from "../src/modules/voice/voiceService.js";
import { reconcileTemporaryVoiceChannels } from "../src/modules/voice/reconciliation.js";
import { handleVoiceButton } from "../src/modules/voice/voiceInteractions.js";
import type { TemporaryVoiceChannel } from "../src/repositories/tempVoiceRepository.js";

function contextWithRoom() {
  const repos = repositories();
  const generator = repos.generators.create({
    guildId: "guild",
    generatorChannelId: "gen",
    targetCategoryId: "cat",
    type: "PUBLIC",
    nameTemplate: "sala-{username}",
    defaultUserLimit: 10,
    maxUserLimit: 10,
    privacyMode: "PUBLIC",
  });
  repos.tempVoice.create({
    channelId: "room",
    guildId: "guild",
    generatorId: generator.id,
    ownerUserId: "owner",
    privacyMode: "PUBLIC",
    userLimit: 10,
    customName: "sala-owner",
  });
  const context: any = {
    client: {},
    repositories: {
      guildConfig: repos.guildConfig,
      generators: repos.generators,
      tempVoice: repos.tempVoice,
      audit: repos.audit,
    },
    services: {
      voiceLogs: { send: vi.fn() },
    },
  };
  context.services.voice = new VoiceService(context);
  repos.guildConfig.ensure("guild");
  return { repos, context, service: context.services.voice as VoiceService };
}

function bits(value: any): bigint {
  if (!value) return 0n;
  if (typeof value === "bigint") return value;
  if (Array.isArray(value)) return value.reduce((acc, item) => acc | bits(item), 0n);
  if ("bitfield" in value) return bits(value.bitfield);
  return BigInt(value);
}

function hasPermission(overwrites: any[], id: string, key: "allow" | "deny", permission: bigint): boolean {
  const overwrite = overwrites.find((entry) => entry.id === id);
  return (bits(overwrite?.[key]) & permission) === permission;
}

describe("voice runtime safety", () => {
  it("protege contra double create/delete con locks", async () => {
    const lock = new AsyncLock();
    let release!: () => void;
    const first = lock.run("room", () => new Promise<void>((resolve) => (release = resolve)));
    await expect(lock.run("room", async () => undefined)).rejects.toThrow("concurrente");
    release();
    await first;
  });

  it("aplica cooldowns contra spam", () => {
    let now = 1000;
    const cooldowns = new CooldownStore(() => now);
    expect(cooldowns.check("rename", 10)).toBe(true);
    expect(cooldowns.check("rename", 10)).toBe(false);
    now += 10_000;
    expect(cooldowns.check("rename", 10)).toBe(true);
  });

  it("channel not in DB no es administrable", () => {
    const { service } = contextWithRoom();
    expect(() =>
      service.assertRoomOwnerOrStaff(
        {
          id: "owner",
          guild: { id: "guild" },
          roles: { cache: new Map() },
        } as any,
        "not-room",
      ),
    ).toThrow("no pertenece");
  });

  it("protected room solo owner o staff autorizado", () => {
    const { service } = contextWithRoom();
    expect(() =>
      service.assertRoomOwnerOrStaff(
        {
          id: "intruder",
          guild: { id: "guild" },
          roles: { cache: new Map() },
        } as any,
        "room",
      ),
    ).toThrow("Solo el owner");
  });

  it("manual transfer actualiza owner persistente", () => {
    const { repos } = contextWithRoom();
    repos.tempVoice.updateOwner("room", "new-owner");
    expect(repos.tempVoice.get("room")?.owner_user_id).toBe("new-owner");
  });

  it("cancel delete when member returns restaura ACTIVE", () => {
    const { repos, service } = contextWithRoom();
    repos.tempVoice.markPending("room");
    service.cancelDelete("room");
    expect(repos.tempVoice.get("room")?.status).toBe("ACTIVE");
  });

  it("startup reconciliation limpia deleted Discord channel", async () => {
    const { repos, context } = contextWithRoom();
    context.client = { guilds: { fetch: vi.fn().mockResolvedValue({ channels: { fetch: vi.fn().mockResolvedValue(null) } }) } };
    const report = await reconcileTemporaryVoiceChannels(context, context.client);
    expect(report.orphanRecordsRemoved).toBe(1);
    expect(repos.tempVoice.get("room")?.status).toBe("DELETED");
  });

  it("startup reconciliation programa empty room on startup", async () => {
    const { context, service } = contextWithRoom();
    const schedule = vi.spyOn(service, "scheduleDelete").mockImplementation(() => undefined);
    context.client = {
      guilds: {
        fetch: vi.fn().mockResolvedValue({
          channels: { fetch: vi.fn().mockResolvedValue({ type: 2, members: { size: 0 } }) },
        }),
      },
    };
    const report = await reconcileTemporaryVoiceChannels(context, context.client);
    expect(report.emptyRoomsCleaned).toBe(1);
    expect(schedule).toHaveBeenCalled();
  });

  it("empty grace en cero borra inmediatamente sin timer", async () => {
    const { repos, service } = contextWithRoom();
    repos.guildConfig.setSettings("guild", { default_empty_grace_seconds: 0 });
    const deleteNow = vi.spyOn(service, "deleteIfStillEmpty").mockResolvedValue(undefined);
    service.scheduleDelete(repos.tempVoice.get("room")!);
    expect(deleteNow).toHaveBeenCalledWith("room");
    expect(repos.tempVoice.get("room")?.status).toBe("PENDING_DELETE");
  });

  it("si Discord falla al borrar sala vacia la DB vuelve a ACTIVE", async () => {
    const { repos, context, service } = contextWithRoom();
    repos.tempVoice.markPending("room");
    context.client = {
      guilds: {
        fetch: vi.fn().mockResolvedValue({
          channels: {
            fetch: vi.fn().mockResolvedValue({
              id: "room",
              type: ChannelType.GuildVoice,
              members: { size: 0 },
              delete: vi.fn().mockRejectedValue({ code: 50013 }),
            }),
          },
        }),
      },
    };

    await service.deleteIfStillEmpty("room");
    expect(repos.tempVoice.get("room")?.status).toBe("ACTIVE");
  });

  it("si Discord responde Unknown Channel al borrar sala vacia se limpia DB", async () => {
    const { repos, context, service } = contextWithRoom();
    repos.tempVoice.markPending("room");
    context.client = {
      guilds: {
        fetch: vi.fn().mockResolvedValue({
          channels: {
            fetch: vi.fn().mockResolvedValue({
              id: "room",
              type: ChannelType.GuildVoice,
              members: { size: 0 },
              delete: vi.fn().mockRejectedValue({ code: 10003 }),
            }),
          },
        }),
      },
    };

    await service.deleteIfStillEmpty("room");
    expect(repos.tempVoice.get("room")?.status).toBe("DELETED");
  });

  it("delete manual no marca DELETED si Discord rechaza el borrado", async () => {
    const { repos, service } = contextWithRoom();
    const actor: any = {
      id: "owner",
      guild: {
        id: "guild",
        channels: {
          fetch: vi.fn().mockResolvedValue({
            id: "room",
            delete: vi.fn().mockRejectedValue({ code: 50013 }),
          }),
        },
      },
      roles: { cache: new Map() },
    };

    await expect(service.deleteRoom(actor, "room")).rejects.toThrow("No pude eliminar");
    expect(repos.tempVoice.get("room")?.status).toBe("ACTIVE");
  });

  it("invalid custom_id no se procesa", async () => {
    await expect(handleVoiceButton({ customId: "other:id" } as any, {} as any)).resolves.toBe(false);
  });

  it("privacy allow block requieren ManageRoles para overwrites", () => {
    const { service } = contextWithRoom();
    expect(() =>
      service.assertCanEditOverwrites({
        guild: { members: { me: { id: "bot" } } },
        permissionsFor: () => ({ has: () => false }),
      } as any),
    ).toThrow("Gestionar roles");
  });

  it("panel failure no rompe si VoiceChannel no expone send", async () => {
    const { service } = contextWithRoom();
    const room = {
      channel_id: "room",
      guild_id: "guild",
      generator_id: 1,
      owner_user_id: "owner",
      control_message_id: null,
      created_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      privacy_mode: "PUBLIC",
      user_limit: 10,
      custom_name: "room",
      status: "ACTIVE",
    } satisfies TemporaryVoiceChannel;
    await expect(service.sendOrRefreshPanel({ id: "room" } as any, room, null)).resolves.toBeUndefined();
  });

  it("refresh permissions copia categoria y preserva estado Voice", async () => {
    const { repos, service } = contextWithRoom();
    repos.tempVoice.setPermission("room", "allowed", "ALLOW");
    repos.tempVoice.setPermission("room", "blocked", "BLOCK");
    repos.generators.addRole(1, "support");
    repos.guildConfig.setRole("guild", "support_role_id", "support");
    const set = vi.fn().mockResolvedValue(undefined);
    const roomChannel: any = {
      id: "room",
      type: ChannelType.GuildVoice,
      guild: { members: { me: { id: "bot" } } },
      permissionsFor: () => ({ has: () => true }),
      permissionOverwrites: { set },
    };
    const category: any = {
      id: "cat",
      type: ChannelType.GuildCategory,
      permissionOverwrites: {
        cache: new Map([
          ["guild", { id: "guild", type: 0, allow: [PermissionFlagsBits.SendMessages], deny: [PermissionFlagsBits.Connect] }],
          ["base-role", { id: "base-role", type: 0, allow: [PermissionFlagsBits.ViewChannel], deny: [] }],
        ]),
      },
    };
    const actor: any = {
      id: "admin",
      guild: {
        id: "guild",
        client: { user: { id: "bot" } },
        members: { me: { permissions: { bitfield: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.Connect | PermissionFlagsBits.ReadMessageHistory } }, fetch: vi.fn() },
        roles: { cache: new Map([["base-role", { id: "base-role" }]]) },
        channels: { fetch: vi.fn(async (id: string) => (id === "room" ? roomChannel : category)) },
      },
    };

    await service.refreshPermissions(actor, "room");
    const overwrites = set.mock.calls[0]![0];
    expect(hasPermission(overwrites, "guild", "allow", PermissionFlagsBits.SendMessages)).toBe(true);
    expect(hasPermission(overwrites, "guild", "deny", PermissionFlagsBits.Connect)).toBe(true);
    expect(hasPermission(overwrites, "owner", "allow", PermissionFlagsBits.ViewChannel)).toBe(true);
    expect(hasPermission(overwrites, "allowed", "allow", PermissionFlagsBits.Connect)).toBe(true);
    expect(hasPermission(overwrites, "blocked", "deny", PermissionFlagsBits.ViewChannel)).toBe(true);
    expect(hasPermission(overwrites, "support", "allow", PermissionFlagsBits.Connect)).toBe(true);
  });

  it("serializa categoria realista y omite allow que el bot no puede conceder en create", async () => {
    const { service } = contextWithRoom();
    const category: any = {
      id: "cat",
      permissionOverwrites: {
        cache: new Map([
          [
            "voice-role",
            {
              id: "voice-role",
              type: 0,
              allow: { bitfield: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageWebhooks },
              deny: { bitfield: 0n },
            },
          ],
          [
            "old-bot",
            {
              id: "old-bot",
              type: 1,
              allow: { bitfield: PermissionFlagsBits.Connect | PermissionFlagsBits.ManageWebhooks },
              deny: { bitfield: 0n },
            },
          ],
        ]),
      },
    };
    const guild: any = {
      id: "guild",
      roles: { cache: new Map([["voice-role", { id: "voice-role" }]]) },
      members: {
        me: { permissions: { bitfield: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect } },
        fetch: vi.fn().mockResolvedValue({ id: "old-bot" }),
      },
    };

    const overwrites = await (service as any).categoryOverwrites(guild, category);
    expect(overwrites).toEqual([
      { id: "voice-role", type: 0, allow: PermissionFlagsBits.ViewChannel, deny: 0n },
      { id: "old-bot", type: 1, allow: PermissionFlagsBits.Connect, deny: 0n },
    ]);
  });

  it("no copia permisos administrativos de categoria al payload de create", async () => {
    const { service } = contextWithRoom();
    const category: any = {
      id: "cat",
      permissionOverwrites: {
        cache: new Map([
          [
            "voice-role",
            {
              id: "voice-role",
              type: 0,
              allow: {
                bitfield:
                  PermissionFlagsBits.ViewChannel |
                  PermissionFlagsBits.Connect |
                  PermissionFlagsBits.ManageRoles |
                  PermissionFlagsBits.ManageChannels |
                  PermissionFlagsBits.MoveMembers,
              },
              deny: { bitfield: 0n },
            },
          ],
        ]),
      },
    };
    const guild: any = {
      id: "guild",
      roles: { cache: new Map([["voice-role", { id: "voice-role" }]]) },
      members: {
        me: {
          permissions: {
            bitfield:
              PermissionFlagsBits.ViewChannel |
              PermissionFlagsBits.Connect |
              PermissionFlagsBits.ManageRoles |
              PermissionFlagsBits.ManageChannels |
              PermissionFlagsBits.MoveMembers,
          },
        },
        fetch: vi.fn(),
      },
    };

    const overwrites = await (service as any).categoryOverwrites(guild, category);
    expect(overwrites[0]).toEqual({ id: "voice-role", type: 0, allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect, deny: 0n });
  });

  it("usa create sincronizado cuando la categoria tiene roles por encima del bot", () => {
    const { service } = contextWithRoom();
    const category: any = {
      id: "staff-cat",
      permissionOverwrites: {
        cache: new Map([
          ["guild", { id: "guild", type: 0 }],
          ["admin", { id: "admin", type: 0 }],
        ]),
      },
    };
    const guild: any = {
      id: "guild",
      members: { me: { roles: { highest: { position: 10 } } } },
      roles: {
        cache: new Map([
          ["admin", { id: "admin", name: "ADMIN", position: 50 }],
        ]),
      },
    };

    expect((service as any).hasUnmanageableRoleOverwrites(guild, category)).toBe(true);
  });

  it("omite overwrite de rol eliminado al copiar categoria", async () => {
    const { service } = contextWithRoom();
    const category: any = {
      id: "cat",
      permissionOverwrites: {
        cache: new Map([
          ["missing-role", { id: "missing-role", type: 0, allow: { bitfield: PermissionFlagsBits.ViewChannel }, deny: { bitfield: 0n } }],
          ["valid-role", { id: "valid-role", type: 0, allow: { bitfield: PermissionFlagsBits.Connect }, deny: { bitfield: 0n } }],
        ]),
      },
    };
    const guild: any = {
      id: "guild",
      roles: { cache: new Map([["valid-role", { id: "valid-role" }]]) },
      members: { me: { permissions: { bitfield: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect } }, fetch: vi.fn() },
    };

    const overwrites = await (service as any).categoryOverwrites(guild, category);
    expect(overwrites.map((overwrite: any) => overwrite.id)).toEqual(["valid-role"]);
  });

  it("libera lock despues de error en create", async () => {
    const lock = new AsyncLock();
    await expect(lock.run("create:guild:user:1", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(lock.run("create:guild:user:1", async () => "ok")).resolves.toBe("ok");
  });

  it("refresh permissions falla de forma controlada si falta categoria", async () => {
    const { service } = contextWithRoom();
    const roomChannel: any = {
      id: "room",
      type: ChannelType.GuildVoice,
      guild: { members: { me: { id: "bot" } } },
      permissionsFor: () => ({ has: () => true }),
      permissionOverwrites: { set: vi.fn() },
    };
    const actor: any = {
      id: "admin",
      guild: {
        id: "guild",
        client: { user: { id: "bot" } },
        channels: { fetch: vi.fn(async (id: string) => (id === "room" ? roomChannel : null)) },
      },
    };
    await expect(service.refreshPermissions(actor, "room")).rejects.toThrow("categoria destino");
  });

  it("delete button difiere respuesta antes de borrar canal", async () => {
    const deleteRoom = vi.fn().mockResolvedValue(undefined);
    const context: any = { services: { voice: { assertRoomOwnerOrStaff: vi.fn(), deleteRoom } } };
    const interaction: any = {
      customId: "voice:delete:room",
      inCachedGuild: () => true,
      member: { id: "owner" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
    };
    await expect(handleVoiceButton(interaction, context)).resolves.toBe(true);
    expect(interaction.deferReply.mock.invocationCallOrder[0]!).toBeLessThan(deleteRoom.mock.invocationCallOrder[0]!);
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it("delete button no falla si Discord borro el mensaje original", async () => {
    const deleteRoom = vi.fn().mockResolvedValue(undefined);
    const context: any = { services: { voice: { deleteRoom } } };
    const interaction: any = {
      customId: "voice:delete:room",
      inCachedGuild: () => true,
      member: { id: "owner" },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockRejectedValue({ code: 10008 }),
    };
    await expect(handleVoiceButton(interaction, context)).resolves.toBe(true);
  });
});
