import { appConfig } from "@/config/index.js";
import { initDatabase } from "@/framework/database/connection.js";
import { createHttpApp } from "@/framework/http/app.js";
import { ensurePublicDir, uiIndexMiddleware, uiStaticMiddleware, hasUiBuild } from "@/framework/http/static.js";
import { registerModuleRoutes } from "@/framework/modules/routes.js";
import { bootQueueJobs } from "@/framework/queue/queue.js";
import { setupQueueDashboard } from "@/framework/queue/ui.js";
import { initRedis } from "@/framework/redis/client.js";
import { storage } from "@/framework/storage/storage.js";

/**
 * Why: Assembles app kernel and boots all framework dependencies.
 * When: HTTP server startup.
 * Where: Called by server runtime entrypoint.
 * How: Initializes storage/db/redis/queues/events/routes and optional UI.
 */
export async function createKernel() {
  await storage.init();

  await initRedis();

  const app = createHttpApp();

  await initDatabase();
  // Fail-fast: schema sync — including the money-column → numeric(14,2)
  // migration — must succeed before we serve any traffic. If it throws, we
  // propagate so boot aborts instead of running against a corrupt or
  // half-migrated schema. server.ts calls createKernel() at top level, so an
  // unhandled rejection exits the process non-zero (verified exit code 1),
  // which fails the container start and lets Coolify keep the previous
  // healthy deployment.
  const { syncDatabaseSchemaAndSuperAdmin } = await import("@/database/sync.js");
  await syncDatabaseSchemaAndSuperAdmin();
  await bootQueueJobs();
  await registerModuleRoutes(app);

  const queueDashboard = await setupQueueDashboard();
  if (typeof queueDashboard.route === "function") {
    queueDashboard.route(app);
  } else {
    app.route(queueDashboard.basePath, queueDashboard.route);
  }

  if (appConfig.uiEnabled) {
    ensurePublicDir();
  }

  if (appConfig.uiEnabled && hasUiBuild()) {
    app.use("/*", uiStaticMiddleware);
    app.get("/*", uiIndexMiddleware);
  }

  return { app, bullBoard: queueDashboard };
}
