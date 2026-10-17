import { relations } from "drizzle-orm";
import { boolean, index, integer, numeric, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/database/models/user.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";

/**
 * Why: Staff earn a fixed fee per service item they complete (e.g. a Zero VAT
 *      return vs a Regular VAT return). Rates are versioned and immutable:
 *      history must never be rewritten once a period has been paid out.
 * When: The tenant admin configures rates on the team member's profile.
 * Where: Payouts module — accrual math reads this table.
 * How: Append-only versions per (user, service item). Each version is a
 *      [effective_from, effective_to) window. Adding a later rate auto-freezes
 *      every earlier version (`is_active = false`, `effective_to` = the successor's
 *      start). Retiring/unassigning closes the open version instead of deleting
 *      it. At most one version per item is active (enforced by a partial unique
 *      index); only that row may be edited in place.
 */
export const userServiceRates = pgTable(
  "user_service_rates",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    serviceItemId: integer("service_item_id")
      .references(() => serviceItems.id, { onDelete: "cascade" })
      .notNull(),
    rate: numeric("rate", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow().notNull(),
    // Exclusive end of the version's window. NULL = open-ended (still current).
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    // True only for the single current version of an item; frozen versions are false.
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("user_service_rates_user_item_effective_idx").on(
      table.userId,
      table.serviceItemId,
      table.effectiveFrom
    ),
    index("user_service_rates_admin_user_idx").on(table.adminId, table.userId)
  ]
);

export const userServiceRatesRelations = relations(userServiceRates, ({ one }) => ({
  user: one(users, {
    fields: [userServiceRates.userId],
    references: [users.id]
  }),
  serviceItem: one(serviceItems, {
    fields: [userServiceRates.serviceItemId],
    references: [serviceItems.id]
  })
}));
