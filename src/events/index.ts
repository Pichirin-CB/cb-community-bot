import type { BotContext } from "../types/context.js";
import { registerInteractionCreate } from "./interactionCreate.js";
import { registerMemberEvents } from "./members.js";
import { registerMessageEvents } from "./messages.js";
import { registerReady } from "./ready.js";
import { registerVoiceStateUpdate } from "./voiceStateUpdate.js";

export async function registerEvents(context: BotContext): Promise<void> {
  await registerReady(context);
  registerInteractionCreate(context);
  registerMemberEvents(context);
  registerMessageEvents(context);
  registerVoiceStateUpdate(context);
}
