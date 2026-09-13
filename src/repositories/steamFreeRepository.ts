import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";

export interface SteamFreeConfig {
  guild_id: string;
  channel_id: string | null;
  enabled: number;
  check_interval_minutes: number;
  free_to_keep_enabled: number;
  free_weekend_enabled: number;
  dlc_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface SteamFreePromotion {
  id: number;
  guild_id: string;
  app_id: number;
  title: string;
  original_price: string | null;
  currency: string | null;
  promotion_key: string;
  started_at: string | null;
  expires_at: string | null;
  steam_url: string;
  image_url: string | null;
  message_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface CreateSteamFreePromotionInput {
  guildId: string;
  appId: number;
  title: string;
  originalPrice?: string | null;
  currency?: string | null;
  promotionKey: string;
  startedAt?: string | null;
  expiresAt?: string | null;
  steamUrl: string;
  imageUrl?: string | null;
}

export class SteamFreeRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  ensure(guildId: string): SteamFreeConfig {
    const existing = this.get(guildId);
    if (existing) return existing;

    const now = nowIso();

    this.db
      .prepare(
        `INSERT INTO steam_free_config
         (
           guild_id,
           enabled,
           check_interval_minutes,
           free_to_keep_enabled,
           free_weekend_enabled,
           dlc_enabled,
           created_at,
           updated_at
         )
         VALUES (?, 0, 15, 1, 0, 0, ?, ?)`,
      )
      .run(guildId, now, now);

    return this.get(guildId)!;
  }

  get(guildId: string): SteamFreeConfig | null {
    return (
      (this.db
        .prepare("SELECT * FROM steam_free_config WHERE guild_id = ?")
        .get(guildId) as SteamFreeConfig | undefined) ?? null
    );
  }

  allEnabled(): SteamFreeConfig[] {
    return this.db
      .prepare(
        `SELECT *
         FROM steam_free_config
         WHERE enabled = 1
           AND channel_id IS NOT NULL`,
      )
      .all() as SteamFreeConfig[];
  }

  setChannel(guildId: string, channelId: string | null): SteamFreeConfig {
    this.ensure(guildId);

    this.db
      .prepare(
        `UPDATE steam_free_config
         SET channel_id = ?,
             updated_at = ?
         WHERE guild_id = ?`,
      )
      .run(channelId, nowIso(), guildId);

    return this.get(guildId)!;
  }

  setEnabled(guildId: string, enabled: boolean): SteamFreeConfig {
    this.ensure(guildId);

    this.db
      .prepare(
        `UPDATE steam_free_config
         SET enabled = ?,
             updated_at = ?
         WHERE guild_id = ?`,
      )
      .run(enabled ? 1 : 0, nowIso(), guildId);

    return this.get(guildId)!;
  }

  setInterval(guildId: string, minutes: number): SteamFreeConfig {
    this.ensure(guildId);

    const safeMinutes = Math.max(5, Math.min(1440, Math.floor(minutes)));

    this.db
      .prepare(
        `UPDATE steam_free_config
         SET check_interval_minutes = ?,
             updated_at = ?
         WHERE guild_id = ?`,
      )
      .run(safeMinutes, nowIso(), guildId);

    return this.get(guildId)!;
  }

  setOptions(
    guildId: string,
    options: Partial<
      Pick<
        SteamFreeConfig,
        "free_to_keep_enabled" | "free_weekend_enabled" | "dlc_enabled"
      >
    >,
  ): SteamFreeConfig {
    this.ensure(guildId);

    const current = this.get(guildId)!;

    this.db
      .prepare(
        `UPDATE steam_free_config
         SET free_to_keep_enabled = ?,
             free_weekend_enabled = ?,
             dlc_enabled = ?,
             updated_at = ?
         WHERE guild_id = ?`,
      )
      .run(
        options.free_to_keep_enabled ?? current.free_to_keep_enabled,
        options.free_weekend_enabled ?? current.free_weekend_enabled,
        options.dlc_enabled ?? current.dlc_enabled,
        nowIso(),
        guildId,
      );

    return this.get(guildId)!;
  }

  getPromotion(
    guildId: string,
    promotionKey: string,
  ): SteamFreePromotion | null {
    return (
      (this.db
        .prepare(
          `SELECT *
           FROM steam_free_promotions
           WHERE guild_id = ?
             AND promotion_key = ?`,
        )
        .get(guildId, promotionKey) as SteamFreePromotion | undefined) ??
      null
    );
  }

  hasPromotion(guildId: string, promotionKey: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1
         FROM steam_free_promotions
         WHERE guild_id = ?
           AND promotion_key = ?
         LIMIT 1`,
      )
      .get(guildId, promotionKey);

    return Boolean(row);
  }

  createPromotion(
    input: CreateSteamFreePromotionInput,
  ): SteamFreePromotion {
    const now = nowIso();

    this.db
      .prepare(
        `INSERT INTO steam_free_promotions
         (
           guild_id,
           app_id,
           title,
           original_price,
           currency,
           promotion_key,
           started_at,
           expires_at,
           steam_url,
           image_url,
           first_seen_at,
           last_seen_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.guildId,
        input.appId,
        input.title,
        input.originalPrice ?? null,
        input.currency ?? null,
        input.promotionKey,
        input.startedAt ?? null,
        input.expiresAt ?? null,
        input.steamUrl,
        input.imageUrl ?? null,
        now,
        now,
      );

    return this.getPromotion(input.guildId, input.promotionKey)!;
  }

  touchPromotion(
    guildId: string,
    promotionKey: string,
    expiresAt?: string | null,
  ): SteamFreePromotion | null {
    this.db
      .prepare(
        `UPDATE steam_free_promotions
         SET last_seen_at = ?,
             expires_at = COALESCE(?, expires_at)
         WHERE guild_id = ?
           AND promotion_key = ?`,
      )
      .run(nowIso(), expiresAt ?? null, guildId, promotionKey);

    return this.getPromotion(guildId, promotionKey);
  }

  setMessageId(
    guildId: string,
    promotionKey: string,
    messageId: string | null,
  ): void {
    this.db
      .prepare(
        `UPDATE steam_free_promotions
         SET message_id = ?
         WHERE guild_id = ?
           AND promotion_key = ?`,
      )
      .run(messageId, guildId, promotionKey);
  }

  getRecentPromotions(
    guildId: string,
    limit = 20,
  ): SteamFreePromotion[] {
    return this.db
      .prepare(
        `SELECT *
         FROM steam_free_promotions
         WHERE guild_id = ?
         ORDER BY first_seen_at DESC
         LIMIT ?`,
      )
      .all(guildId, Math.max(1, Math.min(100, Math.floor(limit)))) as SteamFreePromotion[];
  }
}
