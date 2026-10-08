import { and, asc, desc, eq, ilike, inArray, like, or, sql } from "drizzle-orm";
import type { Handler } from "hono";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { bills } from "../database/models/bills.js";
import { billItems } from "../database/models/bill_items.js";
import { collections } from "../database/models/collections.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { vatSubmissions } from "@/modules/clients/database/models/vat_submissions.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";
import { serviceRates } from "@/modules/services/database/models/service_rates.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { clientManagers } from "@/modules/clients/database/models/client_managers.js";
import { users } from "@/modules/auth/database/models/user.js";
import { purchases } from "@/modules/clients/database/models/purchases.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";

// Helper: Round to 2 decimal places
function r2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// ── 1. SEQUENCE GENERATORS ──────────────────────────────────────────

/**
 * Generates sequential Invoice No in format: [PREFIX]-YYYY-000001 (Dynamic from firm settings)
 */
async function generateNextBillNo(year: number, customPrefix?: string, tenantAdminId?: number | null): Promise<string> {
  let prefixToUse = customPrefix;
  if (!prefixToUse && tenantAdminId) {
    try {
      const firmSetting = await db.query.companySettings.findFirst({
        where: eq(companySettings.adminId, tenantAdminId)
      });
      if (firmSetting?.invoicePrefix) {
        prefixToUse = firmSetting.invoicePrefix.trim();
      }
    } catch { }
  }
  const cleanPrefix = (prefixToUse || "INV").replace(/-+$/, "").toUpperCase();
  const prefix = `${cleanPrefix}-${year}-`;
  const conditions: any[] = [or(like(bills.billNo, `${prefix}%`), ilike(bills.billNo, `%-${year}-%`))];
  if (tenantAdminId) {
    conditions.push(eq(bills.createdBy, tenantAdminId));
  }
  const latestBill = (
    await db
      .select({ billNo: bills.billNo })
      .from(bills)
      .where(and(...conditions))
      .orderBy(desc(bills.id))
      .limit(1)
  )[0];

  let nextSeq = 1;
  if (latestBill && latestBill.billNo) {
    const parts = latestBill.billNo.split("-");
    if (parts.length >= 3) {
      const numPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(numPart)) {
        nextSeq = numPart + 1;
      }
    }
  }

  const padded = String(nextSeq).padStart(6, "0");
  return `${prefix}${padded}`;
}

/**
 * Generates sequential Money Receipt No in format: [PREFIX]-YYYY-000001 (Dynamic from firm settings)
 */
async function generateNextReceiptNo(year: number, customPrefix?: string, tenantAdminId?: number | null): Promise<string> {
  let prefixToUse = customPrefix;
  if (!prefixToUse && tenantAdminId) {
    try {
      const firmSetting = await db.query.companySettings.findFirst({
        where: eq(companySettings.adminId, tenantAdminId)
      });
      if (firmSetting?.receiptPrefix) {
        prefixToUse = firmSetting.receiptPrefix.trim();
      }
    } catch { }
  }
  const cleanPrefix = (prefixToUse || "RCP").replace(/-+$/, "").toUpperCase();
  const prefix = `${cleanPrefix}-${year}-`;
  const conditions: any[] = [or(like(collections.receiptNo, `${prefix}%`), ilike(collections.receiptNo, `%-${year}-%`))];
  if (tenantAdminId) {
    conditions.push(eq(clients.createdBy, tenantAdminId));
  }
  const latestCol = (
    await db
      .select({ receiptNo: collections.receiptNo })
      .from(collections)
      .leftJoin(clients, eq(collections.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(desc(collections.id))
      .limit(1)
  )[0];

  let nextSeq = 1;
  if (latestCol && latestCol.receiptNo) {
    const parts = latestCol.receiptNo.split("-");
    if (parts.length >= 3) {
      const numPart = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(numPart)) {
        nextSeq = numPart + 1;
      }
    }
  }

  const padded = String(nextSeq).padStart(6, "0");
  return `${prefix}${padded}`;
}

// ── 2. RUNNING BALANCE & LEDGER HELPER ───────────────────────────────

/**
 * Calculates client's running balance (positive = due, negative = advance)
 */
async function getClientRunningDue(clientId: number, excludeBillId?: number): Promise<number> {
  // Fetch Client's Opening Balance
  const clientRow = (
    await db
      .select({ openingBalance: clients.openingBalance })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1)
  )[0];
  const openingBalance = clientRow?.openingBalance || 0;

  // Sum of finalized/active bills (grandTotal - paidAmount)
  const clientBills = await db
    .select({
      id: bills.id,
      subtotal: bills.subtotal,
      discountAmount: bills.discountAmount,
      paidAmount: bills.paidAmount,
      status: bills.status
    })
    .from(bills)
    .where(
      and(
        eq(bills.clientId, clientId),
        sql`${bills.status} != 'cancelled'`
      )
    );

  let totalBilledNet = openingBalance;
  for (const b of clientBills) {
    if (excludeBillId && b.id === excludeBillId) continue;
    totalBilledNet += (b.subtotal - b.discountAmount);
  }

  // Sum of completed collections
  const clientCollections = await db
    .select({
      amount: collections.amount,
      status: collections.status
    })
    .from(collections)
    .where(
      and(
        eq(collections.clientId, clientId),
        eq(collections.status, "completed")
      )
    );

  let totalCollected = 0;
  for (const c of clientCollections) {
    totalCollected += c.amount;
  }

  const netDue = r2(totalBilledNet - totalCollected);
  return netDue;
}

/**
 * Super-fast Batch Running Balance Calculator: Eliminates N+1 loop queries
 */
async function getBatchClientsRunningDue(clientIds: number[]): Promise<Map<number, number>> {
  const dueMap = new Map<number, number>();
  if (clientIds.length === 0) return dueMap;

  // 1. Fetch Opening Balances
  const clientRows = await db
    .select({ id: clients.id, openingBalance: clients.openingBalance })
    .from(clients)
    .where(inArray(clients.id, clientIds));

  for (const c of clientRows) {
    dueMap.set(c.id, c.openingBalance || 0);
  }

  // 2. Aggregate Active Bills (subtotal - discountAmount) per client
  const billSums = await db
    .select({
      clientId: bills.clientId,
      totalBilled: sql<number>`COALESCE(SUM(${bills.subtotal} - ${bills.discountAmount}), 0)::float`
    })
    .from(bills)
    .where(
      and(
        inArray(bills.clientId, clientIds),
        sql`${bills.status} != 'cancelled'`
      )
    )
    .groupBy(bills.clientId);

  for (const b of billSums) {
    const current = dueMap.get(b.clientId) || 0;
    dueMap.set(b.clientId, current + b.totalBilled);
  }

  // 3. Aggregate Completed Collections per client
  const collectionSums = await db
    .select({
      clientId: collections.clientId,
      totalCollected: sql<number>`COALESCE(SUM(${collections.amount}), 0)::float`
    })
    .from(collections)
    .where(
      and(
        inArray(collections.clientId, clientIds),
        eq(collections.status, "completed")
      )
    )
    .groupBy(collections.clientId);

  for (const c of collectionSums) {
    const current = dueMap.get(c.clientId) || 0;
    dueMap.set(c.clientId, r2(current - c.totalCollected));
  }

  // Ensure all clients have rounded 2 decimal values
  for (const [id, val] of dueMap.entries()) {
    dueMap.set(id, r2(val));
  }

  return dueMap;
}

// ── 3. LIST INVOICES / BILLS ─────────────────────────────────────────

export const listBills: Handler = async (c: any) => {
  try {
    const query = c.req.valid("query");
    const month = query.month || query.taxPeriod;
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    let conditions: any[] = [];
    if (!isSuperAdmin && tenantAdminId) {
      conditions.push(eq(clients.createdBy, tenantAdminId));
    }
    if (month && month !== "all") {
      conditions.push(eq(bills.taxPeriod, month));
    }
    if (query.clientId && query.clientId !== "all") {
      conditions.push(eq(bills.clientId, Number(query.clientId)));
    }
    if (query.status && query.status !== "all") {
      conditions.push(eq(bills.status, query.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: bills.id,
        billNo: bills.billNo,
        clientId: bills.clientId,
        clientName: clients.companyName,
        clientBin: clients.binNumber,
        customerTypeId: clients.customerTypeId,
        customerTypeName: customerTypes.typeName,
        referenceId: clients.referenceId,
        referenceName: clientReferences.name,
        taxPeriod: bills.taxPeriod,
        billDate: bills.billDate,
        dueDate: bills.dueDate,
        subtotal: bills.subtotal,
        discountAmount: bills.discountAmount,
        previousDue: bills.previousDue,
        grandTotal: bills.grandTotal,
        paidAmount: bills.paidAmount,
        dueAmount: bills.dueAmount,
        status: bills.status,
        notes: bills.notes,
        createdById: bills.createdBy,
        createdByName: users.name,
        createdAt: bills.createdAt
      })
      .from(bills)
      .leftJoin(clients, eq(bills.clientId, clients.id))
      .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
      .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
      .leftJoin(users, eq(bills.createdBy, users.id))
      .where(whereClause)
      .orderBy(desc(bills.id));

    // Fetch line items for the bills
    const billIds = rows.map((r) => r.id);
    let itemsMap: Record<number, any[]> = {};
    if (billIds.length > 0) {
      const allItems = await db
        .select()
        .from(billItems)
        .where(inArray(billItems.billId, billIds));

      for (const it of allItems) {
        if (!itemsMap[it.billId]) itemsMap[it.billId] = [];
        itemsMap[it.billId].push(it);
      }
    }

    let list = rows.map((r) => ({
      ...r,
      items: itemsMap[r.id] || []
    }));

    // Client-side search filtering if provided
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.billNo.toLowerCase().includes(q) ||
          r.clientName?.toLowerCase().includes(q) ||
          r.clientBin?.toLowerCase().includes(q) ||
          r.referenceName?.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q)
      );
    }

    if (query.customerTypeId && query.customerTypeId !== "all") {
      const typeId = Number(query.customerTypeId);
      list = list.filter((r) => r.customerTypeId === typeId);
    }

    if (query.referenceId && query.referenceId !== "all") {
      const refId = Number(query.referenceId);
      list = list.filter((r) => r.referenceId === refId);
    }

    // Overall summary statistics
    const stats = {
      totalInvoicesCount: list.length,
      totalBilledAmount: r2(list.reduce((acc, b) => acc + (b.subtotal - b.discountAmount), 0)),
      totalPaidAmount: r2(list.reduce((acc, b) => acc + b.paidAmount, 0)),
      totalDueAmount: r2(list.reduce((acc, b) => acc + b.dueAmount, 0)),
      paidCount: list.filter((b) => b.status === "paid").length,
      unpaidCount: list.filter((b) => b.status === "unpaid").length,
      partialCount: list.filter((b) => b.status === "partial").length
    };

    return c.json(
      {
        message: "Bills fetched successfully",
        data: list,
        stats
      },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to fetch bills" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 4. GET BILL DETAILS ──────────────────────────────────────────────

export const getBillDetails: Handler = async (c: any) => {
  try {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ message: "Invalid bill ID" }, HttpStatusCodes.BAD_REQUEST);
    }

    const bill = (
      await db
        .select({
          id: bills.id,
          billNo: bills.billNo,
          clientId: bills.clientId,
          clientName: clients.companyName,
          clientProprietor: clients.proprietorName,
          clientBin: clients.binNumber,
          clientMobile: clients.mobile,
          clientEmail: clients.email,
          clientAddress: clients.address,
          customerTypeName: customerTypes.typeName,
          referenceName: clientReferences.name,
          taxPeriod: bills.taxPeriod,
          billDate: bills.billDate,
          dueDate: bills.dueDate,
          subtotal: bills.subtotal,
          discountAmount: bills.discountAmount,
          previousDue: bills.previousDue,
          grandTotal: bills.grandTotal,
          paidAmount: bills.paidAmount,
          dueAmount: bills.dueAmount,
          status: bills.status,
          notes: bills.notes,
          createdBy: bills.createdBy,
          createdAt: bills.createdAt
        })
        .from(bills)
        .leftJoin(clients, eq(bills.clientId, clients.id))
        .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
        .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
        .where(eq(bills.id, id))
        .limit(1)
    )[0];

    if (!bill) {
      return c.json({ message: "Bill not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const items = await db
      .select()
      .from(billItems)
      .where(eq(billItems.billId, id));

    const linkedCollections = await db
      .select()
      .from(collections)
      .where(eq(collections.billId, id));

    // Fetch matching VAT return submission if any
    const submission = (
      await db
        .select({ submissionId: vatSubmissions.submissionId, submittedAt: vatSubmissions.submittedAt })
        .from(vatSubmissions)
        .where(
          and(
            eq(vatSubmissions.clientId, bill.clientId),
            eq(vatSubmissions.taxPeriod, bill.taxPeriod)
          )
        )
        .limit(1)
    )[0];

    // Fetch tenant/company branding settings
    let firmSetting: any = null;
    try {
      if (bill.createdBy) {
        firmSetting = await db.query.companySettings.findFirst({
          where: eq(companySettings.adminId, bill.createdBy)
        });
      }
      if (!firmSetting) {
        firmSetting = await db.query.companySettings.findFirst();
      }
    } catch { }

    return c.json(
      {
        message: "Bill details fetched successfully",
        data: {
          ...bill,
          submissionId: submission?.submissionId || null,
          submittedAt: submission?.submittedAt || null,
          companySettings: firmSetting ? {
            companyName: firmSetting.companyName,
            proprietorName: firmSetting.proprietorName,
            phone: firmSetting.phone,
            email: firmSetting.email,
            website: firmSetting.website,
            address: firmSetting.address,
            binNumber: firmSetting.binNumber,
            tinNumber: firmSetting.tinNumber,
            tradeLicenseNo: firmSetting.tradeLicenseNo,
            invoiceTerms: firmSetting.invoiceTerms
          } : null,
          items,
          collections: linkedCollections
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to fetch bill details" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 5. CLIENT BILLING OVERVIEW & AUTO-ITEMS HELPER ───────────────────

export const getClientBillingOverview: Handler = async (c: any) => {
  try {
    const query = c.req.valid("query");
    const clientId = Number(query.clientId);
    const targetMonth = query.month || new Date().toISOString().slice(0, 7);

    if (isNaN(clientId)) {
      return c.json({ message: "Client ID is required" }, HttpStatusCodes.BAD_REQUEST);
    }

    const client = (
      await db
        .select({
          id: clients.id,
          companyName: clients.companyName,
          binNumber: clients.binNumber,
          mobile: clients.mobile,
          address: clients.address,
          customerTypeId: clients.customerTypeId,
          customerTypeName: customerTypes.typeName,
          referenceId: clients.referenceId,
          referenceName: clientReferences.name,
          vatServiceType: clients.vatServiceType,
          isActive: clients.isActive
        })
        .from(clients)
        .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
        .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
        .where(eq(clients.id, clientId))
        .limit(1)
    )[0];

    if (!client) {
      return c.json({ message: "Client not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // 1. Fetch all finalized submission months for this client
    const clientSubmissions = await db
      .select({
        taxPeriod: vatSubmissions.taxPeriod,
        submissionId: vatSubmissions.submissionId,
        status: vatSubmissions.status,
        submittedAt: vatSubmissions.submittedAt
      })
      .from(vatSubmissions)
      .where(
        and(
          eq(vatSubmissions.clientId, clientId),
          sql`${vatSubmissions.submissionId} IS NOT NULL AND ${vatSubmissions.submissionId} != ''`
        )
      )
      .orderBy(desc(vatSubmissions.taxPeriod));

    // 2. Fetch existing bills for this client to know which months are already billed
    const existingBills = await db
      .select({
        id: bills.id,
        billNo: bills.billNo,
        taxPeriod: bills.taxPeriod,
        status: bills.status
      })
      .from(bills)
      .where(
        and(
          eq(bills.clientId, clientId),
          sql`${bills.status} != 'cancelled'`
        )
      );

    const billedMonthsMap = new Map(existingBills.map((b) => [b.taxPeriod, b]));

    // Format allowed months with submission IDs: "2026-08 — #37001"
    const allowedMonths = clientSubmissions.map((sub) => ({
      taxPeriod: sub.taxPeriod,
      submissionId: sub.submissionId,
      submittedAt: sub.submittedAt,
      isBilled: billedMonthsMap.has(sub.taxPeriod),
      label: `${sub.taxPeriod} — #${sub.submissionId}`
    }));

    // 3. Compute running previous due
    const previousDue = await getClientRunningDue(clientId);

    // 4. Fetch Client's Purchase Volume for targetMonth
    const purchaseVolumeRes = await db
      .select({
        totalNetWt: sql<number>`COALESCE(SUM(${purchases.netWt}), 0)`,
        totalQty: sql<number>`COALESCE(SUM(${purchases.totalQty}), 0)`,
        count: sql<number>`COUNT(*)`
      })
      .from(purchases)
      .where(
        and(
          eq(purchases.clientId, clientId),
          eq(purchases.month, targetMonth)
        )
      );

    const totalNetWtKg = Number(purchaseVolumeRes[0]?.totalNetWt) || 0;
    const totalNetWtMt = r2(totalNetWtKg / 1000);
    const purchaseCount = Number(purchaseVolumeRes[0]?.count) || 0;

    // 5. Fetch Master Service Items & Rates for this customer type
    const allServiceItems = await db
      .select()
      .from(serviceItems)
      .where(eq(serviceItems.isActive, true));

    const allRates = await db
      .select()
      .from(serviceRates);

    // Build rate lookup map (including unit)
    const rateMap: Record<number, { unit: string; regularRate: number; minimumCharge: number }> = {};
    for (const r of allRates) {
      if (r.customerTypeId === client.customerTypeId || (!rateMap[r.serviceItemId] && !r.customerTypeId)) {
        rateMap[r.serviceItemId] = {
          unit: r.unit || "Month",
          regularRate: r.regularRate,
          minimumCharge: r.minimumCharge
        };
      }
    }

    // 6. Auto-calculate suggested line items for selected targetMonth
    const isOnlyReturn = client.vatServiceType === "ONLY_RETURN";
    const suggestedItems: any[] = [];
    const hasMonthlyPurchases = purchaseCount > 0 || totalNetWtKg > 0;

    // Item A: VAT Return Submission (Dynamic Regular vs Zero selection)
    let returnItem = null;
    if (hasMonthlyPurchases) {
      returnItem = allServiceItems.find(
        (s) => s.itemName.toLowerCase().includes("return") && s.itemName.toLowerCase().includes("regular")
      );
    } else {
      returnItem = allServiceItems.find(
        (s) => s.itemName.toLowerCase().includes("return") && s.itemName.toLowerCase().includes("zero")
      );
    }
    if (!returnItem) {
      returnItem = allServiceItems.find((s) => s.itemName.toLowerCase().includes("return"));
    }

    const returnRateInfo = returnItem ? rateMap[returnItem.id] : null;
    const isReturnRateMissing = !returnRateInfo || returnRateInfo.regularRate === 0;
    const returnRate = returnRateInfo ? returnRateInfo.regularRate : 0;
    const returnUnit = returnRateInfo?.unit || "Month";

    suggestedItems.push({
      serviceItemId: returnItem ? returnItem.id : null,
      itemName: returnItem?.itemName || (hasMonthlyPurchases ? "VAT Return Submission (Regular)" : "VAT Return Submission (Zero)"),
      unit: returnUnit,
      qty: 1,
      rateUsed: returnRate,
      minimumChargeUsed: returnRateInfo ? returnRateInfo.minimumCharge : 0,
      calculatedAmount: returnRate,
      finalAmount: returnRate,
      isRateMissing: isReturnRateMissing,
      notes: `${hasMonthlyPurchases ? 'Regular' : 'Zero'} monthly VAT return filing for ${targetMonth}`
    });

    // Item B: Books of Accounts (Mushak 6.2.1) Maintenance (only if FULL service AND has imports/purchases)
    if (!isOnlyReturn && hasMonthlyPurchases) {
      const booksItem = allServiceItems.find(
        (s) => s.itemName.toLowerCase().includes("books") || s.itemName.toLowerCase().includes("6.2.1")
      );
      const booksRateInfo = booksItem ? rateMap[booksItem.id] : null;
      const isBooksRateMissing = !booksRateInfo || booksRateInfo.regularRate === 0;
      const booksRate = booksRateInfo ? booksRateInfo.regularRate : 0;
      const minCharge = booksRateInfo ? booksRateInfo.minimumCharge : 0;
      const booksUnit = booksRateInfo?.unit || "MT";

      // Compute Quantity based on Rate Unit:
      // If unit is "MT" / "Metric Ton" -> use total purchase volume in Metric Tons (e.g. 1500 MT)
      // If unit is "KG" -> use total purchase volume in KG
      // If unit is "Month" -> use 1 Month
      let qty = 1;
      const unitUpper = booksUnit.toUpperCase().trim();
      if (unitUpper === "MT" || unitUpper === "METRIC TON" || unitUpper === "TON" || unitUpper === "TONS") {
        qty = totalNetWtMt;
      } else if (unitUpper === "KG" || unitUpper === "KGM") {
        qty = totalNetWtKg;
      } else if (totalNetWtMt > 0) {
        qty = totalNetWtMt;
      } else {
        qty = 1;
      }

      const calculatedAmt = r2(qty * booksRate);
      const finalAmt = minCharge > 0 ? Math.max(calculatedAmt, minCharge) : calculatedAmt;

      suggestedItems.push({
        serviceItemId: booksItem ? booksItem.id : null,
        itemName: booksItem?.itemName || "Books of Accounts (Mushak 6.2.1) Maintenance",
        unit: booksUnit,
        qty: qty,
        rateUsed: booksRate,
        minimumChargeUsed: minCharge,
        calculatedAmount: calculatedAmt,
        finalAmount: finalAmt,
        isRateMissing: isBooksRateMissing,
        notes: `Purchase & Sales accounts maintenance for ${targetMonth}${qty > 0 && (unitUpper === 'MT' || unitUpper === 'KG') ? ` (${qty} ${booksUnit})` : ''}`
      });
    }

    // Check submission status for targetMonth
    const currentSub = clientSubmissions.find((s) => s.taxPeriod === targetMonth);

    return c.json(
      {
        message: "Client billing overview fetched",
        data: {
          client,
          previousDue,
          allowedMonths,
          targetMonthSubmission: currentSub || null,
          isTargetMonthBilled: billedMonthsMap.has(targetMonth),
          purchaseVolume: {
            totalPurchaseKg: totalNetWtKg,
            totalPurchaseMt: totalNetWtMt,
            purchaseCount
          },
          suggestedItems,
          masterServices: allServiceItems.map((s) => ({
            id: s.id,
            itemName: s.itemName,
            unit: rateMap[s.id]?.unit || (s as any).defaultUnit || "Month",
            regularRate: rateMap[s.id]?.regularRate || 0,
            minimumCharge: rateMap[s.id]?.minimumCharge || 0
          }))
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to fetch client billing overview" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 6. CREATE SINGLE BILL ────────────────────────────────────────────

export const createBill: Handler = async (c: any) => {
  try {
    const payload = c.req.valid("json");
    const { clientId, referenceId: payloadRefId, taxPeriod, billDate, dueDate, discountAmount, notes, items, status } = payload;

    // 1. Verify Active Client
    const client = (
      await db
        .select({ id: clients.id, companyName: clients.companyName, isActive: clients.isActive, referenceId: clients.referenceId })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1)
    )[0];

    if (!client) {
      return c.json({ message: "Client not found" }, HttpStatusCodes.NOT_FOUND);
    }
    if (!client.isActive) {
      return c.json({ message: "Cannot create bill for disabled/inactive client" }, HttpStatusCodes.BAD_REQUEST);
    }

    // 2. CRITICAL RULE: Verify finalized VAT Submission ID exists for this month
    const submission = (
      await db
        .select({ id: vatSubmissions.id, submissionId: vatSubmissions.submissionId })
        .from(vatSubmissions)
        .where(
          and(
            eq(vatSubmissions.clientId, clientId),
            eq(vatSubmissions.taxPeriod, taxPeriod)
          )
        )
        .limit(1)
    )[0];

    if (!submission || !submission.submissionId || !submission.submissionId.trim()) {
      return c.json(
        {
          message: `Cannot create bill: No finalized VAT Return Submission ID found for ${taxPeriod}. Please record the submission ID first.`
        },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    // 3. Prevent duplicate bill for same client and taxPeriod
    const duplicate = (
      await db
        .select({ id: bills.id, billNo: bills.billNo })
        .from(bills)
        .where(
          and(
            eq(bills.clientId, clientId),
            eq(bills.taxPeriod, taxPeriod),
            sql`${bills.status} != 'cancelled'`
          )
        )
        .limit(1)
    )[0];

    if (duplicate) {
      return c.json(
        { message: `Invoice ${duplicate.billNo} already exists for ${taxPeriod}` },
        HttpStatusCodes.CONFLICT
      );
    }

    // 4. Calculate amounts
    const parsedBillDate = new Date(billDate);
    const year = parsedBillDate.getFullYear() || new Date().getFullYear();

    const subtotal = r2(items.reduce((acc, it) => acc + (it.finalAmount || 0), 0));
    const previousDue = await getClientRunningDue(clientId);
    const discount = r2(discountAmount || 0);
    const grandTotal = r2(Math.max(0, subtotal - discount + previousDue));
    const dueAmount = grandTotal;

    // 5. Generate sequential bill number: Inv-YYYY-000001
    const billNo = await generateNextBillNo(year);

    const auth = c.get("auth") || c.get("user");
    const creatorId = auth?.adminId ? Number(auth.adminId) : (auth?.id ? Number(auth.id) : null);

    // 6. Insert Bill in DB
    const newBill = (
      await db
        .insert(bills)
        .values({
          billNo,
          clientId,
          referenceId: payloadRefId !== undefined && payloadRefId !== null ? payloadRefId : client.referenceId,
          taxPeriod,
          billDate: parsedBillDate,
          dueDate: dueDate ? new Date(dueDate) : null,
          subtotal,
          discountAmount: discount,
          previousDue,
          grandTotal,
          paidAmount: 0,
          dueAmount,
          status: status === "draft" ? "draft" : "unpaid",
          createdBy: creatorId,
          notes: notes?.trim() || null
        })
        .returning()
    )[0];

    // 7. Insert Line Items
    if (items.length > 0) {
      await db.insert(billItems).values(
        items.map((it) => ({
          billId: newBill.id,
          serviceItemId: it.serviceItemId || null,
          itemName: it.itemName.trim(),
          unit: it.unit || "Month",
          qty: it.qty !== undefined && it.qty !== null ? Number(it.qty) : 1,
          rateUsed: it.rateUsed !== undefined && it.rateUsed !== null ? Number(it.rateUsed) : 0,
          minimumChargeUsed: it.minimumChargeUsed || 0,
          calculatedAmount: it.calculatedAmount || 0,
          finalAmount: it.finalAmount,
          notes: it.notes?.trim() || null
        }))
      );
    }

    return c.json(
      {
        message: `Invoice ${billNo} created successfully`,
        data: newBill
      },
      HttpStatusCodes.CREATED
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to create bill" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 7. BATCH GENERATE BILLS ──────────────────────────────────────────

export const batchGenerateBills: Handler = async (c: any) => {
  try {
    const payload = c.req.valid("json");
    const { taxPeriod, billDate, dueDate, clientIds } = payload;

    const parsedBillDate = billDate ? new Date(billDate) : new Date();
    const year = parsedBillDate.getFullYear();

    const auth = c.get("auth") || c.get("user");
    const creatorId = auth?.adminId ? Number(auth.adminId) : (auth?.id ? Number(auth.id) : null);
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

    // 1. Fetch all Active Clients
    const clientConditions: any[] = [eq(clients.isActive, true)];
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
        isActive: clients.isActive
      })
      .from(clients)
      .where(and(...clientConditions));

    const activeClients = await clientQuery;
    if (activeClients.length === 0) {
      return c.json({ message: "No active clients found" }, HttpStatusCodes.NOT_FOUND);
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

    const returnItem = allServices.find((s) => s.itemName.toLowerCase().includes("return"));
    const booksItem = allServices.find(
      (s) => s.itemName.toLowerCase().includes("books") || s.itemName.toLowerCase().includes("6.2.1")
    );

    const createdBillsList: any[] = [];
    let skippedCount = 0;

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

    const clientPurchaseMap = new Map<string, number>(purchaseRows.map((p) => [p.clientId, Number(p.totalNetWtKg) || 0]));

    for (const client of targetClients) {
      // Skip if already billed
      if (billedClientIds.has(client.id)) {
        skippedCount++;
        continue;
      }
      // Skip if NO finalized submission ID for this month
      if (!finalizedClientIds.has(client.id)) {
        skippedCount++;
        continue;
      }

      // Rates lookup for this client's customer type
      const clientRates = allRates.filter((r) => r.customerTypeId === client.customerTypeId || !r.customerTypeId);
      const netWtKg: number = Number(clientPurchaseMap.get(client.id)) || 0;
      const netWtMt = r2(netWtKg / 1000);
      const hasPurchases = netWtKg > 0;

      // 1. VAT Return Fee (Dynamic Regular vs Zero)
      let returnItem = null;
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
      const itemsToInsert: any[] = [];

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

      // Generate sequential billNo
      const billNo = await generateNextBillNo(year);

      // Insert Bill
      const billRecord = (
        await db
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
            status: "unpaid",
            createdBy: creatorId,
            notes: `Batch generated monthly bill for ${taxPeriod}`
          })
          .returning()
      )[0];

      // Insert Items
      await db.insert(billItems).values(
        itemsToInsert.map((it) => ({
          billId: billRecord.id,
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

      createdBillsList.push({
        id: billRecord.id,
        billNo: billRecord.billNo,
        companyName: client.companyName,
        grandTotal: billRecord.grandTotal
      });
    }

    return c.json(
      {
        message: `Batch generation complete. ${createdBillsList.length} invoices created successfully.`,
        createdCount: createdBillsList.length,
        skippedCount,
        data: createdBillsList
      },
      HttpStatusCodes.CREATED
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to batch generate bills" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 8. GET MISSING BILLS LIST ────────────────────────────────────────

export const getMissingBills: Handler = async (c: any) => {
  try {
    const query = c.req.valid("query");
    const month = query.month || query.taxPeriod || new Date().toISOString().slice(0, 7);
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    const clientConditions: any[] = [eq(clients.isActive, true)];
    if (!isSuperAdmin && tenantAdminId) {
      clientConditions.push(eq(clients.createdBy, tenantAdminId));
    }

    // Fetch all Active Clients for tenant
    const activeClients = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        binNumber: clients.binNumber,
        mobile: clients.mobile,
        customerTypeId: clients.customerTypeId,
        customerTypeName: customerTypes.typeName,
        referenceId: clients.referenceId,
        referenceName: clientReferences.name,
        vatServiceType: clients.vatServiceType
      })
      .from(clients)
      .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
      .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
      .where(and(...clientConditions))
      .orderBy(asc(clients.companyName));

    if (activeClients.length === 0) {
      return c.json({ message: "No active clients found", data: [] }, HttpStatusCodes.OK);
    }

    // Fetch already billed client IDs for this month
    const existingBills = await db
      .select({ clientId: bills.clientId })
      .from(bills)
      .where(
        and(
          eq(bills.taxPeriod, month),
          sql`${bills.status} != 'cancelled'`
        )
      );
    const billedSet = new Set(existingBills.map((b) => b.clientId));

    // Fetch finalized submissions for this month
    const submissions = await db
      .select({
        clientId: vatSubmissions.clientId,
        submissionId: vatSubmissions.submissionId,
        submittedAt: vatSubmissions.submittedAt
      })
      .from(vatSubmissions)
      .where(
        and(
          eq(vatSubmissions.taxPeriod, month),
          sql`${vatSubmissions.submissionId} IS NOT NULL AND ${vatSubmissions.submissionId} != ''`
        )
      );

    const subMap = new Map<number, any>(submissions.map((s) => [s.clientId, s]));

    // Fetch Master Services and Rates to calculate exact service fee
    const allServices = await db.select().from(serviceItems).where(eq(serviceItems.isActive, true));
    const allRates = await db.select().from(serviceRates);

    const returnItem = allServices.find((s) => s.itemName.toLowerCase().includes("return"));
    const booksItem = allServices.find(
      (s) => s.itemName.toLowerCase().includes("books") || s.itemName.toLowerCase().includes("6.2.1")
    );

    const missingList: any[] = [];
    const unbilledClients = activeClients.filter((cl) => !billedSet.has(cl.id));
    const batchDueMap = await getBatchClientsRunningDue(unbilledClients.map((cl) => cl.id));

    // Batch query purchases for missing month
    const purchaseRows = await db
      .select({
        clientId: purchases.clientId,
        totalNetWtKg: sql<number>`COALESCE(SUM(${purchases.netWt}), 0)`
      })
      .from(purchases)
      .where(eq(purchases.month, month))
      .groupBy(purchases.clientId);

    const clientPurchaseMap = new Map<string, number>(purchaseRows.map((p) => [p.clientId, Number(p.totalNetWtKg) || 0]));

    for (const cl of unbilledClients) {
      const sub = subMap.get(cl.id);
      const prevDue = batchDueMap.get(cl.id) || 0;

      // Compute exact service fee
      const clientRates = allRates.filter((r) => r.customerTypeId === cl.customerTypeId || !r.customerTypeId);
      const netWtKg: number = Number(clientPurchaseMap.get(cl.id)) || 0;
      const netWtMt = r2(netWtKg / 1000);
      const hasPurchases = netWtKg > 0;

      let returnItem = null;
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

      let monthlyServiceFee = returnRate;
      if (cl.vatServiceType === "FULL" && hasPurchases) {
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
        monthlyServiceFee += booksMin > 0 ? Math.max(calculatedAmt, booksMin) : calculatedAmt;
      }

      missingList.push({
        id: cl.id,
        companyName: cl.companyName,
        binNumber: cl.binNumber,
        mobile: cl.mobile,
        customerTypeId: cl.customerTypeId,
        customerTypeName: cl.customerTypeName,
        referenceId: cl.referenceId,
        referenceName: cl.referenceName,
        vatServiceType: cl.vatServiceType,
        targetMonth: month,
        submissionId: sub ? sub.submissionId : null,
        isSubmitted: !!sub,
        previousDue: prevDue,
        monthlyServiceFee: r2(monthlyServiceFee)
      });
    }

    return c.json(
      {
        message: "Missing bills fetched successfully",
        data: missingList,
        totalMissing: missingList.length,
        readyToBillCount: missingList.filter((m) => m.isSubmitted).length
      },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to fetch missing bills" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 9. UPDATE & DELETE BILL ──────────────────────────────────────────

export const updateBill: Handler = async (c: any) => {
  try {
    const id = Number(c.req.param("id"));
    const payload = c.req.valid("json");

    const existing = (
      await db.select().from(bills).where(eq(bills.id, id)).limit(1)
    )[0];

    if (!existing) {
      return c.json({ message: "Bill not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const updatedData: any = {
      updatedAt: new Date()
    };

    if (payload.billDate) updatedData.billDate = new Date(payload.billDate);
    if (payload.dueDate !== undefined) updatedData.dueDate = payload.dueDate ? new Date(payload.dueDate) : null;
    if (payload.notes !== undefined) updatedData.notes = payload.notes;
    if (payload.status) updatedData.status = payload.status;

    if (payload.items && payload.items.length > 0) {
      // Recompute subtotal
      const newSubtotal = r2(payload.items.reduce((acc, it) => acc + (it.finalAmount || 0), 0));
      const discount = payload.discountAmount !== undefined ? r2(payload.discountAmount) : existing.discountAmount;
      const grandTotal = r2(Math.max(0, newSubtotal - discount + existing.previousDue));
      const dueAmount = r2(Math.max(0, grandTotal - existing.paidAmount));

      updatedData.subtotal = newSubtotal;
      updatedData.discountAmount = discount;
      updatedData.grandTotal = grandTotal;
      updatedData.dueAmount = dueAmount;

      // Replace items
      await db.delete(billItems).where(eq(billItems.billId, id));
      await db.insert(billItems).values(
        payload.items.map((it) => ({
          billId: id,
          serviceItemId: it.serviceItemId || null,
          itemName: it.itemName.trim(),
          unit: it.unit || "Month",
          qty: it.qty !== undefined && it.qty !== null ? Number(it.qty) : 1,
          rateUsed: it.rateUsed !== undefined && it.rateUsed !== null ? Number(it.rateUsed) : 0,
          minimumChargeUsed: it.minimumChargeUsed || 0,
          calculatedAmount: it.calculatedAmount || 0,
          finalAmount: it.finalAmount,
          notes: it.notes?.trim() || null
        }))
      );
    }

    const result = (
      await db.update(bills).set(updatedData).where(eq(bills.id, id)).returning()
    )[0];

    return c.json(
      { message: `Invoice ${existing.billNo} updated successfully`, data: result },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to update bill" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const deleteBill: Handler = async (c: any) => {
  try {
    const id = Number(c.req.param("id"));
    const existing = (
      await db.select().from(bills).where(eq(bills.id, id)).limit(1)
    )[0];

    if (!existing) {
      return c.json({ message: "Bill not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Delete bill items cascade and delete bill
    await db.delete(billItems).where(eq(billItems.billId, id));
    await db.delete(bills).where(eq(bills.id, id));

    return c.json(
      { message: `Invoice ${existing.billNo} deleted successfully` },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to delete bill" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

// ── 10. COLLECTIONS & MONEY RECEIPTS ─────────────────────────────────

export const listCollections: Handler = async (c: any) => {
  try {
    const query = c.req.valid("query");
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
    let conditions: any[] = [];

    if (!isSuperAdmin && tenantAdminId) {
      conditions.push(eq(clients.createdBy, tenantAdminId));
    }
    if (query.clientId && query.clientId !== "all") {
      conditions.push(eq(collections.clientId, Number(query.clientId)));
    }
    if (query.paymentMethod && query.paymentMethod !== "all") {
      conditions.push(eq(collections.paymentMethod, query.paymentMethod));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: collections.id,
        receiptNo: collections.receiptNo,
        billId: collections.billId,
        billNo: bills.billNo,
        clientId: collections.clientId,
        clientName: clients.companyName,
        clientBin: clients.binNumber,
        collectionDate: collections.collectionDate,
        amount: collections.amount,
        paymentMethod: collections.paymentMethod,
        referenceNo: collections.referenceNo,
        notes: collections.notes,
        receivedById: collections.receivedBy,
        receivedByName: users.name,
        status: collections.status,
        createdAt: collections.createdAt
      })
      .from(collections)
      .leftJoin(clients, eq(collections.clientId, clients.id))
      .leftJoin(bills, eq(collections.billId, bills.id))
      .leftJoin(users, eq(collections.receivedBy, users.id))
      .where(whereClause)
      .orderBy(desc(collections.id));

    let list = rows;
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.receiptNo.toLowerCase().includes(q) ||
          r.clientName?.toLowerCase().includes(q) ||
          r.billNo?.toLowerCase().includes(q) ||
          r.referenceNo?.toLowerCase().includes(q)
      );
    }

    const totalCollected = r2(list.filter((r) => r.status === "completed").reduce((acc, c) => acc + c.amount, 0));

    return c.json(
      {
        message: "Collections fetched successfully",
        data: list,
        totalCollected,
        count: list.length
      },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to fetch collections" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const createCollection: Handler = async (c: any) => {
  try {
    const payload = c.req.valid("json");
    const { clientId, billId, collectionDate, amount, paymentMethod, referenceNo, notes } = payload;
    const { userId } = await resolveTenantContext(c);

    const client = (
      await db.select().from(clients).where(eq(clients.id, clientId)).limit(1)
    )[0];

    if (!client) {
      return c.json({ message: "Client not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const parsedDate = new Date(collectionDate);
    const year = parsedDate.getFullYear() || new Date().getFullYear();

    // Generate Money Receipt No: MR-YYYY-000001
    const receiptNo = await generateNextReceiptNo(year);

    const newCollection = (
      await db
        .insert(collections)
        .values({
          receiptNo,
          billId: billId || null,
          clientId,
          collectionDate: parsedDate,
          amount: r2(amount),
          paymentMethod,
          referenceNo: referenceNo?.trim() || null,
          notes: notes?.trim() || null,
          receivedBy: userId,
          status: "completed"
        })
        .returning()
    )[0];

    // If linked to a specific bill, update bill's paidAmount & dueAmount
    if (billId) {
      const targetBill = (
        await db.select().from(bills).where(eq(bills.id, billId)).limit(1)
      )[0];

      if (targetBill) {
        const newPaid = r2(targetBill.paidAmount + amount);
        const newDue = r2(Math.max(0, targetBill.grandTotal - newPaid));
        let newStatus = targetBill.status;

        if (newDue === 0) {
          newStatus = "paid";
        } else if (newPaid > 0) {
          newStatus = "partial";
        }

        await db
          .update(bills)
          .set({
            paidAmount: newPaid,
            dueAmount: newDue,
            status: newStatus,
            updatedAt: new Date()
          })
          .where(eq(bills.id, billId));
      }
    }

    return c.json(
      {
        message: `Payment receipt ${receiptNo} created successfully`,
        data: newCollection
      },
      HttpStatusCodes.CREATED
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to record collection" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};

export const cancelCollection: Handler = async (c: any) => {
  try {
    const id = Number(c.req.param("id"));
    const col = (
      await db.select().from(collections).where(eq(collections.id, id)).limit(1)
    )[0];

    if (!col) {
      return c.json({ message: "Collection not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Mark collection cancelled
    await db
      .update(collections)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(collections.id, id));

    // Revert linked bill amounts if applicable
    if (col.billId) {
      const targetBill = (
        await db.select().from(bills).where(eq(bills.id, col.billId)).limit(1)
      )[0];

      if (targetBill) {
        const newPaid = r2(Math.max(0, targetBill.paidAmount - col.amount));
        const newDue = r2(targetBill.grandTotal - newPaid);
        let newStatus: string = "unpaid";
        if (newPaid > 0) newStatus = "partial";

        await db
          .update(bills)
          .set({
            paidAmount: newPaid,
            dueAmount: newDue,
            status: newStatus,
            updatedAt: new Date()
          })
          .where(eq(bills.id, col.billId));
      }
    }

    return c.json(
      { message: `Receipt ${col.receiptNo} cancelled successfully` },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json(
      { message: err.message || "Failed to cancel collection" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};
