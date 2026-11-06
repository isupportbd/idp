import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { broadcast, db, HttpStatusCodes, round2 as r2, resolveTenantContext, validate } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { customerTypes } from "@/modules/services/database/models/customer_types.js";
import { clientReferences } from "@/modules/services/database/models/references.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { clients } from "../database/models/clients.js";
import { BulkCreateClientsSchema } from "./clients.schema.js";

// Helper: Format raw BIN to canonical 9-digit or 13-digit format (e.g. 000123456-0101)
function formatStandardBin(raw: unknown): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 13) {
    return `${digits.slice(0, 9)}-${digits.slice(9, 13)}`;
  }
  return String(raw).trim() || null;
}

// ── 12. BULK CREATE CLIENTS ──────────────────────────────────────────

export const bulkCreateClients = async (c: AppContext) => {
  try {
    const rawBody = c.req.valid("json");
    const { clients: rawClients } = (await validate(BulkCreateClientsSchema, rawBody)) as { clients: Record<string, unknown>[] };

    const { currentUser, isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
    const tenantAdmin = currentUser.adminId ? await db.query.users.findFirst({ where: eq(users.id, tenantAdminId!) }) : currentUser;

    // Check Plan Client Limit for Bulk Upload
    if (!isSuperAdmin && tenantAdmin?.planId) {
      const [plan] = await db.select().from(plans).where(eq(plans.id, tenantAdmin.planId));
      const maxClientsAllowed = plan?.maxClients;

      if (maxClientsAllowed && maxClientsAllowed > 0) {
        const [clientCountResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(clients)
          .where(and(eq(clients.createdBy, tenantAdminId ?? -1), eq(clients.isActive, true)));

        const currentCount = clientCountResult?.count || 0;
        const validClientsToUpload = rawClients.filter(
          (item) => String(item.companyName || "").trim() || String(item.name || "").trim()
        ).length;

        if (currentCount + validClientsToUpload > maxClientsAllowed) {
          const remainingSlots = Math.max(0, maxClientsAllowed - currentCount);
          return c.json(
            {
              success: false,
              message: `Cannot upload ${validClientsToUpload} clients. Your current plan (${plan?.name || "Subscription Plan"}) limit is ${maxClientsAllowed} active clients. You currently have ${currentCount} active clients (Available slots: ${remainingSlots}). Please inactivate unused clients or upgrade your plan.`
            },
            HttpStatusCodes.FORBIDDEN
          );
        }
      }
    }

    const allTypes = await db.select().from(customerTypes);
    const allRefs = await db.select().from(clientReferences);

    // Existing client lookup: fetch existing BINs & company names for this tenant to strictly skip duplicates
    const existingClientRows = await db
      .select({
        id: clients.id,
        binNumber: clients.binNumber,
        companyName: clients.companyName
      })
      .from(clients)
      .where(isSuperAdmin ? undefined : or(eq(clients.createdBy, tenantAdminId ?? -1), sql`${clients.createdBy} IS NULL`));

    const existingBinSet = new Set<string>();
    for (const cl of existingClientRows) {
      if (cl.binNumber) {
        const clean = cl.binNumber.replace(/\D/g, "");
        if (clean) existingBinSet.add(clean);
      }
    }

    const seenBatchBinSet = new Set<string>();
    const toInsert: (typeof clients.$inferInsert)[] = [];
    let skippedCount = 0;

    for (const item of rawClients) {
      const companyName = String(item.companyName || item.name || "").trim();
      if (!companyName) {
        skippedCount++;
        continue;
      }

      // Format and validate BIN
      const rawBin = item.binNumber ? String(item.binNumber).trim() : item.bin ? String(item.bin).trim() : null;
      const formattedBin = formatStandardBin(rawBin);
      const cleanBinDigits = formattedBin ? formattedBin.replace(/\D/g, "") : "";

      // Strict duplicate prevention: if this BIN already exists in database or earlier in this upload, SKIP IT
      if (cleanBinDigits) {
        if (existingBinSet.has(cleanBinDigits) || seenBatchBinSet.has(cleanBinDigits)) {
          skippedCount++;
          continue;
        }
        seenBatchBinSet.add(cleanBinDigits);
      }

      // Customer Type Matching
      let resolvedTypeId: number | null = null;
      if (item.customerTypeId && !isNaN(Number(item.customerTypeId))) {
        resolvedTypeId = Number(item.customerTypeId);
      } else if (item.customerType || item.customerTypeName) {
        const typeStr = String(item.customerType || item.customerTypeName)
          .trim()
          .toLowerCase();
        const found = allTypes.find((t) => t.typeName.toLowerCase() === typeStr || t.typeName.toLowerCase().includes(typeStr));
        if (found) resolvedTypeId = found.id;
      }

      // Reference Matching
      let resolvedRefId: number | null = null;
      if (item.referenceId && !isNaN(Number(item.referenceId))) {
        resolvedRefId = Number(item.referenceId);
      } else if (item.reference || item.referenceName) {
        const refStr = String(item.reference || item.referenceName)
          .trim()
          .toLowerCase();
        const found = allRefs.find((r) => r.name.toLowerCase() === refStr || r.name.toLowerCase().includes(refStr));
        if (found) resolvedRefId = found.id;
      }

      // VAT Service Type Resolution
      let serviceType = "FULL";
      if (item.vatServiceType) {
        const st = String(item.vatServiceType).trim().toUpperCase();
        if (st.includes("ONLY") || st.includes("RETURN")) {
          serviceType = "ONLY_RETURN";
        }
      }

      // Status
      let active = true;
      if (item.isActive !== undefined) {
        if (typeof item.isActive === "boolean") {
          active = item.isActive;
        } else {
          const str = String(item.isActive).trim().toLowerCase();
          if (str === "false" || str === "inactive" || str === "no" || str === "0") {
            active = false;
          }
        }
      }

      // Opening Balance (Due > 0, Advance < 0)
      let openingBalance = 0;
      const rawBal =
        item.openingBalance !== undefined
          ? item.openingBalance
          : item.previousDue !== undefined
            ? item.previousDue
            : item["Previous Due"] !== undefined
              ? item["Previous Due"]
              : item["Opening Balance"];
      const balType = String(item.balanceType || item.openingType || item["Balance Type"] || "")
        .toLowerCase()
        .trim();

      if (rawBal !== undefined && rawBal !== null && !isNaN(Number(rawBal))) {
        const num = Number(rawBal);
        if (balType.includes("adv") || balType.includes("credit")) {
          openingBalance = -Math.abs(num);
        } else {
          openingBalance = num;
        }
      }

      toInsert.push({
        companyName,
        proprietorName: item.proprietorName ? String(item.proprietorName).trim() : null,
        mobile: item.mobile ? String(item.mobile).trim() : null,
        alternativeMobile: item.alternativeMobile ? String(item.alternativeMobile).trim() : null,
        email: item.email ? String(item.email).trim() : null,
        address: item.address ? String(item.address).trim() : null,
        binNumber: formattedBin,
        tinNumber: item.tinNumber ? String(item.tinNumber).trim() : item.tin ? String(item.tin).trim() : null,
        tradeLicenseNo: item.tradeLicenseNo ? String(item.tradeLicenseNo).trim() : null,
        customerTypeId: resolvedTypeId,
        referenceId: resolvedRefId,
        vatUserId: item.vatUserId ? String(item.vatUserId).trim() : null,
        vatPassword: item.vatPassword ? String(item.vatPassword).trim() : null,
        vatServiceType: serviceType,
        openingBalance: openingBalance,
        isActive: active,
        createdBy: tenantAdminId,
        notes: item.notes ? String(item.notes).trim() : null
      });
    }

    const insertedList: (typeof clients.$inferSelect)[] = [];
    if (toInsert.length > 0) {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        try {
          const insertedChunk = await db.insert(clients).values(chunk).returning();
          insertedList.push(...insertedChunk);

          if (toInsert.length > 200) {
            const processedCount = Math.min(toInsert.length, i + chunk.length);
            const percent = Math.round((processedCount / toInsert.length) * 100);
            try {
              broadcast(
                "upload:clients:progress",
                {
                  adminId: tenantAdminId,
                  processed: processedCount,
                  total: toInsert.length,
                  percent,
                  timestamp: Date.now()
                },
                { tenant: tenantAdminId }
              );
            } catch (clientErr: unknown) {
              console.warn("[Client Controller Warning]:", (clientErr as Error)?.message || clientErr);
            }
          }
        } catch (e) {
          // Fallback to row-by-row on chunk conflict
          for (const singleItem of chunk) {
            try {
              const [newClient] = await db.insert(clients).values(singleItem).returning();
              if (newClient) insertedList.push(newClient);
            } catch {
              skippedCount++;
            }
          }
        }
      }
    }

    return c.json(
      {
        message: `Successfully uploaded ${insertedList.length} clients${skippedCount > 0 ? ` (${skippedCount} skipped)` : ""}`,
        createdCount: insertedList.length,
        skippedCount
      },
      HttpStatusCodes.OK
    );
  } catch (err: unknown) {
    return c.json({ message: "Failed to bulk upload clients" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
