import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";

export type GeneratorType = "PUBLIC" | "SUPPORT" | "STAFF";
export type PrivacyMode = "PUBLIC" | "LOCKED" | "PRIVATE";

export type VoiceGenerator = {
  id: number;
  guild_id: string;
  generator_channel_id: string;
  target_category_id: string;
  type: GeneratorType;
  name_template: string;
  default_user_limit: number;
  max_user_limit: number;
  privacy_mode: PrivacyMode;
  bitrate_override: number | null;
  support_alert_channel_id: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};

export type VoiceGeneratorInput = {
  guildId: string;
  generatorChannelId: string;
  targetCategoryId: string;
  type: GeneratorType;
  nameTemplate: string;
  defaultUserLimit: number;
  maxUserLimit: number;
  privacyMode: PrivacyMode;
  bitrateOverride?: number | null;
  supportAlertChannelId?: string | null;
};

export class VoiceGeneratorRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  create(input: VoiceGeneratorInput): VoiceGenerator {
    const now = nowIso();
    const info = this.db
      .prepare(
        `INSERT INTO voice_generators (
          guild_id, generator_channel_id, target_category_id, type, name_template,
          default_user_limit, max_user_limit, privacy_mode, bitrate_override,
          support_alert_channel_id, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        input.guildId,
        input.generatorChannelId,
        input.targetCategoryId,
        input.type,
        input.nameTemplate,
        input.defaultUserLimit,
        input.maxUserLimit,
        input.privacyMode,
        input.bitrateOverride ?? null,
        input.supportAlertChannelId ?? null,
        now,
        now,
      );
    return this.getById(Number(info.lastInsertRowid))!;
  }

  update(id: number, input: Partial<Omit<VoiceGeneratorInput, "guildId">>): VoiceGenerator | null {
    const current = this.getById(id);
    if (!current) return null;
    const next = {
      generatorChannelId: input.generatorChannelId ?? current.generator_channel_id,
      targetCategoryId: input.targetCategoryId ?? current.target_category_id,
      type: input.type ?? current.type,
      nameTemplate: input.nameTemplate ?? current.name_template,
      defaultUserLimit: input.defaultUserLimit ?? current.default_user_limit,
      maxUserLimit: input.maxUserLimit ?? current.max_user_limit,
      privacyMode: input.privacyMode ?? current.privacy_mode,
      bitrateOverride: input.bitrateOverride === undefined ? current.bitrate_override : input.bitrateOverride,
      supportAlertChannelId: input.supportAlertChannelId === undefined ? current.support_alert_channel_id : input.supportAlertChannelId,
    };
    this.db
      .prepare(
        `UPDATE voice_generators SET
          generator_channel_id = ?, target_category_id = ?, type = ?, name_template = ?,
          default_user_limit = ?, max_user_limit = ?, privacy_mode = ?, bitrate_override = ?,
          support_alert_channel_id = ?, updated_at = ?
        WHERE id = ?`,
      )
      .run(
        next.generatorChannelId,
        next.targetCategoryId,
        next.type,
        next.nameTemplate,
        next.defaultUserLimit,
        next.maxUserLimit,
        next.privacyMode,
        next.bitrateOverride,
        next.supportAlertChannelId,
        nowIso(),
        id,
      );
    return this.getById(id);
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM voice_generators WHERE id = ?").run(id).changes > 0;
  }

  setEnabled(id: number, enabled: boolean): boolean {
    return this.db
      .prepare("UPDATE voice_generators SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, nowIso(), id).changes > 0;
  }

  getById(id: number): VoiceGenerator | null {
    return (this.db.prepare("SELECT * FROM voice_generators WHERE id = ?").get(id) as VoiceGenerator | undefined) ?? null;
  }

  getByChannel(guildId: string, channelId: string): VoiceGenerator | null {
    return (
      (this.db
        .prepare("SELECT * FROM voice_generators WHERE guild_id = ? AND generator_channel_id = ?")
        .get(guildId, channelId) as VoiceGenerator | undefined) ?? null
    );
  }

  list(guildId: string): VoiceGenerator[] {
    return this.db
      .prepare("SELECT * FROM voice_generators WHERE guild_id = ? ORDER BY id")
      .all(guildId) as VoiceGenerator[];
  }

  addRole(generatorId: number, roleId: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO voice_generator_roles (generator_id, role_id, created_at) VALUES (?, ?, ?)")
      .run(generatorId, roleId, nowIso());
  }

  removeRole(generatorId: number, roleId: string): void {
    this.db.prepare("DELETE FROM voice_generator_roles WHERE generator_id = ? AND role_id = ?").run(generatorId, roleId);
  }

  roles(generatorId: number): string[] {
    return this.db
      .prepare("SELECT role_id FROM voice_generator_roles WHERE generator_id = ? ORDER BY role_id")
      .all(generatorId)
      .map((row: any) => String(row.role_id));
  }
}
