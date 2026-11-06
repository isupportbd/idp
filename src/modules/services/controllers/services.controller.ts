import { asc, desc, eq } from "drizzle-orm";
import type { Handler } from "hono";
import type { AppContext } from "@/framework/facade.js";
import { broadcast, cache, db, HttpStatusCodes } from "@/framework/facade.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { customerTypes } from "../database/models/customer_types.js";
import { clientReferences } from "../database/models/references.js";
import { serviceItems } from "../database/models/service_items.js";
import { serviceRates } from "../database/models/service_rates.js";

function notifySettingsUpdated(settingType: string) {
  try {
    cache.forget(`master:${settingType}`);
    if (settingType === "service-items" || settingType === "client-types") {
      cache.forget("master:service-rates");
    }
    broadcast("global:settings-updated", { type: settingType, timestamp: Date.now() }, { auth: true });
  } catch (err) {
    console.error(`Failed to broadcast ${settingType} update:`, err);
  }
}

// ── CUSTOMER TYPES CONTROLLERS ──────────────────────────────────────

export const listCustomerTypes = async (c: AppContext) => {
  try {
    const list = await cache.remember("master:client-types", 3600, async () => {
      return await db.select().from(customerTypes).orderBy(desc(customerTypes.id));
    });
    if (typeof c.header === "function") {
      c.header("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
    }
    return c.json({ message: "Customer types fetched successfully", data: list }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to fetch customer types" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const createCustomerType = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    const existing = (await db.select().from(customerTypes).where(eq(customerTypes.typeName, body.typeName.trim())).limit(1))[0];
    if (existing) {
      return c.json({ message: `Customer type "${body.typeName}" already exists` }, HttpStatusCodes.CONFLICT);
    }

    const inserted = (
      await db
        .insert(customerTypes)
        .values({
          typeName: body.typeName.trim(),
          description: body.description?.trim() || null,
          isActive: body.isActive ?? true
        })
        .returning()
    )[0];

    notifySettingsUpdated("client-types");
    return c.json({ message: "Customer type created successfully", data: inserted }, HttpStatusCodes.CREATED);
  } catch (err: unknown) {
    return c.json({ message: "Failed to create customer type" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const toggleCustomerType = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const existing = (await db.select().from(customerTypes).where(eq(customerTypes.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Customer type not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const updated = (
      await db
        .update(customerTypes)
        .set({ isActive: !existing.isActive, updatedAt: new Date() })
        .where(eq(customerTypes.id, id))
        .returning()
    )[0];

    notifySettingsUpdated("client-types");
    return c.json({ message: "Customer type status updated", data: updated }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to toggle customer type" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── REFERENCES CONTROLLERS ──────────────────────────────────────────

export const listReferences = async (c: AppContext) => {
  try {
    const list = await cache.remember("master:references", 3600, async () => {
      return await db.select().from(clientReferences).orderBy(asc(clientReferences.id));
    });
    if (typeof c.header === "function") {
      c.header("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
    }
    return c.json({ message: "References fetched successfully", data: list }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to fetch references" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const createReference = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    const existing = (await db.select().from(clientReferences).where(eq(clientReferences.name, body.name.trim())).limit(1))[0];
    if (existing) {
      return c.json({ message: `Reference "${body.name}" already exists` }, HttpStatusCodes.CONFLICT);
    }

    const inserted = (
      await db
        .insert(clientReferences)
        .values({
          name: body.name.trim(),
          phone: body.phone?.trim() || null,
          email: body.email?.trim() || null,
          notes: body.notes?.trim() || null,
          isActive: body.isActive ?? true
        })
        .returning()
    )[0];

    notifySettingsUpdated("references");
    return c.json({ message: "Reference created successfully", data: inserted }, HttpStatusCodes.CREATED);
  } catch (err: unknown) {
    return c.json({ message: "Failed to create reference" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const updateReference = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const existing = (await db.select().from(clientReferences).where(eq(clientReferences.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Reference not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const updated = (
      await db
        .update(clientReferences)
        .set({
          name: body.name !== undefined ? body.name.trim() : undefined,
          phone: body.phone !== undefined ? (body.phone ? body.phone.trim() : null) : undefined,
          email: body.email !== undefined ? (body.email ? body.email.trim() : null) : undefined,
          notes: body.notes !== undefined ? (body.notes ? body.notes.trim() : null) : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
          updatedAt: new Date()
        })
        .where(eq(clientReferences.id, id))
        .returning()
    )[0];

    notifySettingsUpdated("references");
    return c.json({ message: "Reference updated successfully", data: updated }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to update reference" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const deleteReference = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const existing = (await db.select().from(clientReferences).where(eq(clientReferences.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Reference not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Protect client assignment history
    const [assignedClient] = await db.select({ id: clients.id }).from(clients).where(eq(clients.referenceId, id)).limit(1);

    if (assignedClient) {
      return c.json(
        {
          success: false,
          message: "Cannot delete this reference because client records are linked to it. Deactivate it instead."
        },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    await db.delete(clientReferences).where(eq(clientReferences.id, id));
    notifySettingsUpdated("references");
    return c.json({ message: "Reference deleted successfully" }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to delete reference" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const toggleReference = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const existing = (await db.select().from(clientReferences).where(eq(clientReferences.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Reference not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const updated = (
      await db
        .update(clientReferences)
        .set({ isActive: !existing.isActive, updatedAt: new Date() })
        .where(eq(clientReferences.id, id))
        .returning()
    )[0];

    notifySettingsUpdated("references");
    return c.json({ message: "Reference status updated", data: updated }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to toggle reference" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── SERVICE ITEMS CONTROLLERS ───────────────────────────────────────

export const listServiceItems = async (c: AppContext) => {
  try {
    const list = await cache.remember("master:service-items", 3600, async () => {
      return await db.select().from(serviceItems).orderBy(asc(serviceItems.id));
    });
    if (typeof c.header === "function") {
      c.header("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
    }
    return c.json({ message: "Service items fetched successfully", data: list }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to fetch service items" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const createServiceItem = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    const existing = (await db.select().from(serviceItems).where(eq(serviceItems.itemName, body.itemName.trim())).limit(1))[0];
    if (existing) {
      return c.json({ message: `Service item "${body.itemName}" already exists` }, HttpStatusCodes.CONFLICT);
    }

    const inserted = (
      await db
        .insert(serviceItems)
        .values({
          itemName: body.itemName.trim(),
          isActive: body.isActive ?? true
        })
        .returning()
    )[0];

    notifySettingsUpdated("service-items");
    return c.json({ message: "Service item created successfully", data: inserted }, HttpStatusCodes.CREATED);
  } catch (err: unknown) {
    return c.json({ message: "Failed to create service item" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const toggleServiceItem = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const existing = (await db.select().from(serviceItems).where(eq(serviceItems.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Service item not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const updated = (
      await db.update(serviceItems).set({ isActive: !existing.isActive, updatedAt: new Date() }).where(eq(serviceItems.id, id)).returning()
    )[0];

    notifySettingsUpdated("service-items");
    return c.json({ message: "Service item status updated", data: updated }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to toggle service item" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const updateServiceItem = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const existing = (await db.select().from(serviceItems).where(eq(serviceItems.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Service item not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const updated = (
      await db
        .update(serviceItems)
        .set({
          itemName: body.itemName ? body.itemName.trim() : undefined,
          isActive: body.isActive !== undefined ? body.isActive : undefined,
          updatedAt: new Date()
        })
        .where(eq(serviceItems.id, id))
        .returning()
    )[0];

    notifySettingsUpdated("service-items");
    return c.json({ message: "Service item updated successfully", data: updated }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to update service item" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const deleteServiceItem = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const existing = (await db.select().from(serviceItems).where(eq(serviceItems.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Service item not found" }, HttpStatusCodes.NOT_FOUND);
    }

    await db.delete(serviceItems).where(eq(serviceItems.id, id));
    notifySettingsUpdated("service-items");
    return c.json({ message: "Service item deleted successfully" }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to delete service item" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── SERVICE RATES CONTROLLERS ───────────────────────────────────────

export const listServiceRates = async (c: AppContext) => {
  try {
    const rates = await cache.remember("master:service-rates", 3600, async () => {
      return await db.query.serviceRates.findMany({
        with: {
          serviceItem: true,
          customerType: true
        },
        orderBy: (rates, { desc }) => [desc(rates.id)]
      });
    });

    if (typeof c.header === "function") {
      c.header("Cache-Control", "private, max-age=120, stale-while-revalidate=300");
    }
    return c.json({ message: "Service rates fetched successfully", data: rates }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to fetch service rates" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const createServiceRate = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");

    // Validate that serviceItem exists
    const sItem = (await db.select().from(serviceItems).where(eq(serviceItems.id, body.serviceItemId)).limit(1))[0];
    if (!sItem) {
      return c.json({ message: "Selected service item does not exist" }, HttpStatusCodes.BAD_REQUEST);
    }

    // Validate that customerType exists if provided
    if (body.customerTypeId) {
      const cType = (await db.select().from(customerTypes).where(eq(customerTypes.id, body.customerTypeId)).limit(1))[0];
      if (!cType) {
        return c.json({ message: "Selected customer type does not exist" }, HttpStatusCodes.BAD_REQUEST);
      }
    }

    const inserted = (
      await db
        .insert(serviceRates)
        .values({
          serviceItemId: body.serviceItemId,
          customerTypeId: body.customerTypeId || null,
          unit: body.unit || "Month",
          regularRate: body.regularRate,
          minimumCharge: body.minimumCharge,
          effectiveFrom: body.effectiveFrom
        })
        .returning()
    )[0];

    notifySettingsUpdated("service-rates");
    return c.json({ message: "Service rate saved successfully", data: inserted }, HttpStatusCodes.CREATED);
  } catch (err: unknown) {
    return c.json({ message: "Failed to save service rate" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const updateServiceRate = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const existing = (await db.select().from(serviceRates).where(eq(serviceRates.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Service rate not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const updateData: Partial<typeof serviceRates.$inferInsert> = { updatedAt: new Date() };
    if (body.customerTypeId !== undefined) updateData.customerTypeId = body.customerTypeId;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.regularRate !== undefined) updateData.regularRate = body.regularRate;
    if (body.minimumCharge !== undefined) updateData.minimumCharge = body.minimumCharge;
    if (body.effectiveFrom !== undefined) updateData.effectiveFrom = body.effectiveFrom;

    const updated = (await db.update(serviceRates).set(updateData).where(eq(serviceRates.id, id)).returning())[0];
    notifySettingsUpdated("service-rates");
    return c.json({ message: "Service rate updated successfully", data: updated }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to update service rate" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

export const deleteServiceRate = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const existing = (await db.select().from(serviceRates).where(eq(serviceRates.id, id)).limit(1))[0];
    if (!existing) {
      return c.json({ message: "Service rate not found" }, HttpStatusCodes.NOT_FOUND);
    }

    await db.delete(serviceRates).where(eq(serviceRates.id, id));
    notifySettingsUpdated("service-rates");
    return c.json({ message: "Service rate deleted successfully" }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to delete service rate" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
