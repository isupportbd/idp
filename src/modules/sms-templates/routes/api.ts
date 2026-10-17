import type { Context, Next } from "hono";
import { createRouter } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import {
  listTemplates,
  updateTemplate,
  resetTemplate,
  sendTestSms,
  listSmsLogs,
  getGatewaySettings,
  updateGatewaySettings,
  checkGatewayBalance
} from "../controllers/sms-templates.controller.js";

const smsTemplatesRouter = createRouter();

/**
 * SuperAdmin only — global master template management.
 * Admin/Staff are blocked from editing the master template defaults.
 */
async function superAdminOnlyMiddleware(c: Context, next: Next) {
  const auth = c.get("auth") || c.get("user") || (c.req as any).user;
  const roleName = typeof auth?.role === "string" ? auth.role : auth?.role?.name;
  if (roleName !== "superadmin") {
    return c.json({ success: false, message: "Forbidden: Super Admin access only" }, 403);
  }
  return await next();
}

/**
 * Block regular staff/sub-users from accessing SMS gateway management.
 * Allow: superadmin OR tenant admin (role === 'admin').
 * Block: staff/sub-users (role !== 'admin').
 */
async function blockStaffMiddleware(c: Context, next: Next) {
  const auth = c.get("auth") || c.get("user") || (c.req as any).user;
  const roleName = typeof auth?.role === "string" ? auth.role.toLowerCase() : auth?.role?.name?.toLowerCase();
  const isSuperAdmin = roleName === "superadmin";
  const isTenantAdmin = roleName === "admin";
  if (isSuperAdmin || isTenantAdmin) {
    return await next();
  }
  return c.json({ success: false, message: "Forbidden: Insufficient permissions" }, 403);
}

/**
 * Authenticated users.
 * Each user sees only their own tenant's data via resolveTenantAdminId() in the controller.
 * - SuperAdmin: adminId = null — global gateway & templates
 * - Admin: adminId = user.id — own gateway & templates
 * - Staff: blocked from gateway management
 */
smsTemplatesRouter.use("*", authMiddleware);

// ── Gateway settings & actions: superadmin and tenant admin only ──
// Controller isolates data per tenant via resolveTenantAdminId()
smsTemplatesRouter.get("/gateway", blockStaffMiddleware, getGatewaySettings);
smsTemplatesRouter.put("/gateway", blockStaffMiddleware, updateGatewaySettings);
smsTemplatesRouter.get("/gateway/balance", blockStaffMiddleware, checkGatewayBalance);
smsTemplatesRouter.post("/test", blockStaffMiddleware, sendTestSms);
smsTemplatesRouter.get("/logs", blockStaffMiddleware, listSmsLogs);

// ── Template management: SuperAdmin only ──────────────────────────────────
// Admins use global templates for SMS sending; they do NOT manage templates.
smsTemplatesRouter.get("/", superAdminOnlyMiddleware, listTemplates);
smsTemplatesRouter.put("/:id", superAdminOnlyMiddleware, updateTemplate);
smsTemplatesRouter.post("/:id/reset", superAdminOnlyMiddleware, resetTemplate);

export default smsTemplatesRouter;
