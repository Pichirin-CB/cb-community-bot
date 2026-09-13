import { describe, expect, it } from "vitest";
import { brand, embeds, officialBannerAttachment } from "../src/modules/embeds/embedService.js";
import { buildWelcomeLinkTargets, createWelcomeActionRow } from "../src/modules/welcome/welcomeLinks.js";

function member() {
  return {
    toString: () => "<@user>",
    user: {
      displayAvatarURL: () => "https://cdn.discordapp.com/avatar.png",
    },
    guild: {
      memberCount: 63,
    },
  } as any;
}

describe("branding embeds", () => {
  it("crea bienvenida oficial con banner y avatar de usuario", () => {
    const embed = embeds
      .welcome(member(), {
        rulesChannelId: "rules",
        rolePanelUrl: "https://discord.com/channels/guild/panel/message",
        memberRoleName: "Technology Member",
      })
      .toJSON();

    expect(embed.title).toContain("BIENVENIDO");
    expect(embed.description).toContain("<@user>");
    expect(embed.description).toContain("Technology Member");
    expect(embed.description).toContain("Miembro #63");
    expect(embed.thumbnail?.url).toBe("https://cdn.discordapp.com/avatar.png");
    expect(embed.image?.url).toBe(brand.assets.banner.url);
    expect(embed.footer?.text).toBe(brand.footers.welcome);
  });

  it("crea bienvenida sin banner cuando falta el asset", () => {
    const originalPath = brand.assets.banner.path;
    brand.assets.banner.path = "C:/no-existe/cbstudios-banner.png";
    const embed = embeds.welcome(member(), { rulesChannelId: null, rolePanelUrl: null }).toJSON();
    expect(embed.image).toBeUndefined();
    expect(officialBannerAttachment()).toBeNull();
    brand.assets.banner.path = originalPath;
  });

  it("respeta botones segun reglas y personalizacion configuradas", () => {
    const both = buildWelcomeLinkTargets({
      guildId: "guild",
      rulesChannelId: "rules",
      rolePanelChannelId: "panel",
      rolePanelMessageId: "message",
    });
    expect(createWelcomeActionRow(both)?.components).toHaveLength(2);

    const none = buildWelcomeLinkTargets({
      guildId: "guild",
      rulesChannelId: null,
      rolePanelChannelId: null,
      rolePanelMessageId: null,
    });
    expect(createWelcomeActionRow(none)).toBeNull();
  });

  it("crea anuncio con banner y footer oficial", () => {
    const embed = embeds.announcement("Servidor", "Actualizacion importante", "actualizacion").toJSON();
    expect(embed.title).toBe("⚙️ Servidor");
    expect(embed.description).toBe("Actualizacion importante");
    expect(embed.image?.url).toBe(brand.assets.banner.url);
    expect(embed.footer?.text).toContain("Actualizaciones");
  });

  it("permite anuncio sin banner", () => {
    const embed = embeds.announcement("Servidor", "Mensaje breve", "informacion", false).toJSON();
    expect(embed.image).toBeUndefined();
  });

  it("centraliza colores y attachments oficiales", () => {
    expect(brand.colors.welcome).toBe(0x1677ff);
    expect(brand.colors.announcement).toBe(0x1677ff);
    expect(brand.colors.error).toBe(0xb94343);
    expect(embeds.officialBannerFiles()).toHaveLength(1);
  });
});
