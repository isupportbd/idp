import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { denyRole } from "@/middlewares/role-middleware.js";
import { requirePermission } from "@/middlewares/permission-middleware.js";
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
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.any() }), "Company settings")
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
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.any() }), "Updated company settings")
  }
});

// ── BANK ACCOUNTS ROUTES ─────────────────────────────────────────────

const getBankAccountsRoute = createRoute({
  path: "/bank-accounts",
  method: "get",
  tags: ["Firm"],
  description: "List all firm bank & MFS accounts",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.array(z.any()) }), "Bank accounts list")
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
    [HttpStatusCodes.CREATED]: jsonContent(z.object({ message: z.string(), data: z.any() }), "Created bank account")
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
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.any() }), "Updated bank account")
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
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.array(z.any()) }), "Expense heads list")
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
    [HttpStatusCodes.CREATED]: jsonContent(z.object({ message: z.string(), data: z.any() }), "Created expense head")
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
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.any() }), "Updated expense head")
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
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.any() }), "Toggled expense head status")
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
  .api(putCompanySettingsRoute, [requirePermission(...FIRM_EDITORS)], updateCompanySettings)
  .api(getBankAccountsRoute, [requirePermission(...FIRM_READERS)], listBankAccounts)
  .api(postBankAccountRoute, [requirePermission(...FIRM_EDITORS)], createBankAccount)
  .api(patchBankAccountRoute, [requirePermission(...FIRM_EDITORS)], updateBankAccount)
  .api(deleteBankAccountRoute, [requirePermission(...FIRM_EDITORS)], deleteBankAccount)
  .api(getExpenseHeadsRoute, [requirePermission(...FIRM_READERS)], listExpenseHeads)
  .api(postExpenseHeadRoute, [requirePermission(...FIRM_EDITORS)], createExpenseHead)
  .api(patchExpenseHeadRoute, [requirePermission(...FIRM_EDITORS)], updateExpenseHead)
  .api(toggleExpenseHeadRoute, [requirePermission(...FIRM_EDITORS)], toggleExpenseHead)
  .api(deleteExpenseHeadRoute, [requirePermission(...FIRM_EDITORS)], deleteExpenseHead);
