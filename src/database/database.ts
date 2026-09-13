import DatabaseDriver from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { migrations } from "./migrations.js";
import { logger } from "../logger.js";

export class Database {
  private readonly db: DatabaseDriver.Database;

  constructor(private readonly databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseDriver(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = new Set(
      this.db.prepare("SELECT id FROM schema_migrations").all().map((row: any) => Number(row.id)),
    );

    const apply = this.db.transaction(() => {
      for (const migration of migrations) {
        if (applied.has(migration.id)) continue;
        this.db.exec(migration.sql);
        this.db
          .prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)")
          .run(migration.id, migration.name, new Date().toISOString());
        logger.info({ migration: migration.name }, "Migracion aplicada");
      }
    });

    apply();
  }

  connection(): DatabaseDriver.Database {
    return this.db;
  }

  health(): { ok: boolean; path: string } {
    this.db.prepare("SELECT 1").get();
    return { ok: true, path: this.databasePath };
  }

  close(): void {
    this.db.close();
  }
}
