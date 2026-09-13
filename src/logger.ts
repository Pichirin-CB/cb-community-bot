import pino from "pino";
import { env } from "./config/env.js";

export const logger = pino(
  {
    level: env.LOG_LEVEL,
    redact: {
      paths: ["DISCORD_TOKEN", "token", "*.token", "authorization", "*.authorization"],
      censor: "[redacted]",
    },
    base: {
      app: "cb-studios-bot",
      env: env.NODE_ENV,
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  },
  pino.destination({ dest: env.LOG_FILE, sync: true, mkdir: true }),
);

export function flushLogs(): void {
  try {
    logger.flush();
  } catch {
    // El logger puede no tener buffer inicializado durante fallos muy tempranos.
  }
}
