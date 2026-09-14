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

const GAMERPOWER_API_URL =
  "https://www.gamerpower.com/api/giveaways";

const STEAM_STORE_API_URL =
  "https://store.steampowered.com/api/appdetails";

const STEAM_STORE_SEARCH_URL =
  "https://store.steampowered.com/api/storesearch/";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/153.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 15_000;

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

interface GamerPowerGiveaway {
  id?: number;
  title?: string;
  worth?: string;
  thumbnail?: string;
  image?: string;
  description?: string;
  instructions?: string;
  open_giveaway_url?: string;
  giveaway_url?: string;
  published_date?: string;
  end_date?: string;
  type?: string;
  platforms?: string;
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

interface SteamSearchResponse {
  total?: number;
  items?: Array<{
    id?: number;
    name?: string;
    type?: string;
  }>;
}

interface SteamCandidate {
  externalId: string;
  title: string;
  description: string;
  imageUrl: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  giveawayUrl: string | null;
};

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

  /**
   * Obtiene juegos gratuitos de Steam desde GamerPower
   * y valida cada candidato directamente contra Steam.
   *
   * GamerPower solamente actúa como fuente de descubrimiento.
   * La decisión final de publicar la toma Steam AppDetails.
   */
  private async fetchFreeToKeepGames(): Promise<SteamFreeGame[]> {
    const candidates = await this.fetchGamerPowerCandidates();

    const games: SteamFreeGame[] = [];
    const seenAppIds = new Set<number>();

    for (const candidate of candidates) {
      try {
        /*
         * Primero intentamos encontrar el AppID directamente
         * en las URLs proporcionadas por GamerPower.
         */
        let appId = this.extractSteamAppId(
          candidate.giveawayUrl,
        );

        /*
         * Si GamerPower no proporciona una URL directa de Steam,
         * buscamos el juego en Steam por nombre.
         */
        if (!appId) {
          appId = await this.resolveSteamAppIdByTitle(
            candidate.title,
          );
        }

        if (!appId || seenAppIds.has(appId)) {
          continue;
        }

        const details = await this.fetchSteamDetails(appId);

        if (!details) {
          continue;
        }

        /*
         * Solo juegos.
         *
         * DLC, demos, software, soundtrack, video, etc.
         * quedan fuera.
         */
        if (details.type && details.type !== "game") {
          continue;
        }

        /*
         * is_free=true significa que el producto es
         * permanentemente gratuito / Free-to-Play.
         *
         * No queremos esos juegos.
         */
        if (details.is_free === true) {
          continue;
        }

        const price = details.price_overview;

        if (!price) {
          continue;
        }

        /*
         * Free-to-Keep:
         *
         * - tenía precio real
         * - ahora cuesta 0
         *
         * Esto descarta juegos F2P y ofertas normales.
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
         * Evitamos publicar algo que GamerPower marque
         * como DLC/loot/beta.
         */
        const externalText = [
          candidate.title,
          candidate.description,
        ]
          .join(" ")
          .toLowerCase();

        if (
          /\b(dlc|downloadable content|soundtrack|season pass|bundle)\b/i.test(
            externalText,
          )
        ) {
          continue;
        }

        /*
         * Si la fuente tiene una fecha de expiración pasada,
         * no publicamos.
         */
        if (
          candidate.expiresAt &&
          this.isPast(candidate.expiresAt)
        ) {
          continue;
        }

        /*
         * La oferta externa identifica la promoción.
         * El AppID forma parte de la clave para evitar colisiones.
         */
        const promotionKey = [
          "gamerpower",
          candidate.externalId,
          appId,
        ].join(":");

        seenAppIds.add(appId);

        games.push({
          appId,
          title: details.name ?? candidate.title,
          promotionKey,
          startedAt: candidate.publishedAt,
          expiresAt: candidate.expiresAt,
          steamUrl:
            `https://store.steampowered.com/app/${appId}/`,
          imageUrl:
            details.header_image ??
            candidate.imageUrl ??
            null,
          originalPrice:
            price.initial_formatted ??
            null,
          currency:
            price.currency ??
            null,
        });
      } catch (error) {
        logger.warn(
          {
            error,
            title: candidate.title,
          },
          "No se pudo validar un candidato de Steam Free",
        );
      }
    }

    return games;
  }

  /**
   * GamerPower:
   *
   * /giveaways?platform=steam&type=game
   *
   * Solo usamos type=game. Aun así validamos posteriormente
   * contra Steam porque GamerPower también puede listar
   * giveaways de keys que no convierten el precio de Steam a 0.
   */
  private async fetchGamerPowerCandidates(): Promise<
    SteamCandidate[]
  > {
    const url = new URL(GAMERPOWER_API_URL);

    url.searchParams.set("platform", "steam");
    url.searchParams.set("type", "game");

    const response = await this.fetchJson<
      GamerPowerGiveaway[]
    >(url);

    if (!Array.isArray(response)) {
      logger.warn(
        "GamerPower no devolvio una lista de giveaways",
      );

      return [];
    }

    const candidates: SteamCandidate[] = [];

    for (const giveaway of response) {
      if (!giveaway.title) {
        continue;
      }

      const platforms =
        giveaway.platforms?.toLowerCase() ?? "";

      if (
        platforms &&
        !platforms.includes("steam")
      ) {
        continue;
      }

      /*
       * Excluir explícitamente beta/playtest.
       */
      if (
        giveaway.type &&
        giveaway.type.toLowerCase() !== "game"
      ) {
        continue;
      }

      const description = [
        giveaway.description ?? "",
        giveaway.instructions ?? "",
      ].join(" ");

      if (
        /\b(beta|playtest|early access)\b/i.test(
          giveaway.title + " " + description,
        )
      ) {
        continue;
      }

      candidates.push({
        externalId:
          giveaway.id !== undefined
            ? String(giveaway.id)
            : this.buildFallbackExternalId(
                giveaway.title,
                giveaway.end_date ?? null,
              ),
        title: giveaway.title,
        description,
        imageUrl:
          giveaway.image ??
          giveaway.thumbnail ??
          null,
        publishedAt:
          this.normalizeDate(
            giveaway.published_date,
          ),
        expiresAt:
          this.normalizeDate(
            giveaway.end_date,
          ),
        giveawayUrl:
          giveaway.open_giveaway_url ??
          giveaway.giveaway_url ??
          null,
      });
    }

    return candidates;
  }

  /**
   * Extrae AppID de URLs Steam.
   */
  private extractSteamAppId(
    value: string | null,
  ): number | null {
    if (!value) {
      return null;
    }

    const patterns = [
      /store\.steampowered\.com\/app\/(\d+)/i,
      /steamcommunity\.com\/app\/(\d+)/i,
      /\/app\/(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = value.match(pattern);

      if (!match?.[1]) {
        continue;
      }

      const appId = Number(match[1]);

      if (
        Number.isInteger(appId) &&
        appId > 0
      ) {
        return appId;
      }
    }

    return null;
  }

  /**
   * Cuando la fuente no trae URL Steam directa,
   * usamos el buscador JSON de Steam.
   */
  private async resolveSteamAppIdByTitle(
    title: string,
  ): Promise<number | null> {
    const cleanTitle = title
      .replace(/\s*\(Steam\)\s*/gi, "")
      .replace(
        /\s*(Steam Key Giveaway|Steam Giveaway|Giveaway)\s*/gi,
        "",
      )
      .trim();

    if (!cleanTitle) {
      return null;
    }

    const url = new URL(
      STEAM_STORE_SEARCH_URL,
    );

    url.searchParams.set(
      "term",
      cleanTitle,
    );
    url.searchParams.set(
      "cc",
      "us",
    );
    url.searchParams.set(
      "l",
      "english",
    );
    url.searchParams.set(
      "start",
      "0",
    );
    url.searchParams.set(
      "count",
      "10",
    );

    const response =
      await this.fetchJson<SteamSearchResponse>(
        url,
      );

    if (
      !Array.isArray(response.items) ||
      response.items.length === 0
    ) {
      return null;
    }

    const normalizedTitle =
      this.normalizeTitle(cleanTitle);

    /*
     * Primero exigimos coincidencia exacta.
     */
    const exact = response.items.find(
      (item) =>
        item.id &&
        item.name &&
        this.normalizeTitle(item.name) ===
          normalizedTitle &&
        (!item.type ||
          item.type === "game"),
    );

    if (exact?.id) {
      return exact.id;
    }

    /*
     * Como segundo intento usamos coincidencia
     * suficientemente cercana.
     */
    const partial = response.items.find(
      (item) =>
        item.id &&
        item.name &&
        (!item.type ||
          item.type === "game") &&
        (
          this.normalizeTitle(item.name).includes(
            normalizedTitle,
          ) ||
          normalizedTitle.includes(
            this.normalizeTitle(item.name),
          )
        ),
    );

    return partial?.id ?? null;
  }

  /**
   * Steam AppDetails es la autoridad final.
   */
  private async fetchSteamDetails(
    appId: number,
  ): Promise<SteamStoreResponse["data"] | null> {
    const url = new URL(
      STEAM_STORE_API_URL,
    );

    url.searchParams.set(
      "appids",
      String(appId),
    );
    url.searchParams.set(
      "cc",
      "us",
    );
    url.searchParams.set(
      "l",
      "english",
    );

    const response =
      await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "application/json",
          referer:
            `https://store.steampowered.com/app/${appId}/`,
        },
        signal:
          AbortSignal.timeout(
            REQUEST_TIMEOUT_MS,
          ),
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

    const channel =
      await this.client.channels
        .fetch(config.channel_id)
        .catch(() => null);

    if (
      !channel ||
      (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      )
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

    const textChannel =
      channel as TextChannel;

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

    const expiresTimestamp =
      promotion.expires_at
        ? Math.floor(
            new Date(
              promotion.expires_at,
            ).getTime() / 1000,
          )
        : null;

    const description = [
      "🔥 **FREE TO KEEP**",
      "",
      "Reclámalo durante la promoción y **se queda permanentemente en tu biblioteca de Steam**.",
      "",
      promotion.original_price
        ? `~~${promotion.original_price}~~ → **GRATIS**`
        : "**GRATIS**",
      "",
      expiresTimestamp
        ? `⏰ **Expira:** <t:${expiresTimestamp}:F> (<t:${expiresTimestamp}:R>)`
        : "⏰ **Promoción temporal de Steam**",
    ].join("\n");

    const embed =
      new EmbedBuilder()
        .setColor(0xf5c518)
        .setTitle(
          `🆓 STEAM GRATIS — ${promotion.title}`,
        )
        .setDescription(description)
        .setFooter({
          text:
            "CB Studios • Steam Free Games",
        })
        .setTimestamp();

    if (promotion.image_url) {
      embed.setImage(
        promotion.image_url,
      );
    }

    const button =
      new ButtonBuilder()
        .setLabel(
          "🎮 RECLAMAR EN STEAM",
        )
        .setStyle(
          ButtonStyle.Link,
        )
        .setURL(
          promotion.steam_url,
        );

    const row =
      new ActionRowBuilder<ButtonBuilder>()
        .addComponents(button);

    const message =
      await textChannel.send({
        embeds: [embed],
        components: [row],
        allowedMentions: {
          parse: [],
        },
      });

    return message.id;
  }

  private async fetchJson<T>(
    url: URL,
  ): Promise<T> {
    const response =
      await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept:
            "application/json,text/plain,*/*",
        },
        signal:
          AbortSignal.timeout(
            REQUEST_TIMEOUT_MS,
          ),
      });

    if (!response.ok) {
      throw new Error(
        `${url.hostname} devolvio HTTP ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }

  private normalizeDate(
    value: string | undefined,
  ): string | null {
    if (!value) {
      return null;
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return null;
    }

    return date.toISOString();
  }

  private isPast(
    value: string,
  ): boolean {
    const timestamp =
      new Date(value).getTime();

    return (
      Number.isFinite(timestamp) &&
      timestamp <= Date.now()
    );
  }

  private normalizeTitle(
    value: string,
  ): string {
    return value
      .normalize("NFKD")
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        " ",
      )
      .trim();
  }

  private buildFallbackExternalId(
    title: string,
    expiresAt: string | null,
  ): string {
    return [
      this.normalizeTitle(title)
        .replace(/\s+/g, "-"),
      expiresAt ?? "unknown",
    ].join(":");
  }
}