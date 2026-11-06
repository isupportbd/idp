import { and, eq, inArray, sql } from "drizzle-orm";
import { db, round2 as r2 } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { bills } from "../database/models/bills.js";
import { collections } from "../database/models/collections.js";

/**
 * Calculates client's running balance (positive = due, negative = advance)
 */
export async function getClientRunningDue(clientId: number, excludeBillId?: number): Promise<number> {
  // Fetch Client's Opening Balance
  const clientRow = (await db.select({ openingBalance: clients.openingBalance }).from(clients).where(eq(clients.id, clientId)).limit(1))[0];
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
    .where(and(eq(bills.clientId, clientId), sql`${bills.status} != 'cancelled'`));

  let totalBilledNet = openingBalance;
  for (const b of clientBills) {
    if (excludeBillId && b.id === excludeBillId) continue;
    totalBilledNet += b.subtotal - b.discountAmount;
  }

  // Sum of completed collections
  const clientCollections = await db
    .select({
      amount: collections.amount,
      status: collections.status
    })
    .from(collections)
    .where(and(eq(collections.clientId, clientId), eq(collections.status, "completed")));

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
export async function getBatchClientsRunningDue(clientIds: number[]): Promise<Map<number, number>> {
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
      totalBilled: sql<number>`COALESCE(SUM(${bills.subtotal} - ${bills.discountAmount}), 0)::numeric(14,2)`
    })
    .from(bills)
    .where(and(inArray(bills.clientId, clientIds), sql`${bills.status} != 'cancelled'`))
    .groupBy(bills.clientId);

  for (const b of billSums) {
    const current = dueMap.get(b.clientId) || 0;
    dueMap.set(b.clientId, r2(current + Number(b.totalBilled)));
  }

  // 3. Aggregate Completed Collections per client
  const collectionSums = await db
    .select({
      clientId: collections.clientId,
      totalCollected: sql<number>`COALESCE(SUM(${collections.amount}), 0)::numeric(14,2)`
    })
    .from(collections)
    .where(and(inArray(collections.clientId, clientIds), eq(collections.status, "completed")))
    .groupBy(collections.clientId);

  for (const c of collectionSums) {
    const current = dueMap.get(c.clientId) || 0;
    dueMap.set(c.clientId, r2(current - Number(c.totalCollected)));
  }

  // Ensure all clients have rounded 2 decimal values
  for (const [id, val] of dueMap.entries()) {
    dueMap.set(id, r2(val));
  }

  return dueMap;
}
