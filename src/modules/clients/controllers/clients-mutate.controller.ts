import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { broadcast, db, HttpStatusCodes, round2 as r2, resolveTenantContext } from "@/framework/facade.js";
import { hasPermission } from "@/middlewares/permission-middleware.js";
import { users } from "@/modules/auth/database/models/user.js";
import { bills } from "@/modules/billing/database/models/bills.js";
import { collections } from "@/modules/billing/database/models/collections.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { purchases } from "@/modules/purchases/database/models/purchases.js";
import { salesRates } from "@/modules/sales-rates/database/models/sales_rates.js";
import { vatSubmissions } from "@/modules/submissions/database/models/vat_submissions.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { clientManagers } from "../database/models/client_managers.js";
import { clients } from "../database/models/clients.js";

// ── 3. CREATE / BIND CLIENT (GLOBAL BIN ARCHITECTURE) ────────────────

export const createClient = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    const trimmedBin = body.binNumber?.trim();

    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);

    // 1. Check Tenant Subscription Plan Client Limit (counting ACTIVE clients)
    if (!isSuperAdmin) {
      const tenantAdmin = await db.query.users.findFirst({
        where: eq(users.id, tenantAdminId ?? -1)
      });

      if (tenantAdmin?.planId) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, tenantAdmin.planId));
        const maxClientsAllowed = plan?.maxClients;

        if (maxClientsAllowed && maxClientsAllowed > 0) {
          const [clientCountResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(clients)
            .where(and(eq(clients.createdBy, tenantAdminId ?? -1), eq(clients.isActive, true)));

          const currentCount = clientCountResult?.count || 0;
          if (currentCount >= maxClientsAllowed) {
            return c.json(
              {
                success: false,
                message: `Active client limit reached (${currentCount}/${maxClientsAllowed}) for your current plan (${plan?.name || "Subscription Plan"}). Please inactivate/release an inactive client or upgrade your plan to add more client organizations.`
              },
              HttpStatusCodes.FORBIDDEN
            );
          }
        }
      }
    }

    // 2. Global BIN Uniqueness & Release-and-Bind Check
    if (trimmedBin) {
      const existingGlobalClient = (await db.select().from(clients).where(eq(clients.binNumber, trimmedBin)).limit(1))[0];

      if (existingGlobalClient) {
        // Case A: Client already belongs to THIS admin
        if (existingGlobalClient.createdBy === tenantAdminId) {
          return c.json(
            {
              message: `BIN number "${trimmedBin}" is already registered in your organization under "${existingGlobalClient.companyName}".`
            },
            HttpStatusCodes.CONFLICT
          );
        }

        // Case B: Client belongs to another admin AND is STILL ACTIVE (Not Released!)
        if (existingGlobalClient.isActive) {
          return c.json(
            {
              success: false,
              message: `এই ক্লায়েন্টটি (BIN: ${trimmedBin}) বর্তমানে অন্য একজন অ্যাডমিনের আন্ডারে সক্রিয় রয়েছে। পূর্ববর্তী অ্যাডমিন সমস্ত বকেয়া বুঝে নিয়ে রিলিজ (Release) না করা পর্যন্ত এই ক্লায়েন্টকে আপনার পোর্টালে যুক্ত বা বাইন্ড করা সম্ভব নয়।`
            },
            HttpStatusCodes.CONFLICT
          );
        }

        // Case C: Client was RELEASED by previous admin -> BIND TO NEW ADMIN!
        const [boundClient] = await db
          .update(clients)
          .set({
            companyName: body.companyName?.trim() || existingGlobalClient.companyName,
            proprietorName:
              body.proprietorName !== undefined
                ? body.proprietorName
                  ? body.proprietorName.trim()
                  : null
                : existingGlobalClient.proprietorName,
            mobile: body.mobile !== undefined ? (body.mobile ? body.mobile.trim() : null) : existingGlobalClient.mobile,
            alternativeMobile:
              body.alternativeMobile !== undefined
                ? body.alternativeMobile
                  ? body.alternativeMobile.trim()
                  : null
                : existingGlobalClient.alternativeMobile,
            email: body.email !== undefined ? (body.email ? body.email.trim() : null) : existingGlobalClient.email,
            address: body.address !== undefined ? (body.address ? body.address.trim() : null) : existingGlobalClient.address,
            tinNumber: body.tinNumber !== undefined ? (body.tinNumber ? body.tinNumber.trim() : null) : existingGlobalClient.tinNumber,
            tradeLicenseNo:
              body.tradeLicenseNo !== undefined
                ? body.tradeLicenseNo
                  ? body.tradeLicenseNo.trim()
                  : null
                : existingGlobalClient.tradeLicenseNo,
            customerTypeId: body.customerTypeId !== undefined ? body.customerTypeId : null,
            referenceId: body.referenceId !== undefined ? body.referenceId : null,
            vatUserId: body.vatUserId !== undefined ? (body.vatUserId ? body.vatUserId.trim() : null) : existingGlobalClient.vatUserId,
            vatPassword: body.vatPassword !== undefined ? body.vatPassword : existingGlobalClient.vatPassword,
            vatServiceType: body.vatServiceType || existingGlobalClient.vatServiceType,
            openingBalance: body.openingBalance !== undefined ? r2(Number(body.openingBalance)) : 0,
            isActive: true, // Activated under new admin
            createdBy: tenantAdminId, // Transferred to new tenant admin
            notes: body.notes !== undefined ? (body.notes ? body.notes.trim() : null) : existingGlobalClient.notes,
            updatedAt: new Date()
          })
          .where(eq(clients.id, existingGlobalClient.id))
          .returning();

        // Reassign managers for new firm
        await db.delete(clientManagers).where(eq(clientManagers.clientId, boundClient.id));
        if (body.managerIds && Array.isArray(body.managerIds) && body.managerIds.length > 0) {
          await db.insert(clientManagers).values(
            body.managerIds.map((mgrId: number) => ({
              clientId: boundClient.id,
              managerId: mgrId
            }))
          );
        }

        return c.json(
          {
            message: `Client "${boundClient.companyName}" (BIN: ${trimmedBin}) was released by previous firm and has now been successfully bound to your organization!`,
            data: boundClient,
            isTransferred: true
          },
          HttpStatusCodes.CREATED
        );
      }
    }

    // 3. Brand New Client Registration (BIN not in DB)
    const inserted = (
      await db
        .insert(clients)
        .values({
          companyName: body.companyName.trim(),
          proprietorName: body.proprietorName?.trim() || null,
          mobile: body.mobile?.trim() || null,
          alternativeMobile: body.alternativeMobile?.trim() || null,
          email: body.email?.trim() || null,
          address: body.address?.trim() || null,
          binNumber: trimmedBin || null,
          tinNumber: body.tinNumber?.trim() || null,
          tradeLicenseNo: body.tradeLicenseNo?.trim() || null,
          customerTypeId: body.customerTypeId || null,
          referenceId: body.referenceId || null,
          vatUserId: body.vatUserId?.trim() || null,
          vatPassword: body.vatPassword || null,
          vatServiceType: body.vatServiceType || "FULL",
          openingBalance: body.openingBalance !== undefined ? r2(Number(body.openingBalance)) : 0,
          isActive: body.isActive ?? true,
          createdBy: tenantAdminId,
          notes: body.notes?.trim() || null
        })
        .returning()
    )[0];

    // Assign Managers if provided
    if (body.managerIds && Array.isArray(body.managerIds) && body.managerIds.length > 0) {
      await db.insert(clientManagers).values(
        body.managerIds.map((mgrId: number) => ({
          clientId: inserted.id,
          managerId: mgrId
        }))
      );
    }

    return c.json({ message: "Client created successfully", data: inserted }, HttpStatusCodes.CREATED);
  } catch (err: unknown) {
    return c.json({ message: "Failed to create client" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 4. UPDATE CLIENT ─────────────────────────────────────────────────

export const updateClient = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const { isSuperAdmin, isTenantAdmin, tenantAdminId, userId } = await resolveTenantContext(c);

    const whereConditions = [eq(clients.id, id)];
    if (!isSuperAdmin && tenantAdminId) {
      whereConditions.push(eq(clients.createdBy, tenantAdminId));
    }
    if (!isSuperAdmin && !isTenantAdmin) {
      whereConditions.push(sql`${clients.id} IN (SELECT client_id FROM client_managers WHERE manager_id = ${userId})`);
    }

    const existing = (
      await db
        .select()
        .from(clients)
        .where(and(...whereConditions))
        .limit(1)
    )[0];
    if (!existing) {
      return c.json({ message: "Client not found or unauthorized" }, HttpStatusCodes.NOT_FOUND);
    }

    const trimmedBin = body.binNumber?.trim();
    if (trimmedBin) {
      const duplicateBin = (
        await db
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.binNumber, trimmedBin), ne(clients.id, id)))
          .limit(1)
      )[0];
      if (duplicateBin) {
        return c.json(
          { message: `BIN number "${trimmedBin}" is already used globally by another registered client.` },
          HttpStatusCodes.CONFLICT
        );
      }
    }

    const updated = (
      await db
        .update(clients)
        .set({
          companyName: body.companyName !== undefined ? body.companyName.trim() : undefined,
          proprietorName: body.proprietorName !== undefined ? (body.proprietorName ? body.proprietorName.trim() : null) : undefined,
          mobile: body.mobile !== undefined ? (body.mobile ? body.mobile.trim() : null) : undefined,
          alternativeMobile:
            body.alternativeMobile !== undefined ? (body.alternativeMobile ? body.alternativeMobile.trim() : null) : undefined,
          email: body.email !== undefined ? (body.email ? body.email.trim() : null) : undefined,
          address: body.address !== undefined ? (body.address ? body.address.trim() : null) : undefined,
          binNumber: body.binNumber !== undefined ? trimmedBin || null : undefined,
          tinNumber: body.tinNumber !== undefined ? (body.tinNumber ? body.tinNumber.trim() : null) : undefined,
          tradeLicenseNo: body.tradeLicenseNo !== undefined ? (body.tradeLicenseNo ? body.tradeLicenseNo.trim() : null) : undefined,
          customerTypeId: body.customerTypeId !== undefined ? body.customerTypeId : undefined,
          referenceId: body.referenceId !== undefined ? body.referenceId : undefined,
          vatUserId: body.vatUserId !== undefined ? (body.vatUserId ? body.vatUserId.trim() : null) : undefined,
          vatPassword: body.vatPassword !== undefined && (await hasPermission(c, "clients.vat_password")) ? body.vatPassword : undefined,
          vatServiceType: body.vatServiceType !== undefined ? body.vatServiceType : undefined,
          openingBalance:
            (isTenantAdmin || isSuperAdmin) && body.openingBalance !== undefined ? r2(Number(body.openingBalance)) : undefined,
          isActive: (isTenantAdmin || isSuperAdmin) && body.isActive !== undefined ? body.isActive : undefined,
          notes: body.notes !== undefined ? (body.notes ? body.notes.trim() : null) : undefined,
          updatedAt: new Date()
        })
        .where(eq(clients.id, id))
        .returning()
    )[0];

    // Update manager assignments if passed (tenant admin only)
    if (isTenantAdmin || isSuperAdmin) {
      if (body.managerIds !== undefined && Array.isArray(body.managerIds)) {
        await db.delete(clientManagers).where(eq(clientManagers.clientId, id));
        if (body.managerIds.length > 0) {
          await db.insert(clientManagers).values(
            body.managerIds.map((mgrId: number) => ({
              clientId: id,
              managerId: mgrId
            }))
          );
        }
      }
    }

    return c.json({ message: "Client updated successfully", data: updated }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to update client" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 5. TOGGLE CLIENT ACTIVE STATUS (RELEASE / RESTORE) ───────────────

export const toggleClientStatus = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const { isActive } = c.req.valid("json");
    const auth = c.get("auth") || c.get("user");
    let tenantAdminId: number | null = null;
    let isSuperAdmin = false;

    if (auth?.id) {
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, Number(auth.id)),
        with: { role: true }
      });
      if (currentUser) {
        isSuperAdmin = currentUser.role?.name?.toLowerCase() === "superadmin" || auth.role === "superadmin";
        tenantAdminId = currentUser.adminId ? Number(currentUser.adminId) : currentUser.id;
      }
    }

    const whereConditions = [eq(clients.id, id)];
    if (!isSuperAdmin && tenantAdminId) {
      whereConditions.push(eq(clients.createdBy, tenantAdminId));
    }

    const existing = (
      await db
        .select()
        .from(clients)
        .where(and(...whereConditions))
        .limit(1)
    )[0];
    if (!existing) {
      return c.json({ message: "Client not found or unauthorized" }, HttpStatusCodes.NOT_FOUND);
    }

    // If reactivating a released/inactive client, check subscription plan active client limit
    if (isActive && !existing.isActive && !isSuperAdmin && tenantAdminId) {
      const tenantAdmin = await db.query.users.findFirst({
        where: eq(users.id, tenantAdminId)
      });
      if (tenantAdmin?.planId) {
        const [plan] = await db.select().from(plans).where(eq(plans.id, tenantAdmin.planId));
        if (plan && plan.maxClients && plan.maxClients > 0) {
          const [activeCountRes] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(clients)
            .where(and(eq(clients.createdBy, tenantAdminId), eq(clients.isActive, true)));

          const currentActiveCount = activeCountRes?.count || 0;
          if (currentActiveCount >= plan.maxClients) {
            return c.json(
              {
                message: `Cannot activate client. Active client limit reached (${currentActiveCount}/${plan.maxClients}) for your subscription plan (${plan.name}). Please inactivate another client first or upgrade your plan.`
              },
              HttpStatusCodes.FORBIDDEN
            );
          }
        }
      }
    }

    const updated = (await db.update(clients).set({ isActive, updatedAt: new Date() }).where(eq(clients.id, id)).returning())[0];

    return c.json(
      {
        message: `Client ${isActive ? "activated / restored" : "deactivated / released"} successfully`,
        data: updated
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json({ message: "Failed to toggle client status" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 6. DELETE CLIENT (AUDIT & COMPLIANCE SAFEGUARD) ───────────────────

export const deleteClient = async (c: AppContext) => {
  try {
    const { id } = c.req.valid("param");
    const auth = c.get("auth") || c.get("user");
    let tenantAdminId: number | null = null;
    let isSuperAdmin = false;

    if (auth?.id) {
      const currentUser = await db.query.users.findFirst({
        where: eq(users.id, Number(auth.id)),
        with: { role: true }
      });
      if (currentUser) {
        isSuperAdmin = currentUser.role?.name?.toLowerCase() === "superadmin" || auth.role === "superadmin";
        tenantAdminId = currentUser.adminId ? Number(currentUser.adminId) : currentUser.id;
      }
    }

    const whereConditions = [eq(clients.id, id)];
    if (!isSuperAdmin && tenantAdminId) {
      whereConditions.push(eq(clients.createdBy, tenantAdminId));
    }

    const existing = (
      await db
        .select()
        .from(clients)
        .where(and(...whereConditions))
        .limit(1)
    )[0];
    if (!existing) {
      return c.json({ message: "Client not found or unauthorized" }, HttpStatusCodes.NOT_FOUND);
    }

    // Check for existing accounting & VAT transactions
    const [billsCountRes] = await db.select({ count: sql<number>`count(*)::int` }).from(bills).where(eq(bills.clientId, id));
    const [collectionsCountRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(collections)
      .where(eq(collections.clientId, id));
    const [vatCountRes] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vatSubmissions)
      .where(eq(vatSubmissions.clientId, id));
    const [purchasesCountRes] = await db.select({ count: sql<number>`count(*)::int` }).from(purchases).where(eq(purchases.clientId, id));
    const [ratesCountRes] = await db.select({ count: sql<number>`count(*)::int` }).from(salesRates).where(eq(salesRates.clientId, id));

    const totalTransactions =
      (billsCountRes?.count || 0) +
      (collectionsCountRes?.count || 0) +
      (vatCountRes?.count || 0) +
      (purchasesCountRes?.count || 0) +
      (ratesCountRes?.count || 0);

    if (totalTransactions > 0) {
      return c.json(
        {
          success: false,
          message: `Cannot delete "${existing.companyName}" because this client has ${totalTransactions} existing accounting & tax records (bills, payments, purchases, or VAT submissions). To preserve audit history and ledger balance, please Deactivate / Release the client instead.`
        },
        HttpStatusCodes.BAD_REQUEST
      );
    }

    // If zero transactions exist, safe to delete manager assignments and remove client record
    await db.delete(clientManagers).where(eq(clientManagers.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));

    return c.json({ message: "Client deleted successfully", success: true }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to delete client" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
