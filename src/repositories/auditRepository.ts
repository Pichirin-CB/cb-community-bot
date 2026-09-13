import type DatabaseDriver from "better-sqlite3";
import { nowIso, todayIsoDate } from "../utils/time.js";

export type VoiceAuditEventType =
  | "VOICE_CHANNEL_CREATED"
  | "VOICE_CHANNEL_DELETED"
  | "VOICE_OWNER_TRANSFERRED"
  | "VOICE_OWNER_AUTO_TRANSFERRED"
  | "VOICE_CHANNEL_RENAMED"
  | "VOICE_LIMIT_CHANGED"
  | "VOICE_PRIVACY_CHANGED"
  | "VOICE_PERMISSION_BASE_COPIED"
  | "VOICE_PERMISSION_REFRESHED"
  | "VOICE_PERMISSION_REFRESH_FAILED"
  | "VOICE_USER_ALLOWED"
  | "VOICE_USER_BLOCKED"
  | "VOICE_USER_UNBLOCKED"
  | "VOICE_USER_REMOVED"
  | "VOICE_GENERATOR_CREATED"
  | "VOICE_GENERATOR_UPDATED"
  | "VOICE_GENERATOR_DELETED"
  | "VOICE_RECONCILIATION_STARTED"
  | "VOICE_RECONCILIATION_COMPLETED"
  | "VOICE_ERROR";

export class AuditRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  record(input: {
    guildId: string;
    eventType: VoiceAuditEventType;
    channelId?: string | null;
    actorUserId?: string | null;
    targetUserId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO voice_audit_events (
          guild_id, event_type, channel_id, actor_user_id, target_user_id, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.guildId,
        input.eventType,
        input.channelId ?? null,
        input.actorUserId ?? null,
        input.targetUserId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        nowIso(),
      );
  }

  countToday(guildId: string, eventType: VoiceAuditEventType): number {
    return Number(
      (this.db
        .prepare("SELECT COUNT(*) count FROM voice_audit_events WHERE guild_id = ? AND event_type = ? AND created_at >= ?")
        .get(guildId, eventType, `${todayIsoDate()}T00:00:00.000Z`) as any).count,
    );
  }
}
