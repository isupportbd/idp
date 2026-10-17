import { describe, expect, it, beforeAll } from "vitest";
import { Hono } from "hono";
import { db, jwt } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { initDatabase } from "@/framework/database/connection.js";
import superAdminRouter from "@/modules/superadmin/routes/api.js";

/**
 * Route-guard tests for the superadmin module.
 * Only checks the auth/role layer: every request here is rejected before a controller runs.
 *
 * NOTE: `authMiddleware` resolves the caller's role from the DATABASE (not from the
 * token payload), so the tokens below must reference real users: a platform
 * superadmin and a tenant admin. Otherwise both tokens would resolve to the same
 * database user and the tenant-admin assertions would be meaningless.
 */
describe("superadmin.route-guards", () => {
  const app = new Hono().route("/api/superadmin", superAdminRouter);
  let superAdminUserId = 1;
  let tenantAdminUserId = 1;

  beforeAll(async () => {
    await initDatabase();
    const all = await db.query.users.findMany({ with: { role: true }, limit: 200 });
    const superAdmin = all.find((u) => u.role?.name === "superadmin");
    const tenantAdmin = all.find((u) => u.role?.name === "admin" && u.adminId != null);
    if (superAdmin) superAdminUserId = superAdmin.id;
    if (tenantAdmin) tenantAdminUserId = tenantAdmin.id;
  });

  /** Builds a bearer header whose user resolves to the requested DB identity. */
  const tokenFor = async (identity: "superadmin" | "tenant") => {
    const isSuperAdmin = identity === "superadmin";
    const { token } = await jwt.generateToken(
      {
        id: isSuperAdmin ? superAdminUserId : tenantAdminUserId,
        email: `${identity}@test.com`,
        adminId: isSuperAdmin ? null : tenantAdminUserId,
        roleId: null,
        role: isSuperAdmin ? "superadmin" : "admin"
      },
      "access"
    );
    return { Authorization: `Bearer ${token}` };
  };

  it("rejects unauthenticated recharge approve/reject via /transactions/:id", async () => {
    const approve = await app.request("/api/superadmin/transactions/1/approve", { method: "POST" });
    const reject = await app.request("/api/superadmin/transactions/1/reject", { method: "POST" });
    expect(approve.status).toBe(401);
    expect(reject.status).toBe(401);
  });

  it("rejects tenant admins on /transactions/:id/approve", async () => {
    const res = await app.request("/api/superadmin/transactions/1/approve", {
      method: "POST",
      headers: await tokenFor("tenant")
    });
    expect(res.status).toBe(403);
  });

  it("protects /metrics for superadmin only", async () => {
    expect((await app.request("/api/superadmin/metrics")).status).toBe(401);
    expect(
      (await app.request("/api/superadmin/metrics", { headers: await tokenFor("tenant") })).status
    ).toBe(403);
  });

  it("requires login for master-data reads", async () => {
    for (const path of ["column-mappings", "global-items", "unit-conversions", "references", "client-types"]) {
      const res = await app.request(`/api/superadmin/${path}`);
      expect(res.status).toBe(401);
    }
  });
});
