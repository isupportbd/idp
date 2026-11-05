import type { AppContext } from "@/framework/facade.js";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { paymentSettings } from "@/modules/superadmin/database/models/payment_settings.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { purchases } from "@/modules/purchases/database/models/purchases.js";
import { vatSubmissions } from "@/modules/submissions/database/models/vat_submissions.js";
import { bills } from "@/modules/billing/database/models/bills.js";
import { subscriptionTransactions } from "@/modules/superadmin/database/models/subscription_transactions.js";
import { eq, desc, asc, and, or, ne, isNotNull, isNull, sql, inArray } from "drizzle-orm";


// 1. Get All Active Tenants (Firm Admins)
export async function getTenants(c: AppContext) {
  try {
    const superadminRole = await db.query.roles.findFirst({
      where: eq(roles.name, "superadmin")
    });
    const superadminRoleId = superadminRole?.id ?? -1;

    const adminRole = await db.query.roles.findFirst({
      where: eq(roles.name, "admin")
    });
    const adminRoleId = adminRole?.id ?? -1;

    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mobile: users.mobile,
        status: users.status,
        planId: users.planId,
        billingCycle: users.billingCycle,
        trxId: users.trxId,
        paidAmount: users.paidAmount,
        advanceBalance: users.advanceBalance,
        expDate: users.expDate,
        createdAt: users.createdAt,
        roleName: roles.name
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
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

    // Batch fetch plans and client counts in single aggregated queries to prevent N+1 overhead
    const allPlans = await db.select().from(plans);
    const plansMap = new Map<number, typeof allPlans[number]>();
    for (const p of allPlans) {
      plansMap.set(p.id, p);
    }

    // Group client counts by createdBy in 1 single query
    const clientCounts = await db
      .select({
        createdBy: clients.createdBy,
        count: sql<number>`count(*)`
      })
      .from(clients)
      .groupBy(clients.createdBy);

    const clientCountMap = new Map<number, number>();
    for (const row of clientCounts) {
      if (row.createdBy !== null) {
        clientCountMap.set(row.createdBy, Number(row.count || 0));
      }
    }

    const tenantList = allUsers.map((t) => {
      const plan = t.planId ? plansMap.get(t.planId) : null;
      return {
        ...t,
        clientsCount: clientCountMap.get(t.id) || 0,
        planName: plan?.name || "Standard Firm Plan",
        planMaxUsers: plan?.maxUsers || 5,
        planMaxClients: plan?.maxClients || 50,
        planMaxStorageMB: plan?.maxStorageMB || 1024,
        planHasAccounts: plan?.hasAccounts ?? false
      };
    });

    return c.json({ success: true, data: tenantList });
  } catch (error: unknown) {
    console.error("Error fetching tenants:", error);
    return c.json({ success: false, error: "Failed to fetch tenants" }, 500);
  }
}

// 2. Get Pending Signups
export async function getPendingSignups(c: AppContext) {
  try {
    const pendingUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mobile: users.mobile,
        status: users.status,
        planId: users.planId,
        billingCycle: users.billingCycle,
        trxId: users.trxId,
        paidAmount: users.paidAmount,
        advanceBalance: users.advanceBalance,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.status, "pending"))
      .orderBy(desc(users.createdAt));

    const [paymentConfig] = await db.select().from(paymentSettings).limit(1);
    const chargePercent = paymentConfig?.bkashCharge ?? 1.8;

    const allPlans = await db.select().from(plans);
    const plansMap = new Map<number, typeof allPlans[number]>();
    for (const p of allPlans) {
      plansMap.set(p.id, p);
    }

    const enriched = pendingUsers.map((u) => {
      const plan = u.planId ? plansMap.get(u.planId) : null;

      const isYearly = u.billingCycle === "yearly" || (u.trxId
        ? (u.trxId.toLowerCase().includes("yearly") || u.trxId.toLowerCase().includes("(y)"))
        : false);
      const planPrice = isYearly ? (plan?.rateYearly || 15000) : (plan?.rateMonthly || 1500);
      const grossAmount = u.paidAmount || planPrice;
      const gatewayCharge = Math.round((grossAmount * chargePercent) / 100);
      const netAmount = grossAmount - gatewayCharge;
      const willActivate = netAmount >= planPrice;
      const shortage = willActivate ? 0 : (planPrice - netAmount);
      const excessCredit = willActivate ? (netAmount - planPrice) : 0;

      return {
        ...u,
        planName: plan?.name || "Standard Plan",
        rateMonthly: plan?.rateMonthly || 1500,
        rateYearly: plan?.rateYearly || 15000,
        planPrice,
        grossAmount,
        chargePercent,
        gatewayCharge,
        netAmount,
        willActivate,
        shortage,
        excessCredit,
        requiredFee: planPrice
      };
    });

    return c.json({ success: true, data: enriched });
  } catch (error: unknown) {
    console.error("Error fetching pending signups:", error);
    return c.json({ success: false, error: "Failed to fetch pending signups" }, 500);
  }
}

// 3. Approve Signup (Credit Wallet Net Balance & Auto-Activate Plan if Sufficient)
export async function approveSignup(c: AppContext) {
  try {
    const body = c.req.valid("json");
    const userId = Number(body?.userId);
    const rawDays = body?.days ? Number(body.days) : undefined;
    const days = rawDays && !isNaN(rawDays) && rawDays > 0 ? rawDays : undefined;

    if (!userId || isNaN(userId)) return c.json({ success: false, message: "Valid User ID is required", error: "Valid User ID is required" }, 400);

    const [targetUser] = await db.select().from(users).where(eq(users.id, userId));
    if (!targetUser) return c.json({ success: false, message: "Tenant not found", error: "Tenant not found" }, 404);

    let plan = null;
    if (targetUser.planId) {
      const [foundPlan] = await db.select().from(plans).where(eq(plans.id, targetUser.planId));
      plan = foundPlan;
    }

    const [paymentConfig] = await db.select().from(paymentSettings).limit(1);
    const chargePercent = paymentConfig?.bkashCharge ?? 1.8;
    const isYearly = targetUser.billingCycle === "yearly" || (targetUser.trxId
      ? (targetUser.trxId.toLowerCase().includes("yearly") || targetUser.trxId.toLowerCase().includes("(y)"))
      : false);
    const planPrice = isYearly ? (plan?.rateYearly || 15000) : (plan?.rateMonthly || 1500);

    const grossPaid = targetUser.paidAmount || 0;
    const gatewayCharge = Math.round((grossPaid * chargePercent) / 100);
    const netDeposit = grossPaid - gatewayCharge;
    const totalWallet = (targetUser.advanceBalance || 0) + netDeposit;

    let newExpDate: Date | null = null;
    let finalAdvanceBalance = totalWallet;
    let isPlanActivated = false;

    // If total wallet balance covers the plan price, activate and deduct plan fee
    if (totalWallet >= planPrice) {
      finalAdvanceBalance = totalWallet - planPrice;
      isPlanActivated = true;
      newExpDate = new Date();
      if (days && days > 0) {
        newExpDate.setDate(newExpDate.getDate() + Number(days));
      } else {
        if (isYearly) {
          newExpDate.setFullYear(newExpDate.getFullYear() + 1);
        } else {
          newExpDate.setMonth(newExpDate.getMonth() + 1);
        }
      }
    }

    const adminRole = await db.query.roles.findFirst({
      where: eq(roles.name, "admin")
    });

    await db
      .update(users)
      .set({
        status: "active",
        roleId: targetUser.roleId || adminRole?.id || 1,
        expDate: newExpDate,
        advanceBalance: finalAdvanceBalance,
        adminId: userId, // Firm owner is self-admin
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    const cleanTrxId = targetUser.trxId
      ? targetUser.trxId.replace(/\s*\((monthly|yearly|m|y)\)/gi, "").trim()
      : null;

    // 1. Update/Complete Deposit Transaction
    try {
      await db
        .update(subscriptionTransactions)
        .set({
          status: "completed",
          grossAmount: grossPaid,
          gatewayCharge,
          netAmount: netDeposit,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(subscriptionTransactions.userId, userId),
            eq(subscriptionTransactions.status, "pending"),
            eq(subscriptionTransactions.type, "deposit")
          )
        );
    } catch (txErr) {
      console.error("Failed to update pending deposit transaction:", txErr);
    }

    // 2. If plan was activated, insert plan fee deduction transaction
    if (isPlanActivated) {
      try {
        const addedDays = days && days > 0 ? Number(days) : (isYearly ? 365 : 30);
        await db.insert(subscriptionTransactions).values({
          userId,
          planId: targetUser.planId || null,
          type: "plan_fee",
          billingCycle: isYearly ? "yearly" : "monthly",
          grossAmount: planPrice,
          gatewayCharge: 0,
          netAmount: -planPrice,
          planRate: planPrice,
          paidAmount: planPrice,
          excessCredit: finalAdvanceBalance,
          trxId: cleanTrxId,
          paymentMethod: "bkash",
          daysAdded: addedDays,
          status: "completed",
          note: `Plan activated (${isYearly ? "Yearly" : "Monthly"} cycle)`
        });
      } catch (txDeductErr) {
        console.error("Failed to log plan fee deduction transaction:", txDeductErr);
      }
    }

    return c.json({
      success: true,
      message: isPlanActivated
        ? "Tenant approved and subscription activated successfully"
        : "Deposit approved. Tenant account is active, awaiting additional recharge to cover plan price.",
      expDate: newExpDate,
      advanceBalance: finalAdvanceBalance,
      isPlanActivated
    });
  } catch (error: unknown) {
    console.error("Error approving tenant:", error);
    return c.json({ success: false, error: "Failed to approve tenant" }, 500);
  }
}

// 4. Reject Signup (Delete record)
export async function rejectSignup(c: AppContext) {
  try {
    const { userId } = c.req.valid("json");
    if (!userId) return c.json({ success: false, error: "User ID is required" }, 400);

    await db.delete(users).where(eq(users.id, userId));
    return c.json({ success: true, message: "Pending registration rejected and removed" });
  } catch (error: unknown) {
    console.error("Error rejecting tenant:", error);
    return c.json({ success: false, error: "Failed to reject tenant" }, 500);
  }
}

// 5. Extend Tenant Subscription
export async function extendTenant(c: AppContext) {
  try {
    const id = parseInt(c.req.param("id") ?? "");
    const { days } = c.req.valid("json");

    if (isNaN(id) || !days || days < 1) {
      return c.json({ success: false, error: "Valid ID and days are required" }, 400);
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, id));
    if (!targetUser) return c.json({ success: false, error: "Tenant not found" }, 404);

    let currentExp = targetUser.expDate ? new Date(targetUser.expDate) : new Date();
    if (currentExp < new Date()) currentExp = new Date();

    currentExp.setDate(currentExp.getDate() + Number(days));

    await db
      .update(users)
      .set({ expDate: currentExp, status: "active", updatedAt: new Date() })
      .where(eq(users.id, id));

    // Record manual subscription extension in history ledger
    try {
      await db.insert(subscriptionTransactions).values({
        userId: id,
        planId: targetUser.planId || null,
        type: "extension",
        billingCycle: "custom",
        grossAmount: 0,
        gatewayCharge: 0,
        netAmount: 0,
        planRate: 0,
        paidAmount: 0,
        excessCredit: 0,
        trxId: null,
        paymentMethod: "admin_manual",
        daysAdded: Number(days),
        status: "completed",
        note: `Subscription extended by ${days} days by SuperAdmin`
      });
    } catch (txErr) {
      console.error("Failed to log subscription transaction:", txErr);
    }

    return c.json({ success: true, message: `Subscription extended by ${days} days`, expDate: currentExp });
  } catch (error: unknown) {
    console.error("Error extending tenant:", error);
    return c.json({ success: false, error: "Failed to extend subscription" }, 500);
  }
}

// 5.1 Get Tenant Transaction / Payment History
export async function getTenantTransactions(c: AppContext) {
  try {
    const id = parseInt(c.req.param("id") ?? "");
    if (isNaN(id)) return c.json({ success: false, error: "Valid ID is required" }, 400);

    const [tenant] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        mobile: users.mobile,
        status: users.status,
        planId: users.planId,
        trxId: users.trxId,
        paidAmount: users.paidAmount,
        advanceBalance: users.advanceBalance,
        expDate: users.expDate,
        createdAt: users.createdAt,
        roleName: roles.name
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id));

    if (!tenant) return c.json({ success: false, error: "Tenant not found" }, 404);

    let plan = null;
    if (tenant.planId) {
      const [foundPlan] = await db.select().from(plans).where(eq(plans.id, tenant.planId));
      plan = foundPlan;
    }

    const history = await db
      .select({
        id: subscriptionTransactions.id,
        userId: subscriptionTransactions.userId,
        planId: subscriptionTransactions.planId,
        planName: plans.name,
        billingCycle: subscriptionTransactions.billingCycle,
        planRate: subscriptionTransactions.planRate,
        paidAmount: subscriptionTransactions.paidAmount,
        excessCredit: subscriptionTransactions.excessCredit,
        trxId: subscriptionTransactions.trxId,
        paymentMethod: subscriptionTransactions.paymentMethod,
        daysAdded: subscriptionTransactions.daysAdded,
        status: subscriptionTransactions.status,
        note: subscriptionTransactions.note,
        createdAt: subscriptionTransactions.createdAt
      })
      .from(subscriptionTransactions)
      .leftJoin(plans, eq(subscriptionTransactions.planId, plans.id))
      .where(eq(subscriptionTransactions.userId, id))
      .orderBy(desc(subscriptionTransactions.createdAt));

    return c.json({
      success: true,
      data: {
        tenant: {
          ...tenant,
          planName: plan?.name || "Standard Firm Plan",
          planMaxUsers: plan?.maxUsers || 5,
          planMaxClients: plan?.maxClients || 50,
          planMaxStorageMB: plan?.maxStorageMB || 1024,
          planHasAccounts: plan?.hasAccounts ?? false
        },
        transactions: history
      }
    });
  } catch (error: unknown) {
    console.error("Error fetching tenant transactions:", error);
    return c.json({ success: false, error: "Failed to fetch transaction history" }, 500);
  }
}

// 6. Toggle Tenant Status (Active / Suspended)
export async function toggleTenantStatus(c: AppContext) {
  try {
    const id = parseInt(c.req.param("id") ?? "");
    if (isNaN(id)) return c.json({ success: false, error: "Valid ID is required" }, 400);

    const [targetUser] = await db
      .select({
        id: users.id,
        status: users.status,
        roleName: roles.name
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id));

    if (!targetUser) return c.json({ success: false, error: "Tenant not found" }, 404);
    if (targetUser.roleName === "superadmin") {
      return c.json({ success: false, error: "SuperAdmin status cannot be modified" }, 403);
    }

    const nextStatus = targetUser.status === "active" ? "suspended" : "active";

    await db.update(users).set({ status: nextStatus, updatedAt: new Date() }).where(eq(users.id, id));
    return c.json({ success: true, status: nextStatus, message: `Tenant status set to ${nextStatus}` });
  } catch (error: unknown) {
    console.error("Error toggling tenant status:", error);
    return c.json({ success: false, error: "Failed to toggle status" }, 500);
  }
}

// 7. Delete Tenant Permanently
export async function deleteTenant(c: AppContext) {
  try {
    const id = parseInt(c.req.param("id") ?? "");
    if (isNaN(id)) return c.json({ success: false, error: "Valid ID is required" }, 400);

    const [targetUser] = await db
      .select({
        id: users.id,
        name: users.name,
        roleName: roles.name
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.id, id));

    if (!targetUser) return c.json({ success: false, error: "Tenant not found" }, 404);
    if (targetUser.roleName === "superadmin") {
      return c.json({ success: false, error: "Cannot delete SuperAdmin account" }, 403);
    }

    await db.delete(users).where(eq(users.id, id));
    return c.json({ success: true, message: `Tenant "${targetUser.name}" deleted permanently` });
  } catch (error: unknown) {
    console.error("Error deleting tenant:", error);
    return c.json({ success: false, error: "Failed to delete tenant. Please ensure associated client records are unassigned or handled first." }, 500);
  }
}
