import type { AppContext } from "@/framework/facade.js";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import {
  broadcast,
  db,
  dispatchProviderSms,
  fetchProviderBalance,
  HttpStatusCodes
} from "@/framework/facade.js";
import { refreshTokens, users } from "@/modules/auth/database/models/user.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";

/**
 * Why: Returns live online & active user stats for Admin / SuperAdmin headers.
 * When: Called periodically by Header.vue to show live active & online counter.
 * Where: GET /api/auth/users-stats
 */
export const getUserStats = async (c: AppContext) => {
  try {
    const auth = c.get("auth") || c.get("user");
    if (!auth || !auth.id) {
      return c.json({ success: false, message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const currentUserId = Number(auth.id);

    // Fetch fresh user record from DB to ensure live adminId & role
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, currentUserId),
      with: { role: true }
    });

    if (!currentUser) {
      return c.json({ success: false, message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const currentUserRole = currentUser.role?.name || "user";
    const isSuperAdmin = currentUserRole === "superadmin";

    // Update current user's updatedAt as heartbeat
    try {
      await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, currentUserId));
    } catch (err) {
      console.warn("Failed to update user heartbeat timestamp:", err);
    }

    let rawUsers: (typeof users.$inferSelect & { role?: { name?: string; slug?: string } | null })[] = [];
    if (isSuperAdmin) {
      // SuperAdmin sees all system users
      rawUsers = await db.query.users.findMany({
        with: { role: true }
      });
    } else {
      // For Admin and User:
      // If user is a regular operator, currentUser.adminId points to their Admin.
      // If user is the Admin (Firm Owner), targetAdminId is currentUserId.
      const targetAdminId = currentUser.adminId ? Number(currentUser.adminId) : currentUserId;
      rawUsers = await db.query.users.findMany({
        where: or(eq(users.adminId, targetAdminId), eq(users.id, targetAdminId)),
        with: { role: true }
      });
    }

    // Deduplicate distinct user accounts by ID
    const uniqueMap = new Map<number, typeof rawUsers[0]>();
    for (const u of rawUsers) {
      if (!uniqueMap.has(u.id)) {
        uniqueMap.set(u.id, u);
      }
    }
    const userList = Array.from(uniqueMap.values());

    // Fetch active unrevoked refresh tokens to know which users actually have a live logged-in session
    const activeTokens = await db.query.refreshTokens.findMany({
      where: and(
        eq(refreshTokens.revoked, false),
        gt(refreshTokens.expiresAt, new Date())
      )
    });
    const loggedInUserIds = new Set(activeTokens.map((t) => Number(t.userId)));
    // Always include the current requesting user
    loggedInUserIds.add(currentUserId);

    const now = new Date().getTime();
    let activeCount = 0;
    let onlineCount = 0;

    const formattedUsers = userList.map((u) => {
      const isSelf = u.id === currentUserId;
      const hasActiveSession = isSelf || loggedInUserIds.has(u.id);
      const isStatusActive = u.status === "active";

      const lastActiveTime = u.updatedAt ? new Date(u.updatedAt).getTime() : 0;
      const diffMinutes = lastActiveTime > 0 ? (now - lastActiveTime) / (1000 * 60) : 999999;

      const isActive = hasActiveSession && isStatusActive && (isSelf || diffMinutes <= 5);
      const isOnline = hasActiveSession && isStatusActive && (isSelf || diffMinutes <= 30);

      if (isActive) activeCount++;
      if (isOnline) onlineCount++;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: u.mobile,
        role: u.role?.name || u.role?.slug || "user",
        status: u.status,
        isActive,
        isOnline,
        updatedAt: u.updatedAt ? String(u.updatedAt) : null
      };
    });

    // Priority sort: Active first, then Online, then recently active, then alphabetical
    formattedUsers.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      if (timeA !== timeB) return timeB - timeA;
      return a.name.localeCompare(b.name);
    });

    return c.json({
      success: true,
      stats: {
        active: activeCount,
        online: onlineCount,
        users: formattedUsers
      }
    });
  } catch (err: unknown) {
    console.error("Error fetching user stats:", err);
    return c.json({ success: false, message: "Failed to fetch stats" }, 500);
  }
};

/**
 * Why: Sends a test SMS and broadcasts real-time SMS balance update across firm users.
 * When: Triggered when admin tests SMS gateway or dispatches SMS notifications.
 * Where: POST /api/auth/send-test-sms
 */
export const sendTestSms = async (c: AppContext) => {
  try {
    const auth = c.get("auth") || c.get("user");
    if (!auth || !auth.id) {
      return c.json({ success: false, message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const currentUserId = Number(auth.id);
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, currentUserId)
    });

    if (!currentUser) {
      return c.json({ success: false, message: "User not found" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const targetAdminId = currentUser.adminId ? Number(currentUser.adminId) : currentUserId;
    const adminUser = currentUser.adminId
      ? await db.query.users.findFirst({ where: eq(users.id, targetAdminId) })
      : currentUser;

    if (!adminUser) {
      return c.json({ success: false, message: "Admin account not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const body = c.req.valid("json");
    const firmSetting = (
      await db
        .select()
        .from(companySettings)
        .where(eq(companySettings.adminId, targetAdminId))
        .limit(1)
    )[0] || (await db.select().from(companySettings).where(isNull(companySettings.adminId)).limit(1))[0];
    const mobile = body?.mobile || adminUser.mobile || "01819234567";
    // firmSetting is the correct source for smsApiKey/senderId — users table doesn't have these fields
    const apiKey = body?.apiKey || firmSetting?.smsApiKey;
    const senderId = body?.senderId || firmSetting?.smsSenderId || "";
    const message = body?.message || "Test SMS from VAT IDP Portal. Your SMS gateway is active and live stock is synced.";

    let newSmsBalance = Math.max(0, (adminUser.smsBalance ?? 0) - 1);

    // If SMS Provider API key is provided, transmit directly and fetch live remaining balance from provider
    if (apiKey) {
      const providerRes = await dispatchProviderSms({
        apiKey,
        senderId,
        mobile,
        message
      });

      if (providerRes.liveBalance !== undefined) {
        newSmsBalance = providerRes.liveBalance;
      }

      await db.update(users).set({ smsBalance: newSmsBalance, updatedAt: new Date() }).where(eq(users.id, targetAdminId));

      try {
        broadcast(
          "tenant:sms-updated",
          {
            adminId: targetAdminId,
            smsBalance: newSmsBalance,
            timestamp: Date.now()
          },
          { tenant: targetAdminId }
        );
      } catch (bErr) {
        console.error("Broadcast SMS update error:", bErr);
      }

      if (!providerRes.success) {
        return c.json({
          success: false,
          message: providerRes.message || "SMS Provider rejected request",
          smsBalance: newSmsBalance
        }, 400);
      }

      return c.json({
        success: true,
        message: providerRes.message || "SMS sent successfully and real-time stock synced",
        smsBalance: newSmsBalance
      });
    }

    await db.update(users).set({ smsBalance: newSmsBalance, updatedAt: new Date() }).where(eq(users.id, targetAdminId));

    try {
      broadcast(
        "tenant:sms-updated",
        {
          adminId: targetAdminId,
          smsBalance: newSmsBalance,
          timestamp: Date.now()
        },
        { tenant: targetAdminId }
      );
    } catch (bErr) {
      console.error("Broadcast SMS update error:", bErr);
    }

    return c.json({
      success: true,
      message: "Test SMS triggered (No Gateway API Key configured in Firm Settings)",
      smsBalance: newSmsBalance
    });
  } catch (err: unknown) {
    console.error("sendTestSms error:", err);
    return c.json({ success: false, message: "Failed to dispatch test SMS" }, 500);
  }
};

/**
 * Why: Queries SMS provider API directly to sync live balance on demand.
 * When: Called when tenant clicks SMS badge in Header or requests balance refresh.
 * Where: POST /api/auth/sync-sms-balance
 */
export const syncSmsBalance = async (c: AppContext) => {
  try {
    const auth = c.get("auth") || c.get("user");
    if (!auth || !auth.id) {
      return c.json({ success: false, message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const currentUserId = Number(auth.id);
    const currentUser = await db.query.users.findFirst({
      where: eq(users.id, currentUserId)
    });

    if (!currentUser) {
      return c.json({ success: false, message: "User not found" }, HttpStatusCodes.NOT_FOUND);
    }

    const targetAdminId = currentUser.adminId ? Number(currentUser.adminId) : currentUserId;
    const firmSetting = (
      await db
        .select()
        .from(companySettings)
        .where(eq(companySettings.adminId, targetAdminId))
        .limit(1)
    )[0] || (await db.select().from(companySettings).where(isNull(companySettings.adminId)).limit(1))[0];

    if (!firmSetting?.smsApiKey) {
      return c.json({
        success: false,
        message: "SMS Gateway API Key is not configured in Firm Settings",
        smsBalance: (currentUser as any).smsBalance || 0
      }, HttpStatusCodes.BAD_REQUEST);
    }

    const liveBalance = await fetchProviderBalance(firmSetting.smsApiKey);
    if (liveBalance === null) {
      return c.json({
        success: false,
        message: "Unable to reach SMS Gateway Provider",
        smsBalance: (currentUser as any).smsBalance || 0
      }, HttpStatusCodes.BAD_GATEWAY);
    }

    await db.update(users).set({ smsBalance: liveBalance, updatedAt: new Date() }).where(eq(users.id, targetAdminId));

    try {
      broadcast(
        "tenant:sms-updated",
        {
          adminId: targetAdminId,
          smsBalance: liveBalance,
          timestamp: Date.now()
        },
        { tenant: targetAdminId }
      );
    } catch (bErr) {
      console.error("Broadcast SMS update error:", bErr);
    }

    return c.json({
      success: true,
      message: "SMS balance synced successfully!",
      smsBalance: liveBalance
    }, HttpStatusCodes.OK);
  } catch (err: unknown) {
    console.error("syncSmsBalance error:", err);
    return c.json({ success: false, message: "Failed to sync SMS balance" }, 500);
  }
};
