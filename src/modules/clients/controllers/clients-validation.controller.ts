import { and, eq, ilike, ne, or } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { db, HttpStatusCodes, resolveTenantContext } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { clients } from "../database/models/clients.js";

// ── 7. VALIDATION: GLOBAL BIN UNIQUENESS & BIND STATUS CHECK ─────────

export const checkBinUnique = async (c: AppContext) => {
  try {
    const { bin, excludeId } = c.req.valid("json");
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

    const trimmedBin = bin.trim();
    const conditions = [eq(clients.binNumber, trimmedBin)];
    if (excludeId) {
      conditions.push(ne(clients.id, excludeId));
    }

    const existing = (
      await db
        .select({
          id: clients.id,
          companyName: clients.companyName,
          proprietorName: clients.proprietorName,
          mobile: clients.mobile,
          email: clients.email,
          address: clients.address,
          binNumber: clients.binNumber,
          tinNumber: clients.tinNumber,
          tradeLicenseNo: clients.tradeLicenseNo,
          customerTypeId: clients.customerTypeId,
          referenceId: clients.referenceId,
          vatUserId: clients.vatUserId,
          vatServiceType: clients.vatServiceType,
          isActive: clients.isActive,
          createdBy: clients.createdBy
        })
        .from(clients)
        .where(and(...conditions))
        .limit(1)
    )[0];

    if (!existing) {
      return c.json(
        {
          unique: true,
          status: "AVAILABLE",
          message: "BIN is completely new and available for registration."
        },
        HttpStatusCodes.OK
      );
    }

    if (existing.createdBy === tenantAdminId) {
      return c.json(
        {
          unique: false,
          status: "ALREADY_EXISTS_SAME_FIRM",
          existingClient: existing,
          message: `This BIN is already registered in your organization under "${existing.companyName}".`
        },
        HttpStatusCodes.OK
      );
    }

    if (existing.isActive) {
      // Active under another firm -> LOCKED / DUES PROTECTION!
      return c.json(
        {
          unique: false,
          status: "LOCKED_BY_OTHER_FIRM",
          existingClient: { companyName: existing.companyName, binNumber: existing.binNumber },
          message: `এই BIN (${trimmedBin}) বর্তমানে অন্য একজন অ্যাডমিনের আন্ডারে সক্রিয় রয়েছে। পূর্ববর্তী অ্যাডমিন থেকে সমস্ত বকেয়া নিষ্পত্তি ও রিলিজ (Release) ছাড়া আপনি একে বাইন্ড করতে পারবেন না।`
        },
        HttpStatusCodes.OK
      );
    } else {
      // Released by previous firm -> READY TO BIND!
      return c.json(
        {
          unique: true,
          status: "RELEASED_AVAILABLE_TO_BIND",
          existingClient: {
            companyName: existing.companyName,
            proprietorName: existing.proprietorName,
            binNumber: existing.binNumber,
            tinNumber: existing.tinNumber
          },
          message: `এই ক্লায়েন্টটি পূর্ববর্তী অ্যাডমিন কর্তৃক রিলিজ (Released) করা হয়েছে। আপনি তথ্য পূরণ করে ক্লায়েন্টটিকে আপনার ফার্মের সাথে Bind করতে পারবেন।`
        },
        HttpStatusCodes.OK
      );
    }
  } catch (err: unknown) {
    return c.json({ message: "Failed to check BIN" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

// ── 8. VALIDATION: CHECK MOBILE DUPLICATE ─────────────────────────────

export const checkMobileExists = async (c: AppContext) => {
  try {
    const { mobile, excludeId } = c.req.valid("json");
    const { isSuperAdmin, tenantAdminId } = await resolveTenantContext(c);
    const conditions = [eq(clients.mobile, mobile.trim())];
    if (excludeId) {
      conditions.push(ne(clients.id, excludeId));
    }
    if (!isSuperAdmin && tenantAdminId) {
      conditions.push(eq(clients.createdBy, tenantAdminId));
    }

    const matches = await db
      .select({ id: clients.id, companyName: clients.companyName, mobile: clients.mobile })
      .from(clients)
      .where(and(...conditions))
      .limit(3);

    return c.json({ matches }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    return c.json({ message: "Failed to check mobile" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
