import DatabaseDriver from "better-sqlite3";
import path from "node:path";
import { env } from "../src/config/env.js";

const sourceArg = process.argv[2];
if (!sourceArg) throw new Error("Uso: npm run db:import-voice -- <ruta-a-base-voice.sqlite>");

const sourcePath = path.resolve(sourceArg);
const database = new DatabaseDriver(env.DATABASE_PATH);
database.pragma("foreign_keys = ON");
database.prepare("ATTACH DATABASE ? AS voice_source").run(sourcePath);

database.transaction(() => {
  database.exec(`
    UPDATE guild_config
    SET voice_log_channel_id = (SELECT voice_log_channel_id FROM voice_source.guild_config v WHERE v.guild_id = guild_config.guild_id),
        support_alert_channel_id = (SELECT support_alert_channel_id FROM voice_source.guild_config v WHERE v.guild_id = guild_config.guild_id),
        default_empty_grace_seconds = COALESCE((SELECT default_empty_grace_seconds FROM voice_source.guild_config v WHERE v.guild_id = guild_config.guild_id), default_empty_grace_seconds),
        one_room_per_user = COALESCE((SELECT one_room_per_user FROM voice_source.guild_config v WHERE v.guild_id = guild_config.guild_id), one_room_per_user),
        updated_at = CURRENT_TIMESTAMP
    WHERE guild_id IN (SELECT guild_id FROM voice_source.guild_config);

    INSERT OR IGNORE INTO voice_generators SELECT * FROM voice_source.voice_generators;
    INSERT OR IGNORE INTO voice_generator_roles SELECT * FROM voice_source.voice_generator_roles;
    INSERT OR IGNORE INTO temporary_voice_channels SELECT * FROM voice_source.temporary_voice_channels;
    INSERT OR IGNORE INTO temporary_voice_permissions SELECT * FROM voice_source.temporary_voice_permissions;
    INSERT OR IGNORE INTO voice_audit_events SELECT * FROM voice_source.voice_audit_events;
  `);
})();

for (const table of [
  "voice_generators",
  "voice_generator_roles",
  "temporary_voice_channels",
  "temporary_voice_permissions",
  "voice_audit_events",
]) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  console.log(`${table}: ${row.count}`);
}

database.close();
