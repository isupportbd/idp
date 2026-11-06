import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { cache, db } from "@/framework/facade.js";
import { vatNotes } from "@/modules/superadmin/database/models/vat_notes.js";
import { notifySettingsUpdated } from "./platform.controller.js";

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
    const [existing] = await db.select().from(vatNotes).where(eq(vatNotes.vatRate, numericRate));

    if (existing) {
      return c.json(
        {
          success: false,
          error: `A mapping for VAT Rate "${numericRate}%" already exists (${existing.noteName}). Duplicate VAT rates are not allowed.`
        },
        400
      );
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
        return c.json(
          {
            success: false,
            error: `A mapping for VAT Rate "${numericRate}%" is already configured (${existing.noteName}).`
          },
          400
        );
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
