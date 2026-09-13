import { describe, expect, it } from "vitest";
import { repositories } from "./voiceHelpers.js";

describe("voice repositories", () => {
  it("crea configuracion por guild de forma independiente", () => {
    const { guildConfig } = repositories();
    const config = guildConfig.ensure("guild");
    expect(config.guild_id).toBe("guild");
    expect(config.default_empty_grace_seconds).toBe(0);
    expect(config.one_room_per_user).toBe(1);
  });

  it("guarda generator config con roles relacionales", () => {
    const { generators } = repositories();
    const created = generators.create({
      guildId: "guild",
      generatorChannelId: "gen",
      targetCategoryId: "cat",
      type: "STAFF",
      nameTemplate: "staff-{username}",
      defaultUserLimit: 5,
      maxUserLimit: 10,
      privacyMode: "PRIVATE",
    });
    generators.addRole(created.id, "staff-role");
    expect(generators.getByChannel("guild", "gen")?.type).toBe("STAFF");
    expect(generators.roles(created.id)).toEqual(["staff-role"]);
  });

  it("controla una sala activa por owner y generador", () => {
    const { generators, tempVoice } = repositories();
    const created = generators.create({
      guildId: "guild",
      generatorChannelId: "gen",
      targetCategoryId: "cat",
      type: "PUBLIC",
      nameTemplate: "sala-{username}",
      defaultUserLimit: 10,
      maxUserLimit: 10,
      privacyMode: "PUBLIC",
    });
    tempVoice.create({
      channelId: "room",
      guildId: "guild",
      generatorId: created.id,
      ownerUserId: "owner",
      privacyMode: "PUBLIC",
      userLimit: 10,
      customName: "sala-owner",
    });
    expect(tempVoice.getActiveByOwner("guild", "owner", created.id)?.channel_id).toBe("room");
  });

  it("persistencia allow block unblock", () => {
    const { generators, tempVoice } = repositories();
    const created = generators.create({
      guildId: "guild",
      generatorChannelId: "gen",
      targetCategoryId: "cat",
      type: "PUBLIC",
      nameTemplate: "sala-{username}",
      defaultUserLimit: 10,
      maxUserLimit: 10,
      privacyMode: "PUBLIC",
    });
    tempVoice.create({
      channelId: "room",
      guildId: "guild",
      generatorId: created.id,
      ownerUserId: "owner",
      privacyMode: "PUBLIC",
      userLimit: 10,
      customName: "sala-owner",
    });
    tempVoice.setPermission("room", "target", "ALLOW");
    tempVoice.setPermission("room", "target", "BLOCK");
    expect(tempVoice.permissions("room")[0]?.permission_type).toBe("BLOCK");
    tempVoice.removePermission("room", "target");
    expect(tempVoice.permissions("room")).toHaveLength(0);
  });

  it("marca registros huerfanos como eliminados", () => {
    const { generators, tempVoice } = repositories();
    const created = generators.create({
      guildId: "guild",
      generatorChannelId: "gen",
      targetCategoryId: "cat",
      type: "PUBLIC",
      nameTemplate: "sala-{username}",
      defaultUserLimit: 10,
      maxUserLimit: 10,
      privacyMode: "PUBLIC",
    });
    tempVoice.create({
      channelId: "room",
      guildId: "guild",
      generatorId: created.id,
      ownerUserId: "owner",
      privacyMode: "PUBLIC",
      userLimit: 10,
      customName: "sala-owner",
    });
    tempVoice.markDeleted("room");
    expect(tempVoice.listActive("guild")).toHaveLength(0);
  });
});
