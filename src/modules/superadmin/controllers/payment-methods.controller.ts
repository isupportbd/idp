import { asc, desc, eq } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { cache, db } from "@/framework/facade.js";
import { paymentMethods } from "../database/models/payment_methods.js";
import { notifySettingsUpdated } from "./platform.controller.js";

// Payment Methods CRUD
export async function getPaymentMethods(c: AppContext) {
  try {
    const list = await cache.remember("master:payment-methods", 3600, async () => {
      return await db.select().from(paymentMethods).orderBy(asc(paymentMethods.id));
    });
    return c.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching payment methods:", error);
    return c.json({ success: false, error: "Failed to fetch payment methods" }, 500);
  }
}

export async function createPaymentMethod(c: AppContext) {
  try {
    const body = await c.req.json();
    const name = body.name?.trim();
    if (!name) {
      return c.json({ success: false, error: "Name is required" }, 400);
    }
    const [created] = await db
      .insert(paymentMethods)
      .values({
        name,
        type: body.type?.trim() || "general",
        description: body.description?.trim() || null,
        isActive: body.isActive ?? true
      })
      .returning();

    await cache.forget("master:payment-methods");
    notifySettingsUpdated("payment-methods");
    return c.json({ success: true, data: created, message: "Payment method created successfully" }, 201);
  } catch (error: unknown) {
    console.error("Error creating payment method:", error);
    return c.json({ success: false, error: "Failed to create payment method (it may already exist)" }, 500);
  }
}

export async function updatePaymentMethod(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const body = await c.req.json();
    const name = body.name?.trim();
    if (!name) {
      return c.json({ success: false, error: "Name is required" }, 400);
    }
    const [updated] = await db
      .update(paymentMethods)
      .set({
        name,
        type: body.type?.trim() || "general",
        description: body.description?.trim() || null,
        isActive: body.isActive ?? true,
        updatedAt: new Date()
      })
      .where(eq(paymentMethods.id, id))
      .returning();

    await cache.forget("master:payment-methods");
    notifySettingsUpdated("payment-methods");
    return c.json({ success: true, data: updated, message: "Payment method updated successfully" });
  } catch (error: unknown) {
    console.error("Error updating payment method:", error);
    return c.json({ success: false, error: "Failed to update payment method" }, 500);
  }
}

export async function togglePaymentMethodStatus(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    const [found] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, id));
    if (!found) {
      return c.json({ success: false, error: "Payment method not found" }, 404);
    }
    const [updated] = await db
      .update(paymentMethods)
      .set({
        isActive: !found.isActive,
        updatedAt: new Date()
      })
      .where(eq(paymentMethods.id, id))
      .returning();

    await cache.forget("master:payment-methods");
    notifySettingsUpdated("payment-methods");
    return c.json({ success: true, data: updated, message: "Status updated" });
  } catch (error: unknown) {
    console.error("Error toggling payment method status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

export async function deletePaymentMethod(c: AppContext) {
  try {
    const id = Number(c.req.param("id"));
    await db.delete(paymentMethods).where(eq(paymentMethods.id, id));
    await cache.forget("master:payment-methods");
    notifySettingsUpdated("payment-methods");
    return c.json({ success: true, message: "Payment method deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting payment method:", error);
    return c.json({ success: false, error: "Failed to delete payment method" }, 500);
  }
}
