import type { AppContext } from "@/framework/facade.js";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authConfig, jwtConfig } from "@/config/index.js";
import {
  cookie,
  db,
  HttpStatusCodes,
  jwt
} from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { refreshTokens, users } from "@/modules/auth/database/models/user.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { issueTokens, sanitizeUser } from "./auth.helpers.js";

/**
 * Why: Rotates refresh token and reissues access credentials.
 * When: Used when access token expires but refresh token is still valid.
 * Where: POST auth refresh-token route.
 */
export const refreshToken = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    const payload = await jwt.verifyToken(body.refresh_token, "refresh");

    if (!payload?.jti) return c.json({ message: "Invalid refresh token" }, HttpStatusCodes.UNAUTHORIZED);

    const storedToken = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.jti, payload.jti as string)
    });

    if (!storedToken || storedToken.revoked) {
      return c.json({ message: "Refresh token revoked" }, HttpStatusCodes.UNAUTHORIZED);
    }

    if (storedToken.expiresAt.getTime() < Date.now()) {
      await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
      return c.json({ message: "Refresh token expired" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, payload.id as number),
      with: { role: true }
    });
    if (!user) return c.json({ message: "User not found" }, HttpStatusCodes.UNAUTHORIZED);

    if (user.status === "suspended" || user.status === "inactive" || user.status === "pending") {
      return c.json({ message: "Account is not active" }, HttpStatusCodes.UNAUTHORIZED);
    }

    if (user.adminId) {
      const tenantAdmin = await db.query.users.findFirst({
        where: eq(users.id, user.adminId)
      });
      if (tenantAdmin && (tenantAdmin.status === "suspended" || tenantAdmin.status === "inactive" || tenantAdmin.status === "pending")) {
        return c.json({ message: "Firm account is not active" }, HttpStatusCodes.UNAUTHORIZED);
      }
    }

    const remember = !!payload.remember;
    const refreshExpiry = remember ? jwtConfig.refreshRememberExpirySeconds : jwtConfig.refreshExpirySeconds;
    const accessToken = await jwt.generateToken(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        adminId: user.adminId ? Number(user.adminId) : null,
        roleId: user.role?.id ?? null,
        role: user.role?.name ?? null,
        remember
      },
      "access"
    );
    const newRefreshToken = await jwt.generateToken(
      {
        id: user.id,
        email: user.email,
        adminId: user.adminId ? Number(user.adminId) : null,
        roleId: user.role?.id ?? null,
        role: user.role?.name ?? null,
        remember
      },
      "refresh",
      refreshExpiry
    );

    await db
      .update(refreshTokens)
      .set({
        jti: newRefreshToken.jti as string,
        expiresAt: new Date(newRefreshToken.exp * 1000),
        revoked: false
      })
      .where(eq(refreshTokens.id, storedToken.id));

    await cookie.setAuth(c, accessToken.token);
    await cookie.setRefresh(c, newRefreshToken.token, refreshExpiry);

    return c.json(
      {
        message: "Token refreshed successfully",
        data: {
          user: await sanitizeUser(user),
          access_token: accessToken.token,
          refresh_token: newRefreshToken.token,
          token_type: "Bearer"
        }
      },
      HttpStatusCodes.OK
    );
  } catch (error) {
    console.error("Refresh token error:", error);
    return c.json({ message: "Invalid or expired refresh token" }, HttpStatusCodes.UNAUTHORIZED);
  }
};
