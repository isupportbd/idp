import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
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

const getMonthlySummaryRoute = createRoute({
  path: "/monthly-summary",
  method: "get",
  tags: ["Reports"],
  description: "Get monthly purchase and sales summary report",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.any() }), "Monthly summary")
  }
});

const getSalesReportRoute = createRoute({
  path: "/sales",
  method: "get",
  tags: ["Reports"],
  description: "Get sales details report",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.any() }), "Sales report")
  }
});

const getStatementReportRoute = createRoute({
  path: "/statement",
  method: "get",
  tags: ["Reports"],
  description: "Get client balance statement report",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.any() }), "Statement report")
  }
});

reportsRouter.api(getMonthlySummaryRoute, getMonthlySummary);
reportsRouter.api(getSalesReportRoute, getSalesReport);
reportsRouter.api(getStatementReportRoute, getStatementReport);

export default reportsRouter;
