import { boolean, doublePrecision, integer, json, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  rateMonthly: numeric("rate_monthly", { precision: 14, scale: 2, mode: "number" }).notNull(),
  rateYearly: numeric("rate_yearly", { precision: 14, scale: 2, mode: "number" }).notNull(),
  maxUsers: integer("max_users").notNull().default(1),
  maxClients: integer("max_clients").notNull().default(50),
  maxStorageMB: integer("max_storage_mb").notNull().default(1024),
  hasAccounts: boolean("has_accounts").notNull().default(false),
  yearlyDiscountPercent: doublePrecision("yearly_discount_percent").notNull().default(0),
  features: json("features").$type<string[]>().default([]),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});
