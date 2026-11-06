import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { users } from "@/modules/auth/database/models/user.js";

// ── 11. LIST ASSIGNABLE USERS ────────────────────────────────────────

export const listAssignableUsers = async (c: AppContext) => {
  try {
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    const adminRoles = await db
      .select({ id: roles.id })
      .from(roles)
      .where(or(eq(roles.name, "admin"), eq(roles.name, "superadmin")));

    const excludeRoleIds = adminRoles.map((r) => r.id);

    const conditions: import("drizzle-orm").SQL[] = [eq(users.status, "active")];

    if (excludeRoleIds.length > 0) {
      conditions.push(sql`${users.roleId} NOT IN (${sql.join(excludeRoleIds, sql`, `)})`);
    }

    if (tenantAdminId && !isSuperAdmin) {
      conditions.push(eq(users.adminId, tenantAdminId));
      conditions.push(ne(users.id, tenantAdminId));
    }

    const list = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(asc(users.name));

    if (typeof c.header === "function") {
      c.header("Cache-Control", "private, max-age=60, stale-while-revalidate=180");
    }
    return c.json({ message: "Users fetched", data: list }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to fetch users" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

function formatStandardBin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 13) {
    return `${digits.slice(0, 9)}-${digits.slice(9, 13)}`;
  }
  return String(raw).trim() || null;
}
