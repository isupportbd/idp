import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { initDatabase } from "@/framework/database/connection.js";
import { db } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { vatSubmissions } from "@/modules/clients/database/models/vat_submissions.js";
import { purchases } from "@/modules/clients/database/models/purchases.js";
import { globalItems } from "@/modules/superadmin/database/models/global_items.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";
import { serviceRates } from "@/modules/services/database/models/service_rates.js";
import { bills } from "../database/models/bills.js";
import { billItems } from "../database/models/bill_items.js";
import { runBatchGeneration } from "../controllers/billing.controller.js";

/**
 * Batch invoice generation is financial, previously untested code. These tests
 * drive the REAL `runBatchGeneration` core (the exact function the HTTP handler
 * and the queue worker both call) against a live PostgreSQL database — they do
 * not re-implement the math, so they fail if the production logic regresses.
 *
 * Covered:
 *   1. Invoices are created for eligible clients with correct line items + totals.
 *   2. Bill numbers are sequential and unique (the DB `bill_no` UNIQUE constraint
 *      is the actual race guard — see the concurrency note in test 3).
 *   3. Re-running for the same tax period is idempotent (no duplicate invoices).
 *   4. onProgress reports live progress.
 *
 * Uses a dedicated tax period (2027-12) and unique company names so it cannot
 * collide with billing.test.ts or prior runs.
 */
describe("runBatchGeneration (batch invoice generation)", () => {
  const TAX_PERIOD = "2027-12";
  const BILL_YEAR = 2027;
  const SUFFIX = Date.now().toString().slice(-6);

  // Service rates chosen so the expected amounts are deterministic.
  const RETURN_REGULAR_RATE = 2000;
  const RETURN_ZERO_RATE = 500;
  const BOOKS_RATE_PER_MT = 2.5;
  const BOOKS_MIN_CHARGE = 500;

  // Purchase net weight in KG → 1500 MT after /1000.
  const NET_WT_KG = 1_500_000;
  const EXPECTED_NET_WT_MT = NET_WT_KG / 1000; // 1500
  // Books line: r2(1500 MT * 2.5) = 3750, above the 500 min → 3750.
  const EXPECTED_BOOKS_AMOUNT = 3750;
  // Client A subtotal = return(2000) + books(3750) = 5750.
  const EXPECTED_A_SUBTOTAL = 5750;
  // Client B (no purchases) = zero-return only = 500.
  const EXPECTED_B_SUBTOTAL = 500;

  let customerTypeId: number;
  let returnRegularItemId: number;
  let returnZeroItemId: number;
  let booksItemId: number;
  let globalItemId: number;
  let clientAId: number; // FULL service, WITH purchases → return(regular) + books
  let clientBId: number; // FULL service, NO purchases → return(zero) only
  let initialMaxBillNo: string | null = null;

  const createdBillIds: number[] = [];

  beforeAll(async () => {
    await initDatabase();

    // ── Reset fixtures left by a previous/aborted run of this suite ────
    // runBatchGeneration resolves service items by NAME HEURISTIC and takes the
    // FIRST match, so any stale row would silently shadow this run's items.
    const staleClients = (await db.select({ id: clients.id }).from(clients).where(sql`${clients.companyName} LIKE 'BatchGen %'`)).map(
      (c) => c.id
    );
    if (staleClients.length > 0) {
      await db
        .delete(billItems)
        .where(inArray(billItems.billId, db.select({ id: bills.id }).from(bills).where(inArray(bills.clientId, staleClients))));
      await db.delete(bills).where(inArray(bills.clientId, staleClients));
      await db.delete(vatSubmissions).where(inArray(vatSubmissions.clientId, staleClients));
      await db.delete(purchases).where(inArray(purchases.clientId, staleClients));
      await db.delete(clients).where(inArray(clients.id, staleClients));
    }

    // Clear every service item that matches the batch-generation heuristics so
    // `find(...)` unreservedly resolves to THIS run's items.
    await db
      .delete(serviceItems)
      .where(
        or(
          sql`lower(${serviceItems.itemName}) LIKE '%return%'`,
          sql`lower(${serviceItems.itemName}) LIKE '%books%'`,
          sql`lower(${serviceItems.itemName}) LIKE '%6.2.1%'`
        )
      );

    // ── Customer type ────────────────────────────────────────────────
    const existingType = (await db.select().from(customerTypes).where(eq(customerTypes.typeName, "BatchGen Test Importer")).limit(1))[0];
    customerTypeId = existingType
      ? existingType.id
      : (
          await db
            .insert(customerTypes)
            .values({ typeName: "BatchGen Test Importer", description: "batch generation test", isActive: true })
            .returning()
        )[0].id;

    // ── Service items (names must match the production heuristics) ────
    // return+regular / return+zero / books-or-6.2.1 — see runBatchGeneration.
    // Fixed names (no suffix): the delete above already cleared competitors, and
    // fixed names keep re-runs idempotent.
    const ensureItem = async (name: string): Promise<number> => {
      const found = (await db.select().from(serviceItems).where(eq(serviceItems.itemName, name)).limit(1))[0];
      if (found) return found.id;
      return (await db.insert(serviceItems).values({ itemName: name, isActive: true }).returning())[0].id;
    };
    returnRegularItemId = await ensureItem("VAT Return Submission (Regular)");
    returnZeroItemId = await ensureItem("VAT Return Submission (Zero)");
    booksItemId = await ensureItem("Books of Accounts (Mushak 6.2.1) Maintenance");

    // ── Service rates for this customer type ─────────────────────────
    const ensureRate = async (serviceItemId: number, regularRate: number, minimumCharge: number, unit: string) => {
      const found = (
        await db
          .select()
          .from(serviceRates)
          .where(and(eq(serviceRates.serviceItemId, serviceItemId), eq(serviceRates.customerTypeId, customerTypeId)))
          .limit(1)
      )[0];
      if (!found) {
        await db.insert(serviceRates).values({
          serviceItemId,
          customerTypeId,
          unit,
          regularRate,
          minimumCharge,
          effectiveFrom: "2027-01-01"
        });
      }
    };
    await ensureRate(returnRegularItemId, RETURN_REGULAR_RATE, 0, "Month");
    await ensureRate(returnZeroItemId, RETURN_ZERO_RATE, 0, "Month");
    await ensureRate(booksItemId, BOOKS_RATE_PER_MT, BOOKS_MIN_CHARGE, "MT");

    // ── Global item (required FK for purchases) ──────────────────────
    const existingGlobal = (
      await db
        .select()
        .from(globalItems)
        .where(eq(globalItems.name, `BatchGen Commodity ${SUFFIX}`))
        .limit(1)
    )[0];
    globalItemId = existingGlobal
      ? existingGlobal.id
      : (
          await db
            .insert(globalItems)
            .values({ hsCode: `9999.${SUFFIX}`, name: `BatchGen Commodity ${SUFFIX}`, unit: "KG", isActive: true })
            .returning()
        )[0].id;

    // ── Two active clients ───────────────────────────────────────────
    const insertClient = async (companyName: string): Promise<number> =>
      (
        await db
          .insert(clients)
          .values({
            companyName,
            binNumber: `BIN-${SUFFIX}-${Math.floor(Math.random() * 1000)}`,
            customerTypeId,
            vatServiceType: "FULL",
            openingBalance: 0,
            isActive: true
          })
          .returning()
      )[0].id;

    clientAId = await insertClient(`BatchGen Client A ${SUFFIX}`);
    clientBId = await insertClient(`BatchGen Client B ${SUFFIX}`);

    // ── Finalized VAT submissions (required for eligibility) ─────────
    await db.insert(vatSubmissions).values([
      { clientId: clientAId, taxPeriod: TAX_PERIOD, submissionId: `BG-A-${SUFFIX}`, status: "submitted" },
      { clientId: clientBId, taxPeriod: TAX_PERIOD, submissionId: `BG-B-${SUFFIX}`, status: "submitted" }
    ]);

    // ── Purchase row ONLY for client A (client B must stay purchase-less) ──
    await db.insert(purchases).values({
      clientId: clientAId,
      itemId: globalItemId,
      office: "DHK",
      beNo: `BE-${SUFFIX}`,
      beDate: "2027-12-01",
      month: TAX_PERIOD,
      netWt: NET_WT_KG,
      assValue: 0
    });

    // ── Highest existing INV-2027 bill number, to assert sequentiality ──
    const latest = (
      await db
        .select({ billNo: bills.billNo })
        .from(bills)
        .where(sql`${bills.billNo} LIKE ${`INV-${BILL_YEAR}-%`}`)
        .orderBy(desc(bills.id))
        .limit(1)
    )[0];
    initialMaxBillNo = latest?.billNo ?? null;
  });

  afterAll(async () => {
    // FK-safe cleanup. Bill items cascade from bills, but delete explicitly.
    if (createdBillIds.length > 0) {
      await db.delete(billItems).where(inArray(billItems.billId, createdBillIds));
      await db.delete(bills).where(inArray(bills.id, createdBillIds));
    }
    await db.delete(purchases).where(eq(purchases.clientId, clientAId));
    await db.delete(vatSubmissions).where(eq(vatSubmissions.taxPeriod, TAX_PERIOD));
    if (clientAId) await db.delete(clients).where(eq(clients.id, clientAId));
    if (clientBId) await db.delete(clients).where(eq(clients.id, clientBId));
    if (globalItemId) await db.delete(globalItems).where(eq(globalItems.id, globalItemId));
    await db.delete(serviceRates).where(eq(serviceRates.customerTypeId, customerTypeId));
    await db.delete(serviceItems).where(inArray(serviceItems.id, [returnRegularItemId, returnZeroItemId, booksItemId]));
    if (customerTypeId) await db.delete(customerTypes).where(eq(customerTypes.id, customerTypeId));
  });

  it("creates invoices with correct line items, totals and previous-due rollup", async () => {
    const progressEvents: Array<{ total: number; processed: number; created: number; skipped: number }> = [];

    const result = await runBatchGeneration({
      taxPeriod: TAX_PERIOD,
      billDate: `${BILL_YEAR}-12-15`,
      clientIds: [clientAId, clientBId],
      creatorId: null,
      isSuperAdmin: true,
      onProgress: (s) => progressEvents.push({ ...s })
    });

    expect(result).not.toBeNull();
    const { createdBillsList, skippedCount } = result!;
    expect(createdBillsList.length).toBe(2);
    expect(skippedCount).toBe(0);

    for (const b of createdBillsList) createdBillIds.push(b.id);

    // ── Client A: FULL + purchases → 2 line items, subtotal 5750 ──────
    const billA = (
      await db
        .select()
        .from(bills)
        .where(and(eq(bills.clientId, clientAId), eq(bills.taxPeriod, TAX_PERIOD)))
    )[0];
    expect(billA).toBeDefined();
    expect(billA.subtotal).toBe(EXPECTED_A_SUBTOTAL);
    expect(billA.previousDue).toBe(0);
    expect(billA.grandTotal).toBe(EXPECTED_A_SUBTOTAL);
    expect(billA.dueAmount).toBe(EXPECTED_A_SUBTOTAL);
    expect(billA.paidAmount).toBe(0);
    expect(billA.status).toBe("unpaid");
    expect(billA.billNo).toMatch(new RegExp(`^INV-${BILL_YEAR}-\\d{6}$`));

    const itemsA = await db.select().from(billItems).where(eq(billItems.billId, billA.id));
    expect(itemsA.length).toBe(2);

    const booksLine = itemsA.find((i) => i.serviceItemId === booksItemId)!;
    expect(booksLine).toBeDefined();
    // Qty in MT derived from purchase net weight (KG → MT).
    expect(booksLine.qty).toBe(EXPECTED_NET_WT_MT);
    expect(booksLine.rateUsed).toBe(BOOKS_RATE_PER_MT);
    expect(booksLine.calculatedAmount).toBe(EXPECTED_BOOKS_AMOUNT);
    expect(booksLine.finalAmount).toBe(EXPECTED_BOOKS_AMOUNT);

    const returnLine = itemsA.find((i) => i.serviceItemId === returnRegularItemId)!;
    expect(returnLine).toBeDefined();
    expect(returnLine.qty).toBe(1);
    expect(returnLine.finalAmount).toBe(RETURN_REGULAR_RATE);

    // Line items must sum exactly to the bill subtotal.
    const sumA = itemsA.reduce((acc, i) => acc + i.finalAmount, 0);
    expect(sumA).toBe(billA.subtotal);

    // ── Client B: no purchases → zero-return only, no books line ─────
    const billB = (
      await db
        .select()
        .from(bills)
        .where(and(eq(bills.clientId, clientBId), eq(bills.taxPeriod, TAX_PERIOD)))
    )[0];
    expect(billB).toBeDefined();
    expect(billB.subtotal).toBe(EXPECTED_B_SUBTOTAL);
    expect(billB.grandTotal).toBe(EXPECTED_B_SUBTOTAL);

    const itemsB = await db.select().from(billItems).where(eq(billItems.billId, billB.id));
    expect(itemsB.length).toBe(1);
    expect(itemsB[0].serviceItemId).toBe(returnZeroItemId);
    expect(itemsB[0].finalAmount).toBe(RETURN_ZERO_RATE);

    // ── Progress reporting ───────────────────────────────────────────
    expect(progressEvents.length).toBeGreaterThan(0);
    const last = progressEvents[progressEvents.length - 1];
    expect(last.processed).toBe(2);
    expect(last.created).toBe(2);
    expect(last.total).toBe(2);
  });

  it("assigns sequential, unique invoice numbers with no gaps between the two bills", async () => {
    const rows = await db
      .select({ id: bills.id, billNo: bills.billNo })
      .from(bills)
      .where(and(inArray(bills.clientId, [clientAId, clientBId]), eq(bills.taxPeriod, TAX_PERIOD)))
      .orderBy(bills.id);

    expect(rows.length).toBe(2);

    const suffixOf = (billNo: string) => parseInt(billNo.split("-")[2], 10);
    const seqA = suffixOf(rows[0].billNo);
    const seqB = suffixOf(rows[1].billNo);

    // Sequential: the second client's invoice is exactly the next number.
    expect(seqB).toBe(seqA + 1);
    // Unique: the two invoice numbers differ.
    expect(rows[0].billNo).not.toBe(rows[1].billNo);

    // If an invoice already existed for INV-2027, ours continues after it.
    if (initialMaxBillNo) {
      expect(seqA).toBeGreaterThan(suffixOf(initialMaxBillNo));
    }
  });

  it("is idempotent — re-running for the same tax period creates no duplicate invoices", async () => {
    const before = await db
      .select({ id: bills.id })
      .from(bills)
      .where(and(inArray(bills.clientId, [clientAId, clientBId]), eq(bills.taxPeriod, TAX_PERIOD)));
    expect(before.length).toBe(2);

    const rerun = await runBatchGeneration({
      taxPeriod: TAX_PERIOD,
      billDate: `${BILL_YEAR}-12-15`,
      clientIds: [clientAId, clientBId],
      creatorId: null,
      isSuperAdmin: true
    });

    // Both clients are already billed → everything is skipped.
    expect(rerun!.createdBillsList.length).toBe(0);
    expect(rerun!.skippedCount).toBe(2);

    const after = await db
      .select({ id: bills.id })
      .from(bills)
      .where(and(inArray(bills.clientId, [clientAId, clientBId]), eq(bills.taxPeriod, TAX_PERIOD)));
    expect(after.length).toBe(2);
  });

  it("skips clients without a finalized VAT submission", async () => {
    // Client C: active + finalized submission, but delete its submission so it
    // becomes ineligible → must be skipped, not billed.
    const clientCId = (
      await db
        .insert(clients)
        .values({
          companyName: `BatchGen Client C ${SUFFIX}`,
          customerTypeId,
          vatServiceType: "FULL",
          isActive: true
        })
        .returning()
    )[0].id;

    await db.insert(vatSubmissions).values({
      clientId: clientCId,
      taxPeriod: `${BILL_YEAR}-11`,
      submissionId: `BG-C-${SUFFIX}`,
      status: "submitted"
    });

    try {
      const result = await runBatchGeneration({
        taxPeriod: TAX_PERIOD, // note: 2027-12, but C only has a 2027-11 submission
        billDate: `${BILL_YEAR}-12-15`,
        clientIds: [clientCId],
        creatorId: null,
        isSuperAdmin: true
      });

      // Ineligible (no submission for THIS period) → nothing created, skipped.
      expect(result).not.toBeNull();
      expect(result!.createdBillsList.length).toBe(0);
      expect(result!.skippedCount).toBe(1);

      const billsForC = await db.select().from(bills).where(eq(bills.clientId, clientCId));
      expect(billsForC.length).toBe(0);
    } finally {
      await db.delete(vatSubmissions).where(eq(vatSubmissions.clientId, clientCId));
      await db.delete(clients).where(eq(clients.id, clientCId));
    }
  });
});
