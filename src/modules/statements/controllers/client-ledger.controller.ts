import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { bills } from "@/modules/billing/database/models/bills.js";
import { collections } from "@/modules/billing/database/models/collections.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";

export interface LedgerTransaction {
  id: string;
  type: "opening" | "bill" | "collection";
  date: string;
  taxPeriod: string;
  refNo: string;
  description: string;
  paymentMethod?: string;
  debit: number;
  credit: number;
  balance: number;
  status: string;
  billId?: number | null;
  receiptId?: number | null;
}

export interface ClientLedgerSummary {
  clientId: number;
  companyName: string;
  binNumber: string;
  mobile: string;
  referenceId: number | null;
  referenceName: string;
  openingBalance: number;
  totalBilled: number;
  totalPaid: number;
  closingBalance: number;
  transactions?: LedgerTransaction[];
}

export const getClientLedgerStatement = async (c: AppContext) => {
  try {
    const query = c.req.query();
    const { isSuperAdmin, isTenantAdmin, tenantAdminId, userId } = await resolveTenantContext(c);

    const fromMonth = query.fromMonth || query.from || "";
    const toMonth = query.toMonth || query.to || fromMonth || "";
    const clientIdParam = query.clientId && query.clientId !== "all" ? Number(query.clientId) : null;
    const referenceIdParam = query.referenceId && query.referenceId !== "all" ? Number(query.referenceId) : null;
    const customerTypeIdParam = query.customerTypeId && query.customerTypeId !== "all" ? Number(query.customerTypeId) : null;

    if (!fromMonth || !toMonth) {
      return c.json({ success: false, message: "Start month and end month are required (e.g. 2026-06 to 2026-11)" }, HttpStatusCodes.BAD_REQUEST);
    }

    if (fromMonth > toMonth) {
      return c.json({ success: false, message: "Start month cannot be later than end month" }, HttpStatusCodes.BAD_REQUEST);
    }

    const [startY, startM] = fromMonth.split("-").map(Number);
    const [endY, endM] = toMonth.split("-").map(Number);
    const fromDate = new Date(startY, startM - 1, 1, 0, 0, 0);
    const toDate = new Date(endY, endM, 0, 23, 59, 59, 999);

    // 1. Build Client filter conditions
    const clientConditions: import("drizzle-orm").SQL[] = [eq(clients.isActive, true)];

    if (!isSuperAdmin && tenantAdminId) {
      clientConditions.push(eq(clients.createdBy, tenantAdminId));
    }

    if (!isSuperAdmin && !isTenantAdmin) {
      clientConditions.push(sql`${clients.id} IN (SELECT client_id FROM client_managers WHERE manager_id = ${userId})`);
    }

    if (clientIdParam) {
      clientConditions.push(eq(clients.id, clientIdParam));
    }

    if (referenceIdParam) {
      clientConditions.push(eq(clients.referenceId, referenceIdParam));
    }

    if (customerTypeIdParam) {
      clientConditions.push(eq(clients.customerTypeId, customerTypeIdParam));
    }

    // 2. Fetch matched clients
    const matchedClients = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        binNumber: clients.binNumber,
        mobile: clients.mobile,
        openingBalance: clients.openingBalance,
        referenceId: clients.referenceId,
        referenceName: clientReferences.name,
        customerTypeId: clients.customerTypeId,
        customerTypeName: customerTypes.typeName
      })
      .from(clients)
      .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
      .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
      .where(and(...clientConditions))
      .orderBy(asc(clients.companyName));

    if (matchedClients.length === 0) {
      return c.json({
        success: true,
        summary: {
          totalClients: 0,
          openingBalance: 0,
          totalBilled: 0,
          totalPaid: 0,
          closingBalance: 0
        },
        clientSummaries: [],
        clientTransactions: []
      });
    }

    const clientIds = matchedClients.map((cl) => cl.id);

    // 3. Fetch Prior Bills (before fromMonth) & In-Period Bills (fromMonth <= taxPeriod <= toMonth)
    const allBills = await db
      .select({
        id: bills.id,
        clientId: bills.clientId,
        billNo: bills.billNo,
        taxPeriod: bills.taxPeriod,
        billDate: bills.billDate,
        subtotal: bills.subtotal,
        discountAmount: bills.discountAmount,
        previousDue: bills.previousDue,
        grandTotal: bills.grandTotal,
        paidAmount: bills.paidAmount,
        dueAmount: bills.dueAmount,
        status: bills.status
      })
      .from(bills)
      .where(
        and(
          inArray(bills.clientId, clientIds),
          sql`${bills.status} != 'cancelled'`
        )
      )
      .orderBy(asc(bills.billDate), asc(bills.id));

    // 4. Fetch Prior Collections (before fromDate) & In-Period Collections (fromDate <= collectionDate <= toDate)
    const allCollections = await db
      .select({
        id: collections.id,
        clientId: collections.clientId,
        billId: collections.billId,
        receiptNo: collections.receiptNo,
        collectionDate: collections.collectionDate,
        amount: collections.amount,
        paymentMethod: collections.paymentMethod,
        referenceNo: collections.referenceNo,
        status: collections.status,
        billTaxPeriod: bills.taxPeriod
      })
      .from(collections)
      .leftJoin(bills, eq(collections.billId, bills.id))
      .where(
        and(
          inArray(collections.clientId, clientIds),
          sql`${collections.status} = 'completed'`
        )
      )
      .orderBy(asc(collections.collectionDate), asc(collections.id));

    // 5. Partition by client and compute Opening, In-Period, and Running Balances
    const clientSummaries: ClientLedgerSummary[] = [];
    let singleClientTransactions: LedgerTransaction[] = [];

    let overallOpening = 0;
    let overallBilled = 0;
    let overallPaid = 0;
    let overallClosing = 0;

    for (const cl of matchedClients) {
      const initialOpening = Number(cl.openingBalance) || 0;

      // Filter bills for this client
      const clBills = allBills.filter((b) => b.clientId === cl.id);
      const clCollections = allCollections.filter((col) => col.clientId === cl.id);

      // Prior bills (taxPeriod < fromMonth): Only count actual periodic bill (subtotal - discountAmount)
      const priorBillsSum = clBills
        .filter((b) => b.taxPeriod < fromMonth)
        .reduce((sum, b) => {
          const currentBilled = Math.max(0, (Number(b.subtotal) || 0) - (Number(b.discountAmount) || 0));
          return sum + currentBilled;
        }, 0);

      // Prior collections (collectionDate < fromDate): Only completed collections
      const priorCollectionsSum = clCollections
        .filter((col) => new Date(col.collectionDate).getTime() < fromDate.getTime())
        .reduce((sum, col) => sum + (Number(col.amount) || 0), 0);

      const clientOpeningBalance = Math.round((initialOpening + priorBillsSum - priorCollectionsSum) * 100) / 100;

      // In-period bills (fromMonth <= taxPeriod <= toMonth)
      const inPeriodBills = clBills.filter((b) => b.taxPeriod >= fromMonth && b.taxPeriod <= toMonth);

      // In-period collections (fromDate <= collectionDate <= toDate)
      const inPeriodCollections = clCollections.filter((col) => {
        const time = new Date(col.collectionDate).getTime();
        return time >= fromDate.getTime() && time <= toDate.getTime();
      });

      // Build In-Period Ledger Entries
      interface RawEntry {
        type: "bill" | "collection";
        timestamp: number;
        dateStr: string;
        taxPeriod: string;
        refNo: string;
        description: string;
        paymentMethod?: string;
        debit: number;
        credit: number;
        status: string;
        billId?: number | null;
        receiptId?: number | null;
      }

      const rawEntries: RawEntry[] = [];

      inPeriodBills.forEach((b) => {
        const bDate = new Date(b.billDate);
        const currentBilled = Math.max(0, (Number(b.subtotal) || 0) - (Number(b.discountAmount) || 0));
        rawEntries.push({
          type: "bill",
          timestamp: bDate.getTime(),
          dateStr: bDate.toISOString().slice(0, 10),
          taxPeriod: b.taxPeriod,
          refNo: b.billNo,
          description: `Monthly VAT Service Bill (${b.taxPeriod})`,
          debit: Math.round(currentBilled * 100) / 100,
          credit: 0,
          status: b.status,
          billId: b.id
        });
      });

      inPeriodCollections.forEach((col) => {
        const cDate = new Date(col.collectionDate);
        const methodStr = (col.paymentMethod || "CASH").toUpperCase();
        const refStr = col.referenceNo ? ` (${col.referenceNo})` : "";
        rawEntries.push({
          type: "collection",
          timestamp: cDate.getTime(),
          dateStr: cDate.toISOString().slice(0, 10),
          taxPeriod: col.billTaxPeriod || cDate.toISOString().slice(0, 7),
          refNo: col.receiptNo,
          description: `Payment Received via ${methodStr}${refStr}`,
          paymentMethod: col.paymentMethod,
          debit: 0,
          credit: Math.round((Number(col.amount) || 0) * 100) / 100,
          status: col.status,
          billId: col.billId,
          receiptId: col.id
        });
      });

      // Sort chronological: bills on same date appear before collections
      rawEntries.sort((a, b) => {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        if (a.type === "bill" && b.type === "collection") return -1;
        if (a.type === "collection" && b.type === "bill") return 1;
        return 0;
      });

      let running = clientOpeningBalance;
      let totalBilled = 0;
      let totalPaid = 0;

      const clientTransactions: LedgerTransaction[] = [];

      // Optional Opening row in transaction list
      clientTransactions.push({
        id: `open-${cl.id}`,
        type: "opening",
        date: `${fromMonth}-01`,
        taxPeriod: "—",
        refNo: "—",
        description: "Opening Balance as of " + fromMonth,
        debit: 0,
        credit: 0,
        balance: clientOpeningBalance,
        status: "settled"
      });

      rawEntries.forEach((entry, idx) => {
        totalBilled += entry.debit;
        totalPaid += entry.credit;
        running = Math.round((running + entry.debit - entry.credit) * 100) / 100;

        clientTransactions.push({
          id: `${entry.type}-${entry.billId || entry.receiptId}-${idx}`,
          type: entry.type,
          date: entry.dateStr,
          taxPeriod: entry.taxPeriod,
          refNo: entry.refNo,
          description: entry.description,
          paymentMethod: entry.paymentMethod || undefined,
          debit: entry.debit,
          credit: entry.credit,
          balance: running,
          status: entry.status,
          billId: entry.billId,
          receiptId: entry.receiptId
        });
      });

      const clientClosing = running;

      overallOpening += clientOpeningBalance;
      overallBilled += totalBilled;
      overallPaid += totalPaid;
      overallClosing += clientClosing;

      const summaryItem: ClientLedgerSummary = {
        clientId: cl.id,
        companyName: cl.companyName,
        binNumber: cl.binNumber || "—",
        mobile: cl.mobile || "—",
        referenceId: cl.referenceId,
        referenceName: cl.referenceName || "Direct / No Reference",
        openingBalance: clientOpeningBalance,
        totalBilled: Math.round(totalBilled * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        closingBalance: Math.round(clientClosing * 100) / 100
      };

      if (clientIdParam && cl.id === clientIdParam) {
        summaryItem.transactions = clientTransactions;
        singleClientTransactions = clientTransactions;
      }

      clientSummaries.push(summaryItem);
    }

    // Sort client summaries by highest closing balance (or name)
    clientSummaries.sort((a, b) => b.closingBalance - a.closingBalance);

    // If a reference was filtered (e.g. Satish Chandra Das), build clean month-wise consolidated reference transactions
    let referenceTransactions: LedgerTransaction[] = [];
    if (referenceIdParam && matchedClients.length > 0 && !clientIdParam) {
      // 1. Group in-period bills strictly by month (taxPeriod)
      const monthlyBillsMap = new Map<string, { totalBilled: number; earliestDate: string }>();

      for (const cl of matchedClients) {
        const inPeriodBills = allBills.filter((b) => b.clientId === cl.id && b.taxPeriod >= fromMonth && b.taxPeriod <= toMonth);
        for (const b of inPeriodBills) {
          const currentBilled = Math.max(0, (b.subtotal || 0) - (b.discountAmount || 0));
          const existing = monthlyBillsMap.get(b.taxPeriod) || {
            totalBilled: 0,
            earliestDate: new Date(b.billDate).toISOString().slice(0, 10)
          };
          existing.totalBilled = Math.round((existing.totalBilled + currentBilled) * 100) / 100;
          const bDateStr = new Date(b.billDate).toISOString().slice(0, 10);
          if (bDateStr < existing.earliestDate) {
            existing.earliestDate = bDateStr;
          }
          monthlyBillsMap.set(b.taxPeriod, existing);
        }
      }

      // 2. Collect in-period payments
      // Aggregate collections by month/period as well for genuine consolidated summary
      const monthlyCollsMap = new Map<
        string,
        {
          period: string;
          totalCollected: number;
          latestDate: string;
          count: number;
        }
      >();

      for (const cl of matchedClients) {
        const inPeriodCollections = allCollections.filter(
          (c) => c.clientId === cl.id && c.status === "completed" && new Date(c.collectionDate) >= fromDate && new Date(c.collectionDate) <= toDate
        );

        for (const col of inPeriodCollections) {
          const cDate = new Date(col.collectionDate);
          const dateStr = cDate.toISOString().slice(0, 10);
          const period = col.billTaxPeriod || cDate.toISOString().slice(0, 7);
          const existing = monthlyCollsMap.get(period);
          const amt = Math.round((Number(col.amount) || 0) * 100) / 100;
          if (existing) {
            existing.totalCollected = Math.round((existing.totalCollected + amt) * 100) / 100;
            existing.count += 1;
            if (dateStr > existing.latestDate) {
              existing.latestDate = dateStr;
            }
          } else {
            monthlyCollsMap.set(period, {
              period,
              totalCollected: amt,
              latestDate: dateStr,
              count: 1
            });
          }
        }
      }

      // Build unified timeline entries: month bills and consolidated month collections
      type TimelineEntry =
        | {
            kind: "month_bill";
            sortKey: string;
            dateStr: string;
            taxPeriod: string;
            debit: number;
            credit: 0;
            refNo: string;
            description: string;
          }
        | {
            kind: "month_payment";
            sortKey: string;
            dateStr: string;
            taxPeriod: string;
            debit: 0;
            credit: number;
            refNo: string;
            description: string;
          };

      const timeline: TimelineEntry[] = [];

      for (const [period, data] of monthlyBillsMap.entries()) {
        timeline.push({
          kind: "month_bill",
          sortKey: `${data.earliestDate}-0-bill`,
          dateStr: data.earliestDate,
          taxPeriod: period,
          debit: data.totalBilled,
          credit: 0,
          refNo: "—",
          description: `Monthly VAT Service Bills (${period})`
        });
      }

      for (const [period, data] of monthlyCollsMap.entries()) {
        timeline.push({
          kind: "month_payment",
          sortKey: `${data.latestDate}-1-coll`,
          dateStr: data.latestDate,
          taxPeriod: period,
          debit: 0,
          credit: data.totalCollected,
          refNo: "—",
          description: `Total Collections Received (${period})`
        });
      }

      timeline.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      let refRunning = overallOpening;
      referenceTransactions.push({
        id: `ref-open-${referenceIdParam}`,
        type: "opening",
        date: `${fromMonth}-01`,
        taxPeriod: "—",
        refNo: "—",
        description: `Opening Balance as of ${fromMonth}`,
        debit: 0,
        credit: 0,
        balance: Math.round(overallOpening * 100) / 100,
        status: "settled"
      });

      timeline.forEach((entry, idx) => {
        refRunning = Math.round((refRunning + entry.debit - entry.credit) * 100) / 100;
        if (entry.kind === "month_bill") {
          referenceTransactions.push({
            id: `ref-bill-${entry.taxPeriod}-${idx}`,
            type: "bill",
            date: entry.dateStr,
            taxPeriod: entry.taxPeriod,
            refNo: "—",
            description: entry.description,
            debit: entry.debit,
            credit: 0,
            balance: refRunning,
            status: refRunning <= 0 ? "paid" : "unpaid"
          });
        } else {
          referenceTransactions.push({
            id: `ref-coll-${entry.taxPeriod}-${idx}`,
            type: "collection",
            date: entry.dateStr,
            taxPeriod: entry.taxPeriod,
            refNo: "—",
            description: entry.description,
            debit: 0,
            credit: entry.credit,
            balance: refRunning,
            status: "completed"
          });
        }
      });
    }

    // If only one client was matched and not explicitly via clientId param, expose its transactions
    if (clientSummaries.length === 1 && singleClientTransactions.length === 0) {
      singleClientTransactions = clientSummaries[0].transactions || [];
    }

    return c.json({
      success: true,
      message: "Client ledger statement fetched successfully",
      data: {
        summary: {
          totalClients: matchedClients.length,
          openingBalance: Math.round(overallOpening * 100) / 100,
          totalBilled: Math.round(overallBilled * 100) / 100,
          totalPaid: Math.round(overallPaid * 100) / 100,
          closingBalance: Math.round(overallClosing * 100) / 100
        },
        clientSummaries,
        transactions: singleClientTransactions.length > 0 ? singleClientTransactions : referenceTransactions,
        referenceTransactions
      }
    });
  } catch (error) {
    console.error("Error generating client ledger statement:", error);
    return c.json(
      { success: false, message: "Failed to generate client ledger statement" },
      HttpStatusCodes.INTERNAL_SERVER_ERROR
    );
  }
};
