import { createRouter } from "@/framework/facade.js";
import { zValidator } from "@hono/zod-validator";
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

tenantSmsRouter.get("/gateway", getGatewaySettings);
tenantSmsRouter.put("/gateway", zValidator("json", UpdateGatewaySettingsSchema), updateGatewaySettings);
tenantSmsRouter.get("/gateway/balance", checkGatewayBalance);
tenantSmsRouter.post("/test", zValidator("json", SendTestSmsSchema), sendTestSms);
tenantSmsRouter.get("/logs", listSmsLogs);

// ── Template management: SuperAdmin only ──
const superAdminSmsRouter = createRouter();
superAdminSmsRouter.use("*", authMiddleware, requireRole("superadmin"));

superAdminSmsRouter.get("/", listTemplates);
superAdminSmsRouter.put("/:id", zValidator("json", UpdateTemplateSchema), updateTemplate);
superAdminSmsRouter.post("/:id/reset", resetTemplate);

smsTemplatesRouter.route("/", tenantSmsRouter);
smsTemplatesRouter.route("/", superAdminSmsRouter);

export default smsTemplatesRouter;
