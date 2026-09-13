export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE IF NOT EXISTS guild_config (
        guild_id TEXT PRIMARY KEY,
        welcome_channel_id TEXT,
        rules_channel_id TEXT,
        announcements_channel_id TEXT,
        moderation_log_channel_id TEXT,
        member_log_channel_id TEXT,
        message_log_channel_id TEXT,
        role_log_channel_id TEXT,
        bot_log_channel_id TEXT,
        ticket_category_id TEXT,
        member_role_id TEXT,
        support_role_id TEXT,
        developer_role_id TEXT,
        administrator_role_id TEXT,
        founder_role_id TEXT,
        welcome_enabled INTEGER NOT NULL DEFAULT 1,
        goodbye_enabled INTEGER NOT NULL DEFAULT 1,
        moderation_enabled INTEGER NOT NULL DEFAULT 1,
        message_logs_enabled INTEGER NOT NULL DEFAULT 0,
        security_enabled INTEGER NOT NULL DEFAULT 0,
        welcome_dm_enabled INTEGER NOT NULL DEFAULT 0,
        presence_text TEXT NOT NULL DEFAULT 'CB Studios',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS moderation_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL UNIQUE,
        guild_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        moderator_user_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        duration_ms INTEGER,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        evidence TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_cases_guild_target ON moderation_cases(guild_id, target_user_id, created_at);

      CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        moderator_user_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        removed_by_user_id TEXT,
        removed_at TEXT,
        removal_reason TEXT,
        FOREIGN KEY(case_id) REFERENCES moderation_cases(case_id)
      );
      CREATE INDEX IF NOT EXISTS idx_warnings_guild_target ON warnings(guild_id, target_user_id, active);

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_code TEXT NOT NULL UNIQUE,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL UNIQUE,
        owner_user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        claimed_by_user_id TEXT,
        created_at TEXT NOT NULL,
        closed_at TEXT,
        closed_by_user_id TEXT,
        close_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(guild_id, owner_user_id, status);

      CREATE TABLE IF NOT EXISTS ticket_members (
        ticket_code TEXT NOT NULL,
        user_id TEXT NOT NULL,
        added_by_user_id TEXT NOT NULL,
        added_at TEXT NOT NULL,
        PRIMARY KEY(ticket_code, user_id),
        FOREIGN KEY(ticket_code) REFERENCES tickets(ticket_code)
      );

      CREATE TABLE IF NOT EXISTS saved_embeds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        color TEXT,
        footer TEXT,
        image_url TEXT,
        thumbnail_url TEXT,
        created_by_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(guild_id, name)
      );

      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        actor_user_id TEXT,
        target_user_id TEXT,
        event_type TEXT NOT NULL,
        summary TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_guild_created ON audit_events(guild_id, created_at);
    `,
  },
  {
    id: 2,
    name: "role_panel_config",
    sql: `
      ALTER TABLE guild_config ADD COLUMN role_panel_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN role_panel_message_id TEXT;
    `,
  },
  {
    id: 3,
    name: "ticket_panel_and_lifecycle",
    sql: `
      ALTER TABLE guild_config ADD COLUMN ticket_panel_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN ticket_panel_message_id TEXT;
      ALTER TABLE tickets ADD COLUMN claimed_at TEXT;
      ALTER TABLE tickets ADD COLUMN deleted_at TEXT;
      ALTER TABLE tickets ADD COLUMN deleted_by_user_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_open_owner_category
        ON tickets(guild_id, owner_user_id, category)
        WHERE status = 'open';
    `,
  },
  {
    id: 4,
    name: "self_role_groups",
    sql: `
      CREATE TABLE IF NOT EXISTS self_role_groups (
        guild_id TEXT NOT NULL,
        group_key TEXT NOT NULL,
        group_type TEXT NOT NULL,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(guild_id, group_key)
      );

      CREATE TABLE IF NOT EXISTS self_role_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        group_key TEXT NOT NULL,
        role_id TEXT NOT NULL,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(guild_id, group_key, role_id),
        FOREIGN KEY(guild_id, group_key) REFERENCES self_role_groups(guild_id, group_key)
      );
      CREATE INDEX IF NOT EXISTS idx_self_role_options_guild_group
        ON self_role_options(guild_id, group_key, enabled, sort_order);
      CREATE INDEX IF NOT EXISTS idx_self_role_options_role
        ON self_role_options(guild_id, role_id);
    `,
  },
  {
    id: 5,
    name: "temporary_voice_channels",
    sql: `
      ALTER TABLE guild_config ADD COLUMN voice_log_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN support_alert_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN default_empty_grace_seconds INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE guild_config ADD COLUMN one_room_per_user INTEGER NOT NULL DEFAULT 1;

      CREATE TABLE IF NOT EXISTS voice_generators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        generator_channel_id TEXT NOT NULL,
        target_category_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('PUBLIC', 'SUPPORT', 'STAFF')),
        name_template TEXT NOT NULL,
        default_user_limit INTEGER NOT NULL DEFAULT 0,
        max_user_limit INTEGER NOT NULL DEFAULT 10,
        privacy_mode TEXT NOT NULL CHECK(privacy_mode IN ('PUBLIC', 'LOCKED', 'PRIVATE')),
        bitrate_override INTEGER,
        support_alert_channel_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(guild_id, generator_channel_id)
      );
      CREATE TABLE IF NOT EXISTS voice_generator_roles (
        generator_id INTEGER NOT NULL REFERENCES voice_generators(id) ON DELETE CASCADE,
        role_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(generator_id, role_id)
      );
      CREATE TABLE IF NOT EXISTS temporary_voice_channels (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        generator_id INTEGER NOT NULL REFERENCES voice_generators(id),
        owner_user_id TEXT NOT NULL,
        control_message_id TEXT,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        privacy_mode TEXT NOT NULL CHECK(privacy_mode IN ('PUBLIC', 'LOCKED', 'PRIVATE')),
        user_limit INTEGER NOT NULL DEFAULT 0,
        custom_name TEXT,
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'PENDING_DELETE', 'DELETED')) DEFAULT 'ACTIVE'
      );
      CREATE INDEX IF NOT EXISTS idx_temp_voice_guild_owner ON temporary_voice_channels(guild_id, owner_user_id, status);
      CREATE TABLE IF NOT EXISTS temporary_voice_permissions (
        channel_id TEXT NOT NULL REFERENCES temporary_voice_channels(channel_id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        permission_type TEXT NOT NULL CHECK(permission_type IN ('ALLOW', 'BLOCK')),
        created_at TEXT NOT NULL,
        PRIMARY KEY(channel_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS voice_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        channel_id TEXT,
        actor_user_id TEXT,
        target_user_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_voice_audit_guild_created ON voice_audit_events(guild_id, created_at);
    `,
  },
  {
    id: 6,
    name: "vps_system_status",
    sql: `
      CREATE TABLE IF NOT EXISTS system_status_config (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        message_id TEXT,
        enabled INTEGER NOT NULL DEFAULT 0,
        interval_seconds INTEGER NOT NULL DEFAULT 300,
        mode TEXT NOT NULL DEFAULT 'edit' CHECK(mode IN ('edit', 'post')),
        warn_cpu_pct INTEGER NOT NULL DEFAULT 85,
        warn_ram_pct INTEGER NOT NULL DEFAULT 85,
        warn_disk_pct INTEGER NOT NULL DEFAULT 90,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(guild_id) REFERENCES guild_config(guild_id)
      );
    `,
  },
  {
    id: 7,
    name: "cb_studios_roles_and_logs",
    sql: `
      ALTER TABLE guild_config ADD COLUMN customer_role_id TEXT;
      ALTER TABLE guild_config ADD COLUMN server_booster_role_id TEXT;
      ALTER TABLE guild_config ADD COLUMN bots_role_id TEXT;
      ALTER TABLE guild_config ADD COLUMN channel_log_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN ticket_log_channel_id TEXT;
      ALTER TABLE guild_config ADD COLUMN security_log_channel_id TEXT;
    `,
  },
];
