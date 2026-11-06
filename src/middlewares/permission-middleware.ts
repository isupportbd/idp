import type { Context, Next } from "hono";
import { resolveTenantContext } from "@/framework/utils/tenant-context.js";
import { normalizePermissions } from "@/modules/users/controllers/permissions.js";

type ResolvedPermissions = {
  isTenantAdmin: boolean;
  keys: string[];
};

/**
 * Why: Permissions must be read from the database on every request so that changes made by
 * the tenant admin take effect immediately (JWT payloads can be stale for up to their TTL).
 * How: Reuses the tenant context cache and caches the resolved permissions on the request context.
 */
export async function resolvePermissions(c: Context): Promise<ResolvedPermissions | null> {
  const cached = typeof c.get === "function" ? (c.get("permissions" as never) as ResolvedPermissions | undefined) : undefined;
  if (cached) return cached;

  const auth = (typeof c.get === "function" ? c.get("auth" as never) || c.get("user" as never) : undefined) as { id?: number } | undefined;
  if (!auth?.id) return null;

  try {
    const ctx = await resolveTenantContext(c);
    const resolved: ResolvedPermissions = {
      isTenantAdmin: ctx.isTenantAdmin,
      keys: ctx.isTenantAdmin ? [] : normalizePermissions(ctx.currentUser.permissions)
    };
    if (typeof c.set === "function") {
      c.set("permissions" as never, resolved as never);
    }
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Why: Lets controllers hide sensitive fields (e.g. VAT passwords) per permission.
 * How: Tenant admins always pass; sub-users pass when they hold the key.
 */
export async function hasPermission(c: Context, key: string): Promise<boolean> {
  const resolved = await resolvePermissions(c);
  if (!resolved) return false;
  return resolved.isTenantAdmin || resolved.keys.includes(key);
}

/**
 * Why: Enforces sub-user module/action permissions on the backend, not just in the UI.
 * When: Per route, after authMiddleware.
 * How: Passes if the user is the tenant admin or holds ANY of the given permission keys
 *      (read endpoints shared by several pages list every module that consumes them).
 */
export function requirePermission(...keys: string[]) {
  return async (c: Context, next: Next) => {
    const resolved = await resolvePermissions(c);
    if (!resolved) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    if (resolved.isTenantAdmin || keys.some((key) => resolved.keys.includes(key))) {
      return await next();
    }
    return c.json({ message: "Forbidden: You do not have permission for this action" }, 403);
  };
}

/**
 * Why: Team management (sub-users, client assignments) belongs to the firm owner only;
 * otherwise a sub-user could grant themselves extra permissions.
 */
export async function requireTenantAdmin(c: Context, next: Next) {
  const resolved = await resolvePermissions(c);
  if (!resolved) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  if (!resolved.isTenantAdmin) {
    return c.json({ message: "Forbidden: Only the firm admin can manage team members" }, 403);
  }
  return await next();
}
