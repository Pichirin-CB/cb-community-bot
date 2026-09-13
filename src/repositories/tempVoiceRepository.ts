import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";
import type { PrivacyMode } from "./voiceGeneratorRepository.js";

export type TemporaryVoiceStatus = "ACTIVE" | "PENDING_DELETE" | "DELETED";

export type TemporaryVoiceChannel = {
  channel_id: string;
  guild_id: string;
  generator_id: number;
  owner_user_id: string;
  control_message_id: string | null;
  created_at: string;
  last_active_at: string;
  privacy_mode: PrivacyMode;
  user_limit: number;
  custom_name: string | null;
  status: TemporaryVoiceStatus;
};

export class TempVoiceRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  create(input: {
    channelId: string;
    guildId: string;
    generatorId: number;
    ownerUserId: string;
    privacyMode: PrivacyMode;
    userLimit: number;
    customName: string;
  }): TemporaryVoiceChannel {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO temporary_voice_channels (
          channel_id, guild_id, generator_id, owner_user_id, created_at, last_active_at,
          privacy_mode, user_limit, custom_name, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      )
      .run(
        input.channelId,
        input.guildId,
        input.generatorId,
        input.ownerUserId,
        now,
        now,
        input.privacyMode,
        input.userLimit,
        input.customName,
      );
    return this.get(input.channelId)!;
  }

  get(channelId: string): TemporaryVoiceChannel | null {
    return (
      (this.db.prepare("SELECT * FROM temporary_voice_channels WHERE channel_id = ?").get(channelId) as
        | TemporaryVoiceChannel
        | undefined) ?? null
    );
  }

  getActiveByOwner(guildId: string, ownerUserId: string, generatorId?: number): TemporaryVoiceChannel | null {
    const sql =
      generatorId === undefined
        ? "SELECT * FROM temporary_voice_channels WHERE guild_id = ? AND owner_user_id = ? AND status = 'ACTIVE' ORDER BY created_at LIMIT 1"
        : "SELECT * FROM temporary_voice_channels WHERE guild_id = ? AND owner_user_id = ? AND generator_id = ? AND status = 'ACTIVE' ORDER BY created_at LIMIT 1";
    const args = generatorId === undefined ? [guildId, ownerUserId] : [guildId, ownerUserId, generatorId];
    return (this.db.prepare(sql).get(...args) as TemporaryVoiceChannel | undefined) ?? null;
  }

  listActive(guildId?: string): TemporaryVoiceChannel[] {
    const sql = guildId
      ? "SELECT * FROM temporary_voice_channels WHERE guild_id = ? AND status = 'ACTIVE' ORDER BY created_at"
      : "SELECT * FROM temporary_voice_channels WHERE status = 'ACTIVE' ORDER BY created_at";
    return (guildId ? this.db.prepare(sql).all(guildId) : this.db.prepare(sql).all()) as TemporaryVoiceChannel[];
  }

  countActive(guildId: string): number {
    return Number(
      (this.db.prepare("SELECT COUNT(*) count FROM temporary_voice_channels WHERE guild_id = ? AND status = 'ACTIVE'").get(guildId) as any)
        .count,
    );
  }

  setControlMessage(channelId: string, messageId: string | null): void {
    this.db
      .prepare("UPDATE temporary_voice_channels SET control_message_id = ?, last_active_at = ? WHERE channel_id = ?")
      .run(messageId, nowIso(), channelId);
  }

  updateOwner(channelId: string, ownerUserId: string): void {
    this.db
      .prepare("UPDATE temporary_voice_channels SET owner_user_id = ?, last_active_at = ? WHERE channel_id = ?")
      .run(ownerUserId, nowIso(), channelId);
  }

  updateRoom(channelId: string, input: { privacyMode?: PrivacyMode; userLimit?: number; customName?: string | null }): void {
    const current = this.get(channelId);
    if (!current) return;
    this.db
      .prepare(
        `UPDATE temporary_voice_channels
         SET privacy_mode = ?, user_limit = ?, custom_name = ?, last_active_at = ?
         WHERE channel_id = ?`,
      )
      .run(
        input.privacyMode ?? current.privacy_mode,
        input.userLimit ?? current.user_limit,
        input.customName === undefined ? current.custom_name : input.customName,
        nowIso(),
        channelId,
      );
  }

  markPending(channelId: string): boolean {
    return this.db
      .prepare("UPDATE temporary_voice_channels SET status = 'PENDING_DELETE', last_active_at = ? WHERE channel_id = ? AND status = 'ACTIVE'")
      .run(nowIso(), channelId).changes > 0;
  }

  markActive(channelId: string): void {
    this.db
      .prepare("UPDATE temporary_voice_channels SET status = 'ACTIVE', last_active_at = ? WHERE channel_id = ? AND status = 'PENDING_DELETE'")
      .run(nowIso(), channelId);
  }

  markDeleted(channelId: string): void {
    this.db
      .prepare("UPDATE temporary_voice_channels SET status = 'DELETED', last_active_at = ? WHERE channel_id = ?")
      .run(nowIso(), channelId);
  }

  deleteRecord(channelId: string): void {
    this.db.prepare("DELETE FROM temporary_voice_channels WHERE channel_id = ?").run(channelId);
  }

  setPermission(channelId: string, userId: string, permissionType: "ALLOW" | "BLOCK"): void {
    this.db
      .prepare(
        `INSERT INTO temporary_voice_permissions (channel_id, user_id, permission_type, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(channel_id, user_id) DO UPDATE SET permission_type = excluded.permission_type, created_at = excluded.created_at`,
      )
      .run(channelId, userId, permissionType, nowIso());
  }

  removePermission(channelId: string, userId: string): void {
    this.db.prepare("DELETE FROM temporary_voice_permissions WHERE channel_id = ? AND user_id = ?").run(channelId, userId);
  }

  permissions(channelId: string): { user_id: string; permission_type: "ALLOW" | "BLOCK"; created_at: string }[] {
    return this.db
      .prepare("SELECT user_id, permission_type, created_at FROM temporary_voice_permissions WHERE channel_id = ?")
      .all(channelId) as { user_id: string; permission_type: "ALLOW" | "BLOCK"; created_at: string }[];
  }
}
