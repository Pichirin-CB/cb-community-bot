import type DatabaseDriver from "better-sqlite3";
import { nowIso } from "../utils/time.js";

export interface TicketRow {
  ticket_code: string;
  guild_id: string;
  channel_id: string;
  owner_user_id: string;
  category: string;
  status: string;
  claimed_by_user_id: string | null;
  claimed_at: string | null;
  created_at: string;
  closed_at: string | null;
  closed_by_user_id: string | null;
  close_reason: string | null;
  deleted_at: string | null;
  deleted_by_user_id: string | null;
}

export class TicketRepository {
  constructor(private readonly db: DatabaseDriver.Database) {}

  nextCode(): string {
    const nextId = Number((this.db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM tickets").get() as any).next_id);
    return `TICKET-${nextId.toString().padStart(5, "0")}`;
  }

  create(guildId: string, channelId: string, ownerUserId: string, category: string): TicketRow {
    const ticketCode = this.nextCode();
    this.db
      .prepare(
        `INSERT INTO tickets (ticket_code, guild_id, channel_id, owner_user_id, category, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(ticketCode, guildId, channelId, ownerUserId, category, nowIso());
    return this.getByChannel(channelId)!;
  }

  getByChannel(channelId: string): TicketRow | null {
    return (this.db.prepare("SELECT * FROM tickets WHERE channel_id = ?").get(channelId) as TicketRow | undefined) ?? null;
  }

  getOpenByOwnerAndCategory(guildId: string, ownerUserId: string, category: string): TicketRow | null {
    return (
      (this.db
        .prepare("SELECT * FROM tickets WHERE guild_id = ? AND owner_user_id = ? AND category = ? AND status = 'open'")
        .get(guildId, ownerUserId, category) as TicketRow | undefined) ?? null
    );
  }

  claim(channelId: string, userId: string): boolean {
    const result = this.db
      .prepare("UPDATE tickets SET claimed_by_user_id = ?, claimed_at = ? WHERE channel_id = ? AND status = 'open' AND claimed_by_user_id IS NULL")
      .run(userId, nowIso(), channelId);
    return result.changes === 1;
  }

  close(channelId: string, userId: string, reason: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE tickets
         SET status = 'closed', closed_at = ?, closed_by_user_id = ?, close_reason = ?
         WHERE channel_id = ? AND status != 'closed'`,
      )
      .run(nowIso(), userId, reason, channelId);
    return result.changes === 1;
  }

  reopen(channelId: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE tickets SET status = 'open', closed_at = NULL, closed_by_user_id = NULL, close_reason = NULL WHERE channel_id = ? AND status = 'closed'",
      )
      .run(channelId);
    return result.changes === 1;
  }

  markDeleted(channelId: string, userId: string): boolean {
    const result = this.db
      .prepare("UPDATE tickets SET status = 'deleted', deleted_at = ?, deleted_by_user_id = ? WHERE channel_id = ? AND status != 'deleted'")
      .run(nowIso(), userId, channelId);
    return result.changes === 1;
  }
}
