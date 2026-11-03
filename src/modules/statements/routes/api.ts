import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { getStatementReport } from "../controllers/statements.controller.js";

const statementsRouter = createRouter();

// Auth and tenant middleware
statementsRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

// Permitted for reports.view, purchases.view, or tenant admin
const canRead = requirePermission("reports.view", "purchases.view", "statements.view");

const getStatementRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Statements"],
  description: "Get client financial and submission statement summary",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.any() }), "Statement data")
  }
});

statementsRouter.api(getStatementRoute, [canRead], getStatementReport);

export default statementsRouter;
