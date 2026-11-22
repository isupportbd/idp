import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, round2 as r2 } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { bills } from "../database/models/bills.js";
import { collections } from "../database/models/collections.js";

export interface ReconciledBillingStats {
  totalInvoicesCount: number;
  totalPreviousDueAmount: number;
  totalBilledAmount: number;
  totalPaidAmount: number;
  totalDueAmount: number;
  periodicDueAmount: number;
  paidCount: number;
  unpaidCount: number;
  partialCount: number;
}

/**
 * Computes exact ledger-accurate overview statistics for the Billing screen,
 * ensuring that Previous Due matches Ledger Opening Balance, and Total Dues
 * matches Ledger Closing Balance without relying on stale static columns.
 */
export async function getReconciledBillingStats(params: {
  month?: string;
  referenceId?: number;
  clientId?: number;
  customerTypeId?: number;
  tenantAdminId?: number | null;
  isSuperAdmin?: boolean;
}): Promise<ReconciledBillingStats> {
  const { month, referenceId, clientId, customerTypeId, tenantAdminId, isSuperAdmin } = params;

  // 1. Matched clients based on scope
  const clientConds: any[] = [];
  if (!isSuperAdmin && tenantAdminId) {
    clientConds.push(eq(clients.createdBy, tenantAdminId));
  }
  if (clientId) clientConds.push(eq(clients.id, clientId));
  if (referenceId) clientConds.push(eq(clients.referenceId, referenceId));
  if (customerTypeId) clientConds.push(eq(clients.customerTypeId, customerTypeId));

  const matchedClients = await db
    .select({
      id: clients.id,
      openingBalance: clients.openingBalance
    })
    .from(clients)
    .where(clientConds.length > 0 ? and(...clientConds) : undefined);

  if (matchedClients.length === 0) {
    return {
      totalInvoicesCount: 0,
      totalPreviousDueAmount: 0,
      totalBilledAmount: 0,
      totalPaidAmount: 0,
      totalDueAmount: 0,
      periodicDueAmount: 0,
      paidCount: 0,
      unpaidCount: 0,
      partialCount: 0
    };
  }

  const clientIds = matchedClients.map((c) => c.id);
  const totalClientOpening = matchedClients.reduce((acc, c) => acc + (Number(c.openingBalance) || 0), 0);

  if (!month || month === "all") {
    // If no month is selected, compute overall across all active bills
    const [statsResult] = await db
      .select({
        totalInvoicesCount: sql<number>`count(*)::int`,
        totalPreviousDueAmount: sql<number>`coalesce(sum(${bills.previousDue}), 0)::float`,
        totalBilledAmount: sql<number>`coalesce(sum(${bills.subtotal} - ${bills.discountAmount}), 0)::float`,
        totalPaidAmount: sql<number>`coalesce(sum(${bills.paidAmount}), 0)::float`,
        totalDueAmount: sql<number>`coalesce(sum(${bills.dueAmount}), 0)::float`,
        periodicDueAmount: sql<number>`coalesce(sum(greatest(0, (${bills.subtotal} - ${bills.discountAmount}) - greatest(0, ${bills.paidAmount} - ${bills.previousDue}))), 0)::float`,
        paidCount: sql<number>`coalesce(sum(case when ${bills.status} = 'paid' then 1 else 0 end), 0)::int`,
        unpaidCount: sql<number>`coalesce(sum(case when ${bills.status} = 'unpaid' then 1 else 0 end), 0)::int`,
        partialCount: sql<number>`coalesce(sum(case when ${bills.status} = 'partial' then 1 else 0 end), 0)::int`
      })
      .from(bills)
      .where(and(inArray(bills.clientId, clientIds), sql`${bills.status} != 'cancelled'`));

    return {
      totalInvoicesCount: statsResult?.totalInvoicesCount || 0,
      totalPreviousDueAmount: r2(statsResult?.totalPreviousDueAmount || 0),
      totalBilledAmount: r2(statsResult?.totalBilledAmount || 0),
      totalPaidAmount: r2(statsResult?.totalPaidAmount || 0),
      totalDueAmount: r2(statsResult?.totalDueAmount || 0),
      periodicDueAmount: r2(statsResult?.periodicDueAmount || 0),
      paidCount: statsResult?.paidCount || 0,
      unpaidCount: statsResult?.unpaidCount || 0,
      partialCount: statsResult?.partialCount || 0
    };
  }

  // Exact period dates
  const fromDateStr = `${month}-01`;
  const [yearStr, mStr] = month.split("-");
  const y = parseInt(yearStr, 10);
  const m = parseInt(mStr, 10);
  const lastDay = new Date(y, m, 0).getDate();
  const toDateStr = `${month}-${String(lastDay).padStart(2, "0")}`;

  // 1. Prior bills before selected month
  const [priorBillsRow] = await db
    .select({
      sum: sql<number>`coalesce(sum(${bills.subtotal} - ${bills.discountAmount}), 0)::float`
    })
    .from(bills)
    .where(and(inArray(bills.clientId, clientIds), sql`${bills.taxPeriod} < ${month}`, sql`${bills.status} != 'cancelled'`));

  // 2. Prior collections before selected month start
  const [priorColsRow] = await db
    .select({
      sum: sql<number>`coalesce(sum(${collections.amount}), 0)::float`
    })
    .from(collections)
    .where(and(inArray(collections.clientId, clientIds), sql`${collections.collectionDate} < ${fromDateStr}`, eq(collections.status, "completed")));

  // Ledger Opening Balance for matching clients
  const openingBalance = r2(totalClientOpening + (priorBillsRow?.sum || 0) - (priorColsRow?.sum || 0));

  // 3. In-period bills (taxPeriod == month)
  const [inPeriodBillsRow] = await db
    .select({
      count: sql<number>`count(*)::int`,
      billed: sql<number>`coalesce(sum(${bills.subtotal} - ${bills.discountAmount}), 0)::float`,
      paidForBills: sql<number>`coalesce(sum(${bills.paidAmount}), 0)::float`,
      paidCount: sql<number>`coalesce(sum(case when ${bills.status} = 'paid' then 1 else 0 end), 0)::int`,
      unpaidCount: sql<number>`coalesce(sum(case when ${bills.status} = 'unpaid' then 1 else 0 end), 0)::int`,
      partialCount: sql<number>`coalesce(sum(case when ${bills.status} = 'partial' then 1 else 0 end), 0)::int`
    })
    .from(bills)
    .where(and(inArray(bills.clientId, clientIds), eq(bills.taxPeriod, month), sql`${bills.status} != 'cancelled'`));

  // 4. In-period collections (collectionDate within month)
  const [inPeriodColsRow] = await db
    .select({
      collected: sql<number>`coalesce(sum(${collections.amount}), 0)::float`
    })
    .from(collections)
    .where(
      and(
        inArray(collections.clientId, clientIds),
        sql`${collections.collectionDate} >= ${fromDateStr} and ${collections.collectionDate} <= ${toDateStr}`,
        eq(collections.status, "completed")
      )
    );

  const totalBilled = r2(inPeriodBillsRow?.billed || 0);
  const totalCollected = r2(inPeriodColsRow?.collected || 0);

  // Reconciled Total Dues = Opening Balance + Period Invoiced - Period Collections
  const totalDues = r2(openingBalance + totalBilled - totalCollected);

  // Periodic Due = Current month bills not yet covered
  const periodicDue = r2(Math.max(0, totalBilled - (inPeriodBillsRow?.paidForBills || 0)));

  return {
    totalInvoicesCount: inPeriodBillsRow?.count || 0,
    totalPreviousDueAmount: openingBalance,
    totalBilledAmount: totalBilled,
    totalPaidAmount: totalCollected,
    totalDueAmount: totalDues,
    periodicDueAmount: periodicDue,
    paidCount: inPeriodBillsRow?.paidCount || 0,
    unpaidCount: inPeriodBillsRow?.unpaidCount || 0,
    partialCount: inPeriodBillsRow?.partialCount || 0
  };
}

/**
 * Self-healing balance reconciler:
 * Recalculates and synchronizes `previousDue`, `grandTotal`, `paidAmount`, and `dueAmount`
 * on the `bills` table to permanently fix any stale or drifted snapshot rows.
 */
export async function reconcileBillsForPeriod(month?: string, clientId?: number, tenantAdminId?: number | null): Promise<number> {
  const clientConds: any[] = [];
  if (tenantAdminId) clientConds.push(eq(clients.createdBy, tenantAdminId));
  if (clientId) clientConds.push(eq(clients.id, clientId));

  const allClients = await db
    .select({
      id: clients.id,
      openingBalance: clients.openingBalance
    })
    .from(clients)
    .where(clientConds.length > 0 ? and(...clientConds) : undefined);

  let updatedCount = 0;

  for (const cl of allClients) {
    const initialOpening = Number(cl.openingBalance) || 0;

    const clBills = await db
      .select()
      .from(bills)
      .where(and(eq(bills.clientId, cl.id), sql`${bills.status} != 'cancelled'`))
      .orderBy(asc(bills.taxPeriod), asc(bills.id));

    const clCols = await db
      .select()
      .from(collections)
      .where(and(eq(collections.clientId, cl.id), eq(collections.status, "completed")))
      .orderBy(asc(collections.collectionDate), asc(collections.id));

    for (const b of clBills) {
      if (month && month !== "all" && b.taxPeriod !== month) continue;

      const priorBillsSum = clBills
        .filter((pb) => pb.taxPeriod < b.taxPeriod)
        .reduce((sum, pb) => sum + Math.max(0, (Number(pb.subtotal) || 0) - (Number(pb.discountAmount) || 0)), 0);

      const fromDate = `${b.taxPeriod}-01`;
      const toDateOnlyStr = (d: any) => {
        if (!d) return "";
        if (typeof d === "string") return d.slice(0, 10);
        return new Date(d).toISOString().slice(0, 10);
      };

      const priorColsSum = clCols
        .filter((c) => toDateOnlyStr(c.collectionDate) < fromDate)
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

      const calculatedPreviousDue = r2(initialOpening + priorBillsSum - priorColsSum);
      const currentBilled = r2(Math.max(0, (Number(b.subtotal) || 0) - (Number(b.discountAmount) || 0)));
      const calculatedGrandTotal = r2(currentBilled + calculatedPreviousDue);

      const [yStr, mStr] = b.taxPeriod.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const lastDay = new Date(y, m, 0).getDate();
      const toDate = `${b.taxPeriod}-${String(lastDay).padStart(2, "0")}`;

      const totalColsUpToPeriod = clCols
        .filter((c) => toDateOnlyStr(c.collectionDate) <= toDate)
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

      // Collections specifically tagged to this bill that occurred after the period month
      const subsequentLinkedCols = clCols
        .filter((c) => toDateOnlyStr(c.collectionDate) > toDate && c.billId === b.id)
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

      const totalBilledUpToPeriod = initialOpening + priorBillsSum + currentBilled;
      const periodOutstandingDue = r2(Math.max(0, totalBilledUpToPeriod - totalColsUpToPeriod));
      
      // Net live outstanding due considering subsequent direct payments for this invoice
      const outstandingDue = r2(Math.max(0, periodOutstandingDue - subsequentLinkedCols));
      const effectivePaid = r2(Math.max(0, calculatedGrandTotal - outstandingDue));

      let newStatus = b.status;
      if (outstandingDue <= 0) {
        newStatus = "paid";
      } else if (effectivePaid > 0) {
        newStatus = "partial";
      } else {
        newStatus = "unpaid";
      }

      if (
        r2(Number(b.previousDue)) !== calculatedPreviousDue ||
        r2(Number(b.grandTotal)) !== calculatedGrandTotal ||
        r2(Number(b.dueAmount)) !== outstandingDue ||
        r2(Number(b.paidAmount)) !== effectivePaid ||
        b.status !== newStatus
      ) {
        await db
          .update(bills)
          .set({
            previousDue: calculatedPreviousDue,
            grandTotal: calculatedGrandTotal,
            paidAmount: effectivePaid,
            dueAmount: outstandingDue,
            status: newStatus,
            updatedAt: new Date()
          })
          .where(eq(bills.id, b.id));
        updatedCount++;
      }
    }
  }

  return updatedCount;
}
