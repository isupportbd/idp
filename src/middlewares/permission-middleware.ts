import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { normalizePermissions } from "@/modules/users/controllers/permissions.js";

type ResolvedPermissions = {
  isTenantAdmin: boolean;
  keys: string[];
};

/**
 * Why: Permissions must be read from the database on every request so that changes made by
 * the tenant admin take effect immediately (JWT payloads can be stale for up to their TTL).
 * How: Loads the current user once per request and caches the result on the context.
 */
export async function resolvePermissions(c: Context): Promise<ResolvedPermissions | null> {
  const cached = c.get("permissions" as never) as ResolvedPermissions | undefined;
  if (cached) return cached;

  const auth = c.get("auth") as { id?: number } | undefined;
  if (!auth?.id) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, Number(auth.id)),
    with: { role: true }
  });
  if (!user) return null;

  // Same tenant-admin definition as framework/utils/tenant-context.ts
  const isTenantAdmin = user.role?.name?.toLowerCase() === "admin" || !user.adminId;
  const resolved: ResolvedPermissions = {
    isTenantAdmin,
    keys: isTenantAdmin ? [] : normalizePermissions(user.permissions)
  };
  c.set("permissions" as never, resolved as never);
  return resolved;
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
