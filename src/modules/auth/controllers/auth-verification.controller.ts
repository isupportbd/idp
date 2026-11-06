import { and, eq, gt, sql } from "drizzle-orm";
import { authConfig } from "@/config/index.js";
import type { AppContext } from "@/framework/facade.js";
import { db, HttpStatusCodes } from "@/framework/facade.js";
import { emailVerificationTokens, users } from "@/modules/auth/database/models/user.js";
import { hashEmailVerificationToken } from "./auth.helpers.js";

/**
 * Why: Validates email verification token and marks user as verified.
 * When: Used when user opens verification link from inbox.
 * Where: POST auth verify-email route.
 */
export const verifyEmail = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");

    if (!authConfig.requireEmailVerification) {
      return c.json({ message: "Email verification is not required" }, HttpStatusCodes.OK);
    }

    const record = await db.query.emailVerificationTokens.findFirst({
      where: and(
        eq(emailVerificationTokens.email, body.email),
        eq(emailVerificationTokens.token, hashEmailVerificationToken(body.token)),
        gt(emailVerificationTokens.expiresAt, new Date())
      )
    });

    if (!record) {
      return c.json({ message: "Invalid or expired verification token" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.email, body.email));
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.email, body.email));

    return c.json({ message: "Email verified successfully" }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Verify email error:", error);
    return c.json({ message: "Failed to verify email" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
