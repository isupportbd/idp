import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  batchDeletePurchases,
  deletePurchase,
  deletePurchasesByMonth,
  getPurchasesMonths,
  listPurchases,
  updatePurchaseMonth
} from "../controllers/purchases.controller.js";
import {
  batchDeletePurchasesSchema,
  purchasesListResponseSchema,
  updatePurchaseMonthSchema
} from "../controllers/purchases.schema.js";

const purchasesRouter = createRouter();

purchasesRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

const canRead = requirePermission("purchases.view", "reports.view");
const canEdit = requirePermission("purchases.edit");
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

const updatePurchaseMonthRoute = createRoute({
  path: "/{id}/month",
  method: "put",
  tags: ["Purchases"],
  description: "Shift purchase tax period to current or subsequent month",
  request: {
    body: jsonContent(updatePurchaseMonthSchema, "Target tax period (YYYY-MM)")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Month updated successfully"),
    [HttpStatusCodes.BAD_REQUEST]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Invalid target month or backward shift"),
    [HttpStatusCodes.NOT_FOUND]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Purchase not found")
  }
});

purchasesRouter.api(getPurchasesMonthsRoute, [canRead], getPurchasesMonths);
purchasesRouter.api(listPurchasesRoute, [canRead], listPurchases);
purchasesRouter.api(deleteByMonthRoute, [canDelete], deletePurchasesByMonth);
purchasesRouter.api(deletePurchaseRoute, [canDelete], deletePurchase);
purchasesRouter.api(batchDeletePurchasesRoute, [canDelete], batchDeletePurchases);
purchasesRouter.api(updatePurchaseMonthRoute, [canEdit], updatePurchaseMonth);

export default purchasesRouter;
