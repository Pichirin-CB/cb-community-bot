import DatabaseDriver from "better-sqlite3";
import { Collection } from "discord.js";
import { migrations } from "../src/database/migrations.js";
import { GuildConfigRepository } from "../src/repositories/guildConfigRepository.js";
import { VoiceGeneratorRepository, type VoiceGenerator } from "../src/repositories/voiceGeneratorRepository.js";
import { TempVoiceRepository } from "../src/repositories/tempVoiceRepository.js";
import { AuditRepository } from "../src/repositories/auditRepository.js";

export function testDb(): DatabaseDriver.Database {
  const db = new DatabaseDriver(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);");
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

export function repositories(db = testDb()) {
  return {
    db,
    guildConfig: new GuildConfigRepository(db),
    generators: new VoiceGeneratorRepository(db),
    tempVoice: new TempVoiceRepository(db),
    audit: new AuditRepository(db),
  };
}

export function generator(overrides: Partial<VoiceGenerator> = {}): VoiceGenerator {
  return {
    id: 1,
    guild_id: "guild",
    generator_channel_id: "generator",
    target_category_id: "category",
    type: "PUBLIC",
    name_template: "sala-{username}",
    default_user_limit: 10,
    max_user_limit: 10,
    privacy_mode: "PUBLIC",
    bitrate_override: null,
    support_alert_channel_id: null,
    enabled: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function fakeMember(roleIds: string[], id = "user", guildOwnerId = "owner") {
  const cache = new Collection<string, { id: string }>();
  for (const roleId of roleIds) cache.set(roleId, { id: roleId });
  return {
    id,
    user: { id, username: id, bot: false },
    displayName: id,
    guild: { id: "guild", ownerId: guildOwnerId },
    roles: { cache },
  } as any;
}
