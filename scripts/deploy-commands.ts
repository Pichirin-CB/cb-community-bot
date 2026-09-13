import { REST, Routes } from "discord.js";
import { commandJson } from "../src/commands/index.js";
import { env, requireRuntimeSecrets } from "../src/config/env.js";

requireRuntimeSecrets();

const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
const body = commandJson();

if (env.COMMAND_DEPLOYMENT_MODE === "global") {
  await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body });
  console.log(`Comandos globales registrados: ${body.length}`);
} else {
  await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), { body });
  console.log(`Comandos de guild registrados: ${body.length}`);
}
