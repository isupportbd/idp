import type { AppContext } from "@/framework/facade.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { clients } from "../database/models/clients.js";
import { clientManagers } from "../database/models/client_managers.js";
import { purchases } from "@/modules/purchases/database/models/purchases.js";
import { salesRates } from "@/modules/sales-rates/database/models/sales_rates.js";
import { globalItems } from "@/modules/superadmin/database/models/global_items.js";

// ── GET CLIENT PURCHASED ITEMS ───────────────────────────────────────
export const getClientPurchasedItems = async (c: AppContext) => {
  try {
    const clientId = Number(c.req.param("id"));
    if (!clientId || isNaN(clientId)) {
      return c.json({ message: "Invalid client ID", data: [] }, HttpStatusCodes.BAD_REQUEST);
    }

    const { isSuperAdmin, isTenantAdmin, tenantAdminId, userId } = await resolveTenantContext(c);
    const existingClient = (await db.select({ id: clients.id, createdBy: clients.createdBy }).from(clients).where(eq(clients.id, clientId)).limit(1))[0];
    if (!existingClient) {
      return c.json({ message: "Client not found", data: [] }, HttpStatusCodes.NOT_FOUND);
    }
    if (!isSuperAdmin && tenantAdminId && existingClient.createdBy !== tenantAdminId) {
      return c.json({ message: "Unauthorized access to client", data: [] }, HttpStatusCodes.FORBIDDEN);
    }
    if (!isSuperAdmin && !isTenantAdmin) {
      const isAssigned = (await db.select({ id: clientManagers.id }).from(clientManagers).where(and(eq(clientManagers.clientId, clientId), eq(clientManagers.managerId, userId))).limit(1))[0];
      if (!isAssigned) {
        return c.json({ message: "Unauthorized: You are not assigned to this client", data: [] }, HttpStatusCodes.FORBIDDEN);
      }
    }

    const pQuery = await db
      .select({
        id: globalItems.id,
        name: globalItems.name,
        hsCode: globalItems.hsCode,
        unit: globalItems.unit
      })
      .from(purchases)
      .innerJoin(globalItems, eq(purchases.itemId, globalItems.id))
      .where(eq(purchases.clientId, clientId));

    // Deduplicate items by id
    const uniqueItemsMap = new Map<number, any>();
    for (const item of pQuery) {
      if (!uniqueItemsMap.has(item.id)) {
        uniqueItemsMap.set(item.id, item);
      }
    }

    const data = Array.from(uniqueItemsMap.values());
    return c.json({ message: "Client purchased items fetched successfully", data }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    console.error("Error fetching client purchased items:", err);
    return c.json({ message: "Failed to fetch client purchased items", data: [] }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

