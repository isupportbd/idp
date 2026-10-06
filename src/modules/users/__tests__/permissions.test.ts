import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  ALL_PERMISSION_KEYS,
  DEFAULT_SUB_USER_PERMISSIONS,
  PERMISSION_MODULES,
  normalizePermissions
} from "@/modules/users/controllers/permissions.js";
import { requirePermission, requireTenantAdmin } from "@/middlewares/permission-middleware.js";

/**
 * Builds a tiny app where the resolved permissions are injected on the context,
 * so the middleware is tested without touching the database.
 */
function buildApp(resolved: { isTenantAdmin: boolean; keys: string[] } | null) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (resolved) c.set("permissions" as never, resolved as never);
    await next();
  });
  app.get("/clients", requirePermission("clients.view"), (c) => c.json({ ok: true }));
  app.delete("/clients/1", requirePermission("clients.delete"), (c) => c.json({ ok: true }));
  app.get("/bills", requirePermission("billing.view", "collections.view"), (c) => c.json({ ok: true }));
  app.get("/users", requireTenantAdmin, (c) => c.json({ ok: true }));
  return app;
}

describe("users.permissions", () => {
  describe("permission catalog", () => {
    it("uses unique module.action keys", () => {
      expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
      ALL_PERMISSION_KEYS.forEach((key) => expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/));
    });

    it("gives every module a view action", () => {
      PERMISSION_MODULES.forEach((mod) => {
        expect(mod.actions.some((a) => a.key === `${mod.id}.view`)).toBe(true);
      });
    });

    it("defaults new sub-users to view-only keys that exist in the catalog", () => {
      DEFAULT_SUB_USER_PERMISSIONS.forEach((key) => {
        expect(ALL_PERMISSION_KEYS).toContain(key);
        expect(key.endsWith(".view")).toBe(true);
      });
    });
  });

  describe("normalizePermissions", () => {
    it("expands a legacy module id into all of its actions", () => {
      const result = normalizePermissions(["clients"]);
      expect(result).toEqual(
        expect.arrayContaining([
          "clients.view",
          "clients.create",
          "clients.edit",
          "clients.delete",
          "clients.vat_password"
        ])
      );
    });

    it("expands legacy billing into bills and collections", () => {
      const result = normalizePermissions(["billing"]);
      expect(result).toContain("billing.view");
      expect(result).toContain("collections.create");
    });

    it("keeps valid keys, drops unknown ones and duplicates", () => {
      const result = normalizePermissions(["clients.view", "clients.view", "hack.all", "", null]);
      expect(result).toEqual(["clients.view"]);
    });

    it("returns an empty list for non-array input", () => {
      expect(normalizePermissions(null)).toEqual([]);
      expect(normalizePermissions("clients")).toEqual([]);
    });
  });

  describe("requirePermission middleware", () => {
    it("allows a sub-user holding the key", async () => {
      const res = await buildApp({ isTenantAdmin: false, keys: ["clients.view"] }).request("/clients");
      expect(res.status).toBe(200);
    });

    it("blocks a sub-user without the key with 403", async () => {
      const app = buildApp({ isTenantAdmin: false, keys: ["clients.view"] });
      const res = await app.request("/clients/1", { method: "DELETE" });
      expect(res.status).toBe(403);
    });

    it("passes when the user holds any one of several keys", async () => {
      const res = await buildApp({ isTenantAdmin: false, keys: ["collections.view"] }).request("/bills");
      expect(res.status).toBe(200);
    });

    it("always allows the tenant admin", async () => {
      const app = buildApp({ isTenantAdmin: true, keys: [] });
      const res = await app.request("/clients/1", { method: "DELETE" });
      expect(res.status).toBe(200);
    });

    it("returns 401 when no user is resolved", async () => {
      const res = await buildApp(null).request("/clients");
      expect(res.status).toBe(401);
    });
  });

  describe("requireTenantAdmin middleware", () => {
    it("blocks sub-users from team management", async () => {
      const app = buildApp({ isTenantAdmin: false, keys: ALL_PERMISSION_KEYS });
      const res = await app.request("/users");
      expect(res.status).toBe(403);
    });

    it("allows the tenant admin", async () => {
      const res = await buildApp({ isTenantAdmin: true, keys: [] }).request("/users");
      expect(res.status).toBe(200);
    });
  });
});
