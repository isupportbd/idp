import type { Context, Next } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { loggingConfig } from "@/config/index.js";
import { logger } from "@/framework/support/logger.js";

function ip(c: Context) {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || null;
}

function shouldSkipHttpLog(pathname: string) {
  return pathname.startsWith("/queues");
}

/**
 * Why: Logs each HTTP request with latency and request metadata.
 * When: Applied globally to app routes.
 * Where: HTTP middleware stack.
 * How: Captures start time, assigns request id, logs after downstream response.
 */
export async function loggerMiddleware(c: Context, next: Next) {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  c.set("requestId", requestId);
  await next();

  if (!loggingConfig.httpRequests || shouldSkipHttpLog(c.req.path)) {
    return;
  }

  logger.info("HTTP Request", {
    requestId,
    method: c.req.method,
    path: c.req.path,
    url: c.req.url,
    status: c.res.status,
    duration_ms: Date.now() - start,
    ip: ip(c),
    userAgent: c.req.header("user-agent") || null
  });
}

/**
 * Why: Standard 404 handler with structured log context.
 * When: No route matches request path.
 * Where: App notFound handler registration.
 * How: Emits warning log and returns JSON 404 payload.
 */
export function notFound(c: Context) {
  logger.warn("404 Not Found", {
    requestId: c.get("requestId") || null,
    method: c.req.method,
    path: c.req.path,
    url: c.req.url,
    ip: ip(c),
    userAgent: c.req.header("user-agent") || null
  });

  return c.json({ message: "Not Found" }, 404);
}

/**
 * Why: Centralized unhandled error responder and logger.
 * When: Route/middleware throws uncaught error.
 * Where: App onError handler registration.
 * How: Logs stack + request context and returns status/message JSON.
 */
export function onError(error: unknown, c: Context) {
  const err = error instanceof Error ? error : undefined;
  const statusCandidate = Number((error as { status?: unknown } | null)?.status);
  const errorMessage =
    typeof (error as { message?: unknown } | null)?.message === "string" ? (error as { message: string }).message : undefined;

  logger.error("Unhandled Application Error", {
    requestId: c.get("requestId") || null,
    name: err?.name || "Error",
    message: err?.message ?? errorMessage,
    stack: err?.stack,
    method: c.req.method,
    path: c.req.path,
    url: c.req.url,
    ip: ip(c),
    userAgent: c.req.header("user-agent") || null
  });

  // Only deliberately-authored client errors (4xx) surface their message.
  // Internal failures (5xx) return a generic body so callers never receive
  // database, constraint, filesystem or stack details.
  const status = Number.isFinite(statusCandidate) && statusCandidate >= 400 && statusCandidate <= 599 ? statusCandidate : 500;
  const message = status < 500 ? errorMessage || "Request failed" : "Internal Server Error";

  return c.json({ message }, status as ContentfulStatusCode);
}
