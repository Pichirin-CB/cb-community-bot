import DatabaseDriver from "better-sqlite3";
import path from "node:path";
import { env } from "../src/config/env.js";

const sourceArg = process.argv[2];
if (!sourceArg) throw new Error("Uso: npm run db:import-vps-monitor -- <ruta-a-base-monitor.sqlite>");

const sourcePath = path.resolve(sourceArg);
const database = new DatabaseDriver(env.DATABASE_PATH);
database.pragma("foreign_keys = ON");
database.prepare("ATTACH DATABASE ? AS monitor_source").run(sourcePath);

database.transaction(() => {
  database.exec(`
    INSERT INTO system_status_config (
      guild_id, channel_id, message_id, enabled, interval_seconds, mode,
      warn_cpu_pct, warn_ram_pct, warn_disk_pct, created_at, updated_at
    )
    SELECT guild_id, channel_id, message_id, enabled, interval_seconds, mode,
           warn_cpu_pct, warn_ram_pct, warn_disk_pct, created_at, updated_at
    FROM monitor_source.system_status_config
    WHERE guild_id IN (SELECT guild_id FROM guild_config)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      enabled = excluded.enabled,
      interval_seconds = excluded.interval_seconds,
      mode = excluded.mode,
      warn_cpu_pct = excluded.warn_cpu_pct,
      warn_ram_pct = excluded.warn_ram_pct,
      warn_disk_pct = excluded.warn_disk_pct,
      updated_at = excluded.updated_at;

    INSERT INTO audit_events (
      guild_id, actor_user_id, target_user_id, event_type, summary, details_json, created_at
    )
    SELECT source.guild_id, NULL, NULL, source.event_type, source.summary, source.details_json, source.created_at
    FROM monitor_source.audit_events source
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_events target
      WHERE target.guild_id = source.guild_id
        AND target.event_type = source.event_type
        AND target.summary = source.summary
        AND target.created_at = source.created_at
    );
  `);
})();

const statusCount = database.prepare("SELECT COUNT(*) AS count FROM system_status_config").get() as { count: number };
console.log(`system_status_config: ${statusCount.count}`);
database.close();
