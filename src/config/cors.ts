import { env } from "@/env.js";

/**
 * Why: CORS policy for the HTTP server.
 * When: Global CORS middleware processes cross-origin requests.
 * Where: src/config/cors.ts.
 * How: `origin` is a comma-separated allow-list built from the deployment's
 *      own origins (`FRONTEND_URL` when the UI is separate, plus `APP_URL`).
 *      It intentionally defaults to those origins rather than "*": reflecting
 *      any origin while `credentials: true` would let any website issue
 *      authenticated cross-origin requests. Same-origin deployments need no
 *      CORS entries at all. Set `origin` to "*" explicitly only for a trusted,
 *      throwaway environment.
 */
export const corsConfig = {
  origin:
    [env.FRONTEND_URL, env.APP_URL]
      .map((value) => (value || "").trim())
      .filter(Boolean)
      .join(",") || "*"
};

export type CorsConfig = typeof corsConfig;
