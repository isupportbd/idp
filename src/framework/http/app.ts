import { createRoute, z } from "@hono/zod-openapi";
import { secureHeaders } from "hono/secure-headers";
import { serveEmojiFavicon } from "stoker/middlewares";
import { appConfig } from "@/config/index.js";
import { corsMiddleware } from "@/framework/http/cors.js";
import { loggerMiddleware, notFound, onError } from "@/framework/http/logger.js";
import { configureOpenApi } from "@/framework/http/openapi.js";
import { rateLimiterMiddleware } from "@/framework/http/ratelimiter.js";
import { createRouter } from "@/framework/http/router.js";
import { hasUiBuild, storageStaticMiddleware } from "@/framework/http/static.js";
import { sessionMiddleware } from "@/framework/session/session.js";

/**
 * Why: Builds the main HTTP app with middleware, health, and error handlers.
 * When: Kernel creates application server instance.
 * Where: Framework bootstrap path.
 * How: Composes router, optional OpenAPI, middleware stack, and fallbacks.
 */
export function createHttpApp() {
  const app = createRouter();

  const healthRoute = createRoute({
    path: "/health",
    method: "get",
    tags: ["System"],
    responses: {
      200: {
        description: "Application health status",
        content: {
          "application/json": {
            schema: z.object({ message: z.string() })
          }
        }
      }
    }
  });

  // Global middleware is registered BEFORE the routes below. In Hono a
  // `use()` only wraps routes registered after it, so previously /health,
  // /doc and /api-docs were registered first and silently bypassed CORS,
  // logging and rate limiting.
  // Security headers (HSTS, X-Content-Type-Options, X-Frame-Options,
  // Referrer-Policy, Permissions-Policy, ...) wrap every response. Registered
  // first so it also decorates error/404 responses. CORP is relaxed to
  // `cross-origin` because the app supports a UI on a different origin that
  // loads public `/storage/*` assets. A strict CSP is intentionally NOT set
  // here (the SPA, Scalar docs and BullBoard rely on inline scripts); see the
  // security notes before enabling one.
  app.use(
    "*",
    secureHeaders({
      crossOriginResourcePolicy: "cross-origin",
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: []
      }
    })
  );
  app.use("*", sessionMiddleware);
  app.use("*", corsMiddleware);
  app.use("*", loggerMiddleware);
  app.use("*", rateLimiterMiddleware);
  app.use("/storage/*", storageStaticMiddleware);
  app.use(serveEmojiFavicon("🚀"));

  if (appConfig.openApiEnabled) {
    configureOpenApi(app);
    app.api(healthRoute, (c: any) => c.json({ message: "Application is healthy" }));
  }

  if (!hasUiBuild()) {
    app.get("/", (c: any) => c.json({ name: appConfig.name, ok: true }));
  }

  if (!appConfig.openApiEnabled) {
    app.get("/health", (c: any) => c.json({ message: "Application is healthy" }));
  }

  app.notFound(notFound);
  app.onError(onError);

  return app;
}
