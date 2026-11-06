import { asc, desc, eq } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { cache, db } from "@/framework/facade.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { notifySettingsUpdated } from "./platform.controller.js";

// 7. Plans CRUD
export async function getPlans(c: AppContext) {
  try {
    const allPlans = await cache.remember("master:plans", 3600, async () => {
      return db.select().from(plans).orderBy(plans.id);
    });
    return c.json({ success: true, data: allPlans });
  } catch (error: unknown) {
    console.error("Error fetching plans:", error);
    return c.json({ success: false, error: "Failed to fetch plans" }, 500);
  }
}

export async function createPlan(c: AppContext) {
  try {
    const body = c.req.valid("json");
    const [newPlan] = await db
      .insert(plans)
      .values({
        name: body.name,
        rateMonthly: Number(body.rateMonthly),
        rateYearly: Number(body.rateYearly),
        maxUsers: Number(body.maxUsers || 1),
        maxClients: Number(body.maxClients || 50),
        maxStorageMB: Number(body.maxStorageMB || 1024),
        hasAccounts: Boolean(body.hasAccounts),
        yearlyDiscountPercent: Number(body.yearlyDiscountPercent || 0),
        features: body.features || [],
        status: body.status || "active"
      })
      .returning();

    notifySettingsUpdated("plans");
    return c.json({ success: true, message: "Plan created successfully", data: newPlan });
  } catch (error: unknown) {
    console.error("Error creating plan:", error);
    return c.json({ success: false, error: "Failed to create plan" }, 500);
  }
}

export async function updatePlan(c: AppContext) {
  try {
    const id = parseInt(c.req.param("id") ?? "");
    if (isNaN(id)) return c.json({ success: false, error: "Invalid plan ID" }, 400);

    const body = c.req.valid("json");
    const [updatedPlan] = await db
      .update(plans)
      .set({
        name: body.name,
        rateMonthly: Number(body.rateMonthly),
        rateYearly: Number(body.rateYearly),
        maxUsers: Number(body.maxUsers || 1),
        maxClients: Number(body.maxClients || 50),
        maxStorageMB: Number(body.maxStorageMB || 1024),
        hasAccounts: Boolean(body.hasAccounts),
        yearlyDiscountPercent: Number(body.yearlyDiscountPercent || 0),
        features: body.features || [],
        status: body.status || "active",
        updatedAt: new Date()
      })
      .where(eq(plans.id, id))
      .returning();

    notifySettingsUpdated("plans");
    return c.json({ success: true, message: "Plan updated successfully", data: updatedPlan });
  } catch (error: unknown) {
    console.error("Error updating plan:", error);
    return c.json({ success: false, error: "Failed to update plan" }, 500);
  }
}

export async function deletePlan(c: AppContext) {
  try {
    const id = parseInt(c.req.param("id") ?? "");
    if (isNaN(id)) return c.json({ success: false, error: "Invalid plan ID" }, 400);

    await db.delete(plans).where(eq(plans.id, id));
    notifySettingsUpdated("plans");
    return c.json({ success: true, message: "Plan deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting plan:", error);
    return c.json({ success: false, error: "Failed to delete plan" }, 500);
  }
}
