import type { Client, Collection } from "discord.js";
import type { Database } from "../database/database.js";
import type { BotCommand } from "./command.js";
export type { BotCommand } from "./command.js";
import type { GuildConfigRepository } from "../repositories/guildConfigRepository.js";
import type { CaseRepository } from "../repositories/caseRepository.js";
import type { WarningRepository } from "../repositories/warningRepository.js";
import type { TicketRepository } from "../repositories/ticketRepository.js";
import type { AuditEventRepository } from "../repositories/auditEventRepository.js";
import type { SavedEmbedRepository } from "../repositories/savedEmbedRepository.js";
import type { SelfRoleRepository } from "../repositories/selfRoleRepository.js";
import type { ConfirmationService } from "../services/confirmationService.js";
import type { LogService } from "../services/logService.js";
import type { VoiceGeneratorRepository } from "../repositories/voiceGeneratorRepository.js";
import type { TempVoiceRepository } from "../repositories/tempVoiceRepository.js";
import type { AuditRepository } from "../repositories/auditRepository.js";
import type { VoiceService } from "../modules/voice/voiceService.js";
import type { VoiceLogService } from "../services/voiceLogService.js";
import type { SystemStatusRepository } from "../repositories/systemStatusRepository.js";
import type { StatusScheduler } from "../modules/systemStatus/statusScheduler.js";
import type { SteamFreeRepository } from "../repositories/steamFreeRepository.js";
import type { SteamFreeService } from "../services/steamFreeService.js";
import type { SteamFreeScheduler } from "../modules/steamFree/steamFreeScheduler.js";

export interface BotContext {
  client: Client;
  startedAt: Date;
  database: Database;
  commands: Collection<string, BotCommand>;

  repositories: {
    guildConfig: GuildConfigRepository;
    cases: CaseRepository;
    warnings: WarningRepository;
    tickets: TicketRepository;
    auditEvents: AuditEventRepository;
    savedEmbeds: SavedEmbedRepository;
    selfRoles: SelfRoleRepository;
    generators: VoiceGeneratorRepository;
    tempVoice: TempVoiceRepository;
    audit: AuditRepository;
    systemStatus: SystemStatusRepository;
    steamFree: SteamFreeRepository;
  };

  services: {
    confirmations: ConfirmationService;
    logs: LogService;
    voice: VoiceService;
    voiceLogs: VoiceLogService;
    statusScheduler: StatusScheduler;
    steamFree: SteamFreeService;
    steamFreeScheduler: SteamFreeScheduler;
  };
}