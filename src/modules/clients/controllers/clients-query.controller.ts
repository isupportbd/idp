import type { AppContext } from "@/framework/facade.js";
import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { clients } from "../database/models/clients.js";
import { clientManagers } from "../database/models/client_managers.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { users } from "@/modules/auth/database/models/user.js";
import { hasPermission } from "@/middlewares/permission-middleware.js";

// ── 1. LIST CLIENTS WITH FILTERS & PAGINATION ────────────────────────

export const listClients = async (c: AppContext) => {
  try {
    const query = c.req.valid("query");
    const page = query.page || 1;
    const limit = query.limit || 50;
    const offset = (page - 1) * limit;

    const { isSuperAdmin, isTenantAdmin, tenantAdminId, userId } = await resolveTenantContext(c);

    const conditions: import("drizzle-orm").SQL[] = [];

    if (!isSuperAdmin && tenantAdminId) {
      conditions.push(eq(clients.createdBy, tenantAdminId));
    }

    if (!isSuperAdmin && !isTenantAdmin) {
      conditions.push(
        sql`${clients.id} IN (SELECT client_id FROM client_managers WHERE manager_id = ${userId})`
      );
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      const searchCondition = or(
        ilike(clients.companyName, term),
        ilike(clients.binNumber, term),
        ilike(clients.mobile, term),
        ilike(clients.proprietorName, term)
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    if (query.customerTypeId) {
      conditions.push(eq(clients.customerTypeId, query.customerTypeId));
    }

    if (query.referenceId) {
      conditions.push(eq(clients.referenceId, query.referenceId));
    }

    if (query.vatServiceType && query.vatServiceType !== "all") {
      conditions.push(eq(clients.vatServiceType, query.vatServiceType));
    }

    if (query.isActive && query.isActive !== "all") {
      conditions.push(eq(clients.isActive, query.isActive === "true"));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total Count
    const totalResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(whereClause);
    const total = totalResult[0]?.count || 0;

    // Fetch Paginated Rows
    const rows = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        proprietorName: clients.proprietorName,
        mobile: clients.mobile,
        alternativeMobile: clients.alternativeMobile,
        email: clients.email,
        address: clients.address,
        binNumber: clients.binNumber,
        tinNumber: clients.tinNumber,
        tradeLicenseNo: clients.tradeLicenseNo,
        customerTypeId: clients.customerTypeId,
        customerTypeName: customerTypes.typeName,
        referenceId: clients.referenceId,
        referenceName: clientReferences.name,
        vatUserId: clients.vatUserId,
        vatPassword: clients.vatPassword,
        vatServiceType: clients.vatServiceType,
        openingBalance: clients.openingBalance,
        isActive: clients.isActive,
        notes: clients.notes,
        createdAt: clients.createdAt,
        updatedAt: clients.updatedAt
      })
      .from(clients)
      .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
      .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
      .where(whereClause)
      .orderBy(desc(clients.id))
      .limit(limit)
      .offset(offset);

    // Attach Assigned Managers
    const clientIds = rows.map((r) => r.id);
    let managerMap: Record<number, any[]> = {};

    if (clientIds.length > 0) {
      const allManagers = await db
        .select({
          clientId: clientManagers.clientId,
          managerId: clientManagers.managerId,
          managerName: users.name,
          managerEmail: users.email
        })
        .from(clientManagers)
        .innerJoin(users, eq(clientManagers.managerId, users.id))
        .where(inArray(clientManagers.clientId, clientIds));

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
    }

    const canSeeVat = await hasPermission(c, "clients.vat_password");
    const data = rows.map((r) => ({
      ...r,
      vatPassword: canSeeVat ? (r.vatPassword || null) : null,
      managers: managerMap[r.id] || []
    }));

    return c.json(
      {
        message: "Clients fetched successfully",
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json({ message: "Failed to list clients" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 2. GET SINGLE CLIENT BY ID ───────────────────────────────────────

export const getClientById = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const { isSuperAdmin, isTenantAdmin, tenantAdminId, userId } = await resolveTenantContext(c);

    const whereConditions = [eq(clients.id, id)];
    if (!isSuperAdmin && tenantAdminId) {
      whereConditions.push(eq(clients.createdBy, tenantAdminId));
    }
    if (!isSuperAdmin && !isTenantAdmin) {
      whereConditions.push(
        sql`${clients.id} IN (SELECT client_id FROM client_managers WHERE manager_id = ${userId})`
      );
    }

    const row = (
      await db
        .select({
          id: clients.id,
          companyName: clients.companyName,
          proprietorName: clients.proprietorName,
          mobile: clients.mobile,
          alternativeMobile: clients.alternativeMobile,
          email: clients.email,
          address: clients.address,
          binNumber: clients.binNumber,
          tinNumber: clients.tinNumber,
          tradeLicenseNo: clients.tradeLicenseNo,
          customerTypeId: clients.customerTypeId,
          customerTypeName: customerTypes.typeName,
          referenceId: clients.referenceId,
          referenceName: clientReferences.name,
          vatUserId: clients.vatUserId,
          vatPassword: clients.vatPassword,
          vatServiceType: clients.vatServiceType,
          openingBalance: clients.openingBalance,
          isActive: clients.isActive,
          notes: clients.notes,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt
        })
        .from(clients)
        .leftJoin(customerTypes, eq(clients.customerTypeId, customerTypes.id))
        .leftJoin(clientReferences, eq(clients.referenceId, clientReferences.id))
        .where(and(...whereConditions))
        .limit(1)
    )[0];

    if (!row) {
      return c.json({ message: "Client not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const assignedManagers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email
      })
      .from(clientManagers)
      .innerJoin(users, eq(clientManagers.managerId, users.id))
      .where(eq(clientManagers.clientId, id));

    const canSeeVat = await hasPermission(c, "clients.vat_password");
    return c.json(
      {
        message: "Client retrieved successfully",
        data: {
          ...row,
          vatPassword: canSeeVat ? (row.vatPassword || null) : null,
          managers: assignedManagers
        }
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json({ message: "Failed to get client" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
