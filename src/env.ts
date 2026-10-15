import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { z } from "zod";

expand(config());

const envSchema = z
  .object({
    APP_NAME: z.string().default("nexgen"),
    APP_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_PORT: z.coerce.number().default(3000),
    APP_URL: z.string().trim().default("http://localhost:3000"),
    UI: z
      .string()
      .default("true")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0"),
    FRONTEND_URL: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    DATABASE_URL: z.string().default("sqlite:./src/storage/database/nexgen.sqlite"),
    REDIS: z
      .string()
      .default("false")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0"),
    REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
    REDIS_PREFIX: z
      .string()
      .default("nexgen")
      .transform((value) => value.trim()),
    JWT_ACCESS_SECRET: z.string().trim().optional(),
    JWT_REFRESH_SECRET: z.string().trim().optional(),
    COOKIE_SECRET: z.string().trim().optional(),
    STORAGE_ACCESS_KEY_ID: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    STORAGE_SECRET_ACCESS_KEY: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    MAIL_HOST: z.string().default("127.0.0.1"),
    MAIL_PORT: z.coerce.number().default(1089),
    MAIL_ENCRYPTION: z.enum(["none", "ssl", "tls"]).default("none"),
    MAIL_USERNAME: z.string().default(""),
    MAIL_PASSWORD: z.string().default(""),
    MAIL_FROM_ADDRESS: z.string().default("no-reply@example.com"),
    MAIL_FROM_NAME: z.string().default("IDP"),
    SUPERADMIN_EMAIL: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    SUPERADMIN_PASSWORD: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    SUPERADMIN_NAME: z.string().default("Super Admin"),
    ADMIN_EMAIL: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    ADMIN_PASSWORD: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    ADMIN_NAME: z.string().default("Super Admin"),
    OPEN_API: z
      .string()
      .default("true")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0"),
    SOCKET: z
      .string()
      .default("false")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0"),
    // Rate-limit client-IP trust policy for X-Forwarded-For.
    //   unset    -> auto-detect (trust the header only when the direct peer is a
    //               private/loopback address, i.e. a reverse proxy)
    //   true     -> always trust X-Forwarded-For (must sit behind a proxy)
    //   false    -> never trust it (app is directly exposed)
    // In every mode the LAST (right-most) entry is used, which is the one
    // appended by the nearest proxy and cannot be forged by the client.
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim().toLowerCase();
        if (trimmed === undefined || trimmed === "") return undefined;
        if (trimmed === "true" || trimmed === "1") return true;
        if (trimmed === "false" || trimmed === "0") return false;
        return undefined;
      })
  })
  .superRefine((data, ctx) => {
    // In production the signing/cookie secrets MUST be provided by the real
    // environment. Previously the schema supplied hard-coded defaults, which
    // made the "is required" check below dead code and shipped forgeable
    // secrets to every deployment.
    if (data.APP_ENV !== "production") return;

    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "COOKIE_SECRET"] as const) {
      const value = data[key];
      if (!value || value.length < 32) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be set to a random value of at least 32 characters when APP_ENV=production`
        });
      }
    }
  });

const parsedEnv = envSchema.parse(process.env);

// Development/test fallbacks only. Production is validated above, so these can
// never be used to protect a production instance.
export const env = {
  ...parsedEnv,
  FRONTEND_URL: parsedEnv.FRONTEND_URL,
  JWT_ACCESS_SECRET: parsedEnv.JWT_ACCESS_SECRET || "dev-only-insecure-jwt-access-secret",
  JWT_REFRESH_SECRET: parsedEnv.JWT_REFRESH_SECRET || "dev-only-insecure-jwt-refresh-secret",
  COOKIE_SECRET: parsedEnv.COOKIE_SECRET || "dev-only-insecure-cookie-secret"
};

export type Env = typeof env;
