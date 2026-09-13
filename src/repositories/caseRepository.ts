import type DatabaseDriver from "better-sqlite3";
import { formatCaseId } from "../modules/cases/caseIds.js";
import { nowIso } from "../utils/time.js";

export interface ModerationCaseInput {
  guildId: string;
  targetUserId: string;
  moderatorUserId: string;
  actionType: string;
  reason: string;
  durationMs?: number | null;
  expiresAt?: string | null;
  evidence?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ModerationCase {
  case_id: string;
  guild_id: string;
  target_user_id: string;
  moderator_user_id: string;
  action_type: string;
  reason: string;
  duration_ms: number | null;
  created_at: string;
  expires_at: string | null;
  status: string;
  evidence: string | null;
  metadata_json: string;
}

export class CaseRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  create(input: ModerationCaseInput): ModerationCase {
    const createCase = this.db.transaction(() => {
      const nextId = Number(
        (this.db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM moderation_cases").get() as any)
          .next_id,
      );
      const caseId = formatCaseId(nextId);
      this.db
        .prepare(
          `INSERT INTO moderation_cases (
            case_id, guild_id, target_user_id, moderator_user_id, action_type, reason,
            duration_ms, created_at, expires_at, evidence, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          caseId,
          input.guildId,
          input.targetUserId,
          input.moderatorUserId,
          input.actionType,
          input.reason,
          input.durationMs ?? null,
          nowIso(),
          input.expiresAt ?? null,
          input.evidence ?? null,
          JSON.stringify(input.metadata ?? {}),
        );
      return this.get(caseId)!;
    });

    return createCase();
  }

  get(caseId: string): ModerationCase | null {
    return (
      (this.db.prepare("SELECT * FROM moderation_cases WHERE case_id = ?").get(caseId) as
        | ModerationCase
        | undefined) ?? null
    );
  }

  listForUser(guildId: string, userId: string, limit = 10): ModerationCase[] {
    return this.db
      .prepare(
        `SELECT * FROM moderation_cases
         WHERE guild_id = ? AND target_user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(guildId, userId, limit) as ModerationCase[];
  }
}
