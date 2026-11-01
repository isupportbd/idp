import { Hono } from "hono";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { getStatementReport } from "../controllers/statements.controller.js";

const statementsRouter = new Hono();

// Auth and tenant middleware
statementsRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

// Permitted for reports.view, purchases.view, or tenant admin
const canRead = requirePermission("reports.view", "purchases.view", "statements.view");

statementsRouter.get("/", canRead, getStatementReport);

export default statementsRouter;
