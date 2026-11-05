import type { AppContext } from "@/framework/facade.js";
import { db, cache } from "@/framework/facade.js";
import { unitConversions } from "@/modules/superadmin/database/models/unit_conversions.js";
import { measurementUnits } from "@/modules/superadmin/database/models/measurement_units.js";
import { eq, desc, asc, and, or, ne, sql } from "drizzle-orm";
import { notifySettingsUpdated } from "./platform.controller.js";

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

