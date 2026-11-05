import type { AppContext } from "@/framework/facade.js";
import { broadcast, cache, db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { bills } from "@/modules/billing/database/models/bills.js";
import { paymentSettings } from "@/modules/superadmin/database/models/payment_settings.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { purchases } from "@/modules/purchases/database/models/purchases.js";
import { vatSubmissions } from "@/modules/submissions/database/models/vat_submissions.js";
import { subscriptionTransactions } from "@/modules/superadmin/database/models/subscription_transactions.js";
import { eq, desc, asc, and, or, ne, isNotNull, isNull, sql, inArray } from "drizzle-orm";


export function notifySettingsUpdated(settingType: string) {
  try {
    cache.forget(`master:${settingType}`);
    cache.forgetByPrefix(`master:${settingType}:`);
    broadcast("global:settings-updated", { type: settingType, timestamp: Date.now() }, { auth: true });
  } catch (err) {
    console.error(`Failed to broadcast ${settingType} update:`, err);
  }
}


// 8. Payment Settings (bKash Gateway)
export async function getPaymentSettings(c: AppContext) {
  try {
    let [config] = await db.select().from(paymentSettings).limit(1);
    if (!config) {
      [config] = await db.insert(paymentSettings).values({
        bkashNumber: "01719950891",
        bkashCharge: 1.8
      }).returning();
    }
    const sanitized = {
      id: config.id,
      bkashNumber: config.bkashNumber,
      bkashCharge: config.bkashCharge,
      nagadNumber: config.nagadNumber,
      rocketNumber: config.rocketNumber,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt
    };
    return c.json({ success: true, data: sanitized });
  } catch (error: unknown) {
    console.error("Error fetching payment settings:", error);
    return c.json({ success: false, error: "Failed to fetch payment settings" }, 500);
  }
}

export async function savePaymentSettings(c: AppContext) {
  try {
    const body = c.req.valid("json");
    let [existing] = await db.select().from(paymentSettings).limit(1);

    if (existing) {
      const [updated] = await db.update(paymentSettings).set({
        bkashNumber: body.bkashNumber,
        bkashCharge: Number(body.bkashCharge || 1.8),
        nagadNumber: body.nagadNumber,
        rocketNumber: body.rocketNumber,
        updatedAt: new Date()
      }).where(eq(paymentSettings.id, existing.id)).returning();
      notifySettingsUpdated("payment-settings");
      return c.json({ success: true, message: "Payment settings updated", data: updated });
    } else {
      const [created] = await db.insert(paymentSettings).values({
        bkashNumber: body.bkashNumber,
        bkashCharge: Number(body.bkashCharge || 1.8),
        nagadNumber: body.nagadNumber,
        rocketNumber: body.rocketNumber
      }).returning();
      notifySettingsUpdated("payment-settings");
      return c.json({ success: true, message: "Payment settings saved", data: created });
    }
  } catch (error: unknown) {
    console.error("Error saving payment settings:", error);
    return c.json({ success: false, error: "Failed to save payment settings" }, 500);
  }
}

// 9. Storage Stats & Tenant-wise Usage Ranking
export async function getStorageStats(c: AppContext) {
  try {
    let dbSizeMB = 0;
    let tablesCount = 0;

    try {
      const dbResult = await db.execute(sql`
        SELECT ROUND(SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) / 1024.0 / 1024.0, 2) as sizeMB,
               COUNT(tablename) as tables_count
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);
      const rows = Array.isArray(dbResult) ? dbResult : (dbResult as any).rows;
      if (rows && rows.length > 0) {
        dbSizeMB = Number(rows[0].sizemb || rows[0].sizeMB || 0);
        tablesCount = Number(rows[0].tables_count || 0);
      }
    } catch (err) {
      console.warn("Failed to compute database storage size stats:", err);
    }

    const [clientsTotal] = await db.select({ count: sql<number>`count(*)` }).from(clients);
    const [usersTotal] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [submissionsTotal] = await db.select({ count: sql<number>`count(*)` }).from(vatSubmissions);
    const [billsTotal] = await db.select({ count: sql<number>`count(*)` }).from(bills);

    const totalClients = Number(clientsTotal?.count || 0);
    const totalUsers = Number(usersTotal?.count || 0);
    const totalSubmissions = Number(submissionsTotal?.count || 0);
    const totalBills = Number(billsTotal?.count || 0);
    const totalRowsCount = totalClients + totalUsers + totalSubmissions + totalBills;

    // Fetch non-superadmin tenants
    const superadminRole = await db.query.roles.findFirst({
      where: eq(roles.name, "superadmin")
    });
    const superadminRoleId = superadminRole?.id ?? -1;

    const adminRole = await db.query.roles.findFirst({
      where: eq(roles.name, "admin")
    });
    const adminRoleId = adminRole?.id ?? -1;

    // Fetch all plans to map storage quotas
    const allPlansList = await db.select().from(plans);
    const plansMap = new Map<number, any>(allPlansList.map((p) => [p.id, p]));

    const tenantsList = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mobile: users.mobile,
        status: users.status,
        planId: users.planId,
        extraStorageMB: users.extraStorageMB,
        createdAt: users.createdAt
      })
      .from(users)
      .where(
        and(
          ne(users.status, "pending"),
          or(
            eq(users.roleId, adminRoleId),
            eq(users.adminId, users.id),
            and(isNull(users.adminId), ne(users.roleId, superadminRoleId))
          )
        )
      )
      .orderBy(desc(users.createdAt));

    const tenantStatsRaw = await Promise.all(
      tenantsList.map(async (t) => {
        // Count purchases created by or associated with tenant
        const [purchasesCountRes] = await db
          .select({ count: sql<number>`count(*)` })
          .from(purchases)
          .where(eq(purchases.adminId, t.id));

        const pCount = Number(purchasesCountRes?.count || 0);

        // Count clients created by or associated with tenant
        const [clientCountRes] = await db
          .select({ count: sql<number>`count(*)` })
          .from(clients)
          .where(eq(clients.createdBy, t.id));

        const cCount = Number(clientCountRes?.count || 0);

        // Count submissions submitted by tenant
        const [submissionCountRes] = await db
          .select({ count: sql<number>`count(*)` })
          .from(vatSubmissions)
          .where(eq(vatSubmissions.submittedBy, t.id));

        const sCount = Number(submissionCountRes?.count || 0);

        // Count bills created by tenant
        const [billCountRes] = await db
          .select({ count: sql<number>`count(*)` })
          .from(bills)
          .where(eq(bills.createdBy, t.id));

        const bCount = Number(billCountRes?.count || 0);

        // Calculate total business records
        const totalRecords = pCount + cCount + sCount + bCount;

        const tenantPlan = t.planId ? plansMap.get(t.planId) : null;
        const baseStorageMB = tenantPlan?.maxStorageMB || 1024;
        const extraStorageMB = t.extraStorageMB || 0;
        const maxStorageMB = baseStorageMB + extraStorageMB;
        const planName = tenantPlan?.name || "Starter";

        return {
          id: t.id,
          name: t.name,
          email: t.email,
          mobile: t.mobile,
          status: t.status,
          planId: t.planId,
          planName,
          baseStorageMB,
          extraStorageMB,
          maxStorageMB,
          createdAt: t.createdAt,
          clientsCount: cCount,
          submissionsCount: sCount,
          billsCount: bCount,
          purchasesCount: pCount,
          totalRecords
        };
      })
    );

    // Sort by Total Records Descending (Rank #1 at top)
    const sortedTenants = [...tenantStatsRaw].sort((a, b) => b.totalRecords - a.totalRecords);

    // Assign Rank and calculate storage footprint against plan quota
    const tenantBreakdown = sortedTenants.map((t, index) => {
      // Estimated data footprint in KB / MB (~3.2 KB per record with indices and history)
      const estimatedKB = Math.round(t.totalRecords * 3.2);
      const estimatedMB = Number((estimatedKB / 1024).toFixed(2));
      const usagePercent = Number(((estimatedMB / t.maxStorageMB) * 100).toFixed(2));

      return {
        ...t,
        rank: index + 1,
        usagePercent,
        estimatedKB,
        estimatedMB
      };
    });

    const now = new Date();
    const lastMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    return c.json({
      success: true,
      data: {
        dbSizeMB: dbSizeMB > 0 ? dbSizeMB : 18.5,
        tablesCount: tablesCount > 0 ? tablesCount : 18,
        totalRows: totalRowsCount,
        totalClients,
        totalUsers,
        totalSubmissions,
        totalBills,
        tenantsCount: tenantsList.length,
        rankingResetTime: "12:00 AM Daily",
        lastCalculated: lastMidnight.toISOString(),
        tenantBreakdown
      }
    });
  } catch (error: unknown) {
    console.error("Error fetching storage stats:", error);
    return c.json({ success: false, error: "Failed to fetch storage stats" }, 500);
  }
}

// 16. Public Platform Stats (For Login & Landing Pages)
export async function getPlatformPublicStats(c: AppContext) {
  try {
    const superadminRole = await db.query.roles.findFirst({
      where: eq(roles.name, "superadmin")
    });
    const superadminRoleId = superadminRole?.id ?? -1;

    const adminRole = await db.query.roles.findFirst({
      where: eq(roles.name, "admin")
    });
    const adminRoleId = adminRole?.id ?? -1;

    // Count tenants (firm admins)
    const [tenantCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(
        and(
          eq(users.status, "active"),
          or(
            eq(users.roleId, adminRoleId),
            eq(users.adminId, users.id),
            and(isNull(users.adminId), ne(users.roleId, superadminRoleId))
          )
        )
      );

    // Count all users
    const [allUsersCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users);

    // Count clients
    const [clientsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clients);

    const tenants = Number(tenantCount?.count || 0);
    const totalUsers = Number(allUsersCount?.count || 0);
    const totalClients = Number(clientsCount?.count || 0);

    return c.json({
      success: true,
      data: {
        tenants: tenants > 0 ? `${tenants}+` : "0",
        users: totalUsers > 0 ? `${totalUsers}+` : "0",
        clients: totalClients > 0 ? `${totalClients}+` : "0"
      }
    });
  } catch (error: unknown) {
    return c.json({
      success: true,
      data: {
        tenants: "0",
        users: "0",
        clients: "0"
      }
    });
  }
}

// 16b. System-wide metrics for the SuperAdmin Global Reports page
export async function getGlobalMetrics(c: AppContext) {
  try {
    const superadminRole = await db.query.roles.findFirst({ where: eq(roles.name, "superadmin") });
    const superadminRoleId = superadminRole?.id ?? -1;
    const adminRole = await db.query.roles.findFirst({ where: eq(roles.name, "admin") });
    const adminRoleId = adminRole?.id ?? -1;

    // Same tenant definition as getPlatformPublicStats
    const [tenantCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(
        and(
          eq(users.status, "active"),
          or(
            eq(users.roleId, adminRoleId),
            eq(users.adminId, users.id),
            and(isNull(users.adminId), ne(users.roleId, superadminRoleId))
          )
        )
      );

    const [clientsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(clients)
      .where(eq(clients.isActive, true));

    const [purchaseTotals] = await db
      .select({
        count: sql<number>`count(*)`,
        taxVolume: sql<number>`coalesce(sum(coalesce(${purchases.cd}, 0) + coalesce(${purchases.rd}, 0) + coalesce(${purchases.sd}, 0) + coalesce(${purchases.vat}, 0) + coalesce(${purchases.at}, 0)), 0)`,
        vatVolume: sql<number>`coalesce(sum(coalesce(${purchases.vat}, 0)), 0)`
      })
      .from(purchases);

    return c.json({
      success: true,
      summary: {
        totalTenants: Number(tenantCount?.count || 0),
        totalClients: Number(clientsCount?.count || 0),
        totalPurchases: Number(purchaseTotals?.count || 0),
        totalTaxVolume: Number(purchaseTotals?.taxVolume || 0),
        totalVatVolume: Number(purchaseTotals?.vatVolume || 0)
      }
    });
  } catch (error: unknown) {
    return c.json({ success: false, message: "Failed to load metrics" }, 500);
  }
}

// 17. Live Notifications for SuperAdmin (Pending signups, wallet recharges & alerts)
export async function getNotifications(c: AppContext) {
  try {
    const pendingUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mobile: users.mobile,
        status: users.status,
        planId: users.planId,
        trxId: users.trxId,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.status, "pending"))
      .orderBy(desc(users.createdAt));

    const signupNotifs = await Promise.all(
      pendingUsers.map(async (u) => {
        let planName = "Standard Plan";
        if (u.planId) {
          const [foundPlan] = await db.select().from(plans).where(eq(plans.id, u.planId));
          if (foundPlan?.name) planName = foundPlan.name;
        }
        return {
          id: -u.id,
          type: "signup_request",
          message: `New Tenant Registration: ${u.name} (${u.email}) - Plan: ${planName} - TrxID: ${u.trxId || "N/A"}`,
          createdAt: u.createdAt,
          userId: u.id,
          userName: u.name,
          userEmail: u.email,
          trxId: u.trxId
        };
      })
    );

    const pendingTransactions = await db
      .select({
        id: subscriptionTransactions.id,
        userId: subscriptionTransactions.userId,
        userName: users.name,
        userEmail: users.email,
        type: subscriptionTransactions.type,
        grossAmount: subscriptionTransactions.grossAmount,
        gatewayCharge: subscriptionTransactions.gatewayCharge,
        netAmount: subscriptionTransactions.netAmount,
        paidAmount: subscriptionTransactions.paidAmount,
        trxId: subscriptionTransactions.trxId,
        paymentMethod: subscriptionTransactions.paymentMethod,
        note: subscriptionTransactions.note,
        createdAt: subscriptionTransactions.createdAt
      })
      .from(subscriptionTransactions)
      .leftJoin(users, eq(subscriptionTransactions.userId, users.id))
      .where(
        and(
          inArray(subscriptionTransactions.type, ["deposit", "storage_addon"]),
          eq(subscriptionTransactions.status, "pending")
        )
      )
      .orderBy(desc(subscriptionTransactions.createdAt));

    const rechargeNotifs = pendingTransactions.map((tx) => {
      const isStorage = tx.type === "storage_addon";
      return {
        id: `tx-${tx.id}`,
        type: isStorage ? "storage_request" : "recharge_request",
        transactionId: tx.id,
        userId: tx.userId,
        userName: tx.userName || "Tenant",
        userEmail: tx.userEmail || "",
        grossAmount: tx.grossAmount || tx.paidAmount || 0,
        gatewayCharge: tx.gatewayCharge || 0,
        netAmount: tx.netAmount || ((tx.grossAmount || tx.paidAmount || 0) - (tx.gatewayCharge || 0)),
        trxId: tx.trxId,
        message: isStorage
          ? `Storage Add-on: ${tx.userName || "Tenant"} requested extra storage (Paid: ৳${tx.paidAmount}, Net: ৳${tx.netAmount}) - bKash TrxID: ${tx.trxId || "N/A"}`
          : `Wallet Recharge: ${tx.userName || "Tenant"} deposited ৳${tx.paidAmount} (Net: ৳${tx.netAmount}) - bKash TrxID: ${tx.trxId || "N/A"}`,
        createdAt: tx.createdAt
      };
    });

    return c.json({ success: true, data: [...signupNotifs, ...rechargeNotifs] });
  } catch (error: unknown) {
    console.error("Error fetching notifications:", error);
    return c.json({ success: true, data: [] });
  }
}

