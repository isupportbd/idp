import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";

export class UnauthenticatedTenantError extends Error {
  status = 401;
  constructor(message = "Unauthenticated") {
    super(message);
    this.name = "UnauthenticatedTenantError";
  }
}

export type UserRecord = typeof users.$inferSelect & {
  role?: { id: number; name: string } | null;
};

export interface TenantContext {
  currentUser: UserRecord;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  tenantAdminId: number | null;
  userId: number;
}

export interface HttpError extends Error {
  status?: number;
}

/**
 * Resolves the authenticated user and tenant context from Hono Context.
 * Fails closed (throws UnauthenticatedTenantError) when auth is missing or invalid.
 */
export async function resolveTenantContext(c: Context): Promise<TenantContext> {
  const auth = (c.get("auth" as never) || c.get("user" as never)) as { id?: number | string; role?: string } | undefined;
  if (!auth?.id) {
    throw new UnauthenticatedTenantError();
  }

  const userId = Number(auth.id);
  const currentUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
    with: { role: true }
  });

  if (!currentUser) {
    throw new UnauthenticatedTenantError("User not found");
  }

  const isSuperAdmin = currentUser.role?.name?.toLowerCase() === "superadmin" || auth.role === "superadmin";
  const isTenantAdmin = currentUser.role?.name?.toLowerCase() === "admin" || !currentUser.adminId;
  const tenantAdminId = isSuperAdmin ? null : (currentUser.adminId ? Number(currentUser.adminId) : currentUser.id);

  return {
    currentUser,
    isSuperAdmin,
    isTenantAdmin,
    tenantAdminId,
    userId
  };
}

/**
 * Helper to require a non-null tenantAdminId (throws 403 for superadmin attempting tenant-only action)
 */
export async function requireTenantContext(c: Context): Promise<TenantContext & { tenantAdminId: number }> {
  const ctx = await resolveTenantContext(c);
  if (!ctx.tenantAdminId) {
    const error: HttpError = new Error("Tenant context required");
    error.status = 403;
    throw error;
  }
  return ctx as TenantContext & { tenantAdminId: number };
}

/**
 * Calculates standard statutory submission deadline (15th of next month)
 */
export function getSubmissionDeadline(taxPeriod: string): Date {
  const [y, m] = taxPeriod.split("-").map(Number);
  return new Date(y, m, 15, 23, 59, 59, 999);
}

/**
 * Gets tax period string (YYYY-MM), defaulting to previous calendar month
 */
export function getDefaultTaxPeriod(monthQuery?: string): string {
  if (monthQuery && monthQuery !== "all") {
    return monthQuery;
  }
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Formats standard 8 or 10 digit HS Code with dots (e.g. 7208.39.00)
 */
export function formatStandardHsCode(code: string | null | undefined): string {
  if (!code) return "";
  const clean = String(code).trim();
  if (clean.includes(".")) return clean;
  const digits = clean.replace(/[^0-9a-zA-Z]/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  } else if (digits.length === 10) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8, 10)}`;
  }
  return clean;
}

/**
 * Round numbers to 2 decimal places safely
 */
export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
