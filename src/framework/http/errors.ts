import type { Context } from "hono";

export type ControllerErrorOptions = {
  /** Response field carrying the message. Some modules use "message", not "error". */
  field?: "error" | "message";
  /** Adds `success: false` (the upload module's error shape). */
  success?: boolean;
  /**
   * Surface the thrown error's own message. Defaults to `false` on purpose: this
   * codebase deliberately returns generic messages (the Phase-2 audit removed
   * every `err.message` leak). Only turn this on deliberately for a non-prod
   * endpoint — never for API responses facing users.
   */
  detail?: boolean;
};

function resolveMessage(err: unknown, fallback: string, detail: boolean): string {
  if (!detail) return fallback;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.length > 0) return err;
  return fallback;
}

/**
 * Why: Single place for controller error -> HTTP response mapping.
 * When: Any handler catch block.
 * Where: Module controllers.
 * How: Builds the module's existing error shape so adoption is behavior
 *      neutral. By default it returns ONLY the generic fallback message (no
 *      `err.message` leak), matching current controllers byte-for-byte.
 *
 *      billing   -> handleControllerError(c, err, "Failed to create bill", { field: "message" })
 *                   => { message: "Failed to create bill" }, 500
 *      upload    -> handleControllerError(c, err, "Failed to save purchases", { field: "message", success: false })
 *                   => { success: false, message: "Failed to save purchases" }, 500
 *      default   -> handleControllerError(c, err, "Something failed")
 *                   => { error: "Something failed" }, 500
 */
export function handleControllerError(
  c: Context,
  err: unknown,
  fallback = "Internal server error",
  opts: ControllerErrorOptions = {}
): Response {
  const field = opts.field ?? "error";
  const body: Record<string, unknown> = { [field]: resolveMessage(err, fallback, opts.detail === true) };
  if (opts.success !== undefined) body.success = opts.success;
  return c.json(body, 500);
}

export function badRequest(c: Context, error = "Bad request"): Response {
  return c.json({ error }, 400);
}

export function unauthorized(c: Context, error = "Unauthorized"): Response {
  return c.json({ error }, 401);
}

export function forbidden(c: Context, error = "Forbidden"): Response {
  return c.json({ error }, 403);
}

export function notFound(c: Context, error = "Not found"): Response {
  return c.json({ error }, 404);
}

export function conflict(c: Context, error = "Conflict"): Response {
  return c.json({ error }, 409);
}

export function serviceUnavailable(c: Context, error = "Service unavailable"): Response {
  return c.json({ error }, 503);
}
