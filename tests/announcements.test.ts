import { describe, expect, it } from "vitest";
import {
  buildAnnouncementEmbed,
  buildAnnouncementPreviewPayload,
  buildAnnouncementPublishPayload,
  normalizeAnnouncementContent,
  validateCta,
  type AnnouncementDraft,
} from "../src/modules/announcements/announcementBuilder.js";
import { AnnouncementDraftStore, announcementDrafts } from "../src/modules/announcements/announcementDrafts.js";
import { handleAnnouncementButton } from "../src/modules/announcements/announcementInteractions.js";
import { brand } from "../src/modules/embeds/embedService.js";

function draft(input: Partial<AnnouncementDraft> = {}): AnnouncementDraft {
  return {
    id: "draft",
    guildId: "guild",
    ownerId: "owner",
    channelId: "channel",
    kind: "actualizacion",
    title: "Cambios en el servidor",
    content: "Se realizaron varios ajustes esta noche.",
    mention: "none",
    banner: true,
    imageUrl: null,
    thumbnailUrl: null,
    ctaLabel: null,
    ctaUrl: null,
    fields: [],
    expiresAt: Date.now() + 60_000,
    published: false,
    ...input,
  };
}

describe("announcement builder", () => {
  it("normaliza contenido libre sin reescribir significado", () => {
    expect(normalizeAnnouncementContent("Texto libre con emoji ⚙️\n\nhttps://cb-studios.example")).toBe(
      "Texto libre con emoji ⚙️\n\nhttps://cb-studios.example",
    );
  });

  it("convierte headings en enfasis moderado y elimina separadores", () => {
    expect(
      normalizeAnnouncementContent(
        [
          "# CAMBIO IMPORTANTE",
          "",
          "## NUEVA ACTUALIZACION",
          "",
          "**Se ha actualizado todo el servidor.**",
          "",
          "━━━━━━━━━━━━━━━━━━━━",
        ].join("\n"),
      ),
    ).toBe("**CAMBIO IMPORTANTE**\n\n**NUEVA ACTUALIZACION**\n\nSe ha actualizado todo el servidor.");
  });

  it("conserva listas, numeracion, links y bold parcial", () => {
    const input = [
      "Se realizaron ajustes:",
      "",
      "* Mejoras de **rendimiento**",
      "* Correccion del sistema de tickets",
      "1. Leer https://cb-studios.example/reglas",
    ].join("\n");
    expect(normalizeAnnouncementContent(input)).toContain("* Mejoras de **rendimiento**");
    expect(normalizeAnnouncementContent(input)).toContain("1. Leer https://cb-studios.example/reglas");
  });

  it("reduce saltos excesivos sin juntar parrafos", () => {
    expect(normalizeAnnouncementContent("Uno\n\n\n\n\nDos")).toBe("Uno\n\n\nDos");
  });

  it("valida CTA http/https y rechaza esquemas invalidos", () => {
    expect(validateCta("Abrir web", "https://cb-studios.example")).toEqual({
      ctaLabel: "Abrir web",
      ctaUrl: "https://cb-studios.example/",
    });
    expect(() => validateCta("Abrir", "javascript:alert(1)")).toThrow("cta_url debe ser una URL http(s) valida.");
    expect(() => validateCta("Abrir", null)).toThrow("cta_label y cta_url deben configurarse juntos.");
  });

  it("@everyone queda fuera del embed y el preview no hace ping", () => {
    const payload = buildAnnouncementPreviewPayload(draft({ mention: "everyone" }));
    expect(payload.content).toContain("@everyone");
    expect(payload.allowedMentions.parse).toEqual([]);
    expect(payload.embeds[0]!.data.description).not.toContain("@everyone");
  });

  it("publicacion con ping autorizado usa content y allowedMentions", () => {
    const payload = buildAnnouncementPublishPayload(draft({ mention: "everyone" }));
    expect(payload.content).toBe("@everyone");
    expect(payload.allowedMentions.parse).toEqual(["everyone"]);
  });

  it("no duplica titulo ni convierte toda la descripcion a bold", () => {
    const embed = buildAnnouncementEmbed(
      draft({
        title: "Servidor reiniciado correctamente",
        content: "**Todo listo.**\n\n* Nuevo ajuste",
      }),
    ).toJSON();
    expect(embed.title).toBe("⚙️ Servidor reiniciado correctamente");
    expect(embed.description).toBe("Todo listo.\n\n* Nuevo ajuste");
    expect(embed.description).not.toContain("Servidor reiniciado correctamente");
  });

  it("respeta banner si/no y custom image reemplaza banner", () => {
    expect(buildAnnouncementEmbed(draft({ banner: true })).toJSON().image?.url).toBe(brand.assets.banner.url);
    expect(buildAnnouncementEmbed(draft({ banner: false })).toJSON().image).toBeUndefined();
    expect(buildAnnouncementEmbed(draft({ imageUrl: "https://example.com/image.png" })).toJSON().image?.url).toBe(
      "https://example.com/image.png",
    );
  });

  it("valida limites de Discord sin cortar silenciosamente", () => {
    expect(() => buildAnnouncementEmbed(draft({ title: "x".repeat(300) }))).toThrow("titulo supera");
    expect(() => buildAnnouncementEmbed(draft({ content: "x".repeat(5000) }))).toThrow("contenido supera");
  });

  it("evita doble publicacion por doble click", () => {
    const store = new AnnouncementDraftStore();
    const created = store.create({
      guildId: "guild",
      ownerId: "owner",
      channelId: "channel",
      kind: "informacion",
      title: "Titulo",
      content: "Contenido",
      mention: "none",
    });
    expect(store.markPublishing(created.id)).toBe("ok");
    expect(store.markPublishing(created.id)).toBe("already");
  });

  it("solo el dueno puede usar botones del draft", async () => {
    const created = announcementDrafts.create({
      guildId: "guild",
      ownerId: "owner",
      channelId: "channel",
      kind: "informacion",
      title: "Titulo",
      content: "Contenido",
      mention: "none",
    });
    const replies: any[] = [];
    await handleAnnouncementButton(
      {
        customId: `announce:publish:${created.id}`,
        user: { id: "other" },
        inCachedGuild: () => true,
        reply: (payload: any) => {
          replies.push(payload);
          return Promise.resolve();
        },
      } as any,
      {} as any,
    );
    expect(replies[0].ephemeral).toBe(true);
    expect(replies[0].embeds[0].data.title).toContain("Accion privada");
    announcementDrafts.delete(created.id);
  });

  it("permite editar el borrador sin empezar desde cero", () => {
    const store = new AnnouncementDraftStore();
    const created = store.create({
      guildId: "guild",
      ownerId: "owner",
      channelId: "channel",
      kind: "lanzamiento",
      title: "Evento inicial",
      content: "Contenido inicial",
      mention: "none",
    });
    const updated = store.update(created.id, {
      title: "Evento actualizado",
      content: "Contenido actualizado",
      ctaLabel: "Inscribirme",
      ctaUrl: "https://cb-studios.example/evento",
    });
    expect(updated?.title).toBe("Evento actualizado");
    expect(updated?.ctaUrl).toBe("https://cb-studios.example/evento");
  });
});
