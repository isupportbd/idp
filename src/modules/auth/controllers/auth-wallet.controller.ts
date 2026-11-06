import { and, eq, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { broadcast, db, HttpStatusCodes, redisClientIfReady } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { paymentSettings } from "@/modules/superadmin/database/models/payment_settings.js";
import { subscriptionTransactions } from "@/modules/superadmin/database/models/subscription_transactions.js";

/**
 * Why: Allows a Tenant (Admin) to submit a wallet recharge request via bKash.
 * When: Tenant needs to cover subscription shortage or add prepaid balance.
 * Where: POST /api/auth/recharge-wallet route.
 */
export const rechargeWallet = async (c: AppContext) => {
  try {
    const auth = c.get("auth");
    if (!auth || !auth.id) {
      return c.json({ success: false, message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const body = c.req.valid("json");
    const paidAmount = Number(body?.paidAmount);
    const trxId = body?.trxId ? String(body.trxId).trim() : "";

    if (!paidAmount || isNaN(paidAmount) || paidAmount <= 0) {
      return c.json({ success: false, message: "Valid paid amount is required" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    if (!trxId) {
      return c.json({ success: false, message: "bKash TrxID is required" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(auth.id)));
    if (!user) {
      return c.json({ success: false, message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const [paymentConfig] = await db.select().from(paymentSettings).limit(1);
    const chargePercent = paymentConfig?.bkashCharge ?? 1.8;
    const gatewayCharge = Math.round((paidAmount * chargePercent) / 100);
    const netAmount = paidAmount - gatewayCharge;

    const [inserted] = await db
      .insert(subscriptionTransactions)
      .values({
        userId: user.id,
        planId: user.planId || null,
        type: "deposit",
        billingCycle: user.billingCycle || "monthly",
        grossAmount: paidAmount,
        gatewayCharge,
        netAmount,
        planRate: 0,
        paidAmount,
        trxId,
        paymentMethod: "bkash",
        status: "pending",
        note: "Wallet recharge request awaiting verification"
      })
      .returning();

    try {
      broadcast(
        "tenant:recharge",
        {
          transactionId: inserted.id,
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          paidAmount,
          gatewayCharge,
          netAmount,
          trxId,
          createdAt: inserted.createdAt
        },
        { roles: ["superadmin"] }
      );
    } catch (err) {
      console.error("Broadcast recharge error:", err);
    }

    return c.json({
      success: true,
      message: "Recharge request submitted successfully! SuperAdmin will verify your payment.",
      data: inserted
    });
  } catch (error: unknown) {
    console.error("Error submitting recharge:", error);
    return c.json({ success: false, message: "Failed to submit recharge" }, 500);
  }
};

/**
 * Why: Allows a Tenant to purchase extra permanent storage add-on (1 GB = ৳1,000).
 * When: Storage reaches 90%+ or tenant wants to expand database quota.
 * Where: POST /api/auth/buy-storage route.
 * Rule: Subscription plan MUST be active to purchase extra storage.
 */
export const buyStorage = async (c: AppContext) => {
  try {
    const auth = c.get("auth");
    if (!auth || !auth.id) {
      return c.json({ success: false, message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(auth.id)));
    if (!user) {
      return c.json({ success: false, message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const tenantAdminId = user.adminId ? Number(user.adminId) : user.id;
    const [tenantAdmin] = await db.select().from(users).where(eq(users.id, tenantAdminId));
    if (!tenantAdmin) {
      return c.json({ success: false, message: "Tenant Admin record not found" }, HttpStatusCodes.NOT_FOUND);
    }

    // Strict Rule: Subscription plan MUST be active to purchase storage
    const isSubscriptionActive = !!(tenantAdmin.expDate && new Date(tenantAdmin.expDate) > new Date());
    if (!isSubscriptionActive) {
      return c.json(
        {
          success: false,
          isSubscriptionInactive: true,
          message:
            "Subscription plan is currently expired or inactive. Extra storage can only be purchased while subscription is active. Please renew your plan first."
        },
        HttpStatusCodes.FORBIDDEN
      );
    }

    const body = c.req.valid("json");
    const gigabytes = Math.max(1, Number(body?.gigabytes) || 1);
    const ratePerGb = 1000;
    const totalRequiredAmount = gigabytes * ratePerGb;
    const paymentSource = body?.paymentSource || "wallet";
    const trxId = body?.trxId ? String(body.trxId).trim() : "";

    if (paymentSource === "wallet") {
      const currentBalance = tenantAdmin.advanceBalance || 0;
      if (currentBalance < totalRequiredAmount) {
        const shortage = totalRequiredAmount - currentBalance;
        return c.json(
          {
            success: false,
            shortage,
            advanceBalance: currentBalance,
            requiredAmount: totalRequiredAmount,
            message: `Insufficient wallet balance. Total cost: ৳${totalRequiredAmount}, Current balance: ৳${currentBalance}. Shortage: ৳${shortage}. Please recharge your wallet first.`
          },
          HttpStatusCodes.BAD_REQUEST
        );
      }

      // Deduct from wallet & credit extra storage immediately
      const newBalance = currentBalance - totalRequiredAmount;
      const extraStorageAddedMB = gigabytes * 1024;
      const newExtraStorageMB = (tenantAdmin.extraStorageMB || 0) + extraStorageAddedMB;

      await db
        .update(users)
        .set({
          advanceBalance: newBalance,
          extraStorageMB: newExtraStorageMB,
          updatedAt: new Date()
        })
        .where(eq(users.id, tenantAdminId));

      await db.insert(subscriptionTransactions).values({
        userId: tenantAdminId,
        planId: tenantAdmin.planId || null,
        type: "storage_addon",
        billingCycle: tenantAdmin.billingCycle || "monthly",
        grossAmount: totalRequiredAmount,
        gatewayCharge: 0,
        netAmount: -totalRequiredAmount,
        planRate: totalRequiredAmount,
        paidAmount: totalRequiredAmount,
        status: "completed",
        note: `Purchased ${gigabytes} GB (+${extraStorageAddedMB} MB) extra storage add-on from prepaid wallet`
      });

      return c.json({
        success: true,
        message: `Successfully purchased ${gigabytes} GB extra storage! New total storage updated.`,
        gigabytes,
        extraStorageMB: newExtraStorageMB,
        advanceBalance: newBalance
      });
    } else {
      if (!trxId) {
        return c.json({ success: false, message: "bKash TrxID is required for manual payment" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
      }

      const [paymentConfig] = await db.select().from(paymentSettings).limit(1);
      const chargePercent = paymentConfig?.bkashCharge ?? 1.8;
      const gatewayCharge = Math.round((totalRequiredAmount * chargePercent) / 100);
      const netAmount = totalRequiredAmount - gatewayCharge;

      const [inserted] = await db
        .insert(subscriptionTransactions)
        .values({
          userId: tenantAdminId,
          planId: tenantAdmin.planId || null,
          type: "storage_addon",
          billingCycle: tenantAdmin.billingCycle || "monthly",
          grossAmount: totalRequiredAmount,
          gatewayCharge,
          netAmount,
          planRate: totalRequiredAmount,
          paidAmount: totalRequiredAmount,
          trxId,
          paymentMethod: "bkash",
          status: "pending",
          note: `Extra storage purchase (${gigabytes} GB) request awaiting verification`
        })
        .returning();

      try {
        broadcast(
          "tenant:recharge",
          {
            transactionId: inserted.id,
            userId: tenantAdminId,
            userName: tenantAdmin.name,
            userEmail: tenantAdmin.email,
            paidAmount: totalRequiredAmount,
            gatewayCharge,
            netAmount,
            trxId,
            type: "storage_addon",
            createdAt: inserted.createdAt
          },
          { roles: ["superadmin"] }
        );
      } catch (bErr) {
        console.error("Broadcast storage request error:", bErr);
      }

      return c.json({
        success: true,
        message: "Storage purchase request submitted successfully! Awaiting verification.",
        transactionId: inserted.id
      });
    }
  } catch (err: unknown) {
    console.error("buyStorage error:", err);
    return c.json({ success: false, message: "Failed to process storage purchase" }, 500);
  }
};
