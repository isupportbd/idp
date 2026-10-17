import { and, asc, desc, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { round2 } from "@/utils/number.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { purchases } from "@/modules/clients/database/models/purchases.js";
import { vatSubmissions } from "@/modules/clients/database/models/vat_submissions.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";
import { users } from "@/modules/auth/database/models/user.js";
import { expenseHeads } from "@/modules/firm/database/models/expense_heads.js";
import { formatPeriodLabel, sendTransactionalSms } from "@/modules/sms-templates/services/sms.service.js";
import { payouts } from "../database/models/payouts.js";
import { userServiceRates } from "../database/models/user_service_rates.js";

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const MAX_MONTHS = 600;

export function isValidMonth(value: unknown): value is string {
  return typeof value === "string" && MONTH_RE.test(value);
}

/** Current month as strict `YYYY-MM`. */
export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Shifts a `YYYY-MM` string by `delta` months (negative allowed). */
export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  let year = Number(m[1]);
  let idx = Number(m[2]) - 1 + delta;
  year += Math.floor(idx / 12);
  idx = ((idx % 12) + 12) % 12;
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
}

/** Inclusive list of months from `from` to `to` (bounded by MAX_MONTHS). */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < MAX_MONTHS) {
    out.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return out;
}

function formatMoney(value: number): string {
  const n = round2(Number(value) || 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export interface ReturnServiceItems {
  zeroItemId: number | null;
  regularItemId: number | null;
  zeroItemName: string;
  regularItemName: string;
}

/**
 * Why: Staff are paid a per-item fee. The "Zero VAT Return" vs "Regular VAT
 *      Return" items are matched by name (the same convention billing uses when
 *      generating monthly invoices).
 * How: First by a return item containing "zero"/"regular", then any return item
 *      as a fallback so an un-seeded tenant still accrues something.
 */
export async function resolveReturnServiceItems(): Promise<ReturnServiceItems> {
  const items = await db
    .select({ id: serviceItems.id, itemName: serviceItems.itemName })
    .from(serviceItems)
    .where(eq(serviceItems.isActive, true));

  const isReturn = (name: string) => name.toLowerCase().includes("return");
  const zero = items.find((i) => isReturn(i.itemName) && i.itemName.toLowerCase().includes("zero"));
  const regular = items.find((i) => isReturn(i.itemName) && i.itemName.toLowerCase().includes("regular"));
  const generic = items.find((i) => isReturn(i.itemName));

  return {
    zeroItemId: zero?.id ?? generic?.id ?? null,
    regularItemId: regular?.id ?? generic?.id ?? null,
    zeroItemName: (zero ?? generic)?.itemName ?? "VAT Return Submission (Zero)",
    regularItemName: (regular ?? generic)?.itemName ?? "VAT Return Submission (Regular)"
  };
}

interface RateContext extends ReturnServiceItems {
  zeroRate: number;
  regularRate: number;
  rateOf: (itemId: number | null) => number;
}

interface StaffRateRow {
  serviceItemId: number;
  rate: any;
  effectiveFrom: any;
  effectiveTo: any;
}

/** End-of-month timestamp (ms) for a `YYYY-MM` key; `undefined` -> end of the current month. */
function monthEndTimestamp(month?: string): number {
  if (!month) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  }
  const [year, monthIndex] = month.split("-").map(Number);
  // Day 0 of the following month = last day of `month`.
  return new Date(year, monthIndex, 0, 23, 59, 59, 999).getTime();
}

/** Start-of-month timestamp (ms) for a `YYYY-MM` key; `undefined` -> start of the current month. */
function monthStartTimestamp(month?: string): number {
  if (!month) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex - 1, 1).getTime();
}

/**
 * Why: A version's window is [effectiveFrom, effectiveTo). It applies to a month
 *      when that window overlaps the month: it starts on/before the month ends
 *      AND it has not already ended before the month began.
 */
function rateVersionApplies(
  effectiveFrom: Date | string | null,
  effectiveTo: Date | string | null,
  monthStartTs: number,
  monthEndTs: number
): boolean {
  const from = effectiveFrom ? new Date(effectiveFrom).getTime() : 0;
  if (from > monthEndTs) return false;
  if (effectiveTo) {
    const to = new Date(effectiveTo).getTime();
    if (to <= monthStartTs) return false;
  }
  return true;
}

/** Loads every rate row for a staff member (tenant-scoped) exactly once. */
async function loadStaffRateRows(tenantAdminId: number, staffId: number): Promise<StaffRateRow[]> {
  return db
    .select({
      serviceItemId: userServiceRates.serviceItemId,
      rate: userServiceRates.rate,
      effectiveFrom: userServiceRates.effectiveFrom,
      effectiveTo: userServiceRates.effectiveTo
    })
    .from(userServiceRates)
    .where(and(eq(userServiceRates.adminId, tenantAdminId), eq(userServiceRates.userId, staffId)));
}

/**
 * Why: Rates are versioned by an [effectiveFrom, effectiveTo) window. A rate
 *      published in October must never retroactively change what a staff member
 *      earned in September, and a retired rate must stop accruing after it ends.
 * How: Keep only versions whose window overlaps the requested month, then take
 *      the one with the latest `effectiveFrom`.
 */
function rateForMonth(rateRows: StaffRateRow[], itemId: number | null, month?: string): number {
  if (itemId == null) return 0;
  const endTs = monthEndTimestamp(month);
  const startTs = monthStartTimestamp(month);
  const matching = rateRows.filter(
    (r) => r.serviceItemId === itemId && rateVersionApplies(r.effectiveFrom, r.effectiveTo, startTs, endTs)
  );
  matching.sort((a, b) => {
    const at = a.effectiveFrom ? new Date(a.effectiveFrom).getTime() : 0;
    const bt = b.effectiveFrom ? new Date(b.effectiveFrom).getTime() : 0;
    return bt - at;
  });
  return round2(matching[0]?.rate ?? 0);
}

async function getStaffRateContext(
  tenantAdminId: number,
  staffId: number,
  targetMonth?: string
): Promise<RateContext> {
  const items = await resolveReturnServiceItems();
  const rateRows = await loadStaffRateRows(tenantAdminId, staffId);
  const rateOf = (itemId: number | null) => rateForMonth(rateRows, itemId, targetMonth);

  return {
    ...items,
    rateOf,
    zeroRate: rateOf(items.zeroItemId),
    regularRate: rateOf(items.regularItemId)
  };
}

export interface StaffRateVersion {
  serviceItemId: number;
  itemName: string | null;
  rate: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive: boolean;
}

/**
 * Every rate version recorded for a staff member (append-only history),
 * ordered by service item name and then newest effective date first.
 */
export async function listStaffRateVersions(
  tenantAdminId: number,
  staffId: number
): Promise<StaffRateVersion[]> {
  const rows = await db
    .select({
      serviceItemId: userServiceRates.serviceItemId,
      itemName: serviceItems.itemName,
      rate: userServiceRates.rate,
      effectiveFrom: userServiceRates.effectiveFrom,
      effectiveTo: userServiceRates.effectiveTo,
      isActive: userServiceRates.isActive
    })
    .from(userServiceRates)
    .leftJoin(serviceItems, eq(userServiceRates.serviceItemId, serviceItems.id))
    .where(
      and(
        eq(userServiceRates.adminId, tenantAdminId),
        eq(userServiceRates.userId, staffId),
        gt(userServiceRates.rate, 0)
      )
    )
    .orderBy(asc(serviceItems.itemName), desc(userServiceRates.effectiveFrom));

  return rows.map((r) => ({
    serviceItemId: r.serviceItemId,
    itemName: r.itemName,
    rate: round2(r.rate),
    effectiveFrom: r.effectiveFrom as Date,
    effectiveTo: (r.effectiveTo as Date | null) ?? null,
    isActive: Boolean(r.isActive)
  }));
}

/**
 * The rate that applies to each item for a given month: the latest version whose
 * [effectiveFrom, effectiveTo) window overlaps that month. With no month, the
 * current calendar month is used.
 */
export function ratesEffectiveForMonth(
  versions: StaffRateVersion[],
  month?: string
): StaffRateVersion[] {
  const endTs = monthEndTimestamp(month);
  const startTs = monthStartTimestamp(month);
  const applicable = versions.filter(
    (v) => rateVersionApplies(v.effectiveFrom, v.effectiveTo, startTs, endTs)
  );
  // Versions arrive newest-first within each item, so the first hit is the winner.
  const byItem = new Map<number, StaffRateVersion>();
  for (const version of applicable) {
    if (!byItem.has(version.serviceItemId)) byItem.set(version.serviceItemId, version);
  }
  return [...byItem.values()];
}

/**
 * Why: A month is "Regular" when the client imported goods (any purchase row
 *      with net weight > 0) and "Zero" otherwise — the exact rule the billing
 *      module uses to pick the return line item.
 */
async function purchasesByClientMonth(
  month: string,
  clientIds: number[]
): Promise<Set<number>> {
  const pairs = await turnoverPairs(clientIds, [month]);
  const out = new Set<number>();
  for (const key of pairs) {
    const sep = key.indexOf(":");
    out.add(Number(key.slice(0, sep)));
  }
  return out;
}

/**
 * Which (client, month) pairs had turnover (any purchase row with net weight > 0)
 * — the Regular-VAT signal. Pure helper with explicit param types so Drizzle's
 * `inArray` overloads resolve cleanly.
 */
async function turnoverPairs(clientIds: number[], months: string[]): Promise<Set<string>> {
  if (clientIds.length === 0 || months.length === 0) return new Set<string>();
  const rows = await db
    .select({ clientId: purchases.clientId, month: purchases.month })
    .from(purchases)
    .where(
      and(
        inArray(purchases.clientId, clientIds),
        inArray(purchases.month, months),
        sql`${purchases.netWt} > 0`
      )
    );
  return new Set(rows.map((r) => `${r.clientId}:${r.month}`));
}

/** Finalized submissions filed by a staff member (tenant-scoped) within a month. */
async function staffSubmissionsForMonth(
  tenantAdminId: number,
  staffId: number,
  month: string
): Promise<Array<{ clientId: number }>> {
  return db
    .select({ clientId: vatSubmissions.clientId })
    .from(vatSubmissions)
    .innerJoin(clients, eq(vatSubmissions.clientId, clients.id))
    .where(
      and(
        eq(vatSubmissions.submittedBy, staffId),
        eq(vatSubmissions.taxPeriod, month),
        eq(clients.createdBy, tenantAdminId),
        sql`${vatSubmissions.submissionId} IS NOT NULL AND ${vatSubmissions.submissionId} <> ''`
      )
    );
}

export interface StaffEarnings {
  userId: number;
  month: string;
  zeroCount: number;
  regularCount: number;
  zeroRate: number;
  regularRate: number;
  zeroItemId: number | null;
  regularItemId: number | null;
  /** Total accrued fee for the month (the "Current Month Accrued Bill"). */
  currentBill: number;
}

/**
 * Why: The live accrual primitive — "what has this staff member earned in
 *      `month`?" — used by the realtime `payout:earning-accrued` broadcast and
 *      the dashboard.
 * How: Classify each finalized submission they filed this month as Zero/Regular
 *      (via client purchases) and multiply the counts by their configured rates.
 */
export async function calculateStaffEarnings(
  tenantAdminId: number,
  staffId: number,
  month: string
): Promise<StaffEarnings> {
  const target = isValidMonth(month) ? month : currentMonth();
  const ctx = await getStaffRateContext(tenantAdminId, staffId, target);
  const subs = await staffSubmissionsForMonth(tenantAdminId, staffId, target);
  const clientIds = [...new Set(subs.map((s) => s.clientId))];
  const regularClients = await purchasesByClientMonth(target, clientIds);

  let zeroCount = 0;
  let regularCount = 0;
  for (const s of subs) {
    if (regularClients.has(s.clientId)) regularCount += 1;
    else zeroCount += 1;
  }

  return {
    userId: staffId,
    month: target,
    zeroCount,
    regularCount,
    zeroRate: ctx.zeroRate,
    regularRate: ctx.regularRate,
    zeroItemId: ctx.zeroItemId,
    regularItemId: ctx.regularItemId,
    currentBill: round2(zeroCount * ctx.zeroRate + regularCount * ctx.regularRate)
  };
}

/**
 * The incremental fee a single freshly-recorded submission adds, plus its
 * Zero/Regular classification. Used by the submission controller's realtime
 * accrual broadcast (only for new records, never edits).
 */
export async function computeSubmissionEarning(
  tenantAdminId: number,
  staffId: number,
  month: string,
  clientId: number
): Promise<{ amount: number; classification: "zero" | "regular" }> {
  const ctx = await getStaffRateContext(tenantAdminId, staffId, month);
  const regularClients = await purchasesByClientMonth(month, [clientId]);
  const classification = regularClients.has(clientId) ? "regular" : "zero";
  const amount = classification === "regular" ? ctx.regularRate : ctx.zeroRate;
  return { amount, classification };
}

export interface StaffLedger {
  userId: number;
  month: string;
  zeroCount: number;
  regularCount: number;
  zeroRate: number;
  regularRate: number;
  currentBill: number;
  previousMonth: string;
  previousDue: number;
  previousAdvance: number;
  paidAmount: number;
  paymentCount: number;
  totalPayable: number;
  closingDue: number;
  advanceBalance: number;
  isSettled: boolean;
}

export interface MonthlyLedgerRow {
  month: string;
  zeroCount: number;
  regularCount: number;
  currentBill: number;
  previousDue: number;
  previousAdvance: number;
  paidAmount: number;
  paymentCount: number;
  totalPayable: number;
  closingDue: number;
  advanceBalance: number;
}

/**
 * Why: Reconstructs a staff member's full running account up to `month` so the
 *      carried "previous due / advance" is always correct — even for months that
 *      were never paid. Shared by the single-month ledger and "My Earnings".
 * How: Loads ALL of the staff's finalized submissions + staff payouts once,
 *      then walks month-by-month from their earliest activity applying:
 *        totalPayable = currentBill + previousDue - previousAdvance
 *        paid > payable  -> closingDue = 0, advance = paid - payable
 *        otherwise       -> closingDue = payable - paid, advance = 0
 */
export async function resolveStaffLedgerHistory(
  tenantAdminId: number,
  staffId: number,
  uptoMonth: string
): Promise<{ zeroRate: number; regularRate: number; months: MonthlyLedgerRow[] }> {
  const target = isValidMonth(uptoMonth) ? uptoMonth : currentMonth();
  const items = await resolveReturnServiceItems();
  const rateRows = await loadStaffRateRows(tenantAdminId, staffId);
  const targetZeroRate = rateForMonth(rateRows, items.zeroItemId, target);
  const targetRegularRate = rateForMonth(rateRows, items.regularItemId, target);

  // 1. All finalized submissions filed by the staff member (any month).
  const subs = await db
    .select({ clientId: vatSubmissions.clientId, month: vatSubmissions.taxPeriod })
    .from(vatSubmissions)
    .innerJoin(clients, eq(vatSubmissions.clientId, clients.id))
    .where(
      and(
        eq(vatSubmissions.submittedBy, staffId),
        eq(clients.createdBy, tenantAdminId),
        sql`${vatSubmissions.submissionId} IS NOT NULL AND ${vatSubmissions.submissionId} <> ''`
      )
    );

  // 2. All staff payouts for the member.
  const payRows = await db
    .select({ month: payouts.periodMonth, amount: payouts.amount })
    .from(payouts)
    .where(
      and(
        eq(payouts.adminId, tenantAdminId),
        eq(payouts.payoutType, "staff"),
        eq(payouts.userId, staffId),
        sql`${payouts.periodMonth} IS NOT NULL`
      )
    );

  // 3. Which (client, month) pairs had turnover (Regular VAT).
  const clientIds = [...new Set(subs.map((s) => s.clientId))];
  const months = [...new Set(subs.map((s) => s.month))];
  const regular = await turnoverPairs(clientIds as number[], months as string[]);

  const earningsByMonth = new Map<string, { zero: number; regular: number }>();
  for (const s of subs) {
    const entry = earningsByMonth.get(s.month) ?? { zero: 0, regular: 0 };
    if (regular.has(`${s.clientId}:${s.month}`)) entry.regular += 1;
    else entry.zero += 1;
    earningsByMonth.set(s.month, entry);
  }

  const paidByMonth = new Map<string, { amount: number; count: number }>();
  for (const p of payRows) {
    if (!p.month) continue;
    const entry = paidByMonth.get(p.month) ?? { amount: 0, count: 0 };
    entry.amount = round2(entry.amount + round2(p.amount));
    entry.count += 1;
    paidByMonth.set(p.month, entry);
  }

  const activityMonths = [...earningsByMonth.keys(), ...paidByMonth.keys()];
  const earliest = activityMonths.length > 0 ? activityMonths.reduce((a, b) => (a < b ? a : b)) : null;

  const blankRow: MonthlyLedgerRow = {
    month: target,
    zeroCount: 0,
    regularCount: 0,
    currentBill: 0,
    previousDue: 0,
    previousAdvance: 0,
    paidAmount: 0,
    paymentCount: 0,
    totalPayable: 0,
    closingDue: 0,
    advanceBalance: 0
  };

  if (!earliest || target < earliest) {
    return { zeroRate: targetZeroRate, regularRate: targetRegularRate, months: [blankRow] };
  }

  const rows: MonthlyLedgerRow[] = [];
  let openingDue = 0;
  let openingAdvance = 0;

  for (const m of monthRange(earliest, target)) {
    // Rates are resolved per month so a later rate change never rewrites history.
    const zeroRate = rateForMonth(rateRows, items.zeroItemId, m);
    const regularRate = rateForMonth(rateRows, items.regularItemId, m);
    const gained = earningsByMonth.get(m);
    const currentBill = round2((gained?.zero ?? 0) * zeroRate + (gained?.regular ?? 0) * regularRate);
    const paid = round2(paidByMonth.get(m)?.amount ?? 0);

    const previousDue = openingDue;
    const previousAdvance = openingAdvance;
    const totalPayable = round2(currentBill + previousDue - previousAdvance);

    let closingDue: number;
    let advanceBalance: number;
    if (paid > totalPayable) {
      closingDue = 0;
      advanceBalance = round2(paid - totalPayable);
    } else {
      closingDue = round2(totalPayable - paid);
      advanceBalance = 0;
    }

    rows.push({
      month: m,
      zeroCount: gained?.zero ?? 0,
      regularCount: gained?.regular ?? 0,
      currentBill,
      previousDue,
      previousAdvance,
      paidAmount: paid,
      paymentCount: paidByMonth.get(m)?.count ?? 0,
      totalPayable,
      closingDue,
      advanceBalance
    });

    openingDue = closingDue;
    openingAdvance = advanceBalance;
  }

  return { zeroRate: targetZeroRate, regularRate: targetRegularRate, months: rows };
}

/** Single-month view of {@link resolveStaffLedgerHistory}. */
export async function resolveStaffLedger(
  tenantAdminId: number,
  staffId: number,
  month: string
): Promise<StaffLedger> {
  const walk = await resolveStaffLedgerHistory(tenantAdminId, staffId, month);
  const row = walk.months[walk.months.length - 1];
  return {
    userId: staffId,
    month: row.month,
    zeroCount: row.zeroCount,
    regularCount: row.regularCount,
    zeroRate: walk.zeroRate,
    regularRate: walk.regularRate,
    currentBill: row.currentBill,
    previousMonth: shiftMonth(row.month, -1),
    previousDue: row.previousDue,
    previousAdvance: row.previousAdvance,
    paidAmount: row.paidAmount,
    paymentCount: row.paymentCount,
    totalPayable: row.totalPayable,
    closingDue: row.closingDue,
    advanceBalance: row.advanceBalance,
    isSettled: row.totalPayable > 0 && row.closingDue <= 0
  };
}

export interface StaffLifetimeLedger {
  zeroCount: number;
  regularCount: number;
  zeroRate: number;
  regularRate: number;
  currentBill: number;
  paidAmount: number;
  paymentCount: number;
  totalPayable: number;
  closingDue: number;
  advanceBalance: number;
  isSettled: boolean;
}

/**
 * The latest month with any recorded activity (finalized submission or payout)
 * for a staff member, or null when they have none. Used to size the lifetime
 * aggregate so future-dated (early-filed) periods are still included.
 */
async function latestStaffActivityMonth(
  tenantAdminId: number,
  staffId: number
): Promise<string | null> {
  const subRow = (
    await db
      .select({ m: sql<string>`MAX(${vatSubmissions.taxPeriod})` })
      .from(vatSubmissions)
      .innerJoin(clients, eq(vatSubmissions.clientId, clients.id))
      .where(
        and(
          eq(vatSubmissions.submittedBy, staffId),
          eq(clients.createdBy, tenantAdminId),
          sql`${vatSubmissions.submissionId} IS NOT NULL AND ${vatSubmissions.submissionId} <> ''`
        )
      )
  )[0];
  const payRow = (
    await db
      .select({ m: sql<string>`MAX(${payouts.periodMonth})` })
      .from(payouts)
      .where(and(eq(payouts.adminId, tenantAdminId), eq(payouts.userId, staffId)))
  )[0];

  const candidates = [subRow?.m, payRow?.m].filter((m): m is string => !!m);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a > b ? a : b));
}

/**
 * Why: The "All Months" dashboard view needs a lifetime aggregate per staff
 *      member (cumulative return counts, total earnings and the current
 *      outstanding balance) instead of a single month's snapshot.
 * How: Walk the full running ledger up to whichever is later — the current
 *      month or the latest month with data — summing each month's accrued bill
 *      and payments while keeping the final carried balance.
 */
export async function resolveStaffLifetimeLedger(
  tenantAdminId: number,
  staffId: number
): Promise<StaffLifetimeLedger> {
  const current = currentMonth();
  const latest = await latestStaffActivityMonth(tenantAdminId, staffId);
  const target = latest && latest > current ? latest : current;
  const walk = await resolveStaffLedgerHistory(tenantAdminId, staffId, target);

  let zeroCount = 0;
  let regularCount = 0;
  let currentBill = 0;
  let paidAmount = 0;
  let paymentCount = 0;
  for (const row of walk.months) {
    zeroCount += row.zeroCount;
    regularCount += row.regularCount;
    currentBill = round2(currentBill + row.currentBill);
    paidAmount = round2(paidAmount + row.paidAmount);
    paymentCount += row.paymentCount;
  }

  const last = walk.months[walk.months.length - 1];
  const closingDue = last?.closingDue ?? 0;
  const advanceBalance = last?.advanceBalance ?? 0;
  const hasActivity = currentBill > 0 || paidAmount > 0;

  return {
    zeroCount,
    regularCount,
    zeroRate: walk.zeroRate,
    regularRate: walk.regularRate,
    currentBill,
    paidAmount,
    paymentCount,
    // Over the full series the carried dues/advances cancel out, so the total
    // ever-payable equals the lifetime accrued bill.
    totalPayable: currentBill,
    closingDue,
    advanceBalance,
    isSettled: hasActivity && closingDue <= 0 && advanceBalance <= 0
  };
}

/**
 * Resolves (creating if needed) the tenant's "Staff Salaries & Allowances"
 * expense head (EXP-02) that every staff payout is attributed to.
 */
export async function resolveStaffExpenseHead(tenantAdminId: number) {
  const existing = (
    await db
      .select()
      .from(expenseHeads)
      .where(
        and(
          eq(expenseHeads.adminId, tenantAdminId),
          or(eq(expenseHeads.code, "EXP-02"), ilike(expenseHeads.name, "Staff Salaries%"))
        )
      )
      .limit(1)
  )[0];
  if (existing) return existing;

  const created = (
    await db
      .insert(expenseHeads)
      .values({
        adminId: tenantAdminId,
        name: "Staff Salaries & Allowances",
        code: "EXP-02",
        category: "Salary & Allowances",
        description: "Auto-provisioned head for staff payout accounting"
      })
      .returning()
  )[0];
  return created;
}

/**
 * Why: Renders and dispatches the Bengali payout SMS, then persists the outcome
 *      on the payout row (`sms_status` / `sms_response`).
 * Note: Never throws — a delivery failure must not roll back a recorded payout.
 */
export async function sendPayoutSms(
  payoutId: number
): Promise<{ status: "SENT" | "FAILED" | "SKIPPED"; response: string }> {
  const row = (
    await db
      .select({
        id: payouts.id,
        adminId: payouts.adminId,
        payoutType: payouts.payoutType,
        userId: payouts.userId,
        periodMonth: payouts.periodMonth,
        amount: payouts.amount,
        paymentMethod: payouts.paymentMethod,
        currentBillSnapshot: payouts.currentBillSnapshot,
        previousDueSnapshot: payouts.previousDueSnapshot,
        closingDueSnapshot: payouts.closingDueSnapshot,
        advanceSnapshot: payouts.advanceSnapshot,
        createdBy: payouts.createdBy,
        staffName: users.name,
        staffMobile: users.mobile
      })
      .from(payouts)
      .leftJoin(users, eq(payouts.userId, users.id))
      .where(eq(payouts.id, payoutId))
      .limit(1)
  )[0];

  if (!row) return { status: "SKIPPED", response: "Payout not found" };

  if (row.payoutType !== "staff" || !row.userId) {
    await db
      .update(payouts)
      .set({ smsStatus: "SKIPPED", smsResponse: "SMS not applicable for general expenses", updatedAt: new Date() })
      .where(eq(payouts.id, payoutId));
    return { status: "SKIPPED", response: "Not a staff payout" };
  }

  const currentBill = round2(row.currentBillSnapshot);
  const previousDue = round2(row.previousDueSnapshot);
  const closingDue = round2(row.closingDueSnapshot);
  const advance = round2(row.advanceSnapshot);
  const paid = round2(row.amount);
  // closing and advance are mutually exclusive, so this reconstructs the
  // original "total payable" from stored snapshots alone.
  const totalPayable = round2(paid + closingDue - advance);
  const advanceNote = advance > 0 ? ` [বা অগ্রিম জমা: ${formatMoney(advance)}/-]` : "";

  try {
    const result = await sendTransactionalSms({
      tenantId: String(row.adminId),
      templateKey: "staff_payout",
      recipientPhone: row.staffMobile || "",
      variables: {
        staff_name: row.staffName || "কর্মী",
        period_month: formatPeriodLabel(row.periodMonth) || "",
        current_bill: formatMoney(currentBill),
        previous_due: formatMoney(previousDue),
        total_payable: formatMoney(totalPayable),
        paid_amount: formatMoney(paid),
        payment_method: row.paymentMethod || "CASH",
        closing_due: formatMoney(closingDue),
        advance_note: advanceNote
      },
      referenceType: "payout",
      referenceId: String(payoutId),
      triggeredByUserId: row.createdBy ? String(row.createdBy) : undefined
    });

    await db
      .update(payouts)
      .set({ smsStatus: result.status, smsResponse: result.response, updatedAt: new Date() })
      .where(eq(payouts.id, payoutId));

    return { status: result.status, response: result.response };
  } catch (err: any) {
    const response = err?.message || String(err);
    await db
      .update(payouts)
      .set({ smsStatus: "FAILED", smsResponse: response, updatedAt: new Date() })
      .where(eq(payouts.id, payoutId))
      .catch(() => {});
    return { status: "FAILED", response };
  }
}
