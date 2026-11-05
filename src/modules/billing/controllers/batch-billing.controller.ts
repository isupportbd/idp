import type { AppContext } from "@/framework/facade.js";
import { and, asc, desc, eq, ilike, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import {
  billingScope,
  broadcast,
  db,
  handleAsyncEndpoint,
  handleControllerError,
  HttpStatusCodes,
  invoiceCreatedPayload,
  isAsyncFlagEnabled,
  resolveTenantContext
} from "@/framework/facade.js";
import { enqueueTransactionalSms } from "@/modules/sms-templates/services/sms-queue.service.js";
import { formatPeriodLabel, isTenantSmsEventEnabled, normalizeBdMobile } from "@/modules/sms-templates/services/sms.service.js";
import { generateNextBillNo } from "../services/billing-numbering.service.js";
import { getBatchClientsRunningDue } from "../services/billing-balance.service.js";
import { bills } from "../database/models/bills.js";
import { billItems } from "../database/models/bill_items.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { vatSubmissions } from "@/modules/submissions/database/models/vat_submissions.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";
import { serviceRates } from "@/modules/services/database/models/service_rates.js";
import { purchases } from "@/modules/purchases/database/models/purchases.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { r2, resolveBatchActor, type CreatedBillSummary, type SuggestedBillItem } from "./billing.helpers.js";

export type BatchGenerationParams = {
  taxPeriod: string;
  billDate?: string | undefined;
  dueDate?: string | undefined;
  clientIds?: number[] | undefined;
  creatorId: number | null;
  isSuperAdmin: boolean;
  onProgress?: ((state: { total: number; processed: number; created: number; skipped: number }) => void) | undefined;
};

export type BatchGenerationResult = {
  createdBillsList: CreatedBillSummary[];
  skippedCount: number;
};

/**
 * Why: Extracted from `batchGenerateBills` so the sync endpoint and the queue
 *      worker share ONE copy of the billing math.
 * Returns: created bills + skipped count, or `null` when no active clients exist.
 */
export async function runBatchGeneration(params: BatchGenerationParams): Promise<BatchGenerationResult | null> {
  const { taxPeriod, billDate, dueDate, clientIds, creatorId, isSuperAdmin, onProgress } = params;

  const parsedBillDate = billDate ? new Date(billDate) : new Date();
  const year = parsedBillDate.getFullYear();

  // 1. Fetch all Active Clients
  const clientConditions: SQL[] = [eq(clients.isActive, true)];
  if (!isSuperAdmin && creatorId) {
    clientConditions.push(eq(clients.createdBy, creatorId));
  }

  let clientQuery = db
    .select({
      id: clients.id,
      companyName: clients.companyName,
      customerTypeId: clients.customerTypeId,
      referenceId: clients.referenceId,
      vatServiceType: clients.vatServiceType,
      createdBy: clients.createdBy,
      mobile: clients.mobile,
      alternativeMobile: clients.alternativeMobile,
      isActive: clients.isActive
    })
    .from(clients)
    .where(and(...clientConditions));

  const activeClients = await clientQuery;
  if (activeClients.length === 0) {
    return null;
  }

  // Filter by specific clientIds if provided
  let targetClients = activeClients;
  if (clientIds && clientIds.length > 0) {
    targetClients = activeClients.filter((cl) => clientIds.includes(cl.id));
  }

  // 2. Fetch existing bills for this taxPeriod to skip already billed clients
  const existingBills = await db
    .select({ clientId: bills.clientId })
    .from(bills)
    .where(
      and(
        eq(bills.taxPeriod, taxPeriod),
        sql`${bills.status} != 'cancelled'`
      )
    );
  const billedClientIds = new Set(existingBills.map((b) => b.clientId));

  // 3. Fetch all finalized submissions for this taxPeriod
  const submissions = await db
    .select({ clientId: vatSubmissions.clientId, submissionId: vatSubmissions.submissionId })
    .from(vatSubmissions)
    .where(
      and(
        eq(vatSubmissions.taxPeriod, taxPeriod),
        sql`${vatSubmissions.submissionId} IS NOT NULL AND ${vatSubmissions.submissionId} != ''`
      )
    );
  const finalizedClientIds = new Set(submissions.map((s) => s.clientId));

  // 4. Fetch Master Services & Rates
  const allServices = await db.select().from(serviceItems).where(eq(serviceItems.isActive, true));
  const allRates = await db.select().from(serviceRates);

  const createdBillsList: CreatedBillSummary[] = [];
  let skippedCount = 0;
  let processedCount = 0;
  const totalCount = targetClients.length;

  const reportProgress = () => {
    onProgress?.({ total: totalCount, processed: processedCount, created: createdBillsList.length, skipped: skippedCount });
  };

  const eligibleClients = targetClients.filter(
    (c) => !billedClientIds.has(c.id) && finalizedClientIds.has(c.id)
  );
  const batchDueMap = await getBatchClientsRunningDue(eligibleClients.map((c) => c.id));

  // Batch query purchases for taxPeriod
  const purchaseRows = await db
    .select({
      clientId: purchases.clientId,
      totalNetWtKg: sql<number>`COALESCE(SUM(${purchases.netWt}), 0)`
    })
    .from(purchases)
    .where(eq(purchases.month, taxPeriod))
    .groupBy(purchases.clientId);

  const clientPurchaseMap = new Map<number, number>(purchaseRows.map((p): [number, number] => [p.clientId, Number(p.totalNetWtKg) || 0]));

  // Resolve the firm's bill-notification toggle once per tenant for the whole
  // batch so a 100-invoice run does not issue 100 settings queries.
  const billSmsToggleCache = new Map<string, boolean>();
  const isBillSmsEnabled = async (tenantKey: string): Promise<boolean> => {
    let enabled = billSmsToggleCache.get(tenantKey);
    if (enabled === undefined) {
      enabled = await isTenantSmsEventEnabled(tenantKey, "bill_notification");
      billSmsToggleCache.set(tenantKey, enabled);
    }
    return enabled;
  };

  for (const client of targetClients) {
    // Skip if already billed
    if (billedClientIds.has(client.id)) {
      skippedCount++;
      processedCount++;
      reportProgress();
      continue;
    }
    // Skip if NO finalized submission ID for this month
    if (!finalizedClientIds.has(client.id)) {
      skippedCount++;
      processedCount++;
      reportProgress();
      continue;
    }

    // Rates lookup for this client's customer type
    const clientRates = allRates.filter((r) => r.customerTypeId === client.customerTypeId || !r.customerTypeId);
    const netWtKg: number = clientPurchaseMap.get(client.id) ?? 0;
    const netWtMt = r2(netWtKg / 1000);
    const hasPurchases = netWtKg > 0;

    // 1. VAT Return Fee (Dynamic Regular vs Zero)
    let returnItem: (typeof allServices)[number] | null | undefined = null;
    if (hasPurchases) {
      returnItem = allServices.find(
        (s) => s.itemName.toLowerCase().includes("return") && s.itemName.toLowerCase().includes("regular")
      );
    } else {
      returnItem = allServices.find(
        (s) => s.itemName.toLowerCase().includes("return") && s.itemName.toLowerCase().includes("zero")
      );
    }
    if (!returnItem) {
      returnItem = allServices.find((s) => s.itemName.toLowerCase().includes("return"));
    }

    const returnRateObj = clientRates.find((r) => returnItem && r.serviceItemId === returnItem.id);
    const returnRate = returnRateObj ? returnRateObj.regularRate : 0;
    const returnUnit = returnRateObj?.unit || "Month";

    // Generate Line Items
    const itemsToInsert: SuggestedBillItem[] = [];

    itemsToInsert.push({
      serviceItemId: returnItem ? returnItem.id : null,
      itemName: returnItem?.itemName || (hasPurchases ? "VAT Return Submission (Regular)" : "VAT Return Submission (Zero)"),
      unit: returnUnit,
      qty: 1,
      rateUsed: returnRate,
      minimumChargeUsed: returnRateObj ? returnRateObj.minimumCharge : 0,
      calculatedAmount: returnRate,
      finalAmount: returnRate,
      notes: `${hasPurchases ? 'Regular' : 'Zero'} monthly VAT return filing for ${taxPeriod}`
    });

    // 2. Books of Accounts Fee (if FULL Service AND has purchases/imports)
    if (client.vatServiceType === "FULL" && hasPurchases) {
      const booksItem = allServices.find(
        (s) => s.itemName.toLowerCase().includes("books") || s.itemName.toLowerCase().includes("6.2.1")
      );
      const booksRateObj = clientRates.find((r) => booksItem && r.serviceItemId === booksItem.id);
      const booksRate = booksRateObj ? booksRateObj.regularRate : 0;
      const booksMin = booksRateObj ? booksRateObj.minimumCharge : 0;
      const booksUnit = booksRateObj?.unit || "MT";
      const unitUpper = booksUnit.toUpperCase().trim();

      let qty = 1;
      if (unitUpper === "MT" || unitUpper === "METRIC TON" || unitUpper === "TON" || unitUpper === "TONS") {
        qty = netWtMt;
      } else if (unitUpper === "KG" || unitUpper === "KGM") {
        qty = netWtKg;
      } else if (netWtMt > 0) {
        qty = netWtMt;
      } else {
        qty = 1;
      }

      const calculatedAmt = r2(qty * booksRate);
      const finalBooksAmt = booksMin > 0 ? Math.max(calculatedAmt, booksMin) : calculatedAmt;

      itemsToInsert.push({
        serviceItemId: booksItem ? booksItem.id : null,
        itemName: booksItem?.itemName || "Books of Accounts (Mushak 6.2.1) Maintenance",
        unit: booksUnit,
        qty: qty,
        rateUsed: booksRate,
        minimumChargeUsed: booksMin,
        calculatedAmount: calculatedAmt,
        finalAmount: finalBooksAmt,
        notes: `Purchase & Sales accounts maintenance for ${taxPeriod}${qty > 0 && (unitUpper === 'MT' || unitUpper === 'KG') ? ` (${qty} ${booksUnit})` : ''}`
      });
    }

    // Calculate totals
    const subtotal = r2(itemsToInsert.reduce((acc, it) => acc + it.finalAmount, 0));
    const previousDue = batchDueMap.get(client.id) || 0;
    const grandTotal = r2(subtotal + previousDue);

    // Insert Bill and Items atomically in a transaction with sequence generation
    const billRecord = await db.transaction(async (tx) => {
      const billNo = await generateNextBillNo(year, undefined, creatorId, tx);
      const [insertedBill] = await tx
        .insert(bills)
        .values({
          billNo,
          clientId: client.id,
          referenceId: client.referenceId || null,
          taxPeriod,
          billDate: parsedBillDate,
          dueDate: dueDate ? new Date(dueDate) : null,
          subtotal,
          discountAmount: 0,
          previousDue,
          grandTotal,
          paidAmount: 0,
          dueAmount: grandTotal,
          status: grandTotal <= 0 ? "paid" : "unpaid",
          createdBy: creatorId,
          notes: `Batch generated monthly bill for ${taxPeriod}`
        })
        .returning();

      if (itemsToInsert.length > 0) {
        await tx.insert(billItems).values(
          itemsToInsert.map((it) => ({
            billId: insertedBill.id,
            serviceItemId: it.serviceItemId,
            itemName: it.itemName,
            unit: it.unit,
            qty: it.qty,
            rateUsed: it.rateUsed,
            minimumChargeUsed: it.minimumChargeUsed,
            calculatedAmount: it.calculatedAmount,
            finalAmount: it.finalAmount,
            notes: it.notes
          }))
        );
      }

      return insertedBill;
    });

    createdBillsList.push({
      id: billRecord.id,
      billNo: billRecord.billNo,
      companyName: client.companyName,
      grandTotal: billRecord.grandTotal
    });

    // Queue the bill SMS per new invoice — delivery happens on the `sms`
    // worker so the batch loop never waits on the gateway.
    const batchBillSmsPhone = normalizeBdMobile(client.mobile) || normalizeBdMobile(client.alternativeMobile);
    if (batchBillSmsPhone) {
      // Gate on the firm's per-event SMS toggle (bill/invoice notifications).
      const batchSmsTenantId = String(client.createdBy ?? creatorId ?? "");
      if (await isBillSmsEnabled(batchSmsTenantId)) {
        void enqueueTransactionalSms({
          tenantId: batchSmsTenantId,
          templateKey: "bill_notification",
          recipientPhone: batchBillSmsPhone,
          variables: {
            customer_name: client.companyName,
            month: formatPeriodLabel(taxPeriod),
            current_bill: Number(subtotal),
            due: Number(previousDue),
            grand_total: Number(grandTotal)
          },
          referenceType: "invoice",
          referenceId: String(billRecord.id),
          triggeredByUserId: creatorId ? String(creatorId) : undefined
        });
      }
    }

    processedCount++;
    reportProgress();
  }

  return { createdBillsList, skippedCount };
}

/**
 * Synchronous REST endpoint — response shape unchanged. Heavy batches can be
 * routed to the queue via `batchGenerateBillsAsync` instead.
 */
export const batchGenerateBills = async (c: AppContext) => {
  try {
    const payload = c.req.valid("json");
    const { taxPeriod, billDate, dueDate, clientIds } = payload;
    const { tenantAdminId } = await resolveTenantContext(c);
    const { creatorId, isSuperAdmin } = await resolveBatchActor(c);

    const result = await runBatchGeneration({
      taxPeriod,
      billDate,
      dueDate,
      clientIds,
      creatorId,
      isSuperAdmin
    });

    if (!result) {
      return c.json({ message: "No active clients found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Realtime: notify accountants that fresh invoices exist. Best-effort no-op
    // when Socket.IO/Redis are not wired up.
    for (const bill of result.createdBillsList) {
      broadcast(
        "billing.invoice.updated",
        invoiceCreatedPayload({
          billId: bill.id,
          billNo: bill.billNo,
          tenantId: tenantAdminId,
          taxPeriod,
          grandTotal: bill.grandTotal,
          batch: true
        }),
        billingScope(tenantAdminId)
      );
    }

    return c.json(
      {
        message: `Batch generation complete. ${result.createdBillsList.length} invoices created successfully.`,
        createdCount: result.createdBillsList.length,
        skippedCount: result.skippedCount,
        data: result.createdBillsList
      },
      HttpStatusCodes.CREATED
    );
  } catch (err: unknown) {
    return handleControllerError(c, err, "Failed to batch generate bills", { field: "message" });
  }
};

const BILLING_BATCH_ASYNC_ENV = "BILLING_BATCH_ASYNC";
const BATCH_ASYNC_THRESHOLD = 25;

/** Why: runs async behind a flag, or is forced for batches above the threshold. */
function shouldUseBillingBatchAsync(clientCount: number): boolean {
  if (isAsyncFlagEnabled(BILLING_BATCH_ASYNC_ENV)) return true;
  return Number.isFinite(clientCount) && clientCount > BATCH_ASYNC_THRESHOLD;
}

/** Why: stable job id so a retried request maps to the same batch job. */
function makeBatchJobId(tenantId: string | number | null | undefined, taxPeriod: string, key: string): string {
  const tid = tenantId === null || tenantId === undefined ? "global" : String(tenantId);
  return `billing:batch:${tid}:${taxPeriod}:${key}`;
}

/**
 * Why: bulk invoice generation (hundreds of clients) can outlive the HTTP request.
 * When: POST /api/billing/batch/async (flag, or >25 clients).
 * How: Enqueues onto the `billing` queue; falls back to the sync handler when the
 *      flag is off, the batch is small, or Redis is unavailable.
 */
export const batchGenerateBillsAsync = async (c: AppContext) => {
  const payload = c.req.valid("json");
  const { taxPeriod, billDate, dueDate, clientIds } = payload;
  const { tenantAdminId } = await resolveTenantContext(c);
  const { creatorId, isSuperAdmin } = await resolveBatchActor(c);

  const clientCount = Array.isArray(clientIds) ? clientIds.length : 0;

  return handleAsyncEndpoint({
    c,
    queue: "billing",
    jobName: "billing.batch.generate",
    shouldUseAsync: shouldUseBillingBatchAsync(clientCount),
    fallback: () => batchGenerateBills(c),
    idemParts: [tenantAdminId, taxPeriod, "batch", clientCount, (clientIds || []).join(",")],
    makeJobId: (idemKey) => makeBatchJobId(tenantAdminId, taxPeriod, idemKey),
    buildPayload: (jobId) => ({
      taxPeriod,
      billDate: billDate ?? null,
      dueDate: dueDate ?? null,
      clientIds,
      creatorId,
      isSuperAdmin,
      tenantId: tenantAdminId,
      jobId
    }),
    successMessage: `Batch invoice generation queued for ${taxPeriod}.`,
    extraResponse: { taxPeriod }
  });
};
