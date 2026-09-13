import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type Client,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import type {
  SteamFreeConfig,
  SteamFreePromotion,
  SteamFreeRepository,
} from "../repositories/steamFreeRepository.js";
import { logger } from "../logger.js";

const STEAMDB_FREE_URL = "https://steamdb.info/upcoming/free/";
const STEAM_STORE_API_URL =
  "https://store.steampowered.com/api/appdetails";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/153.0.0.0 Safari/537.36";

export interface SteamFreeGame {
  appId: number;
  title: string;
  promotionKey: string;
  startedAt: string | null;
  expiresAt: string | null;
  steamUrl: string;
  imageUrl: string | null;
  originalPrice: string | null;
  currency: string | null;
}

interface SteamStoreResponse {
  success?: boolean;
  data?: {
    type?: string;
    name?: string;
    is_free?: boolean;
    header_image?: string;
    price_overview?: {
      currency?: string;
      initial_formatted?: string;
      initial?: number;
    };
  };
}

interface PromotionCandidate {
  appId: number;
  title: string;
  startedAt: string | null;
  expiresAt: string | null;
}

export class SteamFreeService {
  private readonly runningGuilds = new Set<string>();

  constructor(
    private readonly client: Client,
    private readonly repository: SteamFreeRepository,
  ) {}

  async checkGuild(guildId: string): Promise<{
    detected: number;
    published: number;
    skipped: number;
  }> {
    if (this.runningGuilds.has(guildId)) {
      return {
        detected: 0,
        published: 0,
        skipped: 0,
      };
    }

    this.runningGuilds.add(guildId);

    try {
      const config = this.repository.ensure(guildId);

      if (!config.enabled || !config.channel_id) {
        return {
          detected: 0,
          published: 0,
          skipped: 0,
        };
      }

      const games = await this.fetchFreeToKeepGames();

      let published = 0;
      let skipped = 0;

      for (const game of games) {
        if (!config.free_to_keep_enabled) {
          skipped += 1;
          continue;
        }

        const alreadyExists = this.repository.hasPromotion(
          guildId,
          game.promotionKey,
        );

        if (alreadyExists) {
          this.repository.touchPromotion(
            guildId,
            game.promotionKey,
            game.expiresAt,
          );

          skipped += 1;
          continue;
        }

        const promotion = this.repository.createPromotion({
          guildId,
          appId: game.appId,
          title: game.title,
          originalPrice: game.originalPrice,
          currency: game.currency,
          promotionKey: game.promotionKey,
          startedAt: game.startedAt,
          expiresAt: game.expiresAt,
          steamUrl: game.steamUrl,
          imageUrl: game.imageUrl,
        });

        const messageId = await this.publishPromotion(
          config,
          promotion,
        );

        if (messageId) {
          this.repository.setMessageId(
            guildId,
            game.promotionKey,
            messageId,
          );

          published += 1;
        }
      }

      return {
        detected: games.length,
        published,
        skipped,
      };
    } catch (error) {
      logger.error(
        {
          error,
          guildId,
        },
        "Error comprobando promociones Steam Free",
      );

      throw error;
    } finally {
      this.runningGuilds.delete(guildId);
    }
  }

  async checkAllEnabled(): Promise<void> {
    const configs = this.repository.allEnabled();

    for (const config of configs) {
      try {
        await this.checkGuild(config.guild_id);
      } catch (error) {
        logger.error(
          {
            error,
            guildId: config.guild_id,
          },
          "Error en comprobacion global de Steam Free",
        );
      }
    }
  }

  private async fetchFreeToKeepGames(): Promise<SteamFreeGame[]> {
    const response = await fetch(STEAMDB_FREE_URL, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(
        `SteamDB devolvio HTTP ${response.status} al consultar promociones.`,
      );
    }

    const html = await response.text();

    const section = this.extractFreeToKeepSection(html);

    if (!section) {
      logger.warn(
        "No se pudo localizar la seccion Free to Keep de SteamDB.",
      );

      return [];
    }

    const candidates = this.extractPromotionCandidates(section);
    const games: SteamFreeGame[] = [];

    for (const candidate of candidates) {
      try {
        const details = await this.fetchSteamDetails(candidate.appId);

        if (!details) {
          logger.warn(
            {
              appId: candidate.appId,
            },
            "No se pudieron obtener los detalles del juego en Steam.",
          );

          continue;
        }

        if (details.type && details.type !== "game") {
          continue;
        }

        /*
         * SteamDB puede mostrar determinados títulos gratuitos
         * dentro de otras categorías, pero nosotros solo queremos
         * promociones temporales Free to Keep.
         *
         * Si Steam marca el producto como permanentemente gratuito,
         * lo ignoramos.
         */
        if (details.is_free === true) {
          continue;
        }

        games.push({
          appId: candidate.appId,
          title: details.name ?? candidate.title,
          promotionKey: `${candidate.appId}:${candidate.startedAt ?? "unknown"}`,
          startedAt: candidate.startedAt,
          expiresAt: candidate.expiresAt,
          steamUrl: `https://store.steampowered.com/app/${candidate.appId}/`,
          imageUrl: details.header_image ?? null,
          originalPrice:
            details.price_overview?.initial_formatted ?? null,
          currency: details.price_overview?.currency ?? null,
        });
      } catch (error) {
        logger.warn(
          {
            error,
            appId: candidate.appId,
          },
          "No se pudo procesar una promocion Steam",
        );
      }
    }

    return games;
  }

  private extractFreeToKeepSection(
    html: string,
  ): string | null {
    const normalized = html.replace(/\r/g, "");

    const startMarkers = [
      "Free to Keep",
      "Free&nbsp;to&nbsp;Keep",
    ];

    let start = -1;

    for (const marker of startMarkers) {
      start = normalized.indexOf(marker);

      if (start !== -1) {
        break;
      }
    }

    if (start === -1) {
      return null;
    }

    const afterStart = normalized.slice(start);

    const endMarkers = [
      "Play For Free",
      "Play&nbsp;For&nbsp;Free",
      "Potentially Upcoming Free Promotions",
    ];

    let end = afterStart.length;

    for (const marker of endMarkers) {
      const index = afterStart.indexOf(marker);

      if (index !== -1 && index > 50) {
        end = Math.min(end, index);
      }
    }

    return afterStart.slice(0, end);
  }

  private extractPromotionCandidates(
    html: string,
  ): PromotionCandidate[] {
    const candidates: PromotionCandidate[] = [];
    const seen = new Set<number>();

    const linkRegex =
      /href=["'](?:https?:\/\/steamdb\.info)?\/app\/(\d+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      const appId = Number(match[1]);

      if (!Number.isInteger(appId) || appId <= 0) {
        continue;
      }

      if (seen.has(appId)) {
        continue;
      }

      const title = this.cleanHtml(match[2] ?? "");

      if (!title || title.length < 2) {
        continue;
      }

      const contextStart = Math.max(
        0,
        match.index - 2500,
      );

      const contextEnd = Math.min(
        html.length,
        match.index + match[0].length + 2500,
      );

      const context = html.slice(
        contextStart,
        contextEnd,
      );

      const dates = this.extractDates(context);

      seen.add(appId);

      candidates.push({
        appId,
        title,
        startedAt: dates.startedAt,
        expiresAt: dates.expiresAt,
      });
    }

    return candidates;
  }

  private extractDates(html: string): {
    startedAt: string | null;
    expiresAt: string | null;
  } {
    const plain = this.cleanHtml(html);

    const startedMatch = plain.match(
      /Started:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}\s+[–-]\s+[0-9]{2}:[0-9]{2}:[0-9]{2}\s+UTC)/i,
    );

    const expiresMatch = plain.match(
      /Expires:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}\s+[–-]\s+[0-9]{2}:[0-9]{2}:[0-9]{2}\s+UTC)/i,
    );

    return {
      startedAt: this.parseSteamDbDate(
        startedMatch?.[1] ?? null,
      ),
      expiresAt: this.parseSteamDbDate(
        expiresMatch?.[1] ?? null,
      ),
    };
  }

  private parseSteamDbDate(
    value: string | null,
  ): string | null {
    if (!value) {
      return null;
    }

    const normalized = value
      .replace(/\u00a0/g, " ")
      .replace(/\s+[–-]\s+/g, " ")
      .replace(/\s+UTC$/i, " UTC")
      .trim();

    const parsed = new Date(normalized);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toISOString();
  }

  private async fetchSteamDetails(
    appId: number,
  ): Promise<SteamStoreResponse["data"] | null> {
    const url = new URL(STEAM_STORE_API_URL);

    url.searchParams.set("appids", String(appId));
    url.searchParams.set("cc", "us");
    url.searchParams.set("l", "english");

    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Steam Store API devolvio HTTP ${response.status} para ${appId}.`,
      );
    }

    const json = (await response.json()) as Record<
      string,
      SteamStoreResponse
    >;

    return json[String(appId)]?.success
      ? json[String(appId)]?.data ?? null
      : null;
  }

  private async publishPromotion(
    config: SteamFreeConfig,
    promotion: SteamFreePromotion,
  ): Promise<string | null> {
    if (!config.channel_id) {
      return null;
    }

    const channel = await this.client.channels
      .fetch(config.channel_id)
      .catch(() => null);

    if (
      !channel ||
      (channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement)
    ) {
      logger.warn(
        {
          guildId: config.guild_id,
          channelId: config.channel_id,
        },
        "Canal de Steam Free no valido",
      );

      return null;
    }

    const textChannel = channel as TextChannel;

    if (!textChannel.isSendable()) {
      logger.warn(
        {
          guildId: config.guild_id,
          channelId: config.channel_id,
        },
        "El canal de Steam Free no permite enviar mensajes",
      );

      return null;
    }

    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle(`🆓 STEAM GRATIS — ${promotion.title}`)
      .setDescription(
        [
          "🔥 **FREE TO KEEP**",
          "",
          "Reclámalo durante la promoción y **se queda permanentemente en tu biblioteca de Steam**.",
          "",
          promotion.original_price
            ? `~~${promotion.original_price}~~ → **GRATIS**`
            : "**GRATIS**",
          promotion.expires_at
            ? `⏰ **Expira:** <t:${Math.floor(
                new Date(promotion.expires_at).getTime() / 1000,
              )}:F> (<t:${Math.floor(
                new Date(promotion.expires_at).getTime() / 1000,
              )}:R>)`
            : "⏰ **Promoción temporal**",
        ].join("\n"),
      )
      .setFooter({
        text: "Crazy • Steam Free Games",
      })
      .setTimestamp();

    if (promotion.image_url) {
      embed.setImage(promotion.image_url);
    }

    const button = new ButtonBuilder()
      .setLabel("🎮 RECLAMAR EN STEAM")
      .setStyle(ButtonStyle.Link)
      .setURL(promotion.steam_url);

    const row =
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button,
      );

    const message = await textChannel.send({
      embeds: [embed],
      components: [row],
      allowedMentions: {
        parse: [],
      },
    });

    return message.id;
  }

  private cleanHtml(value: string): string {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }
}