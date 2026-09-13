import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";

export interface SavedEmbedRow {
  guild_id: string;
  name: string;
  title: string;
  description: string;
  color: string | null;
  footer: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
}

export class SavedEmbedRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  upsert(input: SavedEmbedRow & { createdByUserId: string }): void {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO saved_embeds
         (guild_id, name, title, description, color, footer, image_url, thumbnail_url, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, name) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          color = excluded.color,
          footer = excluded.footer,
          image_url = excluded.image_url,
          thumbnail_url = excluded.thumbnail_url,
          updated_at = excluded.updated_at`,
      )
      .run(
        input.guild_id,
        input.name,
        input.title,
        input.description,
        input.color,
        input.footer,
        input.image_url,
        input.thumbnail_url,
        input.createdByUserId,
        now,
        now,
      );
  }

  get(guildId: string, name: string): SavedEmbedRow | null {
    return (
      (this.db.prepare("SELECT * FROM saved_embeds WHERE guild_id = ? AND name = ?").get(guildId, name) as
        | SavedEmbedRow
        | undefined) ?? null
    );
  }

  delete(guildId: string, name: string): boolean {
    return this.db.prepare("DELETE FROM saved_embeds WHERE guild_id = ? AND name = ?").run(guildId, name).changes === 1;
  }
}
