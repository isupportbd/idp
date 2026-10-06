import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { getActivityMatrix } from "../controllers/activity-filter.controller.js";
import { QueryActivityFilterSchema } from "../controllers/activity-filter.schema.js";

// ── 1. GET ACTIVITY FILTER MATRIX ────────────────────────────────────
// authMiddleware is required: without it the controller cannot resolve the tenant
// and falls back to adminId 1, which returns zero purchases for every other tenant.

const getActivityMatrixRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Activity Filter"],
  description: "Monthly client purchase activity matrix with submission status",
  request: {
    query: QueryActivityFilterSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.any(), "Activity matrix dataset")
  }
});

export const activityFilterRouter = createRouter()
  .group(authMiddleware, denyRole("superadmin"), subscriptionMiddleware)
  .api(getActivityMatrixRoute, [requirePermission("activity_filter.view")], getActivityMatrix);

export default activityFilterRouter;
