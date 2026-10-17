import { relations } from "drizzle-orm";
import { boolean, index, integer, numeric, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/database/models/user.js";

/**
 * Why: A staff member's month-end account must survive independently of the
 *      submissions that produced it — the closing due / advance carries forward.
 * When: Recomputed on every staff payout and on-demand by the dashboard.
 * Where: Payouts module.
 * How: One row per (user, month) holding earned, paid, closing due and advance.
 */
export const userMonthlyLedgers = pgTable(
  "user_monthly_ledgers",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    periodMonth: varchar("period_month", { length: 20 }).notNull(),
    earnedAmount: numeric("earned_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    paidAmount: numeric("paid_amount", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    closingDue: numeric("closing_due", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    advanceBalance: numeric("advance_balance", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    isSettled: boolean("is_settled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("user_monthly_ledgers_user_period_idx").on(table.userId, table.periodMonth),
    index("user_monthly_ledgers_admin_period_idx").on(table.adminId, table.periodMonth)
  ]
);

export const userMonthlyLedgersRelations = relations(userMonthlyLedgers, ({ one }) => ({
  user: one(users, {
    fields: [userMonthlyLedgers.userId],
    references: [users.id]
  })
}));
