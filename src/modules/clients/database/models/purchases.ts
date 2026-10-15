import { boolean, date, doublePrecision, index, integer, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/database/models/user.js";
import { clients } from "./clients.js";
import { globalItems } from "@/modules/superadmin/database/models/global_items.js";

export const purchases = pgTable(
  "purchases",
  {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id")
      .references(() => users.id)
      .notNull()
      .default(1),
    clientId: integer("client_id")
      .references(() => clients.id)
      .notNull(),
    itemId: integer("item_id")
      .references(() => globalItems.id)
      .notNull(),
    office: varchar("office", { length: 100 }),
    beNo: varchar("be_no", { length: 100 }),
    beDate: date("be_date").notNull(),
    month: varchar("month", { length: 7 }).notNull(),
    lcNumber: varchar("lc_number", { length: 100 }),
    netWt: doublePrecision("net_wt").notNull(),
    excessQty: doublePrecision("excess_qty"),
    totalQty: doublePrecision("total_qty"),
    assValue: numeric("ass_value", { precision: 14, scale: 2, mode: "number" }).notNull(),
    unitValue: numeric("unit_value", { precision: 14, scale: 2, mode: "number" }),
    cd: numeric("cd", { precision: 14, scale: 2, mode: "number" }),
    rd: numeric("rd", { precision: 14, scale: 2, mode: "number" }),
    sd: numeric("sd", { precision: 14, scale: 2, mode: "number" }),
    baseValueOfVat: numeric("base_value_of_vat", { precision: 14, scale: 2, mode: "number" }),
    vat: numeric("vat", { precision: 14, scale: 2, mode: "number" }),
    at: numeric("at", { precision: 14, scale: 2, mode: "number" }),
    isRebate: boolean("is_rebate").default(false),
    isFfs: boolean("is_ffs").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    adminIdIdx: index("purchases_admin_id_idx").on(table.adminId),
    clientIdIdx: index("purchases_client_id_idx").on(table.clientId),
    itemIdIdx: index("purchases_item_id_idx").on(table.itemId),
    monthIdx: index("purchases_month_idx").on(table.month),
    adminMonthIdx: index("purchases_admin_month_idx").on(table.adminId, table.month),
    clientMonthIdx: index("purchases_client_month_idx").on(table.clientId, table.month),
    beNoDateIdx: index("purchases_be_no_date_idx").on(table.beNo, table.beDate),
    clientBeDateIdx: index("purchases_client_be_date_idx").on(table.clientId, table.beDate)
  })
);
