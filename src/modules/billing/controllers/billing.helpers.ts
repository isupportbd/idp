import { and, asc, desc, eq, ilike, inArray, like, ne, or, type SQL, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import {
  billingScope,
  broadcast,
  collectionReceivedPayload,
  db,
  HttpStatusCodes,
  handleAsyncEndpoint,
  handleControllerError,
  invoiceCreatedPayload,
  isAsyncFlagEnabled,
  resolveTenantContext
} from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { clientManagers } from "@/modules/clients/database/models/client_managers.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { bankAccounts } from "@/modules/firm/database/models/bank_accounts.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { purchases } from "@/modules/purchases/database/models/purchases.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";
import { serviceRates } from "@/modules/services/database/models/service_rates.js";
import { formatPeriodLabel, isTenantSmsEventEnabled, normalizeBdMobile } from "@/modules/sms-templates/services/sms.service.js";
import { enqueueTransactionalSms } from "@/modules/sms-templates/services/sms-queue.service.js";
import { vatSubmissions } from "@/modules/submissions/database/models/vat_submissions.js";
import { billItems } from "../database/models/bill_items.js";
import { bills } from "../database/models/bills.js";
import { collections } from "../database/models/collections.js";
import { getBatchClientsRunningDue, getClientRunningDue } from "../services/billing-balance.service.js";
import { generateNextBillNo, generateNextReceiptNo } from "../services/billing-numbering.service.js";
import type { CreateBillInput, UpdateBillInput } from "./billing.schema.js";

// Helper: Round to 2 decimal places
function r2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/** A suggested line item for preview / auto-generation. */
type SuggestedBillItem = {
  serviceItemId: number | null;
  itemName: string;
  unit: string;
  qty: number;
  rateUsed: number;
  minimumChargeUsed: number;
  calculatedAmount: number;
  finalAmount: number;
  isRateMissing?: boolean;
  notes: string;
};

/** A bill summary emitted by the batch generator (returned to the caller). */
type CreatedBillSummary = {
  id: number;
  billNo: string;
  companyName: string;
  grandTotal: number;
};

/** A client flagged as unbilled for a month, with the computed service fee. */
type MissingBillingClient = {
  id: number;
  companyName: string;
  proprietorName: string | null;
  binNumber: string | null;
  mobile: string | null;
  tinNumber: string | null;
  customerTypeId: number | null;
  customerTypeName: string | null;
  referenceId: number | null;
  referenceName: string | null;
  vatServiceType: string | null;
  targetMonth: string;
  submissionId: string | null;
  isSubmitted: boolean;
  previousDue: number;
  monthlyServiceFee: number;
};

/**
 * Why: The invoice's "Payment Details" card must show the tenant's own bKash /
 *      bank info. The bank-accounts endpoint sits behind FIRM_READERS, which a
 *      billing clerk may lack, so resolving it here (same request) keeps the
 *      invoice self-contained, permission-safe and snapshot-consistent.
 */
async function resolvePaymentInfo(tenantAdminId: number | null) {
  try {
    // Hard tenant scoping: without a tenant admin we return nothing rather than
    // risk leaking another tenant's bank details onto this invoice.
    if (!tenantAdminId) return null;

    const rows = await db
      .select({
        bankName: bankAccounts.bankName,
        accountName: bankAccounts.accountName,
        accountNumber: bankAccounts.accountNumber,
        branchName: bankAccounts.branchName,
        routingNumber: bankAccounts.routingNumber,
        bkashNumber: bankAccounts.bkashNumber,
        nagadNumber: bankAccounts.nagadNumber,
        isDefault: bankAccounts.isDefault
      })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.isActive, true), eq(bankAccounts.adminId, Number(tenantAdminId))))
      .orderBy(desc(bankAccounts.isDefault), asc(bankAccounts.id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      bkashNumber: row.bkashNumber || null,
      nagadNumber: row.nagadNumber || null,
      bankName: row.bankName || null,
      accountName: row.accountName || null,
      accountNumber: row.accountNumber || null,
      branchName: row.branchName || null,
      routingNumber: row.routingNumber || null
    };
  } catch {
    return null;
  }
}

/**
 * Why: Item-level billing endpoints previously trusted the client-supplied id,
 *      letting an authenticated user read/modify another tenant's rows (IDOR).
 * How: Loads the row together with its owning client and enforces the caller's
 *      tenant. Superadmins bypass the tenant filter.
 * Returns the row when owned, otherwise null (caller responds 404).
 */
async function loadScopedBill(c: AppContext, id: number) {
  const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
  const rows = await db
    .select({ bill: bills, clientOwner: clients.createdBy })
    .from(bills)
    .leftJoin(clients, eq(bills.clientId, clients.id))
    .where(eq(bills.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!isSuperAdmin && Number(row.clientOwner) !== Number(tenantAdminId)) return null;
  return row.bill;
}

async function loadScopedCollection(c: AppContext, id: number) {
  const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
  const rows = await db
    .select({ collection: collections, clientOwner: clients.createdBy })
    .from(collections)
    .leftJoin(clients, eq(collections.clientId, clients.id))
    .where(eq(collections.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!isSuperAdmin && Number(row.clientOwner) !== Number(tenantAdminId)) return null;
  return row.collection;
}

/**
 * Why: Money/CRM rows may only reference clients inside the caller's tenant.
 * How: Returns true when the client exists and belongs to the caller.
 */
async function clientBelongsToTenant(c: AppContext, clientId: number): Promise<boolean> {
  const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
  const conditions: SQL[] = [eq(clients.id, clientId)];
  if (!isSuperAdmin) conditions.push(eq(clients.createdBy, tenantAdminId ?? -1));
  const row = (
    await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(...conditions))
      .limit(1)
  )[0];
  return !!row;
}

async function resolveBatchActor(c: any): Promise<{ creatorId: number | null; isSuperAdmin: boolean }> {
  const auth = c.get("auth") || c.get("user");
  const creatorId = auth?.adminId ? Number(auth.adminId) : auth?.id ? Number(auth.id) : null;
  let isSuperAdmin = false;

  if (auth?.id) {
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, Number(auth.id)),
      with: { role: true }
    });
    if (currentUser) {
      isSuperAdmin = currentUser.role?.name?.toLowerCase() === "superadmin" || auth.role === "superadmin";
    }
  }

  return { creatorId, isSuperAdmin };
}

export {
  type CreatedBillSummary,
  clientBelongsToTenant,
  loadScopedBill,
  loadScopedCollection,
  type MissingBillingClient,
  r2,
  resolveBatchActor,
  resolvePaymentInfo,
  type SuggestedBillItem
};
