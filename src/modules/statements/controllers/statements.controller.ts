import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Handler } from "hono";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { purchases } from "@/modules/clients/database/models/purchases.js";
import { vatSubmissions } from "@/modules/clients/database/models/vat_submissions.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";

/**
 * Generates an array of "YYYY-MM" strings between fromMonth and toMonth (inclusive)
 */
function generateMonthRange(fromMonth: string, toMonth: string): string[] {
  const result: string[] = [];
  const [startY, startM] = fromMonth.split("-").map(Number);
  const [endY, endM] = toMonth.split("-").map(Number);

  if (isNaN(startY) || isNaN(startM) || isNaN(endY) || isNaN(endM)) {
    return [fromMonth];
  }

  const cur = new Date(startY, startM - 1, 1);
  const end = new Date(endY, endM - 1, 1);

  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    result.push(`${y}-${m}`);
    cur.setMonth(cur.getMonth() + 1);
  }

  return result;
}

export const getStatementReport: Handler = async (c: any) => {
  try {
    const query = c.req.query();
    const { isSuperAdmin, isTenantAdmin, tenantAdminId, userId } = await resolveTenantContext(c);

    const fromMonth = query.fromMonth || query.from || "";
    const toMonth = query.toMonth || query.to || fromMonth || "";
    const clientIdParam = query.clientId ? Number(query.clientId) : null;
    const customerTypeIdParam = query.customerTypeId && query.customerTypeId !== "all" ? Number(query.customerTypeId) : null;
    const referenceIdParam = query.referenceId && query.referenceId !== "all" ? Number(query.referenceId) : null;

    if (!fromMonth || !toMonth) {
      return c.json({ success: false, message: "Start month and end month are required" }, HttpStatusCodes.BAD_REQUEST);
    }

    if (fromMonth > toMonth) {
      return c.json(
        { success: false, message: "Start month cannot be later than end month" },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    // 1. Build Client filter conditions
    const clientConditions: any[] = [eq(clients.isActive, true)];

    if (!isSuperAdmin && tenantAdminId) {
      clientConditions.push(eq(clients.createdBy, tenantAdminId));
    }

    if (!isSuperAdmin && !isTenantAdmin) {
      clientConditions.push(
        sql`${clients.id} IN (SELECT client_id FROM client_managers WHERE manager_id = ${userId})`
      );
    }

    if (clientIdParam) {
      clientConditions.push(eq(clients.id, clientIdParam));
    }

    if (customerTypeIdParam) {
      clientConditions.push(eq(clients.customerTypeId, customerTypeIdParam));
    }

    if (referenceIdParam) {
      clientConditions.push(eq(clients.referenceId, referenceIdParam));
    }

    // 2. Fetch matched clients
    const matchedClients = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        binNumber: clients.binNumber,
        mobile: clients.mobile,
        customerTypeId: clients.customerTypeId,
        customerTypeName: customerTypes.typeName,
        referenceId: clients.referenceId,
        referenceName: clientReferences.name
      })
      .from(clients)
      .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
      .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
      .where(and(...clientConditions))
      .orderBy(asc(clients.companyName));

    if (matchedClients.length === 0) {
      return c.json({
        success: true,
        data: [],
        clientSummaries: [],
        months: generateMonthRange(fromMonth, toMonth)
      });
    }

    const clientIds = matchedClients.map((cl) => cl.id);
    const months = generateMonthRange(fromMonth, toMonth);

    // 3. Fetch aggregated purchases per client & month
    // Group by client_id and month: sum totalQty, count distinct be_no
    const purchaseAggregates = await db
      .select({
        clientId: purchases.clientId,
        month: purchases.month,
        totalQty: sql<number>`COALESCE(SUM(${purchases.totalQty}), 0)`,
        beCount: sql<number>`COUNT(DISTINCT ${purchases.beNo})`
      })
      .from(purchases)
      .where(
        and(
          inArray(purchases.clientId, clientIds),
          gte(purchases.month, fromMonth),
          lte(purchases.month, toMonth)
        )
      )
      .groupBy(purchases.clientId, purchases.month);

    // 4. Fetch VAT Submissions for these clients and months
    const submissionsList = await db
      .select({
        clientId: vatSubmissions.clientId,
        taxPeriod: vatSubmissions.taxPeriod,
        submissionId: vatSubmissions.submissionId,
        status: vatSubmissions.status
      })
      .from(vatSubmissions)
      .where(
        and(
          inArray(vatSubmissions.clientId, clientIds),
          gte(vatSubmissions.taxPeriod, fromMonth),
          lte(vatSubmissions.taxPeriod, toMonth)
        )
      );

    // 5. Build lookup maps
    const purchaseMap = new Map<string, { totalQty: number; beCount: number }>();
    for (const p of purchaseAggregates) {
      purchaseMap.set(`${p.clientId}_${p.month}`, {
        totalQty: Number(p.totalQty) || 0,
        beCount: Number(p.beCount) || 0
      });
    }

    const subMap = new Map<string, { submissionId: string; status: string }>();
    for (const s of submissionsList) {
      subMap.set(`${s.clientId}_${s.taxPeriod}`, {
        submissionId: s.submissionId || "",
        status: s.status || "submitted"
      });
    }

    // 6. Assemble the statement rows grouped by client
    const statementRows: any[] = [];
    const clientSummaries: any[] = [];

    for (const cl of matchedClients) {
      let clientTotalQty = 0;
      let clientTotalBeCount = 0;
      let clientSubmittedCount = 0;
      let clientActivityMonths = 0;
      const clientMonthRows: any[] = [];

      for (const m of months) {
        const pData = purchaseMap.get(`${cl.id}_${m}`) || { totalQty: 0, beCount: 0 };
        const sData = subMap.get(`${cl.id}_${m}`);

        clientTotalQty += pData.totalQty;
        clientTotalBeCount += pData.beCount;
        if (pData.totalQty > 0 || pData.beCount > 0) {
          clientActivityMonths++;
        }
        if (sData?.submissionId) {
          clientSubmittedCount++;
        }

        const row = {
          clientId: cl.id,
          companyName: cl.companyName,
          binNumber: cl.binNumber || "",
          customerTypeName: cl.customerTypeName || "",
          referenceName: cl.referenceName || "",
          month: m,
          totalQty: pData.totalQty,
          beCount: pData.beCount,
          submissionId: sData?.submissionId || "",
          submissionStatus: sData?.status || ""
        };

        clientMonthRows.push(row);
        statementRows.push(row);
      }

      clientSummaries.push({
        client: cl,
        totalQty: clientTotalQty,
        totalBeCount: clientTotalBeCount,
        submittedCount: clientSubmittedCount,
        monthCount: months.length,
        activityMonths: clientActivityMonths,
        rows: clientMonthRows
      });
    }

    return c.json({
      success: true,
      data: statementRows,
      clientSummaries,
      meta: {
        fromMonth,
        toMonth,
        monthCount: months.length,
        clientCount: matchedClients.length,
        totalRows: statementRows.length
      }
    });
  } catch (error: any) {
    console.error("Error generating statements:", error);
    return c.json(
      { success: false, message: "Failed to generate statement", error: error?.message },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};
