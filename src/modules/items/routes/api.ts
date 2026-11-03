import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import { getItems, bulkCreateItems } from "../controllers/items.controller.js";
import { bulkCreateItemsSchema } from "../controllers/items.schema.js";

const itemsRouter = createRouter();

itemsRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

const getItemsRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Items"],
  description: "Get all global HS items",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.array(z.any()) }), "Items list")
  }
});

const bulkCreateItemsRoute = createRoute({
  path: "/bulk",
  method: "post",
  tags: ["Items"],
  description: "Bulk create items with standard HS code resolution",
  request: {
    body: jsonContent(bulkCreateItemsSchema, "Bulk items payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string(), inserted: z.array(z.any()).optional() }), "Bulk creation result")
  }
});

itemsRouter.api(getItemsRoute, [requirePermission("purchases.view", "sales_rates.view", "reports.view")], getItems);
itemsRouter.api(bulkCreateItemsRoute, [requirePermission("purchases.create", "sales_rates.create")], bulkCreateItems);

export default itemsRouter;
