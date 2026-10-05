import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { jwt } from "@/framework/facade.js";
import superAdminRouter from "@/modules/superadmin/routes/api.js";

/**
 * Route-guard tests for the superadmin module.
 * Only checks the auth/role layer: every request here is rejected before a controller runs,
 * so no database rows are touched.
 */
describe("superadmin.route-guards", () => {
  const app = new Hono().route("/api/superadmin", superAdminRouter);

  const tokenFor = async (role: string) => {
    const { token } = await jwt.generateToken({ id: 999999, email: `${role}@test.com`, adminId: null, roleId: null, role }, "access");
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
      headers: await tokenFor("admin")
    });
    expect(res.status).toBe(403);
  });

  it("protects /metrics for superadmin only", async () => {
    expect((await app.request("/api/superadmin/metrics")).status).toBe(401);
    expect((await app.request("/api/superadmin/metrics", { headers: await tokenFor("admin") })).status).toBe(403);
  });

  it("requires login for master-data reads", async () => {
    for (const path of ["column-mappings", "global-items", "unit-conversions", "references", "client-types"]) {
      const res = await app.request(`/api/superadmin/${path}`);
      expect(res.status).toBe(401);
    }
  });
});
