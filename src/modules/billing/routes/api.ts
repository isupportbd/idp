import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  listBills,
  getBillDetails,
  createBill,
  batchGenerateBills,
  getMissingBills,
  getClientBillingOverview,
  updateBill,
  deleteBill,
  listCollections,
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

export const billingRouter = new Hono();

// Auth + Subscription + Billing Feature Gate (via subscriptionMiddleware)
// hasAccounts plan check is handled inside subscriptionMiddleware for /billing routes
billingRouter.use("*", authMiddleware, denyRole("superadmin"), subscriptionMiddleware);

// Bills are also read by the collection screens (outstanding dues) and tenant reports.
const BILL_READERS = ["billing.view", "collections.view", "collections.create", "reports.view"];

// ── COLLECTIONS ENDPOINTS (Register before /:id wildcard) ─────────────
billingRouter.get("/collections", requirePermission("collections.view", "reports.view"), zValidator("query", listCollectionsQuerySchema), listCollections);
billingRouter.post("/collections", requirePermission("collections.create"), zValidator("json", createCollectionSchema), createCollection);
billingRouter.delete("/collections/:id", requirePermission("collections.delete"), cancelCollection);

// ── OVERVIEW & MISSING BILLS (Register before /:id wildcard) ──────────
billingRouter.get("/overview", requirePermission(...BILL_READERS), zValidator("query", clientBillingSummaryQuerySchema), getClientBillingOverview);
billingRouter.get("/missing", requirePermission(...BILL_READERS), zValidator("query", listBillsQuerySchema), getMissingBills);

// ── BILL INVOICES ENDPOINTS ──────────────────────────────────────────
billingRouter.get("/", requirePermission(...BILL_READERS), zValidator("query", listBillsQuerySchema), listBills);
billingRouter.post("/", requirePermission("billing.create"), zValidator("json", createBillSchema), createBill);
billingRouter.post("/batch", requirePermission("billing.create"), zValidator("json", batchGenerateBillsSchema), batchGenerateBills);
billingRouter.get("/:id", requirePermission(...BILL_READERS), getBillDetails);
billingRouter.put("/:id", requirePermission("billing.edit"), zValidator("json", updateBillSchema), updateBill);
billingRouter.delete("/:id", requirePermission("billing.delete"), deleteBill);

export default billingRouter;
