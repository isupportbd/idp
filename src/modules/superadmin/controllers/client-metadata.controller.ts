import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { cache, db } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { columnMappings } from "@/modules/superadmin/database/models/column_mappings.js";
import { notifySettingsUpdated } from "./platform.controller.js";

// 7. Client Types CRUD (Operating on master customer_types table)
export async function getClientTypes(c: AppContext) {
  try {
    const list = await cache.remember("master:client-types", 3600, async () => {
      return await db.select().from(customerTypes).orderBy(desc(customerTypes.id));
    });
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

// 10. Client References CRUD (Operating on master client_references table)
export async function getClientReferences(c: AppContext) {
  try {
    const enriched = await cache.remember("master:references", 3600, async () => {
      const refs = await db.select().from(clientReferences).orderBy(desc(clientReferences.id));
      const allClients = await db.select({ referenceId: clients.referenceId }).from(clients);

      return refs.map((r) => ({
        ...r,
        referredClientsCount: allClients.filter((cl) => cl.referenceId === r.id).length
      }));
    });

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
  {
    dbColumn: "base_value_of_vat",
    label: "base_value_of_vat",
    excelHeader: "",
    isCalculated: true,
    isFromDb: false,
    isRegexExtracted: false
  },
  { dbColumn: "vat", label: "vat", excelHeader: "VAT", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "unit_value", label: "unit_value", excelHeader: "", isCalculated: true, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "at", label: "at", excelHeader: "AT", isCalculated: false, isFromDb: false, isRegexExtracted: false },
  { dbColumn: "bin", label: "bin", excelHeader: "BIN", isCalculated: false, isFromDb: false, isRegexExtracted: false }
];

// 11. Column Mappings (Operating on master column_mappings table)
export async function getColumnMappings(c: AppContext) {
  try {
    const list = await cache.remember("master:column-mappings", 3600, async () => {
      const rawList = await db.select().from(columnMappings).orderBy(asc(columnMappings.id));
      const filtered = rawList.filter((r) => r.dbColumn !== "client_name");
      return filtered.length === 0 ? DEFAULT_SYSTEM_COLUMN_MAPPINGS : filtered;
    });
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
