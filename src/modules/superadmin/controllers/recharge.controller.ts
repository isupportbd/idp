import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppContext } from "@/framework/facade.js";
import { broadcast, db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { paymentSettings } from "@/modules/superadmin/database/models/payment_settings.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { subscriptionTransactions } from "@/modules/superadmin/database/models/subscription_transactions.js";

// 18. Get Pending Wallet Recharge Requests
export async function getPendingRecharges(c: AppContext) {
  try {
    const list = await db
      .select({
        id: subscriptionTransactions.id,
        userId: subscriptionTransactions.userId,
        userName: users.name,
        userEmail: users.email,
        userMobile: users.mobile,
        planId: subscriptionTransactions.planId,
        type: subscriptionTransactions.type,
        grossAmount: subscriptionTransactions.grossAmount,
        gatewayCharge: subscriptionTransactions.gatewayCharge,
        netAmount: subscriptionTransactions.netAmount,
        paidAmount: subscriptionTransactions.paidAmount,
        trxId: subscriptionTransactions.trxId,
        paymentMethod: subscriptionTransactions.paymentMethod,
        billingCycle: subscriptionTransactions.billingCycle,
        note: subscriptionTransactions.note,
        createdAt: subscriptionTransactions.createdAt
      })
      .from(subscriptionTransactions)
      .leftJoin(users, eq(subscriptionTransactions.userId, users.id))
      .where(and(inArray(subscriptionTransactions.type, ["deposit", "storage_addon"]), eq(subscriptionTransactions.status, "pending")))
      .orderBy(desc(subscriptionTransactions.createdAt));

    return c.json({ success: true, data: list });
  } catch (error: unknown) {
    console.error("Error fetching pending recharges:", error);
    return c.json({ success: false, error: "Failed to fetch pending recharges" }, 500);
  }
}

// 19. Approve Wallet Recharge (Credit Balance & Auto-Activate Plan if Sufficient)
export async function approveRecharge(c: AppContext) {
  try {
    const body = c.req.valid("json");
    let rawId = body?.transactionId ?? body?.id ?? body?.userId ?? c.req.param("id") ?? c.req.query("transactionId") ?? c.req.query("id");

    if (typeof rawId === "string") {
      rawId = rawId.replace(/\D/g, "");
    }
    const transactionId = Number(rawId);
    if (!transactionId || isNaN(transactionId)) {
      return c.json({ success: false, message: "Valid transaction ID is required" }, 400);
    }

    const [tx] = await db.select().from(subscriptionTransactions).where(eq(subscriptionTransactions.id, transactionId));

    if (!tx) {
      return c.json({ success: false, message: "Transaction not found" }, 404);
    }

    if (tx.status !== "pending") {
      return c.json({ success: true, message: `Transaction is already ${tx.status}` });
    }

    if (tx.userId === null) {
      return c.json({ success: false, message: "Transaction is missing its user reference" }, 400);
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, tx.userId));
    if (!targetUser) {
      return c.json({ success: false, message: "Tenant user not found" }, 404);
    }

    const [paymentConfig] = await db.select().from(paymentSettings).limit(1);
    const chargePercent = paymentConfig?.bkashCharge ?? 1.8;

    const grossAmount = tx.grossAmount || tx.paidAmount || 0;
    const gatewayCharge =
      tx.gatewayCharge !== null && tx.gatewayCharge !== undefined ? tx.gatewayCharge : Math.round((grossAmount * chargePercent) / 100);
    const netDeposit = tx.netAmount || grossAmount - gatewayCharge;

    const currentAdvance = targetUser.advanceBalance || 0;
    const totalWallet = currentAdvance + netDeposit;

    let plan = null;
    if (targetUser.planId) {
      const [foundPlan] = await db.select().from(plans).where(eq(plans.id, targetUser.planId));
      plan = foundPlan;
    }

    const isYearly =
      targetUser.billingCycle === "yearly" ||
      (targetUser.trxId ? targetUser.trxId.toLowerCase().includes("yearly") || targetUser.trxId.toLowerCase().includes("(y)") : false);
    const planPrice = isYearly ? plan?.rateYearly || 15000 : plan?.rateMonthly || 1500;

    const isExpiredOrInactive = !targetUser.expDate || new Date(targetUser.expDate) < new Date();

    let newExpDate = targetUser.expDate ? new Date(targetUser.expDate) : null;
    let finalAdvanceBalance = totalWallet;
    let planActivated = false;

    let newExtraStorageMB = targetUser.extraStorageMB || 0;
    if (tx.type === "storage_addon") {
      // Storage addon payment is dedicated for storage, not added into spendable advance wallet balance
      finalAdvanceBalance = currentAdvance;
      const gb = Math.max(1, Math.round(grossAmount / 1000));
      newExtraStorageMB += gb * 1024;
    } else {
      // If subscription is expired/inactive and total wallet balance now covers plan fee, auto-activate!
      if (isExpiredOrInactive && totalWallet >= planPrice) {
        finalAdvanceBalance = totalWallet - planPrice;
        planActivated = true;
        newExpDate = new Date();
        if (isYearly) {
          newExpDate.setFullYear(newExpDate.getFullYear() + 1);
        } else {
          newExpDate.setMonth(newExpDate.getMonth() + 1);
        }
      }
    }

    // Update User Balance, Storage & Expiration
    await db
      .update(users)
      .set({
        advanceBalance: finalAdvanceBalance,
        extraStorageMB: newExtraStorageMB,
        expDate: newExpDate,
        status: "active",
        updatedAt: new Date()
      })
      .where(eq(users.id, targetUser.id));

    // Update Recharge Transaction to completed
    await db
      .update(subscriptionTransactions)
      .set({
        status: "completed",
        grossAmount,
        gatewayCharge,
        netAmount: netDeposit,
        excessCredit: netDeposit,
        note:
          tx.type === "storage_addon"
            ? `Storage add-on (+${Math.max(1, Math.round(grossAmount / 1000))} GB) approved by SuperAdmin.`
            : `Recharge approved by SuperAdmin. ${planActivated ? `Plan ${plan?.name || ""} auto-activated.` : ""}`,
        updatedAt: new Date()
      })
      .where(eq(subscriptionTransactions.id, tx.id));

    // If plan auto-activated, insert plan activation record
    if (planActivated) {
      try {
        await db.insert(subscriptionTransactions).values({
          userId: targetUser.id,
          planId: targetUser.planId,
          type: "plan_fee",
          billingCycle: targetUser.billingCycle || "monthly",
          planRate: planPrice,
          paidAmount: 0,
          grossAmount: 0,
          gatewayCharge: 0,
          netAmount: -planPrice,
          excessCredit: 0,
          daysAdded: isYearly ? 365 : 30,
          paymentMethod: "wallet_balance",
          trxId: "WALLET-DEDUCTION",
          status: "completed",
          note: `Plan activated using available wallet balance after recharge verification.`
        });
      } catch (txErr) {
        console.error("Failed to log plan activation transaction:", txErr);
      }
    }

    // Broadcast Realtime Events
    try {
      broadcast(
        "tenant:recharge:approved",
        {
          transactionId: tx.id,
          userId: targetUser.id,
          planActivated,
          newBalance: finalAdvanceBalance
        },
        { users: [targetUser.id] }
      );
      broadcast("user:updated", { userId: targetUser.id }, { users: [targetUser.id] });
    } catch (bErr) {
      console.error("Broadcast error:", bErr);
    }

    return c.json({
      success: true,
      message: `Recharge of ৳${grossAmount} (Net: ৳${netDeposit}) approved successfully.${planActivated ? " Plan activated!" : ""}`,
      data: {
        transactionId: tx.id,
        netDeposit,
        finalAdvanceBalance,
        planActivated,
        expDate: newExpDate
      }
    });
  } catch (error: unknown) {
    console.error("Error approving recharge:", error);
    return c.json({ success: false, message: "Failed to approve recharge" }, 500);
  }
}

// 20. Reject Wallet Recharge
export async function rejectRecharge(c: AppContext) {
  try {
    const body = c.req.valid("json");
    let rawId = body?.transactionId ?? body?.id ?? body?.userId ?? c.req.param("id") ?? c.req.query("transactionId") ?? c.req.query("id");

    if (typeof rawId === "string") {
      rawId = rawId.replace(/\D/g, "");
    }
    const transactionId = Number(rawId);
    const reason = body?.reason || "Rejected by SuperAdmin (Invalid TrxID or payment not received)";

    if (!transactionId || isNaN(transactionId)) {
      return c.json({ success: false, message: "Valid transaction ID is required" }, 400);
    }

    const [tx] = await db.select().from(subscriptionTransactions).where(eq(subscriptionTransactions.id, transactionId));

    if (!tx) {
      return c.json({ success: false, message: "Transaction not found" }, 404);
    }

    await db
      .update(subscriptionTransactions)
      .set({
        status: "rejected",
        note: reason,
        updatedAt: new Date()
      })
      .where(eq(subscriptionTransactions.id, transactionId));

    return c.json({ success: true, message: "Recharge request rejected" });
  } catch (error: unknown) {
    console.error("Error rejecting recharge:", error);
    return c.json({ success: false, message: "Failed to reject recharge" }, 500);
  }
}
