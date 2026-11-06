import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { broadcast, db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { clientManagers } from "../database/models/client_managers.js";
import { clients } from "../database/models/clients.js";

// ── 9. ASSIGNMENTS: LIST CLIENT ASSIGNMENTS ──────────────────────────

export const listAssignments = async (c: AppContext) => {
  try {
    const query = c.req.valid("query");
    const filter = query.filter || "all";
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    const clientConditions: import("drizzle-orm").SQL[] = [];
    if (!isSuperAdmin && tenantAdminId) {
      clientConditions.push(eq(clients.createdBy, tenantAdminId));
    }

    const allClients = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        binNumber: clients.binNumber,
        mobile: clients.mobile,
        customerTypeId: clients.customerTypeId,
        customerTypeName: customerTypes.typeName,
        referenceId: clients.referenceId,
        referenceName: clientReferences.name,
        isActive: clients.isActive
      })
      .from(clients)
      .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
      .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
      .where(clientConditions.length > 0 ? and(...clientConditions) : undefined)
      .orderBy(asc(clients.companyName));

    const clientIds = allClients.map((c) => c.id);
    const allManagers =
      clientIds.length > 0
        ? await db
            .select({
              clientId: clientManagers.clientId,
              managerId: clientManagers.managerId,
              managerName: users.name,
              managerEmail: users.email
            })
            .from(clientManagers)
            .innerJoin(users, eq(clientManagers.managerId, users.id))
            .where(inArray(clientManagers.clientId, clientIds))
        : [];

    const managerMap: Record<number, any[]> = {};
    for (const m of allManagers) {
      if (!managerMap[m.clientId]) {
        managerMap[m.clientId] = [];
      }
      managerMap[m.clientId].push({
        id: m.managerId,
        name: m.managerName,
        email: m.managerEmail
      });
    }

    const allAssignments = allClients.map((cl) => {
      const mgrs = managerMap[cl.id] || [];
      return {
        ...cl,
        managerIds: mgrs.map((m) => m.id),
        managers: mgrs
      };
    });

    const stats = {
      total: allAssignments.length,
      assigned: allAssignments.filter((r) => r.managerIds.length > 0).length,
      shared: allAssignments.filter((r) => r.managerIds.length > 1).length,
      unassigned: allAssignments.filter((r) => r.managerIds.length === 0).length
    };

    let result = allAssignments;

    if (query.search && query.search.trim()) {
      const term = query.search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.companyName.toLowerCase().includes(term) ||
          (r.binNumber && r.binNumber.toLowerCase().includes(term)) ||
          (r.mobile && r.mobile.toLowerCase().includes(term))
      );
    }

    if (filter === "assigned") {
      result = result.filter((r) => r.managerIds.length > 0);
    } else if (filter === "shared") {
      result = result.filter((r) => r.managerIds.length > 1);
    } else if (filter === "unassigned") {
      result = result.filter((r) => r.managerIds.length === 0);
    }

    return c.json({ message: "Assignments fetched", data: result, stats }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to list assignments" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 10. ASSIGNMENTS: SAVE ASSIGNMENTS FOR A CLIENT ───────────────────

export const assignManagers = async (c: AppContext) => {
  try {
    const { clientId, managerIds } = c.req.valid("json");
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    const existingClient = (
      await db.select({ id: clients.id, createdBy: clients.createdBy }).from(clients).where(eq(clients.id, clientId)).limit(1)
    )[0];
    if (!existingClient) {
      return c.json({ message: "Client not found" }, HttpStatusCodes.NOT_FOUND);
    }
    if (!isSuperAdmin && tenantAdminId && existingClient.createdBy !== tenantAdminId) {
      return c.json({ message: "Unauthorized access to client" }, HttpStatusCodes.FORBIDDEN);
    }

    if (managerIds.length > 0 && !isSuperAdmin) {
      const candidateManagers = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, managerIds), or(eq(users.adminId, tenantAdminId!), eq(users.id, tenantAdminId!))));

      if (candidateManagers.length !== managerIds.length) {
        return c.json({ message: "One or more managers do not belong to this tenant" }, HttpStatusCodes.BAD_REQUEST);
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(clientManagers).where(eq(clientManagers.clientId, clientId));
      if (managerIds.length > 0) {
        await tx.insert(clientManagers).values(
          managerIds.map((mgrId: number) => ({
            clientId,
            managerId: mgrId
          }))
        );
      }
    });

    return c.json({ message: "Manager assignments updated successfully" }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to assign managers" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
