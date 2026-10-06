import { Hono } from "hono";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { getItems, bulkCreateItems } from "../controllers/items.controller.js";

const itemsRouter = new Hono();

itemsRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

itemsRouter.get("/", requirePermission("purchases.view", "sales_rates.view", "reports.view"), getItems);
itemsRouter.post("/bulk", requirePermission("purchases.create", "sales_rates.create"), bulkCreateItems);

export default itemsRouter;
