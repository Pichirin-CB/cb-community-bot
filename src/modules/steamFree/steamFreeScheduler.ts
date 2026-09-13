import type { Client } from "discord.js";
import type { SteamFreeRepository } from "../../repositories/steamFreeRepository.js";
import type { SteamFreeService } from "../../services/steamFreeService.js";
import { logger } from "../../logger.js";

export class SteamFreeScheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly client: Client,
    private readonly repository: SteamFreeRepository,
    private readonly service: SteamFreeService,
  ) {}

  start(): void {
    this.stop();

    for (const config of this.repository.allEnabled()) {
      this.scheduleGuild(config.guild_id, config.check_interval_minutes);
    }

    logger.info(
      {
        guilds: this.timers.size,
      },
      "Steam Free scheduler iniciado",
    );
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }

    this.timers.clear();

    logger.info("Steam Free scheduler detenido");
  }

  restartGuild(guildId: string): void {
    this.stopGuild(guildId);

    const config = this.repository.get(guildId);

    if (!config?.enabled || !config.channel_id) {
      return;
    }

    this.scheduleGuild(guildId, config.check_interval_minutes);

    logger.info(
      {
        guildId,
        intervalMinutes: config.check_interval_minutes,
      },
      "Steam Free scheduler reiniciado para guild",
    );
  }

  stopGuild(guildId: string): void {
    const timer = this.timers.get(guildId);

    if (!timer) {
      return;
    }

    clearInterval(timer);
    this.timers.delete(guildId);
  }

  async checkNow(guildId: string): Promise<{
    detected: number;
    published: number;
    skipped: number;
  }> {
    return this.service.checkGuild(guildId);
  }

  private scheduleGuild(guildId: string, intervalMinutes: number): void {
    const safeMinutes = Math.max(
      5,
      Math.min(1440, Math.floor(intervalMinutes)),
    );

    const intervalMs = safeMinutes * 60 * 1000;

    const timer = setInterval(() => {
      void this.runGuildCheck(guildId);
    }, intervalMs);

    this.timers.set(guildId, timer);

    void this.runGuildCheck(guildId);
  }

  private async runGuildCheck(guildId: string): Promise<void> {
    const config = this.repository.get(guildId);

    if (!config?.enabled || !config.channel_id) {
      this.stopGuild(guildId);
      return;
    }

    try {
      const result = await this.service.checkGuild(guildId);

      if (result.detected > 0 || result.published > 0) {
        logger.info(
          {
            guildId,
            detected: result.detected,
            published: result.published,
            skipped: result.skipped,
          },
          "Steam Free comprobado",
        );
      }
    } catch (error) {
      logger.error(
        {
          error,
          guildId,
        },
        "Error ejecutando comprobacion programada de Steam Free",
      );
    }
  }
}
