import { createClient } from "./client.js";
import { env, requireRuntimeSecrets } from "./config/env.js";
import { createContext } from "./context.js";
import { registerEvents } from "./events/index.js";
import { flushLogs, logger } from "./logger.js";

async function main(): Promise<void> {
  requireRuntimeSecrets();

  const client = createClient();
  const context = createContext(client);

  await registerEvents(context);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Cerrando CB Community");

    try {
      await client.destroy();
      context.database.close();
      flushLogs();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (error) => {
    logger.error({ error }, "Unhandled rejection");
  });

  process.on("uncaughtException", (error) => {
    logger.error({ error }, "Uncaught exception");
  });

  await client.login(env.DISCORD_TOKEN);
}

main().catch((error) => {
  logger.fatal({ error }, "No se pudo iniciar CB Community");
  flushLogs();
  process.exit(1);
});