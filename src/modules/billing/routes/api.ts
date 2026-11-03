import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  listBills,
  getBillDetails,
  createBill,
  batchGenerateBills,
  batchGenerateBillsAsync,
  getMissingBills,
  getClientBillingOverview,
  updateBill,
  deleteBill,
  listCollections,
  getCollectionDetails,
  createCollection,
  cancelCollection
} from "../controllers/billing.controller.js";
import {
  createBillSchema,
  batchGenerateBillsSchema,
  updateBillSchema,
  createCollectionSchema,
  listBillsQuerySchema,
  listCollectionsQuerySchema,
  clientBillingSummaryQuerySchema
} from "../controllers/billing.schema.js";

export const billingRouter = createRouter();

// Auth + Subscription + Billing Feature Gate (via subscriptionMiddleware)
// hasAccounts plan check is handled inside subscriptionMiddleware for /billing routes
billingRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

// Bills are also read by the collection screens (outstanding dues) and tenant reports.
const BILL_READERS = ["billing.view", "collections.view", "collections.create", "reports.view"];

// ── COLLECTIONS ROUTE SCHEMAS ─────────────────────────────────────────

const listCollectionsRoute = createRoute({
  path: "/collections",
  method: "get",
  tags: ["Billing - Collections"],
  description: "List payment collections with filters",
  request: { query: listCollectionsQuerySchema },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Collections list") }
});

const getCollectionDetailsRoute = createRoute({
  path: "/collections/{id}",
  method: "get",
  tags: ["Billing - Collections"],
  description: "Get single payment collection details",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Collection details") }
});

const createCollectionRoute = createRoute({
  path: "/collections",
  method: "post",
  tags: ["Billing - Collections"],
  description: "Record a new payment collection",
  request: { body: jsonContent(createCollectionSchema, "Collection payload") },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Collection created") }
});

const cancelCollectionRoute = createRoute({
  path: "/collections/{id}",
  method: "delete",
  tags: ["Billing - Collections"],
  description: "Cancel payment collection receipt",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Cancellation result") }
});

// ── OVERVIEW & MISSING BILLS ROUTE SCHEMAS ────────────────────────────

const overviewRoute = createRoute({
  path: "/overview",
  method: "get",
  tags: ["Billing - Overview"],
  description: "Client billing summary overview",
  request: { query: clientBillingSummaryQuerySchema },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Overview summary") }
});

const missingBillsRoute = createRoute({
  path: "/missing",
  method: "get",
  tags: ["Billing - Invoices"],
  description: "Find clients with pending bills for the month",
  request: { query: listBillsQuerySchema },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Missing bills list") }
});

// ── BILL INVOICES ROUTE SCHEMAS ───────────────────────────────────────

const listBillsRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Billing - Invoices"],
  description: "List monthly bills and invoices",
  request: { query: listBillsQuerySchema },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Bills list") }
});

const createBillRoute = createRoute({
  path: "/",
  method: "post",
  tags: ["Billing - Invoices"],
  description: "Create single client bill invoice",
  request: { body: jsonContent(createBillSchema, "Create bill payload") },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Bill created") }
});

const batchGenerateBillsRoute = createRoute({
  path: "/batch",
  method: "post",
  tags: ["Billing - Invoices"],
  description: "Synchronously batch generate bills for month",
  request: { body: jsonContent(batchGenerateBillsSchema, "Batch bill payload") },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Batch generation result") }
});

const batchGenerateBillsAsyncRoute = createRoute({
  path: "/batch/async",
  method: "post",
  tags: ["Billing - Invoices"],
  description: "Queue batch bill generation job asynchronously",
  request: { body: jsonContent(batchGenerateBillsSchema, "Batch bill payload") },
  responses: { [HttpStatusCodes.ACCEPTED]: jsonContent(z.object({ success: z.boolean(), jobId: z.string() }), "Job queued") }
});

const getBillDetailsRoute = createRoute({
  path: "/{id}",
  method: "get",
  tags: ["Billing - Invoices"],
  description: "Get detailed invoice info with line items and payments",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Bill details") }
});

const updateBillRoute = createRoute({
  path: "/{id}",
  method: "put",
  tags: ["Billing - Invoices"],
  description: "Update existing bill invoice",
  request: { body: jsonContent(updateBillSchema, "Update bill payload") },
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), data: z.unknown() }), "Bill updated") }
});

const deleteBillRoute = createRoute({
  path: "/{id}",
  method: "delete",
  tags: ["Billing - Invoices"],
  description: "Delete bill invoice",
  responses: { [HttpStatusCodes.OK]: jsonContent(z.object({ success: z.boolean(), message: z.string() }), "Deletion result") }
});

// ── BIND ROUTERS WITH CREATE_ROUTE API ────────────────────────────────

billingRouter.api(listCollectionsRoute, [requirePermission("collections.view", "reports.view")], listCollections);
billingRouter.api(getCollectionDetailsRoute, [requirePermission(...BILL_READERS)], getCollectionDetails);
billingRouter.api(createCollectionRoute, [requirePermission("collections.create")], createCollection);
billingRouter.api(cancelCollectionRoute, [requirePermission("collections.delete")], cancelCollection);

billingRouter.api(overviewRoute, [requirePermission(...BILL_READERS)], getClientBillingOverview);
billingRouter.api(missingBillsRoute, [requirePermission(...BILL_READERS)], getMissingBills);

billingRouter.api(listBillsRoute, [requirePermission(...BILL_READERS)], listBills);
billingRouter.api(createBillRoute, [requirePermission("billing.create")], createBill);
billingRouter.api(batchGenerateBillsRoute, [requirePermission("billing.create")], batchGenerateBills);
billingRouter.api(batchGenerateBillsAsyncRoute, [requirePermission("billing.create")], batchGenerateBillsAsync);

billingRouter.api(getBillDetailsRoute, [requirePermission(...BILL_READERS)], getBillDetails);
billingRouter.api(updateBillRoute, [requirePermission("billing.edit")], updateBill);
billingRouter.api(deleteBillRoute, [requirePermission("billing.delete")], deleteBill);

export default billingRouter;
