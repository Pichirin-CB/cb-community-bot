import { randomUUID } from "node:crypto";
import {
  announcementDraftTtlMs,
  defaultAnnouncementBanner,
  validateCta,
  type AnnouncementDraft,
  type AnnouncementMention,
} from "./announcementBuilder.js";
import type { AnnouncementKind } from "../embeds/embedService.js";
import { assertUrl } from "../../utils/validation.js";

export interface CreateAnnouncementDraftInput {
  guildId: string;
  ownerId: string;
  channelId: string;
  kind: AnnouncementKind;
  title: string;
  content: string;
  mention: AnnouncementMention;
  banner?: boolean | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export class AnnouncementDraftStore {
  private readonly drafts = new Map<string, AnnouncementDraft>();

  create(input: CreateAnnouncementDraftInput): AnnouncementDraft {
    this.cleanup();
    const cta = validateCta(input.ctaLabel, input.ctaUrl);
    const draft: AnnouncementDraft = {
      id: randomUUID(),
      guildId: input.guildId,
      ownerId: input.ownerId,
      channelId: input.channelId,
      kind: input.kind,
      title: input.title.trim(),
      content: input.content.trim(),
      mention: input.mention,
      banner: input.banner ?? defaultAnnouncementBanner(input.kind),
      imageUrl: assertUrl(input.imageUrl, "imagen"),
      thumbnailUrl: assertUrl(input.thumbnailUrl, "thumbnail"),
      ctaLabel: cta.ctaLabel,
      ctaUrl: cta.ctaUrl,
      fields: [],
      expiresAt: Date.now() + announcementDraftTtlMs,
      published: false,
    };
    this.drafts.set(draft.id, draft);
    return draft;
  }

  get(id: string): AnnouncementDraft | null {
    const draft = this.drafts.get(id) ?? null;
    if (!draft) return null;
    if (draft.expiresAt < Date.now()) {
      this.drafts.delete(id);
      return null;
    }
    return draft;
  }

  update(
    id: string,
    changes: Partial<Pick<AnnouncementDraft, "title" | "content" | "ctaLabel" | "ctaUrl" | "imageUrl">>,
  ): AnnouncementDraft | null {
    const draft = this.get(id);
    if (!draft) return null;
    const cta = validateCta(changes.ctaLabel ?? draft.ctaLabel, changes.ctaUrl ?? draft.ctaUrl);
    const updated: AnnouncementDraft = {
      ...draft,
      title: changes.title?.trim() || draft.title,
      content: changes.content?.trim() || draft.content,
      imageUrl: assertUrl(changes.imageUrl ?? draft.imageUrl, "imagen"),
      ctaLabel: cta.ctaLabel,
      ctaUrl: cta.ctaUrl,
      expiresAt: Date.now() + announcementDraftTtlMs,
    };
    this.drafts.set(id, updated);
    return updated;
  }

  markPublishing(id: string): "missing" | "already" | "ok" {
    const draft = this.get(id);
    if (!draft) return "missing";
    if (draft.published) return "already";
    draft.published = true;
    this.drafts.set(id, draft);
    return "ok";
  }

  delete(id: string): boolean {
    return this.drafts.delete(id);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [id, draft] of this.drafts) {
      if (draft.expiresAt < now) this.drafts.delete(id);
    }
  }
}

export const announcementDrafts = new AnnouncementDraftStore();
