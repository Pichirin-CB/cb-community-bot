import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().default(""),
  DISCORD_CLIENT_ID: z.string().default(""),
  DISCORD_GUILD_ID: z.string().default(""),
  DATABASE_PATH: z.string().default("./data/cb_studios_bot.sqlite"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  COMMAND_DEPLOYMENT_MODE: z.enum(["guild", "global"]).default("guild"),
  ENABLE_MESSAGE_CONTENT_INTENT: z
    .string()
    .default("false")
    .transform((value) => ["1", "true", "yes", "on"].includes(value.toLowerCase())),
  ENABLE_SYSTEM_MONITOR: z.string().default("false").transform((value) => ["1", "true", "yes", "on"].includes(value.toLowerCase())),
  BOT_PRESENCE: z.string().default("CB Studios"),
  STATUS_DEFAULT_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(86400).default(300),
  STATUS_PUBLIC_CPU_WARN: z.coerce.number().int().min(1).max(100).default(85),
  STATUS_PUBLIC_RAM_WARN: z.coerce.number().int().min(1).max(100).default(85),
  STATUS_PUBLIC_DISK_WARN: z.coerce.number().int().min(1).max(100).default(90),
});

const parsed = envSchema.parse(process.env);

const projectRoot = process.cwd();
const databasePath = path.resolve(projectRoot, parsed.DATABASE_PATH);
mkdirSync(path.dirname(databasePath), { recursive: true });
mkdirSync(path.resolve(projectRoot, "logs"), { recursive: true });

export const env = {
  ...parsed,
  PROJECT_ROOT: projectRoot,
  DATABASE_PATH: databasePath,
  LOG_FILE: path.resolve(projectRoot, "logs", "cb_studios_bot.log"),
};

export function requireRuntimeSecrets(): void {
  const missing: string[] = [];
  if (!env.DISCORD_TOKEN) missing.push("DISCORD_TOKEN");
  if (!env.DISCORD_CLIENT_ID) missing.push("DISCORD_CLIENT_ID");
  if (!env.DISCORD_GUILD_ID && env.COMMAND_DEPLOYMENT_MODE === "guild") missing.push("DISCORD_GUILD_ID");

  if (missing.length > 0) {
    throw new Error(`Faltan variables requeridas para iniciar Discord: ${missing.join(", ")}`);
  }
}
