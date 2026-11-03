import { createRouter } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  getMonthlySummary,
  getSalesReport,
  getStatementReport
} from "../controllers/reports.controller.js";

const reportsRouter = createRouter();

reportsRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware, requirePermission("reports.view"));

reportsRouter.get("/monthly-summary", getMonthlySummary);
reportsRouter.get("/sales", getSalesReport);
reportsRouter.get("/statement", getStatementReport);

export default reportsRouter;
