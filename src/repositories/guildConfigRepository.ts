import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";

export interface GuildConfig {
  guild_id: string;
  welcome_channel_id: string | null;
  rules_channel_id: string | null;
  announcements_channel_id: string | null;
  moderation_log_channel_id: string | null;
  member_log_channel_id: string | null;
  message_log_channel_id: string | null;
  role_log_channel_id: string | null;
  channel_log_channel_id?: string | null;
  ticket_log_channel_id?: string | null;
  security_log_channel_id?: string | null;
  bot_log_channel_id: string | null;
  ticket_category_id: string | null;
  ticket_panel_channel_id: string | null;
  ticket_panel_message_id: string | null;
  role_panel_channel_id: string | null;
  role_panel_message_id: string | null;
  voice_log_channel_id?: string | null;
  support_alert_channel_id?: string | null;
  member_role_id: string | null;
  support_role_id: string | null;
  customer_role_id?: string | null;
  developer_role_id: string | null;
  administrator_role_id: string | null;
  founder_role_id: string | null;
  server_booster_role_id?: string | null;
  bots_role_id?: string | null;
  welcome_enabled: number;
  goodbye_enabled: number;
  moderation_enabled: number;
  message_logs_enabled: number;
  security_enabled: number;
  welcome_dm_enabled: number;
  default_empty_grace_seconds?: number;
  one_room_per_user?: number;
  presence_text: string;
}

export const configurableChannelKeys = [
  "welcome_channel_id",
  "rules_channel_id",
  "announcements_channel_id",
  "moderation_log_channel_id",
  "member_log_channel_id",
  "message_log_channel_id",
  "role_log_channel_id",
  "channel_log_channel_id",
  "ticket_log_channel_id",
  "security_log_channel_id",
  "bot_log_channel_id",
  "role_panel_channel_id",
  "voice_log_channel_id",
  "support_alert_channel_id",
] as const;

export const configurableRoleKeys = [
  "member_role_id",
  "support_role_id",
  "customer_role_id",
  "developer_role_id",
  "administrator_role_id",
  "founder_role_id",
  "server_booster_role_id",
  "bots_role_id",
] as const;

export const configChannelKeys = ["voice_log_channel_id", "support_alert_channel_id"] as const;
export const configRoleKeys = ["support_role_id", "developer_role_id", "administrator_role_id", "founder_role_id"] as const;

export const configurableToggleKeys = [
  "welcome_enabled",
  "goodbye_enabled",
  "moderation_enabled",
  "message_logs_enabled",
  "security_enabled",
  "welcome_dm_enabled",
] as const;

export type ChannelConfigKey = (typeof configurableChannelKeys)[number];
export type RoleConfigKey = (typeof configurableRoleKeys)[number];
export type ToggleConfigKey = (typeof configurableToggleKeys)[number];

export class GuildConfigRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  ensure(guildId: string): GuildConfig {
    const existing = this.get(guildId);
    if (existing) return existing;
    const now = nowIso();
    this.db
      .prepare(
        "INSERT INTO guild_config (guild_id, created_at, updated_at) VALUES (@guildId, @now, @now)",
      )
      .run({ guildId, now });
    return this.get(guildId)!;
  }

  get(guildId: string): GuildConfig | null {
    return (
      (this.db.prepare("SELECT * FROM guild_config WHERE guild_id = ?").get(guildId) as
        | GuildConfig
        | undefined) ?? null
    );
  }

  setChannel(guildId: string, key: ChannelConfigKey | "ticket_category_id", channelId: string | null): void {
    this.ensure(guildId);
    this.db
      .prepare(`UPDATE guild_config SET ${key} = ?, updated_at = ? WHERE guild_id = ?`)
      .run(channelId, nowIso(), guildId);
  }

  setRolePanel(guildId: string, channelId: string | null | undefined, messageId: string | null | undefined): void {
    this.ensure(guildId);
    const updates: string[] = [];
    const values: Array<string | null> = [];
    if (channelId !== undefined) {
      updates.push("role_panel_channel_id = ?");
      values.push(channelId);
    }
    if (messageId !== undefined) {
      updates.push("role_panel_message_id = ?");
      values.push(messageId);
    }
    if (updates.length === 0) return;
    updates.push("updated_at = ?");
    values.push(nowIso());
    this.db.prepare(`UPDATE guild_config SET ${updates.join(", ")} WHERE guild_id = ?`).run(...values, guildId);
  }

  setTicketPanel(guildId: string, channelId: string | null, messageId: string | null): void {
    this.ensure(guildId);
    this.db
      .prepare("UPDATE guild_config SET ticket_panel_channel_id = ?, ticket_panel_message_id = ?, updated_at = ? WHERE guild_id = ?")
      .run(channelId, messageId, nowIso(), guildId);
  }

  setRole(guildId: string, key: RoleConfigKey, roleId: string | null): void {
    this.ensure(guildId);
    this.db
      .prepare(`UPDATE guild_config SET ${key} = ?, updated_at = ? WHERE guild_id = ?`)
      .run(roleId, nowIso(), guildId);
  }

  setToggle(guildId: string, key: ToggleConfigKey, enabled: boolean): void {
    this.ensure(guildId);
    this.db
      .prepare(`UPDATE guild_config SET ${key} = ?, updated_at = ? WHERE guild_id = ?`)
      .run(enabled ? 1 : 0, nowIso(), guildId);
  }

  setPresence(guildId: string, presenceText: string): void {
    this.ensure(guildId);
    this.db
      .prepare("UPDATE guild_config SET presence_text = ?, updated_at = ? WHERE guild_id = ?")
      .run(presenceText, nowIso(), guildId);
  }

  setSettings(guildId: string, settings: { default_empty_grace_seconds?: number; one_room_per_user?: boolean }): void {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (settings.default_empty_grace_seconds !== undefined) {
      updates.push("default_empty_grace_seconds = ?");
      values.push(settings.default_empty_grace_seconds);
    }
    if (settings.one_room_per_user !== undefined) {
      updates.push("one_room_per_user = ?");
      values.push(settings.one_room_per_user ? 1 : 0);
    }
    if (updates.length === 0) return;
    this.ensure(guildId);
    updates.push("updated_at = ?");
    values.push(nowIso(), guildId);
    this.db.prepare(`UPDATE guild_config SET ${updates.join(", ")} WHERE guild_id = ?`).run(...values);
  }
}
