import DatabaseDriver from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrations } from "../src/database/migrations.js";
import { AuditEventRepository } from "../src/repositories/auditEventRepository.js";
import { GuildConfigRepository } from "../src/repositories/guildConfigRepository.js";
import { SystemStatusRepository } from "../src/repositories/systemStatusRepository.js";

function memoryDb() {
  const db = new DatabaseDriver(":memory:");
  db.exec("CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);");
  for (const migration of migrations) db.exec(migration.sql);
  return db;
}

describe("repositories", () => {
  it("persists status channel and loop config", () => {
    const db = memoryDb();
    const guilds = new GuildConfigRepository(db);
    const statuses = new SystemStatusRepository(db);
    guilds.ensure("guild-1");
    statuses.setChannel("guild-1", "123456789012345678");
    statuses.setLoop("guild-1", true, 600, "edit");
    const config = statuses.get("guild-1");
    expect(config?.channel_id).toBe("123456789012345678");
    expect(config?.enabled).toBe(1);
    expect(config?.interval_seconds).toBe(600);
    db.close();
  });

  it("updates status thresholds without replacing omitted values", () => {
    const db = memoryDb();
    const guilds = new GuildConfigRepository(db);
    const statuses = new SystemStatusRepository(db);
    guilds.ensure("guild-1");
    statuses.ensure("guild-1");
    const config = statuses.setThresholds("guild-1", { warn_cpu_pct: 75, warn_disk_pct: 80 });
    expect(config.warn_cpu_pct).toBe(75);
    expect(config.warn_ram_pct).toBe(85);
    expect(config.warn_disk_pct).toBe(80);
    db.close();
  });

  it("records audit events as json details", () => {
    const db = memoryDb();
    const auditEvents = new AuditEventRepository(db);
    auditEvents.create({
      guildId: "guild-1",
      eventType: "config_changed",
      summary: "Config changed",
      details: { actor_id: "user-1", field: "status_channel" },
    });
    const row = db.prepare("SELECT * FROM audit_events WHERE guild_id = ?").get("guild-1") as {
      event_type: string;
      summary: string;
      details_json: string;
    };
    expect(row.event_type).toBe("config_changed");
    expect(row.summary).toBe("Config changed");
    expect(JSON.parse(row.details_json)).toEqual({ actor_id: "user-1", field: "status_channel" });
    db.close();
  });
});
