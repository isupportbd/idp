import { relations } from "drizzle-orm";
import { doublePrecision, index, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { bills } from "./bills.js";
import { serviceItems } from "@/modules/services/database/models/service_items.js";

export const billItems = pgTable(
  "bill_items",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
    serviceItemId: integer("service_item_id").references(() => serviceItems.id, { onDelete: "set null" }),
    itemName: varchar("item_name", { length: 255 }).notNull(),
    unit: varchar("unit", { length: 50 }).default("Month"), // 'Month' | 'MT' | 'KG' | 'Item' | 'Fixed'
    qty: doublePrecision("qty").default(1).notNull(),
    rateUsed: numeric("rate_used", { precision: 14, scale: 2, mode: "number" }).default(0).notNull(),
    minimumChargeUsed: numeric("minimum_charge_used", { precision: 14, scale: 2, mode: "number" }).default(0).notNull(),
    calculatedAmount: numeric("calculated_amount", { precision: 14, scale: 2, mode: "number" }).default(0).notNull(),
    finalAmount: numeric("final_amount", { precision: 14, scale: 2, mode: "number" }).default(0).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    billIdIdx: index("bill_items_bill_id_idx").on(table.billId),
    serviceItemIdIdx: index("bill_items_service_item_id_idx").on(table.serviceItemId)
  })
);

export const billItemsRelations = relations(billItems, ({ one }) => ({
  bill: one(bills, {
    fields: [billItems.billId],
    references: [bills.id]
  }),
  serviceItem: one(serviceItems, {
    fields: [billItems.serviceItemId],
    references: [serviceItems.id]
  })
}));
