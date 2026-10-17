import { relations } from "drizzle-orm";
import { integer, numeric, pgTable, serial, text, timestamp, varchar, index } from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/database/models/user.js";
import { bankAccounts } from "@/modules/firm/database/models/bank_accounts.js";
import { expenseHeads } from "@/modules/firm/database/models/expense_heads.js";

/**
 * Why: Every disbursement — either staff salary/allowance or a general firm
 *      expense — is recorded once here as the money-out journal.
 * When: A tenant admin pays a staff member (staff) or records an expense
 *      (general_expense).
 * Where: Payouts module.
 * How: Staff payouts also snapshot the ledger figures at payment time so a
 *      historical receipt is reproducible even after later submissions accrue.
 */
export const payouts = pgTable(
  "payouts",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    payoutType: varchar("payout_type", { length: 20 }).notNull().default("staff"), // "staff" | "general_expense"
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    expenseHeadId: integer("expense_head_id").references(() => expenseHeads.id, { onDelete: "set null" }),
    bankAccountId: integer("bank_account_id").references(() => bankAccounts.id, { onDelete: "set null" }),
    periodMonth: varchar("period_month", { length: 20 }), // e.g. "2026-08"
    amount: numeric("amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    paymentMethod: varchar("payment_method", { length: 20 }).notNull().default("CASH"), // "BKASH" | "BANK" | "CASH"
    accountInfo: varchar("account_info", { length: 255 }),
    referenceNo: varchar("reference_no", { length: 100 }),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    notes: text("notes"),
    // Ledger snapshot captured for staff payouts at the moment of payment.
    currentBillSnapshot: numeric("current_bill_snapshot", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    previousDueSnapshot: numeric("previous_due_snapshot", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    closingDueSnapshot: numeric("closing_due_snapshot", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    advanceSnapshot: numeric("advance_snapshot", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    smsStatus: varchar("sms_status", { length: 16 }), // "SENT" | "FAILED" | "SKIPPED"
    smsResponse: text("sms_response"),
    createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    index("payouts_admin_month_idx").on(table.adminId, table.periodMonth),
    index("payouts_admin_user_idx").on(table.adminId, table.userId),
    index("payouts_admin_type_idx").on(table.adminId, table.payoutType),
    index("payouts_paid_at_idx").on(table.paidAt)
  ]
);

export const payoutsRelations = relations(payouts, ({ one }) => ({
  user: one(users, {
    fields: [payouts.userId],
    references: [users.id]
  }),
  expenseHead: one(expenseHeads, {
    fields: [payouts.expenseHeadId],
    references: [expenseHeads.id]
  }),
  bankAccount: one(bankAccounts, {
    fields: [payouts.bankAccountId],
    references: [bankAccounts.id]
  })
}));
