import type DatabaseDriver from "better-sqlite3";
import { env } from "../config/env.js";
import { nowIso } from "../utils/time.js";

export type StatusMessageMode = "edit" | "post";

export interface SystemStatusConfig {
  guild_id: string;
  channel_id: string | null;
  message_id: string | null;
  enabled: number;
  interval_seconds: number;
  mode: StatusMessageMode;
  warn_cpu_pct: number;
  warn_ram_pct: number;
  warn_disk_pct: number;
  created_at: string;
  updated_at: string;
}

export class SystemStatusRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  ensure(guildId: string): SystemStatusConfig {
    const existing = this.get(guildId);
    if (existing) return existing;
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO system_status_config
         (guild_id, interval_seconds, warn_cpu_pct, warn_ram_pct, warn_disk_pct, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        guildId,
        env.STATUS_DEFAULT_INTERVAL_SECONDS,
        env.STATUS_PUBLIC_CPU_WARN,
        env.STATUS_PUBLIC_RAM_WARN,
        env.STATUS_PUBLIC_DISK_WARN,
        now,
        now,
      );
    return this.get(guildId)!;
  }

  get(guildId: string): SystemStatusConfig | null {
    return (
      (this.db.prepare("SELECT * FROM system_status_config WHERE guild_id = ?").get(guildId) as
        | SystemStatusConfig
        | undefined) ?? null
    );
  }

  allEnabled(): SystemStatusConfig[] {
    return this.db.prepare("SELECT * FROM system_status_config WHERE enabled = 1 AND channel_id IS NOT NULL").all() as SystemStatusConfig[];
  }

  setChannel(guildId: string, channelId: string | null): SystemStatusConfig {
    this.ensure(guildId);
    this.db
      .prepare("UPDATE system_status_config SET channel_id = ?, message_id = NULL, updated_at = ? WHERE guild_id = ?")
      .run(channelId, nowIso(), guildId);
    return this.get(guildId)!;
  }

  setLoop(guildId: string, enabled: boolean, intervalSeconds?: number, mode?: StatusMessageMode): SystemStatusConfig {
    this.ensure(guildId);
    const current = this.get(guildId)!;
    this.db
      .prepare(
        `UPDATE system_status_config
         SET enabled = ?, interval_seconds = ?, mode = ?, updated_at = ?
         WHERE guild_id = ?`,
      )
      .run(
        enabled ? 1 : 0,
        intervalSeconds ?? current.interval_seconds,
        mode ?? current.mode,
        nowIso(),
        guildId,
      );
    return this.get(guildId)!;
  }

  setThresholds(
    guildId: string,
    thresholds: Partial<Pick<SystemStatusConfig, "warn_cpu_pct" | "warn_ram_pct" | "warn_disk_pct">>,
  ): SystemStatusConfig {
    this.ensure(guildId);
    const current = this.get(guildId)!;
    this.db
      .prepare(
        `UPDATE system_status_config
         SET warn_cpu_pct = ?, warn_ram_pct = ?, warn_disk_pct = ?, updated_at = ?
         WHERE guild_id = ?`,
      )
      .run(
        thresholds.warn_cpu_pct ?? current.warn_cpu_pct,
        thresholds.warn_ram_pct ?? current.warn_ram_pct,
        thresholds.warn_disk_pct ?? current.warn_disk_pct,
        nowIso(),
        guildId,
      );
    return this.get(guildId)!;
  }

  setMessageId(guildId: string, messageId: string | null): void {
    this.ensure(guildId);
    this.db
      .prepare("UPDATE system_status_config SET message_id = ?, updated_at = ? WHERE guild_id = ?")
      .run(messageId, nowIso(), guildId);
  }
}
