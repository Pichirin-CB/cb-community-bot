import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";

export class AuditEventRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  create(input: {
    guildId: string;
    actorUserId?: string | null;
    targetUserId?: string | null;
    eventType: string;
    summary: string;
    details?: Record<string, unknown>;
  }): void {
    this.db
      .prepare(
        `INSERT INTO audit_events
         (guild_id, actor_user_id, target_user_id, event_type, summary, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.guildId,
        input.actorUserId ?? null,
        input.targetUserId ?? null,
        input.eventType,
        input.summary,
        JSON.stringify(input.details ?? {}),
        nowIso(),
      );
  }
}
