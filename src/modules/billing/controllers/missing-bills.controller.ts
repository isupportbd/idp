import { and, asc, desc, eq, ilike, inArray, like, ne, or, type SQL, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { purchases } from "@/modules/purchases/database/models/purchases.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";
import { serviceRates } from "@/modules/services/database/models/service_rates.js";
import { vatSubmissions } from "@/modules/submissions/database/models/vat_submissions.js";
import { bills } from "../database/models/bills.js";
import { getBatchClientsRunningDue } from "../services/billing-balance.service.js";
import { type MissingBillingClient, r2 } from "./billing.helpers.js";

// ── 8. GET MISSING BILLS LIST ────────────────────────────────────────

export const getMissingBills = async (c: AppContext) => {
  try {
    const query = c.req.valid("query");
    const month = query.month || query.taxPeriod || new Date().toISOString().slice(0, 7);
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    const clientConditions: SQL[] = [eq(clients.isActive, true)];
    if (!isSuperAdmin && tenantAdminId) {
      clientConditions.push(eq(clients.createdBy, tenantAdminId));
    }
    if (query.customerTypeId && query.customerTypeId !== "all") {
      clientConditions.push(eq(clients.customerTypeId, Number(query.customerTypeId)));
    }
    if (query.referenceId && query.referenceId !== "all") {
      clientConditions.push(eq(clients.referenceId, Number(query.referenceId)));
    }

    // Fetch all Active Clients for tenant
    const activeClients = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        proprietorName: clients.proprietorName,
        binNumber: clients.binNumber,
        mobile: clients.mobile,
        tinNumber: clients.tinNumber,
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
      return c.json({ message: "No active clients found", data: [], totalMissing: 0, readyToBillCount: 0 }, HttpStatusCodes.OK);
    }

    // Fetch already billed client IDs for this month
    const existingBills = await db
      .select({ clientId: bills.clientId })
      .from(bills)
      .where(and(eq(bills.taxPeriod, month), sql`${bills.status} != 'cancelled'`));
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
        and(eq(vatSubmissions.taxPeriod, month), sql`${vatSubmissions.submissionId} IS NOT NULL AND ${vatSubmissions.submissionId} != ''`)
      );

    const subMap = new Map<number, (typeof submissions)[number]>(submissions.map((s) => [s.clientId, s]));

    // Fetch Master Services and Rates to calculate exact service fee
    const allServices = await db.select().from(serviceItems).where(eq(serviceItems.isActive, true));
    const allRates = await db.select().from(serviceRates);

    const missingList: MissingBillingClient[] = [];
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

    const clientPurchaseMap = new Map<number, number>(purchaseRows.map((p): [number, number] => [p.clientId, Number(p.totalNetWtKg) || 0]));

    for (const cl of unbilledClients) {
      const sub = subMap.get(cl.id);
      const prevDue = batchDueMap.get(cl.id) || 0;

      // Compute exact service fee
      const clientRates = allRates.filter((r) => r.customerTypeId === cl.customerTypeId || !r.customerTypeId);
      const netWtKg: number = clientPurchaseMap.get(cl.id) ?? 0;
      const netWtMt = r2(netWtKg / 1000);
      const hasPurchases = netWtKg > 0;

      let returnItem = null;
      if (hasPurchases) {
        returnItem = allServices.find((s) => s.itemName.toLowerCase().includes("return") && s.itemName.toLowerCase().includes("regular"));
      } else {
        returnItem = allServices.find((s) => s.itemName.toLowerCase().includes("return") && s.itemName.toLowerCase().includes("zero"));
      }
      if (!returnItem) {
        returnItem = allServices.find((s) => s.itemName.toLowerCase().includes("return"));
      }

      const returnRateObj = clientRates.find((r) => returnItem && r.serviceItemId === returnItem.id);
      const returnRate = returnRateObj ? returnRateObj.regularRate : 0;

      let monthlyServiceFee = returnRate;
      if (cl.vatServiceType === "FULL" && hasPurchases) {
        const booksItem = allServices.find((s) => s.itemName.toLowerCase().includes("books") || s.itemName.toLowerCase().includes("6.2.1"));
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
        proprietorName: cl.proprietorName,
        binNumber: cl.binNumber,
        mobile: cl.mobile,
        tinNumber: cl.tinNumber,
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

    let resultList = missingList;
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      resultList = resultList.filter(
        (m) =>
          (m.companyName && m.companyName.toLowerCase().includes(q)) ||
          (m.proprietorName && m.proprietorName.toLowerCase().includes(q)) ||
          (m.binNumber && m.binNumber.toLowerCase().includes(q)) ||
          (m.mobile && m.mobile.toLowerCase().includes(q)) ||
          (m.tinNumber && m.tinNumber.toLowerCase().includes(q)) ||
          (m.referenceName && m.referenceName.toLowerCase().includes(q)) ||
          (m.customerTypeName && m.customerTypeName.toLowerCase().includes(q)) ||
          (m.submissionId && m.submissionId.toLowerCase().includes(q)) ||
          (m.vatServiceType && m.vatServiceType.toLowerCase().includes(q))
      );
    }

    return c.json(
      {
        message: "Missing bills fetched successfully",
        data: resultList,
        totalMissing: resultList.length,
        readyToBillCount: resultList.filter((m) => m.isSubmitted).length
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json({ message: "Failed to fetch missing bills" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 9. UPDATE & DELETE BILL ──────────────────────────────────────────
