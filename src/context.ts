import type { Client } from "discord.js";
import { loadCommands } from "./commands/index.js";
import { env } from "./config/env.js";
import { Database } from "./database/database.js";
import { AuditEventRepository } from "./repositories/auditEventRepository.js";
import { CaseRepository } from "./repositories/caseRepository.js";
import { GuildConfigRepository } from "./repositories/guildConfigRepository.js";
import { SavedEmbedRepository } from "./repositories/savedEmbedRepository.js";
import { SelfRoleRepository } from "./repositories/selfRoleRepository.js";
import { TicketRepository } from "./repositories/ticketRepository.js";
import { WarningRepository } from "./repositories/warningRepository.js";
import { ConfirmationService } from "./services/confirmationService.js";
import { LogService } from "./services/logService.js";
import { VoiceGeneratorRepository } from "./repositories/voiceGeneratorRepository.js";
import { TempVoiceRepository } from "./repositories/tempVoiceRepository.js";
import { AuditRepository } from "./repositories/auditRepository.js";
import { VoiceLogService } from "./services/voiceLogService.js";
import { VoiceService } from "./modules/voice/voiceService.js";
import { SystemStatusRepository } from "./repositories/systemStatusRepository.js";
import { StatusScheduler } from "./modules/systemStatus/statusScheduler.js";
import type { BotContext } from "./types/context.js";

export function createContext(client: Client): BotContext {
  const database = new Database(env.DATABASE_PATH);
  database.migrate();
  const connection = database.connection();
  const guildConfig = new GuildConfigRepository(connection);
  const auditEvents = new AuditEventRepository(connection);

  const context = {
    client,
    startedAt: new Date(),
    database,
    commands: loadCommands(),
    repositories: {
      guildConfig,
      cases: new CaseRepository(connection),
      warnings: new WarningRepository(connection),
      tickets: new TicketRepository(connection),
      auditEvents,
      savedEmbeds: new SavedEmbedRepository(connection),
      selfRoles: new SelfRoleRepository(connection),
      generators: new VoiceGeneratorRepository(connection),
      tempVoice: new TempVoiceRepository(connection),
      audit: new AuditRepository(connection),
      systemStatus: new SystemStatusRepository(connection),
    },
    services: {
      confirmations: new ConfirmationService(),
      logs: new LogService(client, guildConfig, auditEvents),
      voice: undefined as unknown as VoiceService,
      voiceLogs: new VoiceLogService(client, guildConfig),
      statusScheduler: undefined as unknown as StatusScheduler,
    },
  };
  context.services.voice = new VoiceService(context);
  context.services.statusScheduler = new StatusScheduler(client, context.repositories.systemStatus);
  return context;
}
