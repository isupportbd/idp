import { relations } from "drizzle-orm";
import { boolean, index, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  code: varchar("code", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const commercialAreas = pgTable("commercial_areas", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  postalCode: varchar("postal_code", { length: 50 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (table) => ({
  locationIdIdx: index("commercial_areas_location_id_idx").on(table.locationId)
}));

export const locationsRelations = relations(locations, ({ many }) => ({
  areas: many(commercialAreas)
}));

export const commercialAreasRelations = relations(commercialAreas, ({ one }) => ({
  location: one(locations, {
    fields: [commercialAreas.locationId],
    references: [locations.id]
  })
}));
