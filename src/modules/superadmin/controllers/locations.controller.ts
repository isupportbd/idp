import type { AppContext } from "@/framework/facade.js";
import { db, cache } from "@/framework/facade.js";
import { locations, commercialAreas } from "@/modules/superadmin/database/models/locations.js";
import { eq, desc, asc, and, or, ne, sql } from "drizzle-orm";
import { notifySettingsUpdated } from "./platform.controller.js";

export async function getLocations(c: AppContext) {
  try {
    const enriched = await cache.remember("master:locations", 3600, async () => {
      const locs = await db.select().from(locations).orderBy(desc(locations.id));
      const allAreas = await db.select().from(commercialAreas);

      return locs.map((l) => ({
        ...l,
        areasCount: allAreas.filter((a) => a.locationId === l.id).length
      }));
    });

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
    const areaList = await cache.remember("master:commercial-areas", 3600, async () => {
      return db
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
    });

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
