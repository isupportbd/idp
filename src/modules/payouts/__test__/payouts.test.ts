import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { initDatabase } from "@/framework/database/connection.js";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { purchases } from "@/modules/clients/database/models/purchases.js";
import { vatSubmissions } from "@/modules/clients/database/models/vat_submissions.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";
import { globalItems } from "@/modules/superadmin/database/models/global_items.js";
import { expenseHeads } from "@/modules/firm/database/models/expense_heads.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { payouts } from "../database/models/payouts.js";
import { userMonthlyLedgers } from "../database/models/user_monthly_ledgers.js";
import { userServiceRates } from "../database/models/user_service_rates.js";
import { ensurePayoutTables } from "../database/ensure-tables.js";
import { calculateStaffEarnings, resolveStaffLedger, resolveStaffLifetimeLedger } from "../services/payouts.service.js";
import { createPayout, getMyEarnings, getPayoutsDashboard, getStaffLedger, getUserRates, saveUserRates } from "../controllers/payouts.controller.js";

// Minimal Hono context double matching the submissions test harness.
const makeCtx = (opts: { auth?: any; json?: any; query?: any; params?: any }): any => ({
  get: (key: string) => (key === "auth" || key === "user" ? opts.auth : undefined),
  req: {
    valid: (type: string) => {
      if (type === "json") return opts.json;
      if (type === "query") return opts.query;
      if (type === "param") return opts.params;
      return undefined;
    },
    query: () => opts.query
  },
  json: (body: any, status: any) => ({ body, status })
});

// `Handler`'s Hono type declares a second `next` arg the runtime does not need.
const invoke = (handler: any, ctx: any) => handler(ctx);

describe("Payouts: staff earnings, ledger carry and payout recording", () => {
  const stamp = Date.now();
  const M1 = "2026-10";
  const M2 = "2026-11";
  const ZERO_RATE = 500;
  const REGULAR_RATE = 1000;

  let ownerId = 0;
  let staffId = 0;
  let clientId = 0;
  let regularItemId = 0;
  let zeroItemId = 0;
  let itemId = 0;
  let settingsId = 0;

  beforeAll(async () => {
    await initDatabase();
    await ensurePayoutTables();

    const [owner] = await db
      .insert(users)
      .values({
        name: `Payout Owner ${stamp}`,
        email: `payout_owner_${stamp}@test.com`,
        password: "hashed_password",
        status: "active"
      })
      .returning();
    ownerId = owner.id;

    const [staff] = await db
      .insert(users)
      .values({
        name: `Payout Staff ${stamp}`,
        email: `payout_staff_${stamp}@test.com`,
        password: "hashed_password",
        status: "active",
        adminId: ownerId
      })
      .returning();
    staffId = staff.id;

    const [client] = await db
      .insert(clients)
      .values({
        companyName: `Payout Client ${stamp}`,
        binNumber: `PAYOUT-${stamp}`,
        isActive: true,
        createdBy: ownerId
      })
      .returning();
    clientId = client.id;

    // Service items must exist for Zero/Regular rate lookup (global master data).
    const ensureItem = async (name: string) => {
      const existing = (
        await db.select({ id: serviceItems.id }).from(serviceItems).where(eq(serviceItems.itemName, name)).limit(1)
      )[0];
      if (existing) return existing.id;
      const [row] = await db
        .insert(serviceItems)
        .values({ itemName: name, isActive: true })
        .returning();
      return row.id;
    };
    regularItemId = await ensureItem("VAT Return Submission (Regular)");
    zeroItemId = await ensureItem("VAT Return Submission (Zero)");

    // Firm settings with NO gateway keys: any SMS attempt fails fast, offline.
    const [settings] = await db
      .insert(companySettings)
      .values({ adminId: ownerId, companyName: `Payout Firm ${stamp}` })
      .returning();
    settingsId = settings.id;

    const [item] = await db
      .insert(globalItems)
      .values({ hsCode: `0000-${stamp}`, name: `Payout Test Item ${stamp}` })
      .returning();
    itemId = item.id;

    // Rate card: Regular 1000, Zero 500. `effective_from` is pinned to January
    // 2026 so the fixtures stay deterministic regardless of the run date
    // (accruals resolve the rate effective at the END of each month).
    await db.insert(userServiceRates).values([
      {
        adminId: ownerId,
        userId: staffId,
        serviceItemId: regularItemId,
        rate: REGULAR_RATE,
        effectiveFrom: new Date("2026-01-01T00:00:00Z")
      },
      {
        adminId: ownerId,
        userId: staffId,
        serviceItemId: zeroItemId,
        rate: ZERO_RATE,
        effectiveFrom: new Date("2026-01-01T00:00:00Z")
      }
    ]);

    // M1 has turnover (net weight > 0) -> Regular; M2 has none -> Zero.
    await db.insert(purchases).values({
      adminId: ownerId,
      clientId,
      itemId,
      beDate: `${M1}-10`,
      month: M1,
      netWt: 120,
      assValue: 0
    });

    await db.insert(vatSubmissions).values([
      { clientId, taxPeriod: M1, submissionId: `NBR-P-${stamp}-1`, status: "submitted", submittedBy: staffId },
      { clientId, taxPeriod: M2, submissionId: `NBR-P-${stamp}-2`, status: "submitted", submittedBy: staffId }
    ]);
  });

  afterAll(async () => {
    const staffIds = [staffId].filter(Boolean);
    if (staffIds.length) {
      await db.delete(vatSubmissions).where(eq(vatSubmissions.clientId, clientId));
      await db.delete(payouts).where(inArray(payouts.userId, staffIds));
      await db.delete(userMonthlyLedgers).where(inArray(userMonthlyLedgers.userId, staffIds));
      await db.delete(userServiceRates).where(inArray(userServiceRates.userId, staffIds));
    }
    if (clientId) await db.delete(purchases).where(eq(purchases.clientId, clientId));
    if (settingsId) await db.delete(companySettings).where(eq(companySettings.id, settingsId));
    if (clientId) await db.delete(clients).where(eq(clients.id, clientId));
    if (ownerId) {
      await db.delete(expenseHeads).where(eq(expenseHeads.adminId, ownerId));
      await db.delete(payouts).where(eq(payouts.adminId, ownerId));
    }
    if (staffId) await db.delete(users).where(eq(users.id, staffId));
    if (ownerId) await db.delete(users).where(eq(users.id, ownerId));
    if (itemId) await db.delete(globalItems).where(eq(globalItems.id, itemId));
  });

  it("classifies Regular (turnover) vs Zero (no turnover) and accrues the right fee", async () => {
    const regular = await calculateStaffEarnings(ownerId, staffId, M1);
    expect(regular.regularCount).toBe(1);
    expect(regular.zeroCount).toBe(0);
    expect(regular.currentBill).toBe(REGULAR_RATE);

    const zero = await calculateStaffEarnings(ownerId, staffId, M2);
    expect(zero.zeroCount).toBe(1);
    expect(zero.regularCount).toBe(0);
    expect(zero.currentBill).toBe(ZERO_RATE);
  });

  it("computes Total Payable as current bill + previous due - previous advance", async () => {
    const first = await resolveStaffLedger(ownerId, staffId, M1);
    expect(first.currentBill).toBe(REGULAR_RATE);
    expect(first.previousDue).toBe(0);
    expect(first.previousAdvance).toBe(0);
    expect(first.totalPayable).toBe(REGULAR_RATE);
    expect(first.paidAmount).toBe(0);
    expect(first.closingDue).toBe(REGULAR_RATE);

    // M2 carries M1's closing due forward (no payment made in M1).
    const second = await resolveStaffLedger(ownerId, staffId, M2);
    expect(second.currentBill).toBe(ZERO_RATE);
    expect(second.previousDue).toBe(REGULAR_RATE);
    expect(second.previousAdvance).toBe(0);
    expect(second.totalPayable).toBe(REGULAR_RATE + ZERO_RATE);
    expect(second.closingDue).toBe(REGULAR_RATE + ZERO_RATE);
  });

  it("records a staff payout with ledger snapshots and materializes the month", async () => {
    const res: any = await invoke(
      createPayout,
      makeCtx({
        auth: { id: ownerId },
        json: { payoutType: "staff", userId: staffId, periodMonth: M1, amount: 400, paymentMethod: "BKASH" }
      })
    );
    expect(res.status).toBe(201);

    const created = res.body.data;
    expect(created.payoutType).toBe("staff");
    expect(Number(created.amount)).toBe(400);
    expect(Number(created.currentBillSnapshot)).toBe(REGULAR_RATE);
    expect(Number(created.previousDueSnapshot)).toBe(0);
    expect(Number(created.closingDueSnapshot)).toBe(REGULAR_RATE - 400);
    expect(Number(created.advanceSnapshot)).toBe(0);
    // No gateway configured in Firm Settings -> fails fast, offline.
    expect(["SENT", "FAILED", "SKIPPED"]).toContain(created.smsStatus);

    const ledgerRow = (
      await db
        .select()
        .from(userMonthlyLedgers)
        .where(eq(userMonthlyLedgers.userId, staffId))
    ).find((r) => r.periodMonth === M1);
    expect(ledgerRow).toBeDefined();
    expect(Number(ledgerRow!.paidAmount)).toBe(400);
    expect(Number(ledgerRow!.closingDue)).toBe(REGULAR_RATE - 400);
    expect(ledgerRow!.isSettled).toBe(false);
  });

  it("opens the next month with the previous closing due", async () => {
    const first = await resolveStaffLedger(ownerId, staffId, M1);
    expect(first.paidAmount).toBe(400);
    expect(first.closingDue).toBe(REGULAR_RATE - 400);

    const second = await resolveStaffLedger(ownerId, staffId, M2);
    expect(second.previousDue).toBe(REGULAR_RATE - 400);
    expect(second.totalPayable).toBe(REGULAR_RATE - 400 + ZERO_RATE);
  });

  it("closes due to 0 and books the excess as advance when Paid > Payable", async () => {
    const payable = REGULAR_RATE - 400 + ZERO_RATE; // 1100
    const res: any = await invoke(
      createPayout,
      makeCtx({
        auth: { id: ownerId },
        json: { payoutType: "staff", userId: staffId, periodMonth: M2, amount: 1500, paymentMethod: "BANK" }
      })
    );
    expect(res.status).toBe(201);
    expect(Number(res.body.data.closingDueSnapshot)).toBe(0);
    expect(Number(res.body.data.advanceSnapshot)).toBe(1500 - payable);

    const ledger = await resolveStaffLedger(ownerId, staffId, M2);
    expect(ledger.totalPayable).toBe(payable);
    expect(ledger.paidAmount).toBe(1500);
    expect(ledger.closingDue).toBe(0);
    expect(ledger.advanceBalance).toBe(1500 - payable);

    // Carried advance reduces the following month's payable.
    const next = await resolveStaffLedger(ownerId, staffId, "2026-12");
    expect(next.previousDue).toBe(0);
    expect(next.previousAdvance).toBe(1500 - payable);
    expect(next.totalPayable).toBe(0 - (1500 - payable));
    expect(next.closingDue).toBe(0);
    expect(next.advanceBalance).toBe(1500 - payable);
  });

  it("exposes a ledger preview endpoint consistent with the service", async () => {
    const res: any = await invoke(
      getStaffLedger,
      makeCtx({ auth: { id: ownerId }, query: { userId: String(staffId), month: M2 } })
    );
    expect(res.status).toBe(200);
    expect(res.body.data.month).toBe(M2);
    expect(res.body.data.totalPayable).toBe(REGULAR_RATE - 400 + ZERO_RATE);
  });

  it("never marks an inactive month (0 bill, 0 due) as settled", async () => {
    // Before any activity: nothing earned and nothing due -> NOT "settled".
    const inactive = await resolveStaffLedger(ownerId, staffId, "2026-09");
    expect(inactive.currentBill).toBe(0);
    expect(inactive.closingDue).toBe(0);
    expect(inactive.totalPayable).toBe(0);
    expect(inactive.isSettled).toBe(false);

    // A month that is only partially paid is not settled either.
    const partial = await resolveStaffLedger(ownerId, staffId, M1);
    expect(partial.isSettled).toBe(false);
  });

  it("aggregates a lifetime view for the 'All Months' dashboard", async () => {
    const lifetime = await resolveStaffLifetimeLedger(ownerId, staffId);
    expect(lifetime.regularCount).toBe(1);
    expect(lifetime.zeroCount).toBe(1);
    expect(lifetime.currentBill).toBe(REGULAR_RATE + ZERO_RATE);
    expect(lifetime.paidAmount).toBe(400 + 1500);
    expect(lifetime.closingDue).toBe(0);
    expect(lifetime.advanceBalance).toBe(1500 - (REGULAR_RATE - 400 + ZERO_RATE));
    // An outstanding advance is surfaced as "Advance", never "Settled".
    expect(lifetime.isSettled).toBe(false);

    // The dashboard endpoint with NO month returns the same lifetime numbers.
    const res: any = await invoke(getPayoutsDashboard, makeCtx({ auth: { id: ownerId }, query: {} }));
    expect(res.status).toBe(200);
    expect(res.body.data.month).toBe("");
    const row = res.body.data.staff.find((s: any) => s.id === staffId);
    expect(row.zeroCount).toBe(1);
    expect(row.regularCount).toBe(1);
    expect(row.currentBill).toBe(REGULAR_RATE + ZERO_RATE);
    expect(row.paidAmount).toBe(1900);
    expect(row.advanceBalance).toBe(400);
  });

  it("resolves rates per month so a later rate change does not rewrite history", async () => {
    // Publish a new, higher Regular rate effective in December 2026. `isActive`
    // is false because this raw fixture only exercises month-based resolution,
    // not the single-active-version invariant enforced by saveUserRates.
    await db.insert(userServiceRates).values({
      adminId: ownerId,
      userId: staffId,
      serviceItemId: regularItemId,
      rate: 9999,
      effectiveFrom: new Date("2026-12-01T00:00:00Z"),
      isActive: false
    });

    // October (M1) must keep the OLD rate only if a rate was effective then.
    // The January fixture rate still wins for M1 -> 1000, not 9999.
    const m1 = await resolveStaffLedger(ownerId, staffId, M1);
    expect(m1.currentBill).toBe(REGULAR_RATE);

    // December sees the new rate for the Regular item; Zero stays at 500.
    const dec = await calculateStaffEarnings(ownerId, staffId, "2026-12");
    expect(dec.zeroRate).toBe(ZERO_RATE);
    expect(dec.regularRate).toBe(9999);

    await db.delete(userServiceRates).where(eq(userServiceRates.rate, 9999));
  });

  it("saves and reads back a per-service-item rate card", async () => {
    const before: any = await invoke(getUserRates, makeCtx({ auth: { id: ownerId }, params: { userId: staffId } }));
    expect(before.status).toBe(200);
    const beforeRegular = before.body.data.find((r: any) => r.serviceItemId === regularItemId);
    expect(Number(beforeRegular.rate)).toBe(REGULAR_RATE);

    const save: any = await invoke(
      saveUserRates,
      makeCtx({
        auth: { id: ownerId },
        params: { userId: staffId },
        json: {
          rates: [
            { serviceItemId: regularItemId, rate: 1200 },
            { serviceItemId: zeroItemId, rate: 650 }
          ]
        }
      })
    );
    expect(save.status).toBe(200);

    const after: any = await invoke(getUserRates, makeCtx({ auth: { id: ownerId }, params: { userId: staffId } }));
    const afterRegular = after.body.data.find((r: any) => r.serviceItemId === regularItemId);
    const afterZero = after.body.data.find((r: any) => r.serviceItemId === zeroItemId);
    expect(Number(afterRegular.rate)).toBe(1200);
    expect(Number(afterZero.rate)).toBe(650);
  });

  it("serves My Earnings scoped to the caller, with history and rate card", async () => {
    const res: any = await invoke(getMyEarnings, makeCtx({ auth: { id: staffId }, query: { month: M2 } }));
    expect(res.status).toBe(200);
    expect(res.body.data.month).toBe(M2);

    // The headline row mirrors the single-month service view.
    const ledger = await resolveStaffLedger(ownerId, staffId, M2);
    expect(res.body.data.current.currentBill).toBe(ledger.currentBill);
    expect(res.body.data.current.advanceBalance).toBe(ledger.advanceBalance);
    expect(res.body.data.current.closingDue).toBe(ledger.closingDue);

    // History walks the whole activity span, month by month.
    expect(res.body.data.months.map((m: any) => m.month)).toEqual([M1, M2]);
    // Only this staff member's payouts are listed.
    expect(res.body.data.payouts.length).toBeGreaterThanOrEqual(2);
    // Rate card carries per-item overrides.
    expect(res.body.data.rateCard.some((r: any) => r.serviceItemId === regularItemId)).toBe(true);
  });

  it("is append-only: a new effective date adds a version and freezes the old", async () => {
    // A clearly-future version must be appended without touching earlier ones.
    const save: any = await invoke(
      saveUserRates,
      makeCtx({
        auth: { id: ownerId },
        params: { userId: staffId },
        json: {
          rates: [
            { serviceItemId: regularItemId, rate: 7777, effectiveFrom: "2099-01-01" },
            { serviceItemId: zeroItemId, rate: 650, effectiveFrom: "2099-01-01" }
          ]
        }
      })
    );
    expect(save.status).toBe(200);

    const res: any = await invoke(getUserRates, makeCtx({ auth: { id: ownerId }, params: { userId: staffId } }));
    const regular = res.body.data.find((r: any) => r.serviceItemId === regularItemId);
    // The newest version surfaces as the editable rate...
    expect(Number(regular.rate)).toBe(7777);
    expect(regular.isActive).toBe(true);
    expect(regular.effectiveFrom).toBe("2099-01-01");
    expect(regular.versionCount).toBeGreaterThanOrEqual(2);
    // ...and the January fixture version is still on record.
    const versionRates = regular.history.map((h: any) => Number(h.rate));
    expect(versionRates).toContain(REGULAR_RATE);

    // Rule 1 — the previous active rate is auto-frozen, not rewritten:
    // it keeps its value but is closed at the successor's effective date.
    const superseded = regular.history.find((h: any) => Number(h.rate) === 1200);
    expect(superseded).toBeDefined();
    expect(superseded.isActive).toBe(false);
    expect(superseded.effectiveTo).toBe("2099-01-01");

    // A 2026 month must still use its own rate, never the 2099 one.
    const m1 = await resolveStaffLedger(ownerId, staffId, M1);
    expect(m1.currentBill).toBeLessThan(7777);
  });

  it("updates the current version in place, leaving history immutable", async () => {
    await invoke(
      saveUserRates,
      makeCtx({
        auth: { id: ownerId },
        params: { userId: staffId },
        json: {
          rates: [
            { serviceItemId: regularItemId, rate: 8888, effectiveFrom: "2099-01-01" },
            { serviceItemId: zeroItemId, rate: 650, effectiveFrom: "2099-01-01" }
          ]
        }
      })
    );

    const res: any = await invoke(getUserRates, makeCtx({ auth: { id: ownerId }, params: { userId: staffId } }));
    const regular = res.body.data.find((r: any) => r.serviceItemId === regularItemId);
    expect(Number(regular.rate)).toBe(8888);

    // The same effective date is edited in place — no duplicate version is added.
    const sameDate = regular.history.filter((h: any) => h.effectiveFrom === "2099-01-01");
    expect(sameDate.length).toBe(1);
    expect(Number(sameDate[0].rate)).toBe(8888);
    expect(sameDate[0].isActive).toBe(true);

    // Rule 3 — a superseded version is read-only: the edit never touched it.
    const january = regular.history.find((h: any) => h.effectiveFrom === "2026-01-01");
    expect(Number(january.rate)).toBe(REGULAR_RATE);
    expect(january.isActive).toBe(false);
  });

  it("retires an unassigned service item without deleting its history", async () => {
    const save: any = await invoke(
      saveUserRates,
      makeCtx({
        auth: { id: ownerId },
        params: { userId: staffId },
        json: {
          rates: [{ serviceItemId: regularItemId, rate: 8888, effectiveFrom: "2099-01-01" }]
        }
      })
    );
    expect(save.status).toBe(200);

    const res: any = await invoke(getUserRates, makeCtx({ auth: { id: ownerId }, params: { userId: staffId } }));
    // Retired items leave the editable assignment list...
    expect(res.body.data.some((r: any) => r.serviceItemId === zeroItemId)).toBe(false);
    expect(res.body.data.some((r: any) => r.serviceItemId === regularItemId)).toBe(true);

    // ...but are surfaced as read-only history, proving nothing was hard-deleted.
    const retiredZero = (res.body.retired || []).find((r: any) => r.serviceItemId === zeroItemId);
    expect(retiredZero).toBeDefined();
    expect(retiredZero.isActive).toBe(false);
    expect(retiredZero.effectiveTo).not.toBe("");

    const rows = (await db
      .select()
      .from(userServiceRates)
      .where(and(eq(userServiceRates.userId, staffId), eq(userServiceRates.serviceItemId, zeroItemId)))) as any[];
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r: any) => r.isActive === false)).toBe(true);

    // Past months still resolve the rate that was in force then.
    const dec = await calculateStaffEarnings(ownerId, staffId, "2026-12");
    expect(dec.zeroRate).toBeGreaterThan(0);
  });
});
