import { describe, expect, it } from "vitest";
import DatabaseDriver from "better-sqlite3";
import { migrations } from "../src/database/migrations.js";
import { CaseRepository } from "../src/repositories/caseRepository.js";
import { GuildConfigRepository } from "../src/repositories/guildConfigRepository.js";
import { WarningRepository } from "../src/repositories/warningRepository.js";

function memoryDb() {
  const db = new DatabaseDriver(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) {
    db.exec(migration.sql);
  }
  return db;
}

describe("repositorios", () => {
  it("crea configuracion por guild de forma idempotente", () => {
    const repo = new GuildConfigRepository(memoryDb());
    const first = repo.ensure("guild");
    const second = repo.ensure("guild");
    expect(first.guild_id).toBe("guild");
    expect(second.guild_id).toBe("guild");
  });

  it("crea casos y warnings asociados", () => {
    const db = memoryDb();
    const cases = new CaseRepository(db);
    const warnings = new WarningRepository(db);
    const created = cases.create({
      guildId: "g",
      targetUserId: "u",
      moderatorUserId: "m",
      actionType: "warn",
      reason: "Spam",
    });
    warnings.create("g", created.case_id, "u", "m", "Spam");
    expect(created.case_id).toBe("CB-000001");
    expect(warnings.listActive("g", "u")).toHaveLength(1);
    expect(warnings.remove("g", 1, "m2", "Resuelto")).toBe(true);
    expect(warnings.listActive("g", "u")).toHaveLength(0);
  });
});
