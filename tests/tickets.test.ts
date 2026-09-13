import DatabaseDriver from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrations } from "../src/database/migrations.js";
import { TicketRepository } from "../src/repositories/ticketRepository.js";

function memoryDb() {
  const db = new DatabaseDriver(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) {
    db.exec(migration.sql);
  }
  return db;
}

describe("tickets repository", () => {
  it("crea tickets y bloquea duplicados abiertos de la misma categoria", () => {
    const repo = new TicketRepository(memoryDb());
    const first = repo.create("guild", "channel-1", "user", "bug");
    expect(first.ticket_code).toBe("TICKET-00001");
    expect(repo.getOpenByOwnerAndCategory("guild", "user", "bug")?.channel_id).toBe("channel-1");
    expect(() => repo.create("guild", "channel-2", "user", "bug")).toThrow();
  });

  it("permite tickets distintos del mismo usuario", () => {
    const repo = new TicketRepository(memoryDb());
    repo.create("guild", "channel-1", "user", "bug");
    repo.create("guild", "channel-2", "user", "members");
    expect(repo.getOpenByOwnerAndCategory("guild", "user", "members")?.channel_id).toBe("channel-2");
  });

  it("guarda claim y evita doble claim", () => {
    const repo = new TicketRepository(memoryDb());
    repo.create("guild", "channel-1", "user", "bug");
    expect(repo.claim("channel-1", "staff-1")).toBe(true);
    expect(repo.claim("channel-1", "staff-2")).toBe(false);
    const row = repo.getByChannel("channel-1")!;
    expect(row.claimed_by_user_id).toBe("staff-1");
    expect(row.claimed_at).toBeTruthy();
  });

  it("cierra, reabre y permite recrear la misma categoria", () => {
    const repo = new TicketRepository(memoryDb());
    repo.create("guild", "channel-1", "user", "bug");
    expect(repo.close("channel-1", "staff", "resuelto")).toBe(true);
    expect(repo.getOpenByOwnerAndCategory("guild", "user", "bug")).toBeNull();
    repo.create("guild", "channel-2", "user", "bug");
    expect(repo.close("channel-2", "staff", "resuelto")).toBe(true);
    expect(repo.reopen("channel-2")).toBe(true);
    expect(repo.getOpenByOwnerAndCategory("guild", "user", "bug")?.channel_id).toBe("channel-2");
  });

  it("marca tickets eliminados antes de borrar el canal", () => {
    const repo = new TicketRepository(memoryDb());
    repo.create("guild", "channel-1", "user", "bug");
    expect(repo.markDeleted("channel-1", "staff")).toBe(true);
    const row = repo.getByChannel("channel-1")!;
    expect(row.status).toBe("deleted");
    expect(row.deleted_by_user_id).toBe("staff");
    expect(row.deleted_at).toBeTruthy();
  });
});
