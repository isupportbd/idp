import type { AppContext } from "@/framework/facade.js";
import { db, cache } from "@/framework/facade.js";
import { globalItems } from "@/modules/superadmin/database/models/global_items.js";
import { measurementUnits } from "@/modules/superadmin/database/models/measurement_units.js";
import { serviceUnits } from "@/modules/services/database/models/service_units.js";
import { eq, desc, asc, and, or, ne, isNotNull, isNull, sql } from "drizzle-orm";
import { notifySettingsUpdated } from "./platform.controller.js";

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