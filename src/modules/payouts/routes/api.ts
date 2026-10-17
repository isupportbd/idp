import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  createPayout,
  getMyEarnings,
  getPayoutDetail,
  getPayoutMeta,
  getPayoutsDashboard,
  getStaffLedger,
  getUserRates,
  listPayouts,
  saveUserRates
} from "../controllers/payouts.controller.js";
import {
  CreatePayoutSchema,
  IdParamSchema,
  ListPayoutsQuerySchema,
  MonthQuerySchema,
  SaveUserRatesSchema,
  StaffLedgerQuerySchema,
  UserIdParamSchema
} from "../controllers/payouts.schema.js";

const okEnvelope = (description: string) =>
  jsonContent(z.object({ message: z.string(), data: z.any() }), description);

// ── META ─────────────────────────────────────────────────────────────
const metaRoute = createRoute({
  path: "/meta",
  method: "get",
  tags: ["Payouts"],
  description: "Dropdown data for the payouts screens (staff, expense heads, banks, service items)",
  responses: { [HttpStatusCodes.OK]: okEnvelope("Payout metadata") }
});

// ── DASHBOARD ────────────────────────────────────────────────────────
const dashboardRoute = createRoute({
  path: "/",
  method: "get",
  tags: ["Payouts"],
  description: "Payouts dashboard: category totals and per-staff earnings/dues for a month",
  request: { query: MonthQuerySchema },
  responses: { [HttpStatusCodes.OK]: okEnvelope("Payouts dashboard") }
});

// ── LIST ─────────────────────────────────────────────────────────────
const listRoute = createRoute({
  path: "/list",
  method: "get",
  tags: ["Payouts"],
  description: "List recorded payouts and general expenses",
  request: { query: ListPayoutsQuerySchema },
  responses: { [HttpStatusCodes.OK]: okEnvelope("Payouts list") }
});

// ── MY EARNINGS (self-service) ───────────────────────────────────────
const myEarningsRoute = createRoute({
  path: "/me",
  method: "get",
  tags: ["Payouts"],
  description: "The signed-in staff member's own earnings, monthly history and payout log",
  request: { query: MonthQuerySchema },
  responses: { [HttpStatusCodes.OK]: okEnvelope("My earnings") }
});

// ── STAFF LEDGER PREVIEW ─────────────────────────────────────────────
const ledgerRoute = createRoute({
  path: "/ledger",
  method: "get",
  tags: ["Payouts"],
  description: "Resolve a staff member's current bill, previous due/advance and payable for a month",
  request: { query: StaffLedgerQuerySchema },
  responses: { [HttpStatusCodes.OK]: okEnvelope("Staff ledger") }
});

// ── USER RATES ───────────────────────────────────────────────────────
const getUserRatesRoute = createRoute({
  path: "/users/{userId}/rates",
  method: "get",
  tags: ["Payouts"],
  description: "Get a staff member's per-service-item rate card",
  request: { params: UserIdParamSchema },
  responses: { [HttpStatusCodes.OK]: okEnvelope("User rates") }
});

const saveUserRatesRoute = createRoute({
  path: "/users/{userId}/rates",
  method: "post",
  tags: ["Payouts"],
  description: "Save a staff member's per-service-item rate card",
  request: { params: UserIdParamSchema, body: jsonContent(SaveUserRatesSchema, "Rate card payload") },
  responses: { [HttpStatusCodes.OK]: okEnvelope("User rates saved") }
});

// ── CREATE ───────────────────────────────────────────────────────────
const createRoute_ = createRoute({
  path: "/",
  method: "post",
  tags: ["Payouts"],
  description: "Record a staff payout or a general firm expense",
  request: { body: jsonContent(CreatePayoutSchema, "Payout payload") },
  responses: { [HttpStatusCodes.CREATED]: okEnvelope("Payout recorded") }
});

// ── DETAIL ───────────────────────────────────────────────────────────
const detailRoute = createRoute({
  path: "/{id}",
  method: "get",
  tags: ["Payouts"],
  description: "Get a single payout / expense record",
  request: { params: IdParamSchema },
  responses: { [HttpStatusCodes.OK]: okEnvelope("Payout detail") }
});

export default createRouter()
  .group(authMiddleware, denyRole("superadmin"), subscriptionMiddleware)
  .api(metaRoute, [requirePermission("payouts.view")], getPayoutMeta)
  .api(dashboardRoute, [requirePermission("payouts.view")], getPayoutsDashboard)
  .api(listRoute, [requirePermission("payouts.view")], listPayouts)
  .api(myEarningsRoute, [], getMyEarnings)
  .api(ledgerRoute, [requirePermission("payouts.view")], getStaffLedger)
  .api(getUserRatesRoute, [requirePermission("payouts.view")], getUserRates)
  .api(saveUserRatesRoute, [requirePermission("payouts.edit")], saveUserRates)
  .api(createRoute_, [requirePermission("payouts.create")], createPayout)
  .api(detailRoute, [requirePermission("payouts.view")], getPayoutDetail);
