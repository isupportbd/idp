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
import { billItems } from "../database/models/bill_items.js";
import { bills } from "../database/models/bills.js";
import { collections } from "../database/models/collections.js";
import { getClientRunningDue } from "../services/billing-balance.service.js";
import { clientBelongsToTenant, r2, type SuggestedBillItem } from "./billing.helpers.js";

// ── 5. CLIENT BILLING OVERVIEW & AUTO-ITEMS HELPER ───────────────────

export const getClientBillingOverview = async (c: AppContext) => {
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
        and(eq(vatSubmissions.clientId, clientId), sql`${vatSubmissions.submissionId} IS NOT NULL AND ${vatSubmissions.submissionId} != ''`)
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
      .where(and(eq(bills.clientId, clientId), sql`${bills.status} != 'cancelled'`));

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
      .where(and(eq(purchases.clientId, clientId), eq(purchases.month, targetMonth)));

    const totalNetWtKg = Number(purchaseVolumeRes[0]?.totalNetWt) || 0;
    const totalNetWtMt = r2(totalNetWtKg / 1000);
    const purchaseCount = Number(purchaseVolumeRes[0]?.count) || 0;

    // 5. Fetch Master Service Items & Rates for this customer type
    const allServiceItems = await db.select().from(serviceItems).where(eq(serviceItems.isActive, true));

    const allRates = await db.select().from(serviceRates);

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
    const suggestedItems: SuggestedBillItem[] = [];
    const hasMonthlyPurchases = purchaseCount > 0 || totalNetWtKg > 0;

    // Item A: VAT Return Submission (Dynamic Regular vs Zero selection)
    let returnItem = null;
    if (hasMonthlyPurchases) {
      returnItem = allServiceItems.find((s) => s.itemName.toLowerCase().includes("return") && s.itemName.toLowerCase().includes("regular"));
    } else {
      returnItem = allServiceItems.find((s) => s.itemName.toLowerCase().includes("return") && s.itemName.toLowerCase().includes("zero"));
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
      notes: `${hasMonthlyPurchases ? "Regular" : "Zero"} monthly VAT return filing for ${targetMonth}`
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
        notes: `Purchase & Sales accounts maintenance for ${targetMonth}${qty > 0 && (unitUpper === "MT" || unitUpper === "KG") ? ` (${qty} ${booksUnit})` : ""}`
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
            unit: rateMap[s.id]?.unit || "Month",
            regularRate: rateMap[s.id]?.regularRate || 0,
            minimumCharge: rateMap[s.id]?.minimumCharge || 0
          }))
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json({ message: "Failed to fetch client billing overview" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 6. CREATE SINGLE BILL ────────────────────────────────────────────
