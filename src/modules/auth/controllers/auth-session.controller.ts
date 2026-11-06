import { and, eq, sql } from "drizzle-orm";
import { authConfig } from "@/config/index.js";
import type { AppContext } from "@/framework/facade.js";
import { cookie, db, HttpStatusCodes, password } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { refreshTokens, users } from "@/modules/auth/database/models/user.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { issueTokens, revokeCurrentRefreshToken, sanitizeUser } from "./auth.helpers.js";

/**
 * Why: Authenticates user credentials and rotates active login cookies/tokens.
 * When: Used whenever a user signs in.
 * Where: POST auth login route.
 */
export const login = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const user = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
      with: { role: true }
    });

    if (!user || !(await password.verifyPassword(body.password, user.password))) {
      return c.json({ message: "Invalid credentials" }, HttpStatusCodes.UNAUTHORIZED);
    }

    if (user.status === "suspended") {
      return c.json({ message: "Your account is suspended. Please contact administrator." }, HttpStatusCodes.FORBIDDEN);
    }

    if (user.status === "inactive") {
      return c.json({ message: "Your account is inactive. Please contact administrator." }, HttpStatusCodes.FORBIDDEN);
    }

    if (user.status === "pending") {
      return c.json({ message: "Your registration is pending verification and approval." }, HttpStatusCodes.FORBIDDEN);
    }

    if (user.adminId) {
      const tenantAdmin = await db.query.users.findFirst({
        where: eq(users.id, user.adminId)
      });
      if (tenantAdmin && (tenantAdmin.status === "suspended" || tenantAdmin.status === "inactive" || tenantAdmin.status === "pending")) {
        return c.json(
          { message: "Your firm account is inactive or suspended. Please contact firm administrator." },
          HttpStatusCodes.FORBIDDEN
        );
      }
    }

    if (authConfig.requireEmailVerification && !user.emailVerifiedAt) {
      return c.json({ message: "Please verify your email before logging in" }, HttpStatusCodes.FORBIDDEN);
    }

    await revokeCurrentRefreshToken(c);
    const tokens = await issueTokens(c, user, { remember: !!body.remember });

    try {
      await db.update(users).set({ updatedAt: new Date() }).where(eq(users.id, user.id));
    } catch (err) {
      console.warn("Failed to update user login timestamp:", err);
    }

    return c.json(
      {
        message: "User logged in successfully",
        data: {
          user: await sanitizeUser(user),
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_type: "Bearer"
        }
      },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ message: "Failed to login" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Returns the currently authenticated user profile.
 * When: Used by clients to bootstrap session/user state.
 * Where: GET auth me route.
 */
export const me = async (c: AppContext) => {
  try {
    const auth = c.get("auth");
    const user = await db.query.users.findFirst({
      where: eq(users.id, auth.id),
      with: { role: true }
    });

    if (!user) return c.json({ message: "User not found" }, HttpStatusCodes.NOT_FOUND);

    return c.json(
      {
        message: "Authenticated user fetched successfully",
        data: await sanitizeUser(user)
      },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Me error:", error);
    return c.json({ message: "Failed to fetch user" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Revokes current refresh token, sets user offline, and clears auth cookies.
 * When: Used when the active device logs out.
 * Where: POST auth logout route.
 */
export const logout = async (c: AppContext) => {
  try {
    const auth = c.get("auth") || c.get("user");
    if (auth && auth.id) {
      const userId = Number(auth.id);
      try {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
        // Immediately mark user offline by setting updatedAt to 1 hour ago
        const pastTime = new Date(Date.now() - 3600 * 1000);
        await db.update(users).set({ updatedAt: pastTime }).where(eq(users.id, userId));
      } catch (err) {
        console.error("Error updating logout status:", err);
      }
    }
    await revokeCurrentRefreshToken(c);
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Logged out successfully" }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Logout error:", error);
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Failed to logout" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Revokes all refresh tokens for account-wide logout.
 * When: Used for "logout from all devices" security action.
 * Where: POST auth logout-all-devices route.
 */
export const logoutAllDevices = async (c: AppContext) => {
  try {
    const auth = c.get("auth") || c.get("user");

    if (!auth || !auth.id) return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);

    const userId = Number(auth.id);
    try {
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
      const pastTime = new Date(Date.now() - 3600 * 1000);
      await db.update(users).set({ updatedAt: pastTime }).where(eq(users.id, userId));
    } catch (err) {
      console.error("Logout all devices error:", err);
    }

    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);

    return c.json({ message: "Logged out from all devices successfully" }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Logout all devices error:", error);
    return c.json({ message: "Failed to logout from all devices" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
