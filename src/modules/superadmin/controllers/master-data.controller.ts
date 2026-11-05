import type { AppContext } from "@/framework/facade.js";
import { db, cache } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { locations, commercialAreas } from "@/modules/superadmin/database/models/locations.js";
import { columnMappings } from "@/modules/superadmin/database/models/column_mappings.js";
import { globalItems } from "@/modules/superadmin/database/models/global_items.js";
import { measurementUnits } from "@/modules/superadmin/database/models/measurement_units.js";
import { vatNotes } from "@/modules/superadmin/database/models/vat_notes.js";
import { unitConversions } from "@/modules/superadmin/database/models/unit_conversions.js";
import { serviceUnits } from "@/modules/services/database/models/service_units.js";
import { eq, desc, asc, and, or, ne, isNotNull, isNull, sql } from "drizzle-orm";
import { notifySettingsUpdated } from "./platform.controller.js";

// 7. Client Types CRUD (Operating on master customer_types table)
export async function getClientTypes(c: AppContext) {
  try {
    const list = await db.select().from(customerTypes).orderBy(desc(customerTypes.id));
    return c.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching client types:", error);
    return c.json({ success: false, error: "Failed to fetch client types" }, 500);
  }
}

export async function createClientType(c: AppContext) {
  try {
    const body = c.req.valid("json");
    const name = body.typeName || body.name;
    if (!name || !name.trim()) {
      return c.json({ success: false, error: "Name is required" }, 400);
    }
    const [created] = await db
      .insert(customerTypes)
      .values({
        typeName: name.trim(),
        description: body.description?.trim() || null,
        isActive: body.isActive ?? true
      })
      .returning();

    notifySettingsUpdated("client-types");
    return c.json({ success: true, data: created, message: "Client type created successfully" }, 201);
  } catch (error: unknown) {
    console.error("Error creating client type:", error);
    return c.json({ success: false, error: "Failed to create client type" }, 500);
  }
}

export async function updateClientType(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const name = body.typeName || body.name;
    if (!name || !name.trim()) {
      return c.json({ success: false, error: "Name is required" }, 400);
    }
    const [updated] = await db
      .update(customerTypes)
      .set({
        typeName: name.trim(),
        description: body.description?.trim() || null,
        isActive: body.isActive ?? true,
        updatedAt: new Date()
      })
      .where(eq(customerTypes.id, id))
      .returning();

    notifySettingsUpdated("client-types");
    return c.json({ success: true, data: updated, message: "Client type updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating client type:", error);
    return c.json({ success: false, error: "Failed to update client type" }, 500);
  }
}

export async function toggleClientTypeStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(customerTypes).where(eq(customerTypes.id, id));
    if (!found) {
      return c.json({ success: false, error: "Client type not found" }, 404);
    }
    const [updated] = await db
      .update(customerTypes)
      .set({
        isActive: !found.isActive,
        updatedAt: new Date()
      })
      .where(eq(customerTypes.id, id))
      .returning();

    notifySettingsUpdated("client-types");
    return c.json({ success: true, data: updated, message: "Status updated" });
  } catch (error: unknown) {
    console.error("Error toggling client type status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deleteClientType(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(customerTypes).where(eq(customerTypes.id, id));
    notifySettingsUpdated("client-types");
    return c.json({ success: true, message: "Client type deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting client type:", error);
    return c.json({ success: false, error: "Failed to delete client type" }, 500);
  }
}

// 8. Locations & Districts CRUD
export async function getLocations(c: AppContext) {
  try {
    const locs = await db.select().from(locations).orderBy(desc(locations.id));
    const allAreas = await db.select().from(commercialAreas);

    const enriched = locs.map((l) => ({
      ...l,
      areasCount: allAreas.filter((a) => a.locationId === l.id).length
    }));

    return c.json({ success: true, data: enriched });
  } catch (error: unknown) {
    console.error("Error fetching locations:", error);
    return c.json({ success: false, error: "Failed to fetch locations" }, 500);
  }
}

export async function createLocation(c: AppContext) {
  try {
    const body = c.req.valid("json");
    if (!body.name || !body.name.trim()) {
      return c.json({ success: false, error: "Location name is required" }, 400);
    }
    const [created] = await db
      .insert(locations)
      .values({
        name: body.name.trim(),
        code: body.code?.trim()?.toUpperCase() || null,
        isActive: body.isActive ?? true
      })
      .returning();

    notifySettingsUpdated("locations");
    return c.json({ success: true, data: created, message: "Location created successfully" }, 201);
  } catch (error: unknown) {
    console.error("Error creating location:", error);
    return c.json({ success: false, error: "Failed to create location" }, 500);
  }
}

export async function updateLocation(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    if (!body.name || !body.name.trim()) {
      return c.json({ success: false, error: "Location name is required" }, 400);
    }
    const [updated] = await db
      .update(locations)
      .set({
        name: body.name.trim(),
        code: body.code?.trim()?.toUpperCase() || null,
        isActive: body.isActive ?? true,
        updatedAt: new Date()
      })
      .where(eq(locations.id, id))
      .returning();

    notifySettingsUpdated("locations");
    return c.json({ success: true, data: updated, message: "Location updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating location:", error);
    return c.json({ success: false, error: "Failed to update location" }, 500);
  }
}

export async function toggleLocationStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(locations).where(eq(locations.id, id));
    if (!found) return c.json({ success: false, error: "Location not found" }, 404);

    const [updated] = await db
      .update(locations)
      .set({ isActive: !found.isActive, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();

    notifySettingsUpdated("locations");
    return c.json({ success: true, data: updated, message: "Status updated" });
  } catch (error: unknown) {
    console.error("Error toggling location status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deleteLocation(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(locations).where(eq(locations.id, id));
    notifySettingsUpdated("locations");
    return c.json({ success: true, message: "Location deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting location:", error);
    return c.json({ success: false, error: "Failed to delete location" }, 500);
  }
}

// 9. Commercial Areas CRUD
export async function getCommercialAreas(c: AppContext) {
  try {
    const areaList = await db
      .select({
        id: commercialAreas.id,
        locationId: commercialAreas.locationId,
        name: commercialAreas.name,
        postalCode: commercialAreas.postalCode,
        isActive: commercialAreas.isActive,
        createdAt: commercialAreas.createdAt,
        updatedAt: commercialAreas.updatedAt,
        locationName: locations.name
      })
      .from(commercialAreas)
      .leftJoin(locations, eq(commercialAreas.locationId, locations.id))
      .orderBy(desc(commercialAreas.id));

    return c.json({ success: true, data: areaList });
  } catch (error: unknown) {
    console.error("Error fetching commercial areas:", error);
    return c.json({ success: false, error: "Failed to fetch areas" }, 500);
  }
}

export async function createCommercialArea(c: AppContext) {
  try {
    const body = c.req.valid("json");
    if (!body.name || !body.name.trim()) {
      return c.json({ success: false, error: "Area name is required" }, 400);
    }
    if (!body.locationId) {
      return c.json({ success: false, error: "Parent location is required" }, 400);
    }

    const [created] = await db
      .insert(commercialAreas)
      .values({
        locationId: Number(body.locationId),
        name: body.name.trim(),
        postalCode: body.postalCode?.trim() || null,
        isActive: body.isActive ?? true
      })
      .returning();

    const [loc] = await db.select().from(locations).where(eq(locations.id, created.locationId));

    notifySettingsUpdated("commercial-areas");
    return c.json({
      success: true,
      data: { ...created, locationName: loc?.name || "—" },
      message: "Commercial area created successfully"
    }, 201);
  } catch (error: unknown) {
    console.error("Error creating commercial area:", error);
    return c.json({ success: false, error: "Failed to create area" }, 500);
  }
}

export async function updateCommercialArea(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    if (!body.name || !body.name.trim()) {
      return c.json({ success: false, error: "Area name is required" }, 400);
    }
    const [updated] = await db
      .update(commercialAreas)
      .set({
        locationId: Number(body.locationId),
        name: body.name.trim(),
        postalCode: body.postalCode?.trim() || null,
        isActive: body.isActive ?? true,
        updatedAt: new Date()
      })
      .where(eq(commercialAreas.id, id))
      .returning();

    const [loc] = await db.select().from(locations).where(eq(locations.id, updated.locationId));

    notifySettingsUpdated("commercial-areas");
    return c.json({
      success: true,
      data: { ...updated, locationName: loc?.name || "—" },
      message: "Commercial area updated successfully"
    });
  } catch (error: unknown) {
    console.error("Error updating commercial area:", error);
    return c.json({ success: false, error: "Failed to update area" }, 500);
  }
}

export async function toggleCommercialAreaStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(commercialAreas).where(eq(commercialAreas.id, id));
    if (!found) return c.json({ success: false, error: "Area not found" }, 404);

    const [updated] = await db
      .update(commercialAreas)
      .set({ isActive: !found.isActive, updatedAt: new Date() })
      .where(eq(commercialAreas.id, id))
      .returning();

    notifySettingsUpdated("commercial-areas");
    return c.json({ success: true, data: updated, message: "Status updated" });
  } catch (error: unknown) {
    console.error("Error toggling area status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deleteCommercialArea(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(commercialAreas).where(eq(commercialAreas.id, id));
    notifySettingsUpdated("commercial-areas");
    return c.json({ success: true, message: "Commercial area deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting commercial area:", error);
    return c.json({ success: false, error: "Failed to delete commercial area" }, 500);
  }
}

// 10. Client References CRUD (Operating on master client_references table)
export async function getClientReferences(c: AppContext) {
  try {
    const refs = await db.select().from(clientReferences).orderBy(desc(clientReferences.id));
    const allClients = await db.select({ referenceId: clients.referenceId }).from(clients);

    const enriched = refs.map((r) => ({
      ...r,
      referredClientsCount: allClients.filter((cl) => cl.referenceId === r.id).length
    }));

    return c.json({ success: true, data: enriched });
  } catch (error: unknown) {
    console.error("Error fetching client references:", error);
    return c.json({ success: false, error: "Failed to fetch references" }, 500);
  }
}

export async function createClientReference(c: AppContext) {
  try {
    const body = c.req.valid("json");
    if (!body.name || !body.name.trim()) {
      return c.json({ success: false, error: "Reference name is required" }, 400);
    }
    const [created] = await db
      .insert(clientReferences)
      .values({
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        notes: body.notes?.trim() || null,
        isActive: body.isActive ?? true
      })
      .returning();

    notifySettingsUpdated("references");
    return c.json({ success: true, data: created, message: "Reference created successfully" }, 201);
  } catch (error: unknown) {
    console.error("Error creating reference:", error);
    return c.json({ success: false, error: "Failed to create reference" }, 500);
  }
}

export async function updateClientReference(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    if (!body.name || !body.name.trim()) {
      return c.json({ success: false, error: "Reference name is required" }, 400);
    }
    const [updated] = await db
      .update(clientReferences)
      .set({
        name: body.name.trim(),
        phone: body.phone?.trim() || null,
        email: body.email?.trim() || null,
        notes: body.notes?.trim() || null,
        isActive: body.isActive ?? true,
        updatedAt: new Date()
      })
      .where(eq(clientReferences.id, id))
      .returning();

    notifySettingsUpdated("references");
    return c.json({ success: true, data: updated, message: "Reference updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating reference:", error);
    return c.json({ success: false, error: "Failed to update reference" }, 500);
  }
}

export async function toggleClientReferenceStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(clientReferences).where(eq(clientReferences.id, id));
    if (!found) return c.json({ success: false, error: "Reference not found" }, 404);

    const [updated] = await db
      .update(clientReferences)
      .set({ isActive: !found.isActive, updatedAt: new Date() })
      .where(eq(clientReferences.id, id))
      .returning();

    notifySettingsUpdated("references");
    return c.json({ success: true, data: updated, message: "Status updated" });
  } catch (error: unknown) {
    console.error("Error toggling reference status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deleteClientReference(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(clientReferences).where(eq(clientReferences.id, id));
    notifySettingsUpdated("references");
    return c.json({ success: true, message: "Reference deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting reference:", error);
    return c.json({ success: false, error: "Failed to delete reference" }, 500);
  }
}

const DEFAULT_SYSTEM_COLUMN_MAPPINGS = [
  { dbColumn: "office", label: "office", excelHeader: "Office", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "be_no", label: "be_no", excelHeader: "BE_NO", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "be_date", label: "be_date", excelHeader: "BE_DATE", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "hs_code", label: "hs_code", excelHeader: "HSCode", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "item_name", label: "item_name", excelHeader: "", isCalculated: false, isFromDb: true, isRegexExtracted: false },
  { dbColumn: "lc_number", label: "lc_number", excelHeader: "LC Number", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "net_wt", label: "net_wt", excelHeader: "Net_WT", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "excess_qty", label: "excess_qty", excelHeader: "Description", isCalculated: false, isFromDb: false, isRegexExtracted: true },
  { dbColumn: "total_qty", label: "total_qty", excelHeader: "", isCalculated: true, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "ass_value", label: "ass_value", excelHeader: "Ass. Value", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "cd", label: "cd", excelHeader: "CD", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "rd", label: "rd", excelHeader: "RD", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "sd", label: "sd", excelHeader: "SD", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "base_value_of_vat", label: "base_value_of_vat", excelHeader: "", isCalculated: true, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "vat", label: "vat", excelHeader: "VAT", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "unit_value", label: "unit_value", excelHeader: "", isCalculated: true, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "at", label: "at", excelHeader: "AT", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "bin", label: "bin", excelHeader: "BIN", isCalculated: false, isFromDb: false, isRegexExtracted: false }
];

// 11. Column Mappings (Operating on master column_mappings table)
export async function getColumnMappings(c: AppContext) {
  try {
    const rawList = await db.select().from(columnMappings).orderBy(asc(columnMappings.id));
    const list = rawList.filter((r) => r.dbColumn !== "client_name");
    if (list.length === 0) {
      return c.json({ success: true, data: DEFAULT_SYSTEM_COLUMN_MAPPINGS });
    }
    return c.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching column mappings:", error);
    return c.json({ success: false, error: "Failed to fetch column mappings" }, 500);
  }
}

export async function saveColumnMappings(c: AppContext) {
  try {
    const { rows } = c.req.valid("json");
    if (!Array.isArray(rows)) {
      return c.json({ success: false, error: "Mappings array is required" }, 400);
    }

    for (const row of rows) {
      if (row.dbColumn) {
        await db
          .insert(columnMappings)
          .values({
            dbColumn: row.dbColumn,
            label: row.label || row.dbColumn,
            excelHeader: row.excelHeader || null,
            isCalculated: row.isCalculated ?? false,
            isFromDb: row.isFromDb ?? false,
            isRegexExtracted: row.isRegexExtracted ?? false,
            updatedAt: new Date()
          })
          .onConflictDoUpdate({
            target: columnMappings.dbColumn,
            set: {
              excelHeader: row.excelHeader || null,
              label: row.label || row.dbColumn,
              isCalculated: row.isCalculated ?? false,
              isFromDb: row.isFromDb ?? false,
              isRegexExtracted: row.isRegexExtracted ?? false,
              updatedAt: new Date()
            }
          });
      }
    }

    const updatedList = await db.select().from(columnMappings).orderBy(asc(columnMappings.id));
    notifySettingsUpdated("column-mappings");
    return c.json({ success: true, data: updatedList, message: "Column mappings saved to database successfully" });
  } catch (error: unknown) {
    console.error("Error saving column mappings:", error);
    return c.json({ success: false, error: "Failed to save column mappings" }, 500);
  }
}

// 12. Global Commodity & HS Codes (Operating on global_items table)
export async function getGlobalItems(c: AppContext) {
  try {
    const list = await cache.remember("master:global-items", 3600, async () => {
      return await db.select().from(globalItems).orderBy(asc(globalItems.hsCode));
    });
    return c.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching global items:", error);
    return c.json({ success: false, error: "Failed to fetch global items" }, 500);
  }
}

export async function createGlobalItem(c: AppContext) {
  try {
    const body = c.req.valid("json");
    const { hsCode, awHsCode, name, unit, isActive } = body;

    if (!hsCode || !name) {
      return c.json({ success: false, error: "HS Code and Name are required" }, 400);
    }

    const trimmedHsCode = hsCode.trim();

    // Check duplicate HS Code
    const [existing] = await db
      .select()
      .from(globalItems)
      .where(sql`LOWER(TRIM(${globalItems.hsCode})) = LOWER(${trimmedHsCode})`);

    if (existing) {
      return c.json({
        success: false,
        error: `HS Code "${trimmedHsCode}" already exists in the catalog. Duplicate HS Codes are not allowed.`
      }, 400);
    }

    const calculatedAw = awHsCode ? awHsCode.trim() : trimmedHsCode.replace(/\./g, "").trim();

    const [inserted] = await db
      .insert(globalItems)
      .values({
        hsCode: trimmedHsCode,
        awHsCode: calculatedAw,
        name: name.trim(),
        unit: unit?.trim() || "U",
        isActive: isActive !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    notifySettingsUpdated("global-items");
    return c.json({ success: true, data: inserted, message: "Item added successfully" }, 201);
  } catch (error: unknown) {
    console.error("Error creating global item:", error);
    if ((error as { code?: string })?.code === "23505") {
      return c.json({ success: false, error: "This HS Code already exists in the database." }, 400);
    }
    return c.json({ success: false, error: "Failed to create global item" }, 500);
  }
}

export async function updateGlobalItem(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const { hsCode, awHsCode, name, unit, isActive } = body;

    const [found] = await db.select().from(globalItems).where(eq(globalItems.id, id));
    if (!found) return c.json({ success: false, error: "Item not found" }, 404);

    if (hsCode) {
      const trimmedHsCode = hsCode.trim();
      const [existing] = await db
        .select()
        .from(globalItems)
        .where(
          and(
            sql`LOWER(TRIM(${globalItems.hsCode})) = LOWER(${trimmedHsCode})`,
            ne(globalItems.id, id)
          )
        );

      if (existing) {
        return c.json({
          success: false,
          error: `HS Code "${trimmedHsCode}" is already in use by another item.`
        }, 400);
      }
    }

    const calculatedAw = awHsCode !== undefined ? (awHsCode?.trim() || "") : hsCode ? hsCode.replace(/\./g, "").trim() : found.awHsCode;

    const [updated] = await db
      .update(globalItems)
      .set({
        ...(hsCode && { hsCode: hsCode.trim() }),
        ...(calculatedAw !== undefined && { awHsCode: calculatedAw }),
        ...(name && { name: name.trim() }),
        ...(unit !== undefined && { unit: unit?.trim() || "U" }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      })
      .where(eq(globalItems.id, id))
      .returning();

    notifySettingsUpdated("global-items");
    return c.json({ success: true, data: updated, message: "Item updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating global item:", error);
    if ((error as { code?: string })?.code === "23505") {
      return c.json({ success: false, error: "This HS Code already exists in the database." }, 400);
    }
    return c.json({ success: false, error: "Failed to update global item" }, 500);
  }
}

export async function toggleGlobalItemStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(globalItems).where(eq(globalItems.id, id));
    if (!found) return c.json({ success: false, error: "Item not found" }, 404);

    const [updated] = await db
      .update(globalItems)
      .set({ isActive: !found.isActive, updatedAt: new Date() })
      .where(eq(globalItems.id, id))
      .returning();

    notifySettingsUpdated("global-items");
    return c.json({ success: true, data: updated, message: "Status updated" });
  } catch (error: unknown) {
    console.error("Error toggling global item status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deleteGlobalItem(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(globalItems).where(eq(globalItems.id, id));
    notifySettingsUpdated("global-items");
    return c.json({ success: true, message: "Item deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting global item:", error);
    return c.json({ success: false, error: "Failed to delete item" }, 500);
  }
}

// 13. Measurement Units (Operating on measurement_units table)
export async function getMeasurementUnits(c: AppContext) {
  try {
    const list = await cache.remember("master:measurement-units", 3600, async () => {
      return await db.select().from(measurementUnits).orderBy(asc(measurementUnits.id));
    });
    return c.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching measurement units:", error);
    return c.json({ success: false, error: "Failed to fetch measurement units" }, 500);
  }
}

export async function createMeasurementUnit(c: AppContext) {
  try {
    const body = c.req.valid("json");
    const { code, name, description, isActive } = body;

    if (!code || !name) {
      return c.json({ success: false, error: "Unit Code and Name are required" }, 400);
    }

    const trimmedCode = code.trim().toUpperCase();

    // Check duplicate code
    const [existing] = await db
      .select()
      .from(measurementUnits)
      .where(sql`UPPER(TRIM(${measurementUnits.code})) = ${trimmedCode}`);

    if (existing) {
      return c.json({
        success: false,
        error: `Unit Code "${trimmedCode}" already exists in the database.`
      }, 400);
    }

    const [inserted] = await db
      .insert(measurementUnits)
      .values({
        code: trimmedCode,
        name: name.trim(),
        description: description?.trim() || null,
        isActive: isActive !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    notifySettingsUpdated("measurement-units");
    return c.json({ success: true, data: inserted, message: "Unit created successfully" }, 201);
  } catch (error: unknown) {
    console.error("Error creating measurement unit:", error);
    if ((error as { code?: string })?.code === "23505") {
      return c.json({ success: false, error: "This Unit Code already exists in the database." }, 400);
    }
    return c.json({ success: false, error: "Failed to create measurement unit" }, 500);
  }
}

export async function updateMeasurementUnit(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const { code, name, description, isActive } = body;

    const [found] = await db.select().from(measurementUnits).where(eq(measurementUnits.id, id));
    if (!found) return c.json({ success: false, error: "Unit not found" }, 404);

    if (code) {
      const trimmedCode = code.trim().toUpperCase();
      const [existing] = await db
        .select()
        .from(measurementUnits)
        .where(
          and(
            sql`UPPER(TRIM(${measurementUnits.code})) = ${trimmedCode}`,
            ne(measurementUnits.id, id)
          )
        );

      if (existing) {
        return c.json({
          success: false,
          error: `Unit Code "${trimmedCode}" is already in use by another unit.`
        }, 400);
      }
    }

    const [updated] = await db
      .update(measurementUnits)
      .set({
        ...(code && { code: code.trim().toUpperCase() }),
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      })
      .where(eq(measurementUnits.id, id))
      .returning();

    notifySettingsUpdated("measurement-units");
    return c.json({ success: true, data: updated, message: "Unit updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating measurement unit:", error);
    if ((error as { code?: string })?.code === "23505") {
      return c.json({ success: false, error: "This Unit Code already exists in the database." }, 400);
    }
    return c.json({ success: false, error: "Failed to update measurement unit" }, 500);
  }
}

export async function toggleMeasurementUnitStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(measurementUnits).where(eq(measurementUnits.id, id));
    if (!found) return c.json({ success: false, error: "Unit not found" }, 404);

    const [updated] = await db
      .update(measurementUnits)
      .set({ isActive: !found.isActive, updatedAt: new Date() })
      .where(eq(measurementUnits.id, id))
      .returning();

    notifySettingsUpdated("measurement-units");
    return c.json({ success: true, data: updated, message: "Unit status updated" });
  } catch (error: unknown) {
    console.error("Error toggling measurement unit status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deleteMeasurementUnit(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(measurementUnits).where(eq(measurementUnits.id, id));
    notifySettingsUpdated("measurement-units");
    return c.json({ success: true, message: "Unit deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting measurement unit:", error);
    return c.json({ success: false, error: "Failed to delete measurement unit" }, 500);
  }
}

// 14. VAT Note Rules / Mappings (Operating on vat_notes_mapping table)
export async function getVatNotes(c: AppContext) {
  try {
    const list = await cache.remember("master:vat-notes", 3600, async () => {
      return await db.select().from(vatNotes).orderBy(asc(vatNotes.vatRate));
    });
    return c.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching VAT notes:", error);
    return c.json({ success: false, error: "Failed to fetch VAT notes" }, 500);
  }
}

export async function createVatNote(c: AppContext) {
  try {
    const body = c.req.valid("json");
    const { vatRate, noteName, description, isActive } = body;

    if (vatRate === undefined || vatRate === null || !noteName) {
      return c.json({ success: false, error: "VAT Rate (%) and Note Name are required" }, 400);
    }

    const numericRate = parseFloat(vatRate);
    if (isNaN(numericRate)) {
      return c.json({ success: false, error: "Valid numeric VAT rate is required" }, 400);
    }

    const trimmedNote = noteName.trim();

    // Check duplicate vatRate
    const [existing] = await db
      .select()
      .from(vatNotes)
      .where(eq(vatNotes.vatRate, numericRate));

    if (existing) {
      return c.json({
        success: false,
        error: `A mapping for VAT Rate "${numericRate}%" already exists (${existing.noteName}). Duplicate VAT rates are not allowed.`
      }, 400);
    }

    const [inserted] = await db
      .insert(vatNotes)
      .values({
        vatRate: numericRate,
        noteName: trimmedNote,
        description: description ? description.trim() : null,
        isActive: isActive !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    notifySettingsUpdated("vat-notes");
    return c.json({ success: true, data: inserted, message: "VAT Note mapping created successfully" }, 201);
  } catch (error: unknown) {
    console.error("Error creating VAT note mapping:", error);
    if ((error as { code?: string })?.code === "23505") {
      return c.json({ success: false, error: "A mapping for this VAT Rate already exists." }, 400);
    }
    return c.json({ success: false, error: "Failed to create VAT note mapping" }, 500);
  }
}

export async function updateVatNote(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const { vatRate, noteName, description, isActive } = body;

    const [found] = await db.select().from(vatNotes).where(eq(vatNotes.id, id));
    if (!found) return c.json({ success: false, error: "VAT note not found" }, 404);

    let numericRate = found.vatRate;
    if (vatRate !== undefined && vatRate !== null) {
      numericRate = parseFloat(vatRate);
      if (isNaN(numericRate)) {
        return c.json({ success: false, error: "Valid numeric VAT rate is required" }, 400);
      }

      const [existing] = await db
        .select()
        .from(vatNotes)
        .where(and(eq(vatNotes.vatRate, numericRate), ne(vatNotes.id, id)));

      if (existing) {
        return c.json({
          success: false,
          error: `A mapping for VAT Rate "${numericRate}%" is already configured (${existing.noteName}).`
        }, 400);
      }
    }

    const [updated] = await db
      .update(vatNotes)
      .set({
        vatRate: numericRate,
        ...(noteName && { noteName: noteName.trim() }),
        ...(description !== undefined && { description: description ? description.trim() : null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        updatedAt: new Date()
      })
      .where(eq(vatNotes.id, id))
      .returning();

    notifySettingsUpdated("vat-notes");
    return c.json({ success: true, data: updated, message: "VAT note updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating VAT note mapping:", error);
    if ((error as { code?: string })?.code === "23505") {
      return c.json({ success: false, error: "A mapping for this VAT Rate already exists." }, 400);
    }
    return c.json({ success: false, error: "Failed to update VAT note mapping" }, 500);
  }
}

export async function toggleVatNoteStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(vatNotes).where(eq(vatNotes.id, id));
    if (!found) return c.json({ success: false, error: "VAT note not found" }, 404);

    const [updated] = await db
      .update(vatNotes)
      .set({
        isActive: !found.isActive,
        updatedAt: new Date()
      })
      .where(eq(vatNotes.id, id))
      .returning();

    notifySettingsUpdated("vat-notes");
    return c.json({ success: true, data: updated, message: "VAT note status updated" });
  } catch (error: unknown) {
    console.error("Error toggling VAT note status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deleteVatNote(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(vatNotes).where(eq(vatNotes.id, id));
    notifySettingsUpdated("vat-notes");
    return c.json({ success: true, message: "VAT note deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting VAT note:", error);
    return c.json({ success: false, error: "Failed to delete VAT note" }, 500);
  }
}

// 15. Unit Conversions (Operating on PostgreSQL unit_conversions table)
export async function getUnitConversions(c: AppContext) {
  try {
    const allParam = c.req.query("all");
    const cacheKey = allParam === "true" ? "master:unit-conversions:all" : "master:unit-conversions:dedup";
    const data = await cache.remember(cacheKey, 3600, async () => {
      const list = await db.select().from(unitConversions).orderBy(asc(unitConversions.id));
      if (allParam === "true") {
        return list;
      }

      // Deduplicate pairs for Settings View (showing canonical pairs with direct & reverse)
      const seen = new Set<string>();
      const uniquePairs: {
        id: number;
        purchaseUnit: string;
        salesUnit: string;
        factor: number;
        reverseFactor: number;
        createdAt: Date | null;
        updatedAt: Date | null;
      }[] = [];
      for (const item of list) {
        const key = [item.purchaseUnit, item.salesUnit].sort().join("<->");
        if (!seen.has(key)) {
          seen.add(key);
          const f = Number(item.factor || 1);
          const revFactor = f > 0 ? Math.round((1 / f) * 100000000) / 100000000 : 0;
          uniquePairs.push({
            id: item.id,
            purchaseUnit: item.purchaseUnit,
            salesUnit: item.salesUnit,
            factor: f,
            reverseFactor: revFactor,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          });
        }
      }
      return uniquePairs;
    });
    return c.json({ success: true, data });
  } catch (error: unknown) {
    console.error("Error fetching unit conversions:", error);
    return c.json({ success: false, error: "Failed to fetch unit conversions" }, 500);
  }
}

export async function createUnitConversion(c: AppContext) {
  try {
    const body = c.req.valid("json");
    const { purchaseUnit, salesUnit, factor } = body;

    if (!purchaseUnit || !salesUnit || factor === undefined || factor === null) {
      return c.json({ success: false, error: "Purchase unit, Sales unit, and Factor are required" }, 400);
    }

    const pUnit = purchaseUnit.trim().toUpperCase();
    const sUnit = salesUnit.trim().toUpperCase();

    if (pUnit === sUnit) {
      return c.json({
        success: false,
        error: "Purchase Unit and Sales Unit cannot be the same unit (e.g. KG to KG is not allowed). Please select different units."
      }, 400);
    }

    const numFactor = parseFloat(factor);
    if (isNaN(numFactor) || numFactor <= 0) {
      return c.json({ success: false, error: "Factor must be a valid positive number" }, 400);
    }

    // Check duplicate conversion in BOTH directions
    const [existingForward] = await db
      .select()
      .from(unitConversions)
      .where(and(eq(unitConversions.purchaseUnit, pUnit), eq(unitConversions.salesUnit, sUnit)));

    const [existingReverse] = await db
      .select()
      .from(unitConversions)
      .where(and(eq(unitConversions.purchaseUnit, sUnit), eq(unitConversions.salesUnit, pUnit)));

    if (existingForward || existingReverse) {
      return c.json({
        success: false,
        error: `Conversion pair between "${pUnit}" and "${sUnit}" already exists in the database!`
      }, 400);
    }

    const reverseFactor = Math.round((1 / numFactor) * 100000000) / 100000000;

    // Insert forward record
    const [inserted] = await db
      .insert(unitConversions)
      .values({
        purchaseUnit: pUnit,
        salesUnit: sUnit,
        factor: numFactor,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    // Automatically insert bi-directional reverse record for reporting/lookup
    await db
      .insert(unitConversions)
      .values({
        purchaseUnit: sUnit,
        salesUnit: pUnit,
        factor: reverseFactor,
        createdAt: new Date(),
        updatedAt: new Date()
      });

    notifySettingsUpdated("unit-conversions");
    return c.json({
      success: true,
      data: {
        ...inserted,
        reverseFactor
      },
      message: "Unit conversion pair created successfully"
    }, 201);
  } catch (error: unknown) {
    console.error("Error creating unit conversion:", error);
    return c.json({ success: false, error: "Failed to create unit conversion" }, 500);
  }
}

export async function updateUnitConversion(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const { purchaseUnit, salesUnit, factor } = body;

    const [found] = await db.select().from(unitConversions).where(eq(unitConversions.id, id));
    if (!found) return c.json({ success: false, error: "Unit conversion not found" }, 404);

    const oldP = found.purchaseUnit;
    const oldS = found.salesUnit;

    const pUnit = purchaseUnit ? purchaseUnit.trim().toUpperCase() : oldP;
    const sUnit = salesUnit ? salesUnit.trim().toUpperCase() : oldS;

    if (pUnit === sUnit) {
      return c.json({
        success: false,
        error: "Purchase Unit and Sales Unit cannot be the same unit (e.g. KG to KG is not allowed). Please select different units."
      }, 400);
    }

    let numFactor = found.factor;
    if (factor !== undefined && factor !== null) {
      numFactor = parseFloat(factor);
      if (isNaN(numFactor) || numFactor <= 0) {
        return c.json({ success: false, error: "Factor must be a valid positive number" }, 400);
      }
    }

    // Check duplicate conversion for any other pair
    const existingList = await db
      .select()
      .from(unitConversions)
      .where(
        or(
          and(eq(unitConversions.purchaseUnit, pUnit), eq(unitConversions.salesUnit, sUnit)),
          and(eq(unitConversions.purchaseUnit, sUnit), eq(unitConversions.salesUnit, pUnit))
        )
      );

    const conflicting = existingList.find(
      (e) =>
        !(
          (e.purchaseUnit === oldP && e.salesUnit === oldS) ||
          (e.purchaseUnit === oldS && e.salesUnit === oldP)
        )
    );

    if (conflicting) {
      return c.json({
        success: false,
        error: `Conversion pair between "${pUnit}" and "${sUnit}" already exists.`
      }, 400);
    }

    const reverseFactor = Math.round((1 / numFactor) * 100000000) / 100000000;

    // Delete old reverse record if unit names changed
    if (oldP !== pUnit || oldS !== sUnit) {
      await db
        .delete(unitConversions)
        .where(and(eq(unitConversions.purchaseUnit, oldS), eq(unitConversions.salesUnit, oldP)));
    }

    // Update main forward record
    const [updated] = await db
      .update(unitConversions)
      .set({
        purchaseUnit: pUnit,
        salesUnit: sUnit,
        factor: numFactor,
        updatedAt: new Date()
      })
      .where(eq(unitConversions.id, id))
      .returning();

    // Upsert / update reverse record
    const [existingReverse] = await db
      .select()
      .from(unitConversions)
      .where(and(eq(unitConversions.purchaseUnit, sUnit), eq(unitConversions.salesUnit, pUnit)));

    if (existingReverse) {
      await db
        .update(unitConversions)
        .set({
          factor: reverseFactor,
          updatedAt: new Date()
        })
        .where(eq(unitConversions.id, existingReverse.id));
    } else {
      await db
        .insert(unitConversions)
        .values({
          purchaseUnit: sUnit,
          salesUnit: pUnit,
          factor: reverseFactor,
          createdAt: new Date(),
          updatedAt: new Date()
        });
    }

    notifySettingsUpdated("unit-conversions");
    return c.json({
      success: true,
      data: {
        ...updated,
        reverseFactor
      },
      message: "Unit conversion pair updated successfully"
    });
  } catch (error: unknown) {
    console.error("Error updating unit conversion:", error);
    return c.json({ success: false, error: "Failed to update unit conversion" }, 500);
  }
}

export async function deleteUnitConversion(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(unitConversions).where(eq(unitConversions.id, id));
    if (!found) {
      return c.json({ success: false, error: "Unit conversion not found" }, 404);
    }

    // Delete both forward and reverse records
    await db
      .delete(unitConversions)
      .where(
        or(
          and(eq(unitConversions.purchaseUnit, found.purchaseUnit), eq(unitConversions.salesUnit, found.salesUnit)),
          and(eq(unitConversions.purchaseUnit, found.salesUnit), eq(unitConversions.salesUnit, found.purchaseUnit))
        )
      );

    notifySettingsUpdated("unit-conversions");
    return c.json({ success: true, message: "Unit conversion pair deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting unit conversion:", error);
    return c.json({ success: false, error: "Failed to delete unit conversion" }, 500);
  }
}


// ── Global Service Units CRUD ────────────────────────────────
export async function getServiceUnits(c: AppContext) {
  try {
    const list = await db
      .select()
      .from(serviceUnits)
      .orderBy(desc(serviceUnits.id));

    return c.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching service units:", error);
    return c.json({ success: false, error: "Failed to fetch service units" }, 500);
  }
}

export async function createServiceUnit(c: AppContext) {
  try {
    const body = c.req.valid("json");
    const { code, name, description, isActive } = body;

    if (!code || !code.trim()) {
      return c.json({ success: false, error: "Unit code is required" }, 400);
    }
    if (!name || !name.trim()) {
      return c.json({ success: false, error: "Unit name is required" }, 400);
    }

    const trimmedCode = code.trim();
    const [existing] = await db
      .select()
      .from(serviceUnits)
      .where(sql`LOWER(TRIM(${serviceUnits.code})) = ${trimmedCode.toLowerCase()}`);

    if (existing) {
      return c.json({ success: false, error: `Unit code "${trimmedCode}" already exists.` }, 400);
    }

    const [inserted] = await db
      .insert(serviceUnits)
      .values({
        code: trimmedCode,
        name: name.trim(),
        description: description?.trim() || null,
        isActive: isActive !== false,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    notifySettingsUpdated("service-units");
    return c.json({ success: true, data: inserted, message: "Service unit created successfully" }, 201);
  } catch (error: unknown) {
    console.error("Error creating service unit:", error);
    if ((error as { code?: string })?.code === "23505") {
      return c.json({ success: false, error: "This Unit Code already exists." }, 400);
    }
    return c.json({ success: false, error: "Failed to create service unit" }, 500);
  }
}

export async function updateServiceUnit(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const { code, name, description, isActive } = body;

    const [found] = await db.select().from(serviceUnits).where(eq(serviceUnits.id, id));
    if (!found) return c.json({ success: false, error: "Service unit not found" }, 404);

    if (code) {
      const trimmedCode = code.trim();
      const [existing] = await db
        .select()
        .from(serviceUnits)
        .where(
          and(
            sql`LOWER(TRIM(${serviceUnits.code})) = ${trimmedCode.toLowerCase()}`,
            ne(serviceUnits.id, id)
          )
        );

      if (existing) {
        return c.json({ success: false, error: `Unit code "${trimmedCode}" is already in use.` }, 400);
      }
    }

    const [updated] = await db
      .update(serviceUnits)
      .set({
        ...(code && { code: code.trim() }),
        ...(name && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date()
      })
      .where(eq(serviceUnits.id, id))
      .returning();

    notifySettingsUpdated("service-units");
    return c.json({ success: true, data: updated, message: "Service unit updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating service unit:", error);
    if ((error as { code?: string })?.code === "23505") {
      return c.json({ success: false, error: "This Unit Code already exists." }, 400);
    }
    return c.json({ success: false, error: "Failed to update service unit" }, 500);
  }
}

export async function toggleServiceUnitStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(serviceUnits).where(eq(serviceUnits.id, id));
    if (!found) return c.json({ success: false, error: "Service unit not found" }, 404);

    const [updated] = await db
      .update(serviceUnits)
      .set({ isActive: !found.isActive, updatedAt: new Date() })
      .where(eq(serviceUnits.id, id))
      .returning();

    notifySettingsUpdated("service-units");
    return c.json({ success: true, data: updated, message: "Service unit status updated" });
  } catch (error: unknown) {
    console.error("Error toggling service unit status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deleteServiceUnit(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(serviceUnits).where(eq(serviceUnits.id, id));
    notifySettingsUpdated("service-units");
    return c.json({ success: true, message: "Service unit deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting service unit:", error);
    return c.json({ success: false, error: "Failed to delete service unit" }, 500);
  }
}