import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import type { Handler } from "hono";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { broadcast } from "@/framework/realtime/broadcast.js";
import { round2 } from "@/utils/number.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { bankAccounts } from "@/modules/firm/database/models/bank_accounts.js";
import { expenseHeads } from "@/modules/firm/database/models/expense_heads.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";
import { payouts } from "../database/models/payouts.js";
import { userMonthlyLedgers } from "../database/models/user_monthly_ledgers.js";
import { userServiceRates } from "../database/models/user_service_rates.js";
import {
  currentMonth,
  isValidMonth,
  listStaffRateVersions,
  ratesEffectiveForMonth,
  resolveStaffExpenseHead,
  resolveStaffLedger,
  resolveStaffLedgerHistory,
  resolveStaffLifetimeLedger,
  sendPayoutSms
} from "../services/payouts.service.js";

/** Fire the payout SMS without letting a slow gateway hang the HTTP request. */
async function dispatchPayoutSms(payoutId: number): Promise<"SENT" | "FAILED" | "SKIPPED"> {
  try {
    const result = await Promise.race([
      sendPayoutSms(payoutId),
      new Promise<{ status: "SKIPPED" }>((resolve) =>
        setTimeout(() => resolve({ status: "SKIPPED" }), 10000)
      )
    ]);
    return result.status;
  } catch {
    return "FAILED";
  }
}

/**
 * Active sub-users (real staff/employees) belonging to the tenant.
 * The Tenant Admin is the employer and is deliberately excluded — the admin
 * does not earn staff commissions or receive staff payouts.
 */
async function tenantStaff(tenantAdminId: number) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      mobile: users.mobile,
      roleName: roles.name,
      status: users.status
    })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(
      and(
        eq(users.adminId, tenantAdminId),
        ne(users.id, tenantAdminId),
        eq(users.status, "active")
      )
    )
    .orderBy(asc(users.name));
}

/**
 * Resolves the owning tenant for a staff-scoped request and verifies that the
 * target really is a sub-user of that tenant.
 *
 * Why: a superadmin has no `adminId`, so `tenantAdminId` resolves to their own
 * id — scoping staff lookups by it would 404 on every other firm's staff. A
 * superadmin may act on any firm, so the tenant is derived from the staff record
 * itself; a tenant admin stays hard-scoped to their own firm.
 */
async function resolveStaffScope(c: any, userId: number) {
  const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
  const row = (
    await db
      .select({ id: users.id, name: users.name, mobile: users.mobile, adminId: users.adminId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  )[0];
  if (!row) return null;
  // The Tenant Admin is the employer and is never treated as staff.
  const ownerId = row.adminId == null ? Number(row.id) : Number(row.adminId);
  if (ownerId === Number(row.id)) return null;
  if (!isSuperAdmin && ownerId !== tenantAdminId) return null;
  return { tenant: ownerId, staff: { id: row.id, name: row.name, mobile: row.mobile } };
}

/**
 * Normalises a client-supplied effective date to UTC midnight. Because the rate
 * card is append-only (unique per user + item + `effective_from`), anchoring the
 * time at midnight means "make this rate effective from this day" is idempotent:
 * re-saving the same day updates that version instead of adding a duplicate.
 */
function normalizeEffectiveDate(value?: string | Date | null): Date {
  const parsed = value ? new Date(value) : new Date();
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
}

/** Formats an effective date as `YYYY-MM-DD` for the client. */
function toDateOnly(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// ── 1. META (dropdown data for create + rates editor) ────────────────

export const getPayoutMeta: Handler = async (c: any) => {
  try {
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
    const tenant = isSuperAdmin ? tenantAdminId : tenantAdminId;

    const [staff, heads, banks, items, staffHead] = await Promise.all([
      tenantStaff(tenant),
      db
        .select()
        .from(expenseHeads)
        .where(and(eq(expenseHeads.adminId, tenant), eq(expenseHeads.isActive, true)))
        .orderBy(asc(expenseHeads.category), asc(expenseHeads.name)),
      db
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.adminId, tenant), eq(bankAccounts.isActive, true)))
        .orderBy(asc(bankAccounts.bankName)),
      db
        .select({ id: serviceItems.id, itemName: serviceItems.itemName })
        .from(serviceItems)
        .where(eq(serviceItems.isActive, true))
        .orderBy(asc(serviceItems.itemName)),
      resolveStaffExpenseHead(tenant)
    ]);

    return c.json(
      {
        message: "Payout metadata fetched successfully",
        data: { staff, expenseHeads: heads, bankAccounts: banks, serviceItems: items, staffExpenseHead: staffHead }
      },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json({ message: "Failed to fetch payout metadata" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 2. DASHBOARD ─────────────────────────────────────────────────────

export const getPayoutsDashboard: Handler = async (c: any) => {
  try {
    const query = c.req.valid ? c.req.valid("query") : c.req.query();
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
    const tenant = isSuperAdmin ? tenantAdminId : tenantAdminId;
    // No month selected ("All Months") -> aggregate a lifetime view across every month.
    const hasMonth = isValidMonth(query.month);
    const month = hasMonth ? query.month : "";

    const staffRows = await tenantStaff(tenant);

    const staff: any[] = await Promise.all(
      staffRows.map(async (s) => {
        const base = {
          id: s.id,
          name: s.name,
          email: s.email,
          mobile: s.mobile,
          role: s.roleName
        };

        if (hasMonth) {
          const ledger = await resolveStaffLedger(tenant, s.id, month);
          return {
            ...base,
            zeroCount: ledger.zeroCount,
            regularCount: ledger.regularCount,
            zeroRate: ledger.zeroRate,
            regularRate: ledger.regularRate,
            currentBill: ledger.currentBill,
            paidAmount: ledger.paidAmount,
            previousDue: ledger.previousDue,
            previousAdvance: ledger.previousAdvance,
            totalPayable: ledger.totalPayable,
            closingDue: ledger.closingDue,
            advanceBalance: ledger.advanceBalance,
            isSettled: ledger.isSettled
          };
        }

        const lifetime = await resolveStaffLifetimeLedger(tenant, s.id);
        return {
          ...base,
          zeroCount: lifetime.zeroCount,
          regularCount: lifetime.regularCount,
          zeroRate: lifetime.zeroRate,
          regularRate: lifetime.regularRate,
          currentBill: lifetime.currentBill,
          paidAmount: lifetime.paidAmount,
          previousDue: 0,
          previousAdvance: 0,
          totalPayable: lifetime.totalPayable,
          closingDue: lifetime.closingDue,
          advanceBalance: lifetime.advanceBalance,
          isSettled: lifetime.isSettled
        };
      })
    );

    const totalEarned = round2(staff.reduce((sum, s) => sum + s.currentBill, 0));
    const totalStaffPaid = round2(staff.reduce((sum, s) => sum + s.paidAmount, 0));
    const totalDue = round2(staff.reduce((sum, s) => sum + s.closingDue, 0));
    const totalAdvance = round2(staff.reduce((sum, s) => sum + s.advanceBalance, 0));

    // Rows scoped to the tenant, plus the selected month when one is active.
    const scopeConditions: any[] = [eq(payouts.adminId, tenant)];
    if (hasMonth) scopeConditions.push(eq(payouts.periodMonth, month));

    const recent = await db
      .select({
        id: payouts.id,
        payoutType: payouts.payoutType,
        userId: payouts.userId,
        staffName: users.name,
        expenseHeadId: payouts.expenseHeadId,
        headName: expenseHeads.name,
        category: expenseHeads.category,
        amount: payouts.amount,
        paymentMethod: payouts.paymentMethod,
        accountInfo: payouts.accountInfo,
        referenceNo: payouts.referenceNo,
        periodMonth: payouts.periodMonth,
        paidAt: payouts.paidAt,
        smsStatus: payouts.smsStatus
      })
      .from(payouts)
      .leftJoin(users, eq(payouts.userId, users.id))
      .leftJoin(expenseHeads, eq(payouts.expenseHeadId, expenseHeads.id))
      .where(and(...scopeConditions))
      .orderBy(desc(payouts.paidAt))
      .limit(50);

    // Aggregate the expense total in SQL — the `recent` list is capped at 50 rows.
    const expenseRows = await db
      .select({ total: sql<string>`COALESCE(SUM(${payouts.amount}), 0)` })
      .from(payouts)
      .where(and(...scopeConditions, eq(payouts.payoutType, "general_expense")));
    const generalExpenseTotal = round2(Number(expenseRows[0]?.total ?? 0));

    const categoryRows = await db
      .select({
        category: sql<string>`COALESCE(${expenseHeads.category}, 'Other')`,
        amount: sql<string>`COALESCE(SUM(${payouts.amount}), 0)`
      })
      .from(payouts)
      .leftJoin(expenseHeads, eq(payouts.expenseHeadId, expenseHeads.id))
      .where(and(...scopeConditions))
      .groupBy(sql`COALESCE(${expenseHeads.category}, 'Other')`);

    const categories = categoryRows.map((r) => ({ category: r.category, amount: round2(Number(r.amount)) }));

    return c.json(
      {
        message: "Payouts dashboard fetched successfully",
        data: {
          month,
          summary: {
            staffCount: staff.length,
            totalEarned,
            totalPaid: totalStaffPaid,
            totalDue,
            totalAdvance,
            generalExpenseTotal,
            monthPayoutTotal: round2(totalStaffPaid + generalExpenseTotal)
          },
          staff,
          categories,
          recent
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json({ message: "Failed to fetch payouts dashboard" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 3. LIST PAYOUTS ──────────────────────────────────────────────────

export const listPayouts: Handler = async (c: any) => {
  try {
    const query = c.req.valid ? c.req.valid("query") : c.req.query();
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    const conditions: any[] = [];
    if (!isSuperAdmin) conditions.push(eq(payouts.adminId, tenantAdminId));
    if (query.month) conditions.push(eq(payouts.periodMonth, query.month));
    if (query.payoutType && query.payoutType !== "all") conditions.push(eq(payouts.payoutType, query.payoutType));
    if (query.userId) conditions.push(eq(payouts.userId, Number(query.userId)));
    if (query.search && String(query.search).trim()) {
      const like = `%${String(query.search).trim()}%`;
      conditions.push(
        or(ilike(payouts.referenceNo, like), ilike(payouts.notes, like), ilike(users.name, like), ilike(expenseHeads.name, like))
      );
    }

    const rows = await db
      .select({
        id: payouts.id,
        payoutType: payouts.payoutType,
        userId: payouts.userId,
        staffName: users.name,
        expenseHeadId: payouts.expenseHeadId,
        headName: expenseHeads.name,
        category: expenseHeads.category,
        bankAccountId: payouts.bankAccountId,
        amount: payouts.amount,
        paymentMethod: payouts.paymentMethod,
        accountInfo: payouts.accountInfo,
        referenceNo: payouts.referenceNo,
        periodMonth: payouts.periodMonth,
        paidAt: payouts.paidAt,
        notes: payouts.notes,
        smsStatus: payouts.smsStatus,
        createdAt: payouts.createdAt
      })
      .from(payouts)
      .leftJoin(users, eq(payouts.userId, users.id))
      .leftJoin(expenseHeads, eq(payouts.expenseHeadId, expenseHeads.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(payouts.paidAt))
      .limit(500);

    const totalPaid = round2(rows.reduce((sum, r) => sum + round2(r.amount), 0));
    return c.json({ message: "Payouts fetched successfully", data: rows, total: rows.length, totalPaid }, HttpStatusCodes.OK);
  } catch (err: any) {
    return c.json({ message: "Failed to fetch payouts" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 4. SINGLE PAYOUT ─────────────────────────────────────────────────

export const getPayoutDetail: Handler = async (c: any) => {
  try {
    const { id } = c.req.valid("param");
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    const conditions: any[] = [eq(payouts.id, id)];
    if (!isSuperAdmin) conditions.push(eq(payouts.adminId, tenantAdminId));

    const row = (
      await db
        .select({
          id: payouts.id,
          adminId: payouts.adminId,
          payoutType: payouts.payoutType,
          userId: payouts.userId,
          staffName: users.name,
          staffMobile: users.mobile,
          expenseHeadId: payouts.expenseHeadId,
          headName: expenseHeads.name,
          category: expenseHeads.category,
          bankAccountId: payouts.bankAccountId,
          bankName: bankAccounts.bankName,
          bankAccountNumber: bankAccounts.accountNumber,
          amount: payouts.amount,
          paymentMethod: payouts.paymentMethod,
          accountInfo: payouts.accountInfo,
          referenceNo: payouts.referenceNo,
          periodMonth: payouts.periodMonth,
          paidAt: payouts.paidAt,
          notes: payouts.notes,
          currentBillSnapshot: payouts.currentBillSnapshot,
          previousDueSnapshot: payouts.previousDueSnapshot,
          closingDueSnapshot: payouts.closingDueSnapshot,
          advanceSnapshot: payouts.advanceSnapshot,
          smsStatus: payouts.smsStatus,
          smsResponse: payouts.smsResponse,
          createdBy: payouts.createdBy,
          createdAt: payouts.createdAt
        })
        .from(payouts)
        .leftJoin(users, eq(payouts.userId, users.id))
        .leftJoin(expenseHeads, eq(payouts.expenseHeadId, expenseHeads.id))
        .leftJoin(bankAccounts, eq(payouts.bankAccountId, bankAccounts.id))
        .where(and(...conditions))
        .limit(1)
    )[0];

    if (!row) return c.json({ message: "Payout not found" }, HttpStatusCodes.NOT_FOUND);
    return c.json({ message: "Payout fetched successfully", data: row }, HttpStatusCodes.OK);
  } catch (err: any) {
    return c.json({ message: "Failed to fetch payout" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 5. STAFF LEDGER PREVIEW (for the create page) ────────────────────

export const getStaffLedger: Handler = async (c: any) => {
  try {
    const query = c.req.valid ? c.req.valid("query") : c.req.query();
    const userId = Number(query.userId);
    if (!userId) return c.json({ message: "userId is required" }, HttpStatusCodes.BAD_REQUEST);

    const scope = await resolveStaffScope(c, userId);
    if (!scope) return c.json({ message: "Staff member not found" }, HttpStatusCodes.NOT_FOUND);
    const { tenant } = scope;

    const month = isValidMonth(query.month) ? query.month : currentMonth();
    const ledger = await resolveStaffLedger(tenant, userId, month);
    return c.json({ message: "Staff ledger fetched successfully", data: ledger }, HttpStatusCodes.OK);
  } catch (err: any) {
    return c.json({ message: "Failed to fetch staff ledger" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 6. CREATE PAYOUT ─────────────────────────────────────────────────

export const createPayout: Handler = async (c: any) => {
  try {
    const payload = c.req.valid("json");
    const { isSuperAdmin, tenantAdminId, userId: actorId } = await resolveTenantContext(c);
    // Superadmins have no tenant of their own; the staff branch below re-resolves
    // the owning firm from the target staff record.
    let tenant = isSuperAdmin ? tenantAdminId : tenantAdminId;

    const amount = round2(Number(payload.amount) || 0);
    const paidAt = payload.paidAt ? new Date(payload.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return c.json({ message: "Invalid payment date" }, HttpStatusCodes.BAD_REQUEST);
    }

    // ── General firm expense ──────────────────────────────────────────
    if (payload.payoutType === "general_expense") {
      if (!payload.expenseHeadId) {
        return c.json({ message: "Expense head is required" }, HttpStatusCodes.BAD_REQUEST);
      }
      const head = (
        await db
          .select({ id: expenseHeads.id })
          .from(expenseHeads)
          .where(and(eq(expenseHeads.id, payload.expenseHeadId), eq(expenseHeads.adminId, tenant)))
          .limit(1)
      )[0];
      if (!head) return c.json({ message: "Expense head not found" }, HttpStatusCodes.NOT_FOUND);

      if (payload.bankAccountId) {
        const bank = (
          await db
            .select({ id: bankAccounts.id })
            .from(bankAccounts)
            .where(and(eq(bankAccounts.id, payload.bankAccountId), eq(bankAccounts.adminId, tenant)))
            .limit(1)
        )[0];
        if (!bank) return c.json({ message: "Bank account not found" }, HttpStatusCodes.NOT_FOUND);
      }

      const created = (
        await db
          .insert(payouts)
          .values({
            adminId: tenant,
            payoutType: "general_expense",
            userId: null,
            expenseHeadId: payload.expenseHeadId,
            bankAccountId: payload.bankAccountId ?? null,
            periodMonth: isValidMonth(payload.periodMonth) ? payload.periodMonth : null,
            amount,
            paymentMethod: payload.paymentMethod ?? "CASH",
            accountInfo: payload.accountInfo?.trim() || null,
            referenceNo: payload.referenceNo?.trim() || null,
            paidAt,
            notes: payload.notes?.trim() || null,
            smsStatus: "SKIPPED",
            createdBy: actorId ?? null
          })
          .returning()
      )[0];

      broadcast(
        "payout:created",
        { id: created.id, payoutType: "general_expense", amount, periodMonth: created.periodMonth, paidAt },
        { tenant }
      );

      return c.json({ message: "Expense recorded successfully", data: created }, HttpStatusCodes.CREATED);
    }

    // ── Staff payout ──────────────────────────────────────────────────
    const staffId = Number(payload.userId);
    if (!staffId) return c.json({ message: "Staff member is required" }, HttpStatusCodes.BAD_REQUEST);

    const staffScope = await resolveStaffScope(c, staffId);
    if (!staffScope) return c.json({ message: "Staff member not found" }, HttpStatusCodes.NOT_FOUND);
    const staff = staffScope.staff;
    tenant = staffScope.tenant;

    const month = isValidMonth(payload.periodMonth) ? payload.periodMonth : currentMonth();

    // Ledger state BEFORE this payment (total payable is inclusive of prior carry).
    const ledger = await resolveStaffLedger(tenant, staffId, month);
    const newPaid = round2(ledger.paidAmount + amount);
    let closingDue: number;
    let advanceBalance: number;
    if (newPaid > ledger.totalPayable) {
      closingDue = 0;
      advanceBalance = round2(newPaid - ledger.totalPayable);
    } else {
      closingDue = round2(ledger.totalPayable - newPaid);
      advanceBalance = 0;
    }

    const head = await resolveStaffExpenseHead(tenant);

    const created = (
      await db
        .insert(payouts)
        .values({
          adminId: tenant,
          payoutType: "staff",
          userId: staffId,
          expenseHeadId: head.id,
          bankAccountId: payload.bankAccountId ?? null,
          periodMonth: month,
          amount,
          paymentMethod: payload.paymentMethod ?? "CASH",
          accountInfo: payload.accountInfo?.trim() || null,
          referenceNo: payload.referenceNo?.trim() || null,
          paidAt,
          notes: payload.notes?.trim() || null,
          currentBillSnapshot: ledger.currentBill,
          previousDueSnapshot: ledger.previousDue,
          closingDueSnapshot: closingDue,
          advanceSnapshot: advanceBalance,
          createdBy: actorId ?? null
        })
        .returning()
    )[0];

    // Materialize the month ledger so the carry is queryable for reporting.
    await db
      .insert(userMonthlyLedgers)
      .values({
        adminId: tenant,
        userId: staffId,
        periodMonth: month,
        earnedAmount: ledger.currentBill,
        paidAmount: newPaid,
        closingDue,
        advanceBalance,
        isSettled: closingDue <= 0
      })
      .onConflictDoUpdate({
        target: [userMonthlyLedgers.userId, userMonthlyLedgers.periodMonth],
        set: {
          earnedAmount: ledger.currentBill,
          paidAmount: newPaid,
          closingDue,
          advanceBalance,
          isSettled: closingDue <= 0,
          updatedAt: new Date()
        }
      });

    broadcast(
      "payout:balance-updated",
      {
        userId: staffId,
        month,
        amount,
        currentBill: ledger.currentBill,
        totalPayable: ledger.totalPayable,
        paidAmount: newPaid,
        closingDue,
        advanceBalance
      },
      { tenant }
    );
    broadcast(
      "payout:created",
      { id: created.id, payoutType: "staff", userId: staffId, amount, periodMonth: month, paidAt },
      { tenant }
    );

    const smsStatus = await dispatchPayoutSms(created.id);

    return c.json(
      {
        message: "Payout recorded successfully",
        data: { ...created, staffName: staff.name, smsStatus, closingDue, advanceBalance }
      },
      HttpStatusCodes.CREATED
    );
  } catch (err: any) {
    return c.json({ message: "Failed to record payout" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 7. USER SERVICE RATES ────────────────────────────────────────────

export const getUserRates: Handler = async (c: any) => {
  try {
    const { userId } = c.req.valid("param");
    const scope = await resolveStaffScope(c, userId);
    if (!scope) return c.json({ message: "Staff member not found" }, HttpStatusCodes.NOT_FOUND);
    const { tenant } = scope;

    // Full catalog of active service items, used to populate the assignment dropdown.
    const items = await db
      .select({ id: serviceItems.id, itemName: serviceItems.itemName })
      .from(serviceItems)
      .where(eq(serviceItems.isActive, true))
      .orderBy(asc(serviceItems.itemName));

    // Append-only history: every recorded version, newest first within each item.
    const versions = await listStaffRateVersions(tenant, userId);

    // Group append-only history per item. `data` carries the editable (active)
    // version of each currently-assigned item; `retired` carries items whose rate
    // has been ended — read-only history that proves nothing was ever deleted.
    const byItem = new Map<number, typeof versions>();
    for (const v of versions) {
      const list = byItem.get(v.serviceItemId) ?? [];
      list.push(v);
      byItem.set(v.serviceItemId, list);
    }

    const historyOf = (list: typeof versions) =>
      list.map((v) => ({
        rate: v.rate,
        effectiveFrom: toDateOnly(v.effectiveFrom),
        effectiveTo: v.effectiveTo ? toDateOnly(v.effectiveTo) : "",
        isActive: v.isActive
      }));

    const data: any[] = [];
    const retired: any[] = [];
    for (const [serviceItemId, list] of byItem) {
      // `list` is newest-effective-first; its head is the most recent version.
      const latest = list[0];
      const active = list.find((v) => v.isActive);
      if (active) {
        data.push({
          serviceItemId,
          itemName: active.itemName,
          rate: active.rate,
          effectiveFrom: toDateOnly(active.effectiveFrom),
          effectiveTo: "",
          isActive: true,
          versionCount: list.length,
          history: historyOf(list)
        });
      } else {
        retired.push({
          serviceItemId,
          itemName: latest.itemName,
          rate: latest.rate,
          effectiveFrom: toDateOnly(latest.effectiveFrom),
          effectiveTo: latest.effectiveTo ? toDateOnly(latest.effectiveTo) : "",
          isActive: false,
          versionCount: list.length,
          history: historyOf(list)
        });
      }
    }

    return c.json(
      { message: "User rates fetched successfully", data, retired, catalog: items, userId },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json({ message: "Failed to fetch user rates" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const saveUserRates: Handler = async (c: any) => {
  try {
    const { userId } = c.req.valid("param");
    const { rates } = c.req.valid("json");
    const scope = await resolveStaffScope(c, userId);
    if (!scope) return c.json({ message: "Staff member not found" }, HttpStatusCodes.NOT_FOUND);
    const { tenant } = scope;

    // Strict immutable versioning:
    //  1. A rate is an append-only version keyed by (item, effectiveFrom).
    //  2. Adding a version with a new effective date auto-freezes every earlier
    //     open version (isActive=false, effectiveTo = the successor's start).
    //  3. The current (active) version may be edited in place only when its
    //     effective date is unchanged; superseded versions are strictly read-only.
    //  4. Unassigning an item retires its active version — nothing is ever deleted,
    //     so past months always resolve against the rate that was active then.
    const now = new Date();
    // Keyed by service item so a duplicated row can never create two active versions.
    const incomingById = new Map<number, { serviceItemId: number; rate: number; effectiveFrom: Date }>();
    for (const entry of rates) {
      const rate = round2(Number(entry.rate) || 0);
      if (rate <= 0) continue; // zero-rate rows are never stored (no placeholders)
      const serviceItemId = Number(entry.serviceItemId);
      incomingById.set(serviceItemId, {
        serviceItemId,
        rate,
        effectiveFrom: normalizeEffectiveDate(entry.effectiveFrom)
      });
    }
    const incoming = [...incomingById.values()];
    const assignedItemIds = incoming.map((v) => v.serviceItemId);

    let rejection: string | null = null;
    try {
      await db.transaction(async (tx) => {
        const existing = (await tx
          .select({
            id: userServiceRates.id,
            serviceItemId: userServiceRates.serviceItemId,
            effectiveFrom: userServiceRates.effectiveFrom,
            isActive: userServiceRates.isActive
          })
          .from(userServiceRates)
          .where(
            and(eq(userServiceRates.adminId, tenant), eq(userServiceRates.userId, userId))
          )) as Array<{
          id: number;
          serviceItemId: number;
          effectiveFrom: Date;
          isActive: boolean;
        }>;

        const byItem = new Map<number, typeof existing>();
        for (const row of existing) {
          const list = byItem.get(row.serviceItemId) ?? [];
          list.push(row);
          byItem.set(row.serviceItemId, list);
        }

        // Retire items no longer assigned — close the open version, never delete.
        for (const [itemId, rows] of byItem) {
          if (assignedItemIds.includes(itemId)) continue;
          const active = rows.find((r) => r.isActive);
          if (!active) continue;
          const started = new Date(active.effectiveFrom).getTime();
          const ended = new Date(Math.max(started, now.getTime()));
          await tx
            .update(userServiceRates)
            .set({ isActive: false, effectiveTo: ended, updatedAt: now })
            .where(eq(userServiceRates.id, active.id));
        }

        for (const v of incoming) {
          const rows = byItem.get(v.serviceItemId) ?? [];
          const active = rows.find((r) => r.isActive) ?? null;
          const vFrom = v.effectiveFrom.getTime();

          // Rule 3: edit the current version in place while its date is unchanged.
          if (active && new Date(active.effectiveFrom).getTime() === vFrom) {
            await tx
              .update(userServiceRates)
              .set({ rate: v.rate, updatedAt: now })
              .where(eq(userServiceRates.id, active.id));
            continue;
          }

          // History is immutable: never rewrite or replace a frozen version.
          if (!active && rows.some((r) => new Date(r.effectiveFrom).getTime() === vFrom)) {
            rejection = "A rate already exists for that effective date. Historical rates are read-only.";
            throw new Error("rate-version-conflict");
          }

          // The current version cannot move backwards in time.
          if (active && vFrom < new Date(active.effectiveFrom).getTime()) {
            rejection = "A new rate must take effect on or after the current rate's effective date.";
            throw new Error("rate-version-backwards");
          }

          // Auto-freeze: close the open version at the new effective date.
          if (active) {
            await tx
              .update(userServiceRates)
              .set({ isActive: false, effectiveTo: v.effectiveFrom, updatedAt: now })
              .where(eq(userServiceRates.id, active.id));
          }

          await tx.insert(userServiceRates).values({
            adminId: tenant,
            userId,
            serviceItemId: v.serviceItemId,
            rate: v.rate,
            effectiveFrom: v.effectiveFrom,
            effectiveTo: null,
            isActive: true,
            createdAt: now,
            updatedAt: now
          });
        }
      });
    } catch (err) {
      if (rejection) return c.json({ message: rejection }, HttpStatusCodes.BAD_REQUEST);
      throw err;
    }

    broadcast("payout:rates-updated", { userId }, { tenant });
    return c.json({ message: "Rates saved successfully", data: { userId, count: assignedItemIds.length } }, HttpStatusCodes.OK);
  } catch (err: any) {
    return c.json({ message: "Failed to save user rates" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 8. MY EARNINGS (self-service) ────────────────────────────────────

/**
 * Why: Sub-users must be able to see their own commissions/payment history
 *      without holding the `payouts.view` permission (which exposes the whole
 *      firm). This endpoint is scoped strictly to the caller.
 */
export const getMyEarnings: Handler = async (c: any) => {
  try {
    const query = c.req.valid ? c.req.valid("query") : c.req.query();
    const { tenantAdminId, userId } = await resolveTenantContext(c);
    const month = isValidMonth(query.month) ? query.month : currentMonth();

    const history = await resolveStaffLedgerHistory(tenantAdminId, userId, month);
    const current = history.months[history.months.length - 1];

    const payoutRows = await db
      .select({
        id: payouts.id,
        amount: payouts.amount,
        paymentMethod: payouts.paymentMethod,
        accountInfo: payouts.accountInfo,
        referenceNo: payouts.referenceNo,
        periodMonth: payouts.periodMonth,
        paidAt: payouts.paidAt,
        notes: payouts.notes
      })
      .from(payouts)
      .where(
        and(
          eq(payouts.adminId, tenantAdminId),
          eq(payouts.payoutType, "staff"),
          eq(payouts.userId, userId)
        )
      )
      .orderBy(desc(payouts.paidAt))
      .limit(100);

    // Rate card reflects the version effective for the selected month (one row
    // per item), so scheduled rate changes never leak into past months.
    const rateVersions = await listStaffRateVersions(tenantAdminId, userId);
    const rateCard = ratesEffectiveForMonth(rateVersions, month).map((v) => ({
      serviceItemId: v.serviceItemId,
      itemName: v.itemName,
      rate: v.rate
    }));

    return c.json(
      {
        message: "My earnings fetched successfully",
        data: {
          month,
          zeroRate: history.zeroRate,
          regularRate: history.regularRate,
          current,
          months: history.months,
          payouts: payoutRows,
          rateCard
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: any) {
    return c.json({ message: "Failed to fetch your earnings" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
