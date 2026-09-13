import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";

export type SelfRoleGroupType = "color" | "preferences";

export interface SelfRoleGroupRow {
  guild_id: string;
  group_key: string;
  group_type: SelfRoleGroupType;
  label: string;
  sort_order: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface SelfRoleOptionRow {
  id: number;
  guild_id: string;
  group_key: string;
  role_id: string;
  label: string;
  sort_order: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export class SelfRoleRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  ensureGroup(input: {
    guildId: string;
    groupKey: string;
    groupType: SelfRoleGroupType;
    label: string;
    sortOrder: number;
    enabled?: boolean;
  }): SelfRoleGroupRow {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO self_role_groups
         (guild_id, group_key, group_type, label, sort_order, enabled, created_at, updated_at)
         VALUES (@guildId, @groupKey, @groupType, @label, @sortOrder, @enabled, @now, @now)
         ON CONFLICT(guild_id, group_key) DO UPDATE SET
           group_type = excluded.group_type,
           label = excluded.label,
           sort_order = excluded.sort_order,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`,
      )
      .run({ ...input, enabled: input.enabled === false ? 0 : 1, now });
    return this.getGroup(input.guildId, input.groupKey)!;
  }

  getGroup(guildId: string, groupKey: string): SelfRoleGroupRow | null {
    return (
      (this.db.prepare("SELECT * FROM self_role_groups WHERE guild_id = ? AND group_key = ?").get(guildId, groupKey) as
        | SelfRoleGroupRow
        | undefined) ?? null
    );
  }

  listGroups(guildId: string, includeDisabled = false): SelfRoleGroupRow[] {
    return this.db
      .prepare(
        `SELECT * FROM self_role_groups
         WHERE guild_id = ? ${includeDisabled ? "" : "AND enabled = 1"}
         ORDER BY sort_order, group_key`,
      )
      .all(guildId) as SelfRoleGroupRow[];
  }

  upsertOption(input: {
    guildId: string;
    groupKey: string;
    roleId: string;
    label: string;
    sortOrder: number;
    enabled?: boolean;
  }): SelfRoleOptionRow {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO self_role_options
         (guild_id, group_key, role_id, label, sort_order, enabled, created_at, updated_at)
         VALUES (@guildId, @groupKey, @roleId, @label, @sortOrder, @enabled, @now, @now)
         ON CONFLICT(guild_id, group_key, role_id) DO UPDATE SET
           label = excluded.label,
           sort_order = excluded.sort_order,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`,
      )
      .run({ ...input, enabled: input.enabled === false ? 0 : 1, now });
    return this.getOption(input.guildId, input.groupKey, input.roleId)!;
  }

  getOption(guildId: string, groupKey: string, roleId: string): SelfRoleOptionRow | null {
    return (
      (this.db
        .prepare("SELECT * FROM self_role_options WHERE guild_id = ? AND group_key = ? AND role_id = ?")
        .get(guildId, groupKey, roleId) as SelfRoleOptionRow | undefined) ?? null
    );
  }

  listOptions(guildId: string, includeDisabled = false): SelfRoleOptionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM self_role_options
         WHERE guild_id = ? ${includeDisabled ? "" : "AND enabled = 1"}
         ORDER BY group_key, sort_order, label`,
      )
      .all(guildId) as SelfRoleOptionRow[];
  }

  listOptionsByGroup(guildId: string, groupKey: string, includeDisabled = false): SelfRoleOptionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM self_role_options
         WHERE guild_id = ? AND group_key = ? ${includeDisabled ? "" : "AND enabled = 1"}
         ORDER BY sort_order, label`,
      )
      .all(guildId, groupKey) as SelfRoleOptionRow[];
  }

  setOptionEnabled(guildId: string, groupKey: string, roleId: string, enabled: boolean): boolean {
    const result = this.db
      .prepare(
        `UPDATE self_role_options
         SET enabled = ?, updated_at = ?
         WHERE guild_id = ? AND group_key = ? AND role_id = ?`,
      )
      .run(enabled ? 1 : 0, nowIso(), guildId, groupKey, roleId);
    return result.changes > 0;
  }

  removeOption(guildId: string, groupKey: string, roleId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM self_role_options WHERE guild_id = ? AND group_key = ? AND role_id = ?")
      .run(guildId, groupKey, roleId);
    return result.changes > 0;
  }
}
