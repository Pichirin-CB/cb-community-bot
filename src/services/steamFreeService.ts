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

const STEAM_SEARCH_URL =
  "https://store.steampowered.com/search/results/";

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
      final?: number;
      discount_percent?: number;
    };
  };
}

interface PromotionCandidate {
  appId: number;
  title: string;
}

interface SearchResponse {
  success?: number;
  results_html?: string;
  total_count?: number;
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
    const candidates = await this.fetchSteamPromotionCandidates();

    const games: SteamFreeGame[] = [];

    for (const candidate of candidates) {
      try {
        const details = await this.fetchSteamDetails(
          candidate.appId,
        );

        if (!details) {
          continue;
        }

        /*
         * Solo queremos juegos.
         *
         * DLC, demos, soundtracks, software, etc. quedan fuera.
         */
        if (details.type && details.type !== "game") {
          continue;
        }

        /*
         * Un producto marcado como is_free es Free-to-Play
         * o permanentemente gratuito.
         *
         * Free to Keep es diferente: es un juego de pago
         * cuyo precio final está temporalmente en 0.
         */
        if (details.is_free === true) {
          continue;
        }

        const price = details.price_overview;

        if (!price) {
          continue;
        }

        /*
         * Debe existir un precio inicial real y el precio final
         * debe ser 0.
         */
        if (
          typeof price.initial !== "number" ||
          price.initial <= 0 ||
          typeof price.final !== "number" ||
          price.final !== 0
        ) {
          continue;
        }

        /*
         * Steam Search no siempre expone las fechas de una
         * promoción en el resultado. Por eso usamos una clave
         * estable basada en AppID + precio inicial + descuento.
         *
         * Cuando la promoción cambie y Steam vuelva a cobrar,
         * dejará de aparecer en la siguiente comprobación.
         */
        const promotionKey =
          `${candidate.appId}:${price.initial}:${price.discount_percent ?? 100}`;

        games.push({
          appId: candidate.appId,
          title: details.name ?? candidate.title,
          promotionKey,
          startedAt: null,
          expiresAt: null,
          steamUrl:
            `https://store.steampowered.com/app/${candidate.appId}/`,
          imageUrl: details.header_image ?? null,
          originalPrice:
            price.initial_formatted ?? null,
          currency:
            price.currency ?? null,
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

  private async fetchSteamPromotionCandidates(): Promise<
    PromotionCandidate[]
  > {
    const url = new URL(STEAM_SEARCH_URL);

    url.searchParams.set("query", "");
    url.searchParams.set("start", "0");
    url.searchParams.set("count", "50");
    url.searchParams.set("maxprice", "free");
    url.searchParams.set("specials", "1");
    url.searchParams.set("category1", "998");
    url.searchParams.set("infinite", "1");

    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json,text/javascript,*/*;q=0.8",
        referer: "https://store.steampowered.com/",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Steam Search devolvio HTTP ${response.status}.`,
      );
    }

    const json =
      (await response.json()) as SearchResponse;

    if (!json.results_html) {
      logger.warn(
        {
          totalCount: json.total_count,
        },
        "Steam Search no devolvio resultados HTML.",
      );

      return [];
    }

    return this.extractPromotionCandidates(
      json.results_html,
    );
  }

  private extractPromotionCandidates(
    html: string,
  ): PromotionCandidate[] {
    const candidates: PromotionCandidate[] = [];
    const seen = new Set<number>();

    /*
     * Steam Search utiliza data-ds-appid en los resultados.
     *
     * También aceptamos data-ds-appid con atributos adicionales
     * para tolerar pequeños cambios del HTML.
     */
    const appRegex =
      /data-ds-appid=["'](\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;

    let match: RegExpExecArray | null;

    while ((match = appRegex.exec(html)) !== null) {
      const appId = Number(match[1]);

      if (!Number.isInteger(appId) || appId <= 0) {
        continue;
      }

      if (seen.has(appId)) {
        continue;
      }

      const blockStart = Math.max(
        0,
        match.index - 500,
      );

      const blockEnd = Math.min(
        html.length,
        match.index + match[0].length + 3000,
      );

      const block = html.slice(
        blockStart,
        blockEnd,
      );

      const titleMatch =
        block.match(
          /class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
        );

      const title = this.cleanHtml(
        titleMatch?.[1] ??
          this.cleanHtml(match[2] ?? ""),
      );

      if (!title || title.length < 2) {
        continue;
      }

      seen.add(appId);

      candidates.push({
        appId,
        title,
      });
    }

    /*
     * Fallback para cambios menores en Steam Search.
     */
    if (candidates.length === 0) {
      const fallbackRegex =
        /data-ds-appid=["'](\d+)["']/gi;

      let fallbackMatch: RegExpExecArray | null;

      while (
        (fallbackMatch =
          fallbackRegex.exec(html)) !== null
      ) {
        const appId = Number(fallbackMatch[1]);

        if (
          !Number.isInteger(appId) ||
          appId <= 0 ||
          seen.has(appId)
        ) {
          continue;
        }

        seen.add(appId);

        candidates.push({
          appId,
          title: `Steam App ${appId}`,
        });
      }
    }

    return candidates;
  }

  private async fetchSteamDetails(
    appId: number,
  ): Promise<SteamStoreResponse["data"] | null> {
    const url = new URL(STEAM_STORE_API_URL);

    url.searchParams.set(
      "appids",
      String(appId),
    );
    url.searchParams.set("cc", "us");
    url.searchParams.set("l", "english");

    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
        referer:
          `https://store.steampowered.com/app/${appId}/`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Steam Store API devolvio HTTP ${response.status} para ${appId}.`,
      );
    }

    const json =
      (await response.json()) as Record<
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
      .setTitle(
        `🆓 STEAM GRATIS — ${promotion.title}`,
      )
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
                new Date(
                  promotion.expires_at,
                ).getTime() / 1000,
              )}:F> (<t:${Math.floor(
                new Date(
                  promotion.expires_at,
                ).getTime() / 1000,
              )}:R>)`
            : "⏰ **Promoción temporal**",
        ].join("\n"),
      )
      .setFooter({
        text: "CB Studios • Steam Free Games",
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
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " ",
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " ",
      )
      .replace(
        /<[^>]+>/g,
        " ",
      )
      .replace(
        /&nbsp;/gi,
        " ",
      )
      .replace(
        /&amp;/gi,
        "&",
      )
      .replace(
        /&quot;/gi,
        '"',
      )
      .replace(
        /&#39;/gi,
        "'",
      )
      .replace(
        /&lt;/gi,
        "<",
      )
      .replace(
        /&gt;/gi,
        ">",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();
  }
}