import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { getClientLedgerStatement } from "../controllers/client-ledger.controller.js";
import { getStatementReport } from "../controllers/statements.controller.js";

const statementsRouter = createRouter();

// Auth and tenant middleware
statementsRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

// Permitted for reports.view, purchases.view, or tenant admin
const canRead = requirePermission("reports.view", "purchases.view", "statements.view");
const canReadLedger = requirePermission("statements.view", "billing.view", "reports.view");

const getStatementRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Statements"],
  description: "Get client financial and submission statement summary",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Statement data")
  }
});

const getLedgerRoute = createRoute({
  path: "/ledger",
  method: "get",
  tags: ["Statements"],
  description: "Get client billing and payment ledger statement",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Client ledger data")
  }
});

statementsRouter.api(getStatementRoute, [canRead], getStatementReport);
statementsRouter.api(getLedgerRoute, [canReadLedger], getClientLedgerStatement);

export default statementsRouter;
