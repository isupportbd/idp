import { cors } from "hono/cors";
import { corsConfig } from "@/config/index.js";
import { parseCsvOrFallback } from "@/framework/support/lifecycle.js";

/** Normalizes an origin for comparison (trims, drops trailing slashes). */
function normalizeOrigin(value?: string | null) {
  return (value || "").trim().replace(/\/+$/, "");
}

const corsOrigins = parseCsvOrFallback(corsConfig.origin, []).map(normalizeOrigin).filter(Boolean);

/**
 * Why: Applies credential-aware CORS policy.
 * When: Global HTTP middleware processing.
 * Where: App middleware stack.
 * How: Reflects the origin only when it is in the configured allow-list (or
 *      when the policy is the explicit "*" wildcard); unknown origins receive
 *      no CORS headers, so the browser blocks the cross-origin read.
 */
export const corsMiddleware = cors({
  origin: (origin) => {
    if (corsConfig.origin.trim() === "*") return origin;
    const normalized = normalizeOrigin(origin);
    return normalized && corsOrigins.includes(normalized) ? origin : undefined;
  },
  credentials: true
});
