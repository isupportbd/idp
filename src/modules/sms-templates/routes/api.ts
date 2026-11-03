import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole, requireRole } from "@/middlewares/role-middleware.js";
import { requireTenantAdmin } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
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
import {
  UpdateTemplateSchema,
  SendTestSmsSchema,
  UpdateGatewaySettingsSchema
} from "../controllers/sms-templates.schema.js";

const smsTemplatesRouter = createRouter();

// ── Gateway settings & actions: tenant admin only ──
const tenantSmsRouter = createRouter();
tenantSmsRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware, requireTenantAdmin);

const getGatewaySettingsRoute = createRoute({
  path: "/gateway",
  method: "get",
  tags: ["SMS - Tenant Gateway"],
  description: "Get tenant SMS gateway settings",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.any() }), "Gateway settings") }
});

const updateGatewaySettingsRoute = createRoute({
  path: "/gateway",
  method: "put",
  tags: ["SMS - Tenant Gateway"],
  description: "Update tenant SMS gateway configuration",
  request: { body: jsonContent(UpdateGatewaySettingsSchema, "Gateway settings payload") },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Settings updated") }
});

const checkGatewayBalanceRoute = createRoute({
  path: "/gateway/balance",
  method: "get",
  tags: ["SMS - Tenant Gateway"],
  description: "Check live SMS gateway balance",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), balance: z.any() }), "Gateway balance") }
});

const sendTestSmsRoute = createRoute({
  path: "/test",
  method: "post",
  tags: ["SMS - Tenant Gateway"],
  description: "Send test SMS via configured gateway",
  request: { body: jsonContent(SendTestSmsSchema, "Test SMS payload") },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "SMS sent") }
});

const listSmsLogsRoute = createRoute({
  path: "/logs",
  method: "get",
  tags: ["SMS - Tenant Logs"],
  description: "List recent tenant SMS delivery logs",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), logs: z.array(z.any()) }), "SMS logs") }
});

tenantSmsRouter.api(getGatewaySettingsRoute, getGatewaySettings);
tenantSmsRouter.api(updateGatewaySettingsRoute, updateGatewaySettings);
tenantSmsRouter.api(checkGatewayBalanceRoute, checkGatewayBalance);
tenantSmsRouter.api(sendTestSmsRoute, sendTestSms);
tenantSmsRouter.api(listSmsLogsRoute, listSmsLogs);

// ── Template management: SuperAdmin only ──
const superAdminSmsRouter = createRouter();
superAdminSmsRouter.use("*", authMiddleware, requireRole("superadmin"));

const listTemplatesRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["SMS - SuperAdmin Templates"],
  description: "List all global master SMS templates",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), templates: z.array(z.any()) }), "Templates list") }
});

const updateTemplateRoute = createRoute({
  path: "/{id}",
  method: "put",
  tags: ["SMS - SuperAdmin Templates"],
  description: "Update global master SMS template",
  request: { body: jsonContent(UpdateTemplateSchema, "Template update payload") },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Template updated") }
});

const resetTemplateRoute = createRoute({
  path: "/{id}/reset",
  method: "post",
  tags: ["SMS - SuperAdmin Templates"],
  description: "Reset global template to system default",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Template reset") }
});

superAdminSmsRouter.api(listTemplatesRoute, listTemplates);
superAdminSmsRouter.api(updateTemplateRoute, updateTemplate);
superAdminSmsRouter.api(resetTemplateRoute, resetTemplate);

smsTemplatesRouter.route("/", tenantSmsRouter);
smsTemplatesRouter.route("/", superAdminSmsRouter);

export default smsTemplatesRouter;
