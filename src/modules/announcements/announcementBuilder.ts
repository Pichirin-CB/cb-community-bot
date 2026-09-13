import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbedField,
  type AttachmentBuilder,
} from "discord.js";
import { brand, embeds, type AnnouncementKind } from "../embeds/embedService.js";
import { assertUrl, EMBED_DESCRIPTION_MAX, EMBED_TITLE_MAX } from "../../utils/validation.js";

export type AnnouncementMention = "none" | "here" | "everyone";

export interface AnnouncementDraft {
  id: string;
  guildId: string;
  ownerId: string;
  channelId: string;
  kind: AnnouncementKind;
  title: string;
  content: string;
  mention: AnnouncementMention;
  banner: boolean;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  fields: APIEmbedField[];
  expiresAt: number;
  published: boolean;
}

export interface AnnouncementPayload {
  content: string;
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  allowedMentions: { parse: Array<"everyone"> };
}

export const announcementDraftTtlMs = 20 * 60 * 1000;

const templates: Record<
  AnnouncementKind,
  { icon: string; color: number; footer: string; bannerDefault: boolean }
> = {
  informacion: {
    icon: "📢",
    color: brand.colors.announcement,
    footer: "Crazy • Información",
    bannerDefault: true,
  },
  actualizacion: {
    icon: "⚙️",
    color: brand.colors.announcement,
    footer: "Crazy • Actualizaciones",
    bannerDefault: true,
  },
  mantenimiento: {
    icon: "🔧",
    color: brand.colors.info,
    footer: "Crazy • Mantenimiento",
    bannerDefault: false,
  },
  desarrollo: {
    icon: "⚙️",
    color: brand.colors.info,
    footer: "Crazy • Desarrollo",
    bannerDefault: true,
  },
  lanzamiento: {
    icon: "🚀",
    color: brand.colors.success,
    footer: "Crazy • Lanzamientos",
    bannerDefault: true,
  },
  importante: {
    icon: "⚠️",
    color: brand.colors.warning,
    footer: "Crazy • Importante",
    bannerDefault: true,
  },
  comunidad: {
    icon: "🌐",
    color: brand.colors.announcement,
    footer: "Crazy • Comunidad",
    bannerDefault: true,
  },
};

const separatorLine = /^[\s\-_=*~━─—•·]{6,}$/u;
const headingLine = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
const fullBoldLine = /^\*\*(.+)\*\*$/;

export function announcementTemplate(kind: AnnouncementKind = "informacion") {
  return templates[kind] ?? templates.informacion;
}

export function defaultAnnouncementBanner(kind: AnnouncementKind): boolean {
  return announcementTemplate(kind).bannerDefault;
}

function cleanLine(line: string): string | null {
  const trimmedRight = line.replace(/[ \t]+$/g, "");
  const trimmed = trimmedRight.trim();
  if (!trimmed) return "";
  if (separatorLine.test(trimmed)) return null;

  const heading = trimmed.match(headingLine);
  if (heading?.[1]) {
    return `**${heading[1].trim().replace(fullBoldLine, "$1")}**`;
  }

  const fullBold = trimmed.match(fullBoldLine);
  if (fullBold?.[1] && !fullBold[1].includes("**")) {
    return fullBold[1].trim();
  }

  return trimmedRight.replace(/[ \t]{2,}/g, " ");
}

export function normalizeAnnouncementContent(input: string): string {
  const normalized = input.replace(/\r\n?/g, "\n");
  const lines: string[] = [];
  let blankCount = 0;

  for (const rawLine of normalized.split("\n")) {
    const line = cleanLine(rawLine);
    if (line === null) continue;
    if (line === "") {
      blankCount += 1;
      if (blankCount <= 2 && lines.length > 0) lines.push("");
      continue;
    }
    blankCount = 0;
    lines.push(line);
  }

  while (lines.at(-1) === "") lines.pop();
  return lines.join("\n").trim();
}

export function sanitizeAnnouncementTitle(input: string, kind: AnnouncementKind): string {
  const template = announcementTemplate(kind);
  const cleanTitle = normalizeAnnouncementContent(input).replace(/\n+/g, " ").replace(fullBoldLine, "$1").trim();
  return `${template.icon} ${cleanTitle}`;
}

export function assertAnnouncementLimits(draft: Pick<AnnouncementDraft, "title" | "content" | "kind" | "fields">): void {
  const title = sanitizeAnnouncementTitle(draft.title, draft.kind);
  const description = normalizeAnnouncementContent(draft.content);
  if (!title || title.length > EMBED_TITLE_MAX) {
    throw new Error(`El titulo supera el limite permitido por Discord (${EMBED_TITLE_MAX} caracteres).`);
  }
  if (!description || description.length > EMBED_DESCRIPTION_MAX) {
    throw new Error(`El contenido supera el limite permitido por Discord (${EMBED_DESCRIPTION_MAX} caracteres).`);
  }
  const fieldsTotal = draft.fields.reduce((total, field) => total + field.name.length + field.value.length, 0);
  if (title.length + description.length + fieldsTotal > 6000) {
    throw new Error("El embed supera el limite total permitido por Discord. Reduce el contenido o los campos.");
  }
}

export function validateCta(label: string | null | undefined, url: string | null | undefined): {
  ctaLabel: string | null;
  ctaUrl: string | null;
} {
  const cleanLabel = (label ?? "").trim();
  const cleanUrl = assertUrl(url, "cta_url");
  if (!cleanLabel && !cleanUrl) return { ctaLabel: null, ctaUrl: null };
  if (!cleanLabel || !cleanUrl) {
    throw new Error("cta_label y cta_url deben configurarse juntos.");
  }
  if (cleanLabel.length > 80) {
    throw new Error("cta_label no puede superar 80 caracteres.");
  }
  return { ctaLabel: cleanLabel, ctaUrl: cleanUrl };
}

export function buildAnnouncementEmbed(draft: AnnouncementDraft): EmbedBuilder {
  assertAnnouncementLimits(draft);
  const template = announcementTemplate(draft.kind);
  const image = draft.imageUrl ?? (draft.banner ? brand.assets.banner.url : null);
  const embed = new EmbedBuilder()
    .setColor(template.color)
    .setTitle(sanitizeAnnouncementTitle(draft.title, draft.kind))
    .setDescription(normalizeAnnouncementContent(draft.content))
    .setFooter({ text: template.footer })
    .setTimestamp();

  if (image) embed.setImage(image);
  if (draft.thumbnailUrl && !draft.imageUrl) embed.setThumbnail(draft.thumbnailUrl);
  for (const field of draft.fields.slice(0, 3)) embed.addFields(field);
  return embed;
}

export function mentionContent(mention: AnnouncementMention): string {
  if (mention === "everyone") return "@everyone";
  if (mention === "here") return "@here";
  return "";
}

export function previewNotice(draft: AnnouncementDraft): string {
  const mention = mentionContent(draft.mention);
  return mention ? `Preview seguro. Mencion al publicar: ${mention}` : "Preview seguro. Mencion al publicar: ninguna";
}

export function buildAnnouncementCtaRows(draft: AnnouncementDraft): ActionRowBuilder<ButtonBuilder>[] {
  if (!draft.ctaLabel || !draft.ctaUrl) return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(draft.ctaLabel).setURL(draft.ctaUrl),
    ),
  ];
}

export function buildAnnouncementActionRow(draftId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`announce:publish:${draftId}`).setLabel("✅ Publicar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`announce:edit:${draftId}`).setLabel("✏️ Editar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`announce:cancel:${draftId}`).setLabel("❌ Cancelar").setStyle(ButtonStyle.Danger),
  );
}

export function buildAnnouncementPreviewPayload(draft: AnnouncementDraft): AnnouncementPayload {
  const files = draft.imageUrl || !draft.banner ? [] : embeds.officialBannerFiles();
  return {
    content: previewNotice(draft),
    embeds: [buildAnnouncementEmbed(draft)],
    files,
    components: [...buildAnnouncementCtaRows(draft), buildAnnouncementActionRow(draft.id)],
    allowedMentions: { parse: [] },
  };
}

export function buildAnnouncementPublishPayload(draft: AnnouncementDraft): AnnouncementPayload {
  const files = draft.imageUrl || !draft.banner ? [] : embeds.officialBannerFiles();
  return {
    content: mentionContent(draft.mention),
    embeds: [buildAnnouncementEmbed(draft)],
    files,
    components: buildAnnouncementCtaRows(draft),
    allowedMentions: draft.mention === "none" ? { parse: [] } : { parse: ["everyone"] },
  };
}
