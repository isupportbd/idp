import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission, requireTenantAdmin } from "@/middlewares/permission-middleware.js";
import { subscriptionMiddleware } from "@/middlewares/subscription-middleware.js";
import {
  getCompanySettings,
  updateCompanySettings,
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  listExpenseHeads,
  createExpenseHead,
  updateExpenseHead,
  toggleExpenseHead,
  deleteExpenseHead
} from "../controllers/firm.controller.js";
import {
  CompanySettingsSchema,
  CreateBankAccountSchema,
  UpdateBankAccountSchema,
  CreateExpenseHeadSchema,
  UpdateExpenseHeadSchema,
  IdParamSchema
} from "../controllers/firm.schema.js";

// ── COMPANY SETTINGS ROUTES ──────────────────────────────────────────

const getCompanySettingsRoute = createRoute({
  path: "/settings",
  method: "get",
  tags: ["Firm"],
  description: "Get company/firm profile and configuration",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.unknown() }), "Company settings")
  }
});

const putCompanySettingsRoute = createRoute({
  path: "/settings",
  method: "put",
  tags: ["Firm"],
  description: "Update company/firm profile and configuration",
  request: {
    body: jsonContent(CompanySettingsSchema, "Company settings payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.unknown() }), "Updated company settings")
  }
});

// ── BANK ACCOUNTS ROUTES ─────────────────────────────────────────────

const getBankAccountsRoute = createRoute({
  path: "/bank-accounts",
  method: "get",
  tags: ["Firm"],
  description: "List all firm bank & MFS accounts",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.array(z.unknown()) }), "Bank accounts list")
  }
});

const postBankAccountRoute = createRoute({
  path: "/bank-accounts",
  method: "post",
  tags: ["Firm"],
  description: "Create new bank or MFS account",
  request: {
    body: jsonContent(CreateBankAccountSchema, "Bank account payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(z.object({ message: z.string(), data: z.unknown() }), "Created bank account")
  }
});

const patchBankAccountRoute = createRoute({
  path: "/bank-accounts/{id}",
  method: "patch",
  tags: ["Firm"],
  description: "Update bank or MFS account",
  request: {
    params: IdParamSchema,
    body: jsonContent(UpdateBankAccountSchema, "Update bank account payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.unknown() }), "Updated bank account")
  }
});

const deleteBankAccountRoute = createRoute({
  path: "/bank-accounts/{id}",
  method: "delete",
  tags: ["Firm"],
  description: "Delete bank account",
  request: {
    params: IdParamSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string() }), "Deleted bank account response")
  }
});

// ── EXPENSE HEADS ROUTES ─────────────────────────────────────────────

const getExpenseHeadsRoute = createRoute({
  path: "/expense-heads",
  method: "get",
  tags: ["Firm"],
  description: "List all operating expense heads",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.array(z.unknown()) }), "Expense heads list")
  }
});

const postExpenseHeadRoute = createRoute({
  path: "/expense-heads",
  method: "post",
  tags: ["Firm"],
  description: "Create new expense head",
  request: {
    body: jsonContent(CreateExpenseHeadSchema, "Expense head payload")
  },
  responses: {
    [HttpStatusCodes.CREATED]: jsonContent(z.object({ message: z.string(), data: z.unknown() }), "Created expense head")
  }
});

const patchExpenseHeadRoute = createRoute({
  path: "/expense-heads/{id}",
  method: "patch",
  tags: ["Firm"],
  description: "Update expense head",
  request: {
    params: IdParamSchema,
    body: jsonContent(UpdateExpenseHeadSchema, "Update expense head payload")
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.unknown() }), "Updated expense head")
  }
});

const toggleExpenseHeadRoute = createRoute({
  path: "/expense-heads/{id}/toggle",
  method: "patch",
  tags: ["Firm"],
  description: "Toggle expense head active status",
  request: {
    params: IdParamSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.unknown() }), "Toggled expense head status")
  }
});

const deleteExpenseHeadRoute = createRoute({
  path: "/expense-heads/{id}",
  method: "delete",
  tags: ["Firm"],
  description: "Delete expense head",
  request: {
    params: IdParamSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string() }), "Deleted expense head response")
  }
});

// ── ROUTER EXPORT ────────────────────────────────────────────────────

const FIRM_READERS = ["settings.view", "billing.view", "collections.view"];
const FIRM_EDITORS = ["settings.edit"];

export default createRouter()
  .group(authMiddleware, denyRole("superadmin"), subscriptionMiddleware)
  .api(getCompanySettingsRoute, [requirePermission(...FIRM_READERS)], getCompanySettings)
  .api(putCompanySettingsRoute, [requireTenantAdmin], updateCompanySettings)
  .api(getBankAccountsRoute, [requirePermission(...FIRM_READERS)], listBankAccounts)
  .api(postBankAccountRoute, [requireTenantAdmin], createBankAccount)
  .api(patchBankAccountRoute, [requireTenantAdmin], updateBankAccount)
  .api(deleteBankAccountRoute, [requireTenantAdmin], deleteBankAccount)
  .api(getExpenseHeadsRoute, [requirePermission(...FIRM_READERS)], listExpenseHeads)
  .api(postExpenseHeadRoute, [requireTenantAdmin], createExpenseHead)
  .api(patchExpenseHeadRoute, [requireTenantAdmin], updateExpenseHead)
  .api(toggleExpenseHeadRoute, [requireTenantAdmin], toggleExpenseHead)
  .api(deleteExpenseHeadRoute, [requireTenantAdmin], deleteExpenseHead);
