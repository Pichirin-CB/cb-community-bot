import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";

export interface WarningRow {
  id: number;
  guild_id: string;
  case_id: string;
  target_user_id: string;
  moderator_user_id: string;
  reason: string;
  active: number;
  created_at: string;
  removed_by_user_id: string | null;
  removed_at: string | null;
  removal_reason: string | null;
}

export class WarningRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  create(guildId: string, caseId: string, targetUserId: string, moderatorUserId: string, reason: string): void {
    this.db
      .prepare(
        `INSERT INTO warnings
         (guild_id, case_id, target_user_id, moderator_user_id, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(guildId, caseId, targetUserId, moderatorUserId, reason, nowIso());
  }

  listActive(guildId: string, targetUserId: string): WarningRow[] {
    return this.db
      .prepare(
        `SELECT * FROM warnings
         WHERE guild_id = ? AND target_user_id = ? AND active = 1
         ORDER BY created_at DESC`,
      )
      .all(guildId, targetUserId) as WarningRow[];
  }

  remove(guildId: string, warningId: number, moderatorUserId: string, reason: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE warnings
         SET active = 0, removed_by_user_id = ?, removed_at = ?, removal_reason = ?
         WHERE guild_id = ? AND id = ? AND active = 1`,
      )
      .run(moderatorUserId, nowIso(), reason, guildId, warningId);
    return result.changes === 1;
  }
}
