import type { Context } from "hono";

/**
 * Shape written by authMiddleware via `c.set("auth", {...})`.
 * There is no separate `tenantId` / `adminId` / `userId` key on the context —
 * all three are derived from this payload.
 */
export type AuthPayload = {
  id?: number | string | null;
  email?: string | null;
  name?: string | null;
  adminId?: number | string | null;
  roleId?: number | string | null;
  role?: string | null;
  type?: string | null;
  [key: string]: unknown;
};

export type RequestTenantContext = {
  /** Acting tenant's admin id (`auth.adminId ?? auth.id`). */
  tenantId: number | null;
  /** Present only for sub-users; equals `auth.adminId`. */
  adminId: number | null;
  /** Authenticated user id (`auth.id`). */
  userId: number | null;
  /** Raw auth payload (null when unauthenticated). */
  auth: AuthPayload | null;
  /** Role name as stored on the token (no DB lookup). */
  role: string | null;
  /** Cheap superadmin flag derived from the token role only. */
  isSuperAdmin: boolean;
};

function toId(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Why: Lightweight, synchronous tenant/actor resolution for controllers.
 * When: A handler needs userId/adminId/tenantId without a DB round-trip.
 * Where: Controllers, async-endpoint factories, job enqueueing.
 * How: Reads `c.get("auth")`, falling back to the legacy `c.get("user")`.
 *      Unlike `resolveTenantContext` (async, DB-backed, returns `currentUser`
 *      + role), this performs no queries — use it when the token payload is
 *      enough. Never removes or replaces `resolveTenantContext`.
 */
export function getTenantContext(c: Context): RequestTenantContext {
  const auth = ((c.get?.("auth") as AuthPayload | undefined) || (c.get?.("user") as AuthPayload | undefined) || null) as AuthPayload | null;

  const userId = toId(auth?.id);
  const adminId = toId(auth?.adminId);
  const tenantId = adminId ?? userId;
  const role = auth?.role ? String(auth.role) : null;

  return {
    tenantId,
    adminId,
    userId,
    auth,
    role,
    isSuperAdmin: role?.toLowerCase() === "superadmin"
  };
}
