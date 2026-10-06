import { Hono } from "hono";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  listPurchases,
  deletePurchase,
  batchDeletePurchases,
  deletePurchasesByMonth,
  getPurchasesMonths
} from "../controllers/purchases.controller.js";

const purchasesRouter = new Hono();

purchasesRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

const canRead = requirePermission("purchases.view", "reports.view");
const canDelete = requirePermission("purchases.delete");

purchasesRouter.get("/months", canRead, getPurchasesMonths);
purchasesRouter.get("/", canRead, listPurchases);
purchasesRouter.delete("/month/:month", canDelete, deletePurchasesByMonth);
purchasesRouter.delete("/:id", canDelete, deletePurchase);
purchasesRouter.post("/batch-delete", canDelete, batchDeletePurchases);

export default purchasesRouter;

