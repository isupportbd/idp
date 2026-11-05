import type { AppContext } from "@/framework/facade.js";
import { and, eq, gt, lt, or, sql } from "drizzle-orm";
import {
  db,
  dispatchEvent,
  HttpStatusCodes,
  mail,
  password,
  redisClientIfReady,
  urls
} from "@/framework/facade.js";
import { passwordResetTokens, refreshTokens, users } from "@/modules/auth/database/models/user.js";
import {
  hashResetToken,
  makeResetOtp,
  makeResetToken
} from "./auth.helpers.js";

/**
 * Why: Starts password reset flow and queues email delivery event.
 * When: Used when user requests a forgot-password link.
 * Where: POST auth forgot-password route.
 */
export const forgotPassword = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    await db
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.email, body.email), lt(passwordResetTokens.expiresAt, new Date())));

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });
    if (!user) return c.json({ message: "If this email exists, a reset link has been sent" }, HttpStatusCodes.OK);

    const plainToken = makeResetToken();
    const plainOtp = makeResetOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, user.email));
    await db.insert(passwordResetTokens).values([
      {
        email: user.email,
        token: hashResetToken(plainToken),
        expiresAt,
        createdAt: new Date()
      },
      {
        email: user.email,
        token: hashResetToken(plainOtp),
        expiresAt,
        createdAt: new Date()
      }
    ]);

    const resetUrl = urls.url(`/reset-password?token=${plainToken}&email=${encodeURIComponent(user.email)}`);
    if (redisClientIfReady()) {
      await dispatchEvent("user:forget-password", { email: user.email, name: user.name, resetUrl, otp: plainOtp }, { queue: "mail" });
    } else {
      const subject = plainOtp ? `${plainOtp} is your IDP verification code` : "Reset Your Password - IDP";

      const textBody = `Hello ${user.name || "User"},

We received a request to reset your IDP account password.

Your 6-Digit OTP Code is: ${plainOtp}

${resetUrl ? `Or use this password reset link:\n${resetUrl}\n` : ""}
This code is valid for 15 minutes.
If you did not make this request, please ignore this email.

— IDP Security Team`;

      await mail.sendMail({
        to: user.email,
        subject,
        text: textBody,
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subject}</title>
          </head>
          <body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
            <!-- Preheader preview text for inbox -->
            <div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
              Your IDP password reset verification code is ${plainOtp}.
            </div>

            <div style="max-width: 520px; margin: 0 auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; font-size: 20px; font-weight: 700; color: #2563eb; letter-spacing: 0.5px;">IDP Portal</div>
              </div>

              <h2 style="color: #0f172a; margin-top: 0; font-size: 18px; font-weight: 600; text-align: center;">পাসওয়ার্ড রিসেট ভেরিফিকেশন</h2>
              
              <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 16px 0;">
                Hello <strong>${user.name || "User"}</strong>,<br>
                We received a request to reset the password for your IDP account. Please use the verification code below:
              </p>

              <div style="text-align: center; margin: 24px 0;">
                <div style="font-size: 12px; color: #64748b; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Verification Code</div>
                <div style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8; background: #eff6ff; padding: 14px 28px; border-radius: 8px; display: inline-block; border: 1px solid #bfdbfe;">
                  ${plainOtp}
                </div>
              </div>

              ${
                resetUrl
                  ? `
              <div style="text-align: center; margin: 20px 0;">
                <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; font-size: 14px;">
                  Reset Password Directly
                </a>
              </div>
              `
                  : ""
              }

              <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 24px; text-align: center;">
                ⏱️ This code will expire in <strong>15 minutes</strong>.
              </p>

              <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />

              <p style="color: #94a3b8; font-size: 12px; line-height: 1.4; margin: 0; text-align: center;">
                If you did not request this, you can safely ignore this email.<br>
                © ${new Date().getFullYear()} IDP. All rights reserved.
              </p>
            </div>
          </body>
          </html>
        `
      });
      await dispatchEvent("user.changed", { email: user.email }, { broadcast: { auth: true } });
    }

    return c.json({ success: true, message: "If this email exists, an OTP & reset link has been sent" }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Forgot password error:", error);
    return c.json({ success: false, message: "Failed to process forgot password request" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Why: Verifies reset token and persists the new password.
 * When: Used after user submits reset token + new password.
 * Where: POST auth reset-password route.
 */
export const resetPassword = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    const inputToken = (body.token || body.otp || "").toString().trim();
    const newPass = body.password || body.newPassword;

    const record = await db.query.passwordResetTokens.findFirst({
      where: and(
        eq(passwordResetTokens.email, body.email),
        eq(passwordResetTokens.token, hashResetToken(inputToken)),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    });

    if (!record) {
      return c.json({ success: false, message: "Invalid or expired OTP / reset token" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    await db
      .update(users)
      .set({
        password: await password.hashPassword(newPass),
        updatedAt: new Date()
      })
      .where(eq(users.email, body.email));

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, body.email));

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });
    if (user) await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.userId, user.id));

    return c.json({ success: true, message: "Password reset successfully! Please sign in." }, HttpStatusCodes.OK);
  } catch (error) {
    console.error("Reset password error:", error);
    return c.json({ success: false, message: "Failed to reset password" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
