import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
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
import { batchDeletePurchasesSchema, purchasesListResponseSchema } from "../controllers/purchases.schema.js";

const purchasesRouter = createRouter();

purchasesRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

const canRead = requirePermission("purchases.view", "reports.view");
const canDelete = requirePermission("purchases.delete");

const getPurchasesMonthsRoute = createRoute({
  path: "/months",
  method: "get",
  tags: ["Purchases"],
  description: "Get distinct months with purchase records",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.array(z.string()) }), "Months list")
  }
});

const listPurchasesRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Purchases"],
  description: "List purchases filtered by month, client, etc.",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(purchasesListResponseSchema, "Purchases list")
  }
});

const deleteByMonthRoute = createRoute({
  path: "/month/{month}",
  method: "delete",
  tags: ["Purchases"],
  description: "Delete all purchases for a specific month",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Deletion result")
  }
});

const deletePurchaseRoute = createRoute({
  path: "/{id}",
  method: "delete",
  tags: ["Purchases"],
  description: "Delete single purchase record",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Deletion result")
  }
});

const batchDeletePurchasesRoute = createRoute({
  path: "/batch-delete",
  method: "post",
  tags: ["Purchases"],
  description: "Batch delete purchase records",
  request: {
    body: jsonContent(batchDeletePurchasesSchema, "Batch delete criteria")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Batch deletion result")
  }
});

purchasesRouter.api(getPurchasesMonthsRoute, [canRead], getPurchasesMonths);
purchasesRouter.api(listPurchasesRoute, [canRead], listPurchases);
purchasesRouter.api(deleteByMonthRoute, [canDelete], deletePurchasesByMonth);
purchasesRouter.api(deletePurchaseRoute, [canDelete], deletePurchase);
purchasesRouter.api(batchDeletePurchasesRoute, [canDelete], batchDeletePurchases);

export default purchasesRouter;

