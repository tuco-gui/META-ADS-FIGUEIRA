import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  META_ACCESS_TOKEN: z.string().optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_BUSINESS_ID: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_API_VERSION: z.string().default("v24.0"),
  ADMIN_EMAIL: z.string().email().default("sguilherme@sz4marketing.com"),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  AUTH_COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUDIT_LOG_PATH: z.string().default("./audit.log"),
  META_ALLOW_GEO_FALLBACK_WITHOUT_AUTOMATION: z
    .enum(["true", "false"])
    .default("false")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment: ${parsed.error.message}`);
}

function normalizeAdAccountId(value?: string): string | undefined {
  if (!value) return undefined;
  return value.startsWith("act_") ? value : `act_${value}`;
}

export const env = {
  ...parsed.data,
  META_AD_ACCOUNT_ID: normalizeAdAccountId(parsed.data.META_AD_ACCOUNT_ID),
  META_ALLOW_GEO_FALLBACK_WITHOUT_AUTOMATION:
    parsed.data.META_ALLOW_GEO_FALLBACK_WITHOUT_AUTOMATION === "true",
  AUTH_COOKIE_SECURE: parsed.data.AUTH_COOKIE_SECURE === "true"
};

export function requireEnv(name: keyof typeof env): string {
  const value = env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required environment variable: ${String(name)}`);
  }
  return value;
}
