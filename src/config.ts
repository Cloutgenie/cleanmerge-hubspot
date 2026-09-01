import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url(),
  HUBSPOT_CLIENT_ID: z.string().min(1),
  HUBSPOT_CLIENT_SECRET: z.string().min(1),
  HUBSPOT_REDIRECT_URI: z.string().url(),
  HUBSPOT_SCOPES: z.string().default("automation"),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  DATABASE_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = schema.parse(env);
  if (config.NODE_ENV === "production" && (!config.DATABASE_URL || !config.TOKEN_ENCRYPTION_KEY)) {
    throw new Error("DATABASE_URL and TOKEN_ENCRYPTION_KEY are required in production");
  }
  return config;
}
