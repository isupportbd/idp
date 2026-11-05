import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { cookie, db, jwt } from "@/framework/facade.js";
import { refreshTokens, users } from "@/modules/auth/database/models/user.js";

type CachedUserAuth = {
  id: number;
  email: string;
  name: string;
  status: string;
  adminId: number | null;
  roleId: number | null;
  role: string | null;
  cachedAt: number;
};

const USER_AUTH_CACHE_TTL_MS = 30_000; // 30s cache
const userAuthCache = new Map<number, CachedUserAuth>();

export function invalidateUserAuthCache(userId?: number) {
  if (userId) {
    userAuthCache.delete(userId);
  } else {
    userAuthCache.clear();
  }
}

export async function authMiddleware(c: Context, next: Next) {
  let accessToken = await cookie.getAuth(c);

  if (!accessToken) {
    const authHeader = c.req.header("Authorization") || c.req.header("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7).trim();
    }
  }

  if (accessToken) {
    const accessPayload = await jwt.verifyToken(accessToken, "access");

    if (accessPayload && accessPayload.id) {
      const userId = Number(accessPayload.id);
      const now = Date.now();
      let cached = userAuthCache.get(userId);

      if (!cached || now - cached.cachedAt > USER_AUTH_CACHE_TTL_MS) {
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, userId),
          with: { role: true }
        });

        if (dbUser) {
          cached = {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            status: dbUser.status,
            adminId: dbUser.adminId ? Number(dbUser.adminId) : null,
            roleId: dbUser.role?.id ?? null,
            role: dbUser.role?.name ?? null,
            cachedAt: now
          };
          if (userAuthCache.size > 5000) {
            userAuthCache.clear();
          }
          userAuthCache.set(userId, cached);
        } else {
          cached = undefined;
        }
      }

      if (!cached || cached.status === "suspended" || cached.status === "inactive" || cached.status === "pending") {
        userAuthCache.delete(userId);
        cookie.deleteAuth(c);
        cookie.deleteRefresh(c);
        return c.json({ message: "Unauthorized: Account is not active" }, 401);
      }

      c.set("auth", {
        ...accessPayload,
        id: cached.id,
        email: cached.email,
        name: cached.name,
        adminId: cached.adminId,
        roleId: cached.roleId,
        role: cached.role
      });
      return await next();
    }
  }

  const refreshToken = await cookie.getRefresh(c);

  if (!refreshToken) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Unauthorized" }, 401);
  }

  const refreshPayload = await jwt.verifyToken(refreshToken, "refresh");

  if (!refreshPayload?.jti) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, 401);
  }

  const storedToken = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.jti, refreshPayload.jti as string)
  });

  if (!storedToken || storedToken.revoked) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, 401);
  }

  if (storedToken.expiresAt.getTime() < Date.now()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, 401);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, refreshPayload.id as number),
    with: { role: true }
  });

  if (!user || user.status === "suspended" || user.status === "inactive" || user.status === "pending") {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Unauthorized: Account is not active" }, 401);
  }

  const newAccessToken = await jwt.generateToken(
    {
      id: user.id,
      email: user.email,
      adminId: user.adminId ?? null,
      roleId: user.role?.id ?? null,
      role: user.role?.name ?? null
    },
    "access"
  );

  await cookie.setAuth(c, newAccessToken.token);
  c.set("auth", {
    id: user.id,
    email: user.email,
    name: user.name,
    adminId: user.adminId ?? null,
    roleId: user.role?.id ?? null,
    role: user.role?.name ?? null,
    type: "access"
  });
  return await next();
}
