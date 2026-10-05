import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { getActivityMatrix } from "../controllers/activity-filter.controller.js";
import { QueryActivityFilterSchema } from "../controllers/activity-filter.schema.js";

export const activityFilterRouter = new Hono();

// ── GET ACTIVITY FILTER MATRIX ──────────────────────────────────────
// authMiddleware is required: without it the controller cannot resolve the tenant
// and falls back to adminId 1, which returns zero purchases for every other tenant.
activityFilterRouter.get("/", authMiddleware, zValidator("query", QueryActivityFilterSchema), getActivityMatrix);

export default activityFilterRouter;
