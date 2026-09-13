import type { BotCommand } from "../../types/command.js";
import { statusCommand } from "./status.js";
import { statusChannelCommand } from "./statusChannel.js";
import { statusLoopCommand } from "./statusLoop.js";

export const monitoringCommands: BotCommand[] = [statusCommand, statusChannelCommand, statusLoopCommand];
