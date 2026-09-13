import { Events } from "discord.js";
import type { BotContext } from "../types/context.js";

export function registerVoiceStateUpdate(context: BotContext): void {
  context.client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    void context.services.voice.handleVoiceStateUpdate(oldState, newState);
  });
}
