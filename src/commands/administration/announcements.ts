import { ChannelType, EmbedBuilder, SlashCommandBuilder, type TextChannel } from "discord.js";
import type { BotCommand } from "../../types/command.js";
import { brand, embeds, type AnnouncementKind } from "../../modules/embeds/embedService.js";
import { UserFacingError, requirePermission } from "../../permissions/guards.js";
import { assertEmbedText, assertUrl } from "../../utils/validation.js";
import { buildAnnouncementPreviewPayload, type AnnouncementMention } from "../../modules/announcements/announcementBuilder.js";
import { announcementDrafts } from "../../modules/announcements/announcementDrafts.js";

export const announceCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Previsualiza y publica un anuncio.")
    .addChannelOption((option) =>
      option.setName("canal").setDescription("Canal destino").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addStringOption((option) => option.setName("titulo").setDescription("Titulo").setRequired(true).setMaxLength(256))
    .addStringOption((option) => option.setName("contenido").setDescription("Contenido").setRequired(true).setMaxLength(4000))
    .addStringOption((option) =>
      option
        .setName("plantilla")
        .setDescription("Tipo de anuncio")
        .addChoices(
          { name: "actualizacion", value: "actualizacion" },
          { name: "mantenimiento", value: "mantenimiento" },
          { name: "desarrollo", value: "desarrollo" },
          { name: "lanzamiento", value: "lanzamiento" },
          { name: "importante", value: "importante" },
          { name: "comunidad", value: "comunidad" },
          { name: "informacion", value: "informacion" },
        ),
    )
    .addStringOption((option) => option.setName("imagen").setDescription("URL de imagen"))
    .addStringOption((option) => option.setName("thumbnail").setDescription("URL de thumbnail"))
    .addBooleanOption((option) => option.setName("banner").setDescription("Mostrar banner oficial"))
    .addStringOption((option) => option.setName("cta_label").setDescription("Texto del boton CTA").setMaxLength(80))
    .addStringOption((option) => option.setName("cta_url").setDescription("URL del boton CTA"))
    .addStringOption((option) =>
      option
        .setName("mencion")
        .setDescription("Mencion opcional")
        .addChoices({ name: "ninguna", value: "none" }, { name: "@here", value: "here" }, { name: "@everyone", value: "everyone" }),
    ),
  level: "announcements",
  description: "Anuncios con preview",
  async execute(interaction, context) {
    await requirePermission(interaction, context, "announcements");
    const channel = interaction.options.getChannel("canal", true);
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      throw new UserFacingError("El canal debe ser de texto o anuncios.");
    }
    const title = interaction.options.getString("titulo", true);
    const content = interaction.options.getString("contenido", true);
    const mention = (interaction.options.getString("mencion") ?? "none") as AnnouncementMention;
    const template = (interaction.options.getString("plantilla") ?? "informacion") as AnnouncementKind;
    const draft = announcementDrafts.create({
      guildId: interaction.guildId!,
      ownerId: interaction.user.id,
      channelId: channel.id,
      kind: template,
      title,
      content,
      mention,
      banner: interaction.options.getBoolean("banner"),
      imageUrl: interaction.options.getString("imagen"),
      thumbnailUrl: interaction.options.getString("thumbnail"),
      ctaLabel: interaction.options.getString("cta_label"),
      ctaUrl: interaction.options.getString("cta_url"),
    });

    await interaction.reply({ ...buildAnnouncementPreviewPayload(draft), ephemeral: true });
  },
};

export const embedCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Gestiona plantillas de embeds.")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Crea o actualiza una plantilla.")
        .addStringOption((option) => option.setName("nombre").setDescription("Nombre").setRequired(true).setMaxLength(64))
        .addStringOption((option) => option.setName("titulo").setDescription("Titulo").setRequired(true).setMaxLength(256))
        .addStringOption((option) => option.setName("descripcion").setDescription("Descripcion").setRequired(true).setMaxLength(4000))
        .addStringOption((option) => option.setName("footer").setDescription("Footer").setMaxLength(256))
        .addStringOption((option) => option.setName("imagen").setDescription("URL imagen"))
        .addStringOption((option) => option.setName("thumbnail").setDescription("URL thumbnail")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("send")
        .setDescription("Envia una plantilla guardada.")
        .addStringOption((option) => option.setName("nombre").setDescription("Nombre").setRequired(true))
        .addChannelOption((option) => option.setName("canal").setDescription("Canal").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Elimina una plantilla.")
        .addStringOption((option) => option.setName("nombre").setDescription("Nombre").setRequired(true)),
    ),
  level: "announcements",
  description: "Plantillas de embeds",
  async execute(interaction, context) {
    await requirePermission(interaction, context, "announcements");
    const sub = interaction.options.getSubcommand();
    const name = interaction.options.getString("nombre", true).toLowerCase();

    if (sub === "create") {
      const title = interaction.options.getString("titulo", true);
      const description = interaction.options.getString("descripcion", true);
      assertEmbedText(title, description);
      context.repositories.savedEmbeds.upsert({
        guild_id: interaction.guildId!,
        name,
        title,
        description,
        color: `#${brand.colors.announcement.toString(16)}`,
        footer: interaction.options.getString("footer"),
        image_url: assertUrl(interaction.options.getString("imagen"), "imagen"),
        thumbnail_url: assertUrl(interaction.options.getString("thumbnail"), "thumbnail"),
        createdByUserId: interaction.user.id,
      });
      await interaction.reply({ embeds: [embeds.success("Plantilla guardada", name)], ephemeral: true });
      return;
    }

    if (sub === "delete") {
      const ok = context.repositories.savedEmbeds.delete(interaction.guildId!, name);
      await interaction.reply({ embeds: [ok ? embeds.success("Plantilla eliminada", name) : embeds.warning("No encontrada", name)], ephemeral: true });
      return;
    }

    const row = context.repositories.savedEmbeds.get(interaction.guildId!, name);
    if (!row) throw new UserFacingError("No encontre esa plantilla.");
    const channel = interaction.options.getChannel("canal", true);
    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      throw new UserFacingError("El canal debe ser de texto o anuncios.");
    }
    const embed = new EmbedBuilder().setTitle(row.title).setDescription(row.description).setColor(brand.colors.announcement).setFooter({ text: row.footer ?? brand.footers.announcement }).setTimestamp();
    if (row.image_url) embed.setImage(row.image_url);
    if (row.thumbnail_url) embed.setThumbnail(row.thumbnail_url);
    await (channel as TextChannel).send({ embeds: [embed], allowedMentions: { parse: [] } });
    await interaction.reply({ embeds: [embeds.success("Embed enviado", `Publicado en <#${channel.id}>.`)], ephemeral: true });
  },
};
