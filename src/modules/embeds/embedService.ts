import { AttachmentBuilder, EmbedBuilder, type ColorResolvable, type GuildMember, type User } from "discord.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { logger } from "../../logger.js";

interface WelcomeEmbedOptions {
  rulesChannelId: string | null;
  rolePanelUrl: string | null;
  memberRoleName?: string | null;
}

export const brand = {
  name: "Crazy",
  footer: "Crazy • Sistema Oficial",
  footers: {
    system: "Crazy • Sistema Oficial",
    welcome: "Crazy • Bienvenida",
    tickets: "Crazy • Centro de Ayuda",
    announcement: "Crazy • Comunicados Oficiales",
    moderation: "Crazy • Moderación",
    security: "Crazy • Seguridad",
  },
  colors: {
    success: 0x48b8ff,
    error: 0xb94343,
    warning: 0xf5c542,
    info: 0x101a2e,
    moderation: 0xff8c32,
    announcement: 0x1677ff,
    welcome: 0x1677ff,
    security: 0xff8c32,
  },
  assets: {
    banner: {
      filename: "crazy-banner.png",
      path: path.resolve(process.cwd(), "assets", "branding", "crazy-banner.png"),
      url: "attachment://crazy-banner.png",
    },
    logo: {
      filename: "crazy-logo.png",
      path: path.resolve(process.cwd(), "assets", "branding", "crazy-logo.png"),
      url: "attachment://crazy-logo.png",
    },
  },
};

export type EmbedTone = keyof typeof brand.colors;

export type AnnouncementKind =
  | "informacion"
  | "actualizacion"
  | "mantenimiento"
  | "desarrollo"
  | "lanzamiento"
  | "importante"
  | "comunidad";

const announcementTemplates: Record<
  AnnouncementKind,
  {
    icon: string;
    title: string;
    withBanner: boolean;
    footer: string;
    color: number;
  }
> = {
  informacion: {
    icon: "📢",
    title: "Anuncio",
    withBanner: true,
    footer: brand.footers.announcement,
    color: brand.colors.announcement,
  },
  actualizacion: {
    icon: "⚙️",
    title: "Actualización",
    withBanner: true,
    footer: "Crazy • Actualizaciones",
    color: brand.colors.announcement,
  },
  mantenimiento: {
    icon: "🔧",
    title: "Mantenimiento",
    withBanner: false,
    footer: "Crazy • Mantenimiento",
    color: brand.colors.info,
  },
  desarrollo: {
    icon: "⚙️",
    title: "Desarrollo",
    withBanner: true,
    footer: "Crazy • Desarrollo",
    color: brand.colors.info,
  },
  lanzamiento: {
    icon: "🚀",
    title: "Lanzamiento",
    withBanner: true,
    footer: "Crazy • Lanzamientos",
    color: brand.colors.success,
  },
  importante: {
    icon: "⚠️",
    title: "Importante",
    withBanner: true,
    footer: "Crazy • Importante",
    color: brand.colors.warning,
  },
  comunidad: {
    icon: "🌐",
    title: "Comunidad",
    withBanner: true,
    footer: "Crazy • Comunidad",
    color: brand.colors.announcement,
  },
};

export function officialBannerAttachment(): AttachmentBuilder | null {
  if (!hasOfficialBanner()) {
    logger.warn(
      { path: brand.assets.banner.path },
      "Banner oficial no encontrado; se enviara embed sin banner",
    );
    return null;
  }

  return new AttachmentBuilder(brand.assets.banner.path, {
    name: brand.assets.banner.filename,
  });
}

export function hasOfficialBanner(): boolean {
  return existsSync(brand.assets.banner.path);
}

export function officialBannerFiles(): AttachmentBuilder[] {
  const attachment = officialBannerAttachment();
  return attachment ? [attachment] : [];
}

function base(
  title: string,
  description: string,
  color: ColorResolvable,
  footer = brand.footers.system,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: footer })
    .setTimestamp();
}

function withBanner(embed: EmbedBuilder, enabled = true): EmbedBuilder {
  if (enabled && hasOfficialBanner()) {
    embed.setImage(brand.assets.banner.url);
  }

  return embed;
}

export const embeds = {
  base,
  officialBannerAttachment,
  officialBannerFiles,
  hasOfficialBanner,

  success: (title: string, description: string) =>
    base(`✅ ${title}`, description, brand.colors.success),

  error: (title: string, description: string) =>
    base(`❌ ${title}`, description, brand.colors.error),

  warning: (title: string, description: string) =>
    base(`⚠️ ${title}`, description, brand.colors.warning),

  info: (title: string, description: string) =>
    base(title, description, brand.colors.info),

  information: (title: string, description: string) =>
    base(title, description, brand.colors.info),

  moderation: (title: string, description: string) =>
    base(
      `⚠️ ${title}`,
      description,
      brand.colors.moderation,
      brand.footers.moderation,
    ),

  ticket: (title: string, description: string) =>
    base(title, description, brand.colors.info, brand.footers.tickets),

  announcement(
    title: string,
    description: string,
    kind: AnnouncementKind = "informacion",
    includeBanner = true,
  ): EmbedBuilder {
    const template =
      announcementTemplates[kind] ?? announcementTemplates.informacion;

    return withBanner(
      base(
        `${template.icon} ${title}`,
        description,
        template.color,
        template.footer,
      ),
      includeBanner && template.withBanner,
    );
  },

  security: (title: string, description: string) =>
    base(
      `🛡️ ${title}`,
      description,
      brand.colors.security,
      brand.footers.security,
    ),

  welcome(member: GuildMember, options: WelcomeEmbedOptions): EmbedBuilder {
    const steps = [
      "Bienvenido a la comunidad oficial de Crazy.",
      "Aquí comienza tu experiencia con nuestra comunidad.",
    ];

    if (options.rulesChannelId) {
      steps.push(
        "",
        "📜 **Primeros pasos**",
        "Lee las reglas y conoce la información importante de la comunidad.",
      );
    }

    if (options.rolePanelUrl) {
      steps.push(
        "",
        "🎨 **Personaliza tu perfil**",
        "Elige tu color y tus preferencias cuando el panel esté disponible.",
      );
    }

    if (options.memberRoleName) {
      steps.push("", "⚙️ **Tu rol inicial**", options.memberRoleName);
    }

    steps.push(
      "",
      `👥 **Miembro #${member.guild.memberCount}**`,
      "",
      "**PLAY • CONNECT • ENJOY**",
    );

    return withBanner(
      base(
        "⚡ BIENVENIDO A CRAZY",
        `¡Bienvenido, ${member}!\n\n${steps.join("\n")}`,
        brand.colors.welcome,
        brand.footers.welcome,
      ).setThumbnail(member.user.displayAvatarURL({ size: 256 })),
    );
  },

  official(
    title: string,
    description: string,
    tone: EmbedTone = "info",
    includeBanner = false,
  ): EmbedBuilder {
    return withBanner(
      base(title, description, brand.colors[tone], brand.footers.system),
      includeBanner,
    );
  },

  user(user: User, description: string): EmbedBuilder {
    return base(
      `Información de ${user.username}`,
      description,
      brand.colors.info,
    ).setThumbnail(user.displayAvatarURL());
  },

  announcementTemplate(kind: AnnouncementKind) {
    return announcementTemplates[kind] ?? announcementTemplates.informacion;
  },
};
