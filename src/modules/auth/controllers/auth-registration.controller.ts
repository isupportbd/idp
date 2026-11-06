import { and, eq, or, sql } from "drizzle-orm";
import { authConfig } from "@/config/index.js";
import type { AppContext } from "@/framework/facade.js";
import { broadcast, cookie, db, dispatchEvent, HttpStatusCodes, mail, password, urls } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { emailVerificationTokens, users } from "@/modules/auth/database/models/user.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { paymentSettings } from "@/modules/superadmin/database/models/payment_settings.js";
import { plans } from "@/modules/superadmin/database/models/plans.js";
import { subscriptionTransactions } from "@/modules/superadmin/database/models/subscription_transactions.js";
import {
  hashEmailVerificationToken,
  issueTokens,
  makeEmailVerificationToken,
  revokeCurrentRefreshToken,
  sanitizeUser
} from "./auth.helpers.js";

/**
 * Why: Creates a new user, issues tokens, and triggers signup side effects.
 * When: Used on first-time account creation.
 * Where: POST auth register route.
 */
export const register = async (c: AppContext) => {
  try {
    const body = c.req.valid("json");
    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    const defaultRole =
      (await db.query.roles.findFirst({
        where: eq(roles.name, "admin")
      })) ||
      (await db.query.roles.findFirst({
        where: eq(roles.name, "user")
      }));

    const existingUser = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`
    });

    if (existingUser) {
      return c.json({ message: "Email already exists" }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    const targetRoleId = defaultRole?.id ?? null;
    const targetStatus = "pending";

    // Validate Plan & Payment for Tenants
    let tenantPlanId = null;
    let tenantBillingCycle = "monthly";
    let tenantPaidAmount = 0;
    let tenantTrxId = null;
    let baseFee = 0;
    let chargePercent = 1.8;

    if (!body.planId) {
      return c.json({ success: false, message: "Please select a plan to sign up." }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    const [selectedPlan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, Number(body.planId)));
    if (!selectedPlan) {
      return c.json({ success: false, message: "Selected plan does not exist." }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    tenantPlanId = selectedPlan.id;
    tenantBillingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";

    const [paymentConfig] = await db.select().from(paymentSettings).limit(1);
    chargePercent = paymentConfig?.bkashCharge ?? 1.8;
    baseFee = tenantBillingCycle === "yearly" ? selectedPlan.rateYearly : selectedPlan.rateMonthly;

    const rawPaidAmount = Number(body.paidAmount || 0);
    if (rawPaidAmount < 1) {
      return c.json(
        {
          success: false,
          message: `Please enter the amount paid via bKash.`
        },
        HttpStatusCodes.UNPROCESSABLE_ENTITY
      );
    }

    if (!body.trxId || !body.trxId.trim()) {
      return c.json({ success: false, message: "bKash TrxID is required to complete registration." }, HttpStatusCodes.UNPROCESSABLE_ENTITY);
    }

    tenantPaidAmount = rawPaidAmount;
    tenantTrxId = body.trxId.replace(/\s*\((monthly|yearly|m|y)\)/gi, "").trim();

    const insertedRows = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email,
        mobile: body.mobile || null,
        password: await password.hashPassword(body.password),
        roleId: targetRoleId,
        status: targetStatus,
        planId: tenantPlanId,
        billingCycle: tenantBillingCycle,
        trxId: tenantTrxId,
        paidAmount: tenantPaidAmount,
        advanceBalance: 0
      })
      .returning();

    const insertedId = insertedRows[0]?.id;
    if (!insertedId) {
      throw new Error("Failed to resolve inserted user id");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, insertedId),
      with: { role: true }
    });

    if (!user) {
      throw new Error("Failed to load registered user");
    }

    // Initialize clean firm profile for tenant
    try {
      await db.insert(companySettings).values({
        adminId: user.id,
        companyName: user.name || "",
        proprietorName: user.name || "",
        phone: user.mobile || "",
        email: user.email || "",
        website: "",
        address: "",
        binNumber: "",
        tinNumber: "",
        tradeLicenseNo: ""
      });
    } catch (csErr) {
      console.error("Failed to initialize company settings for new user:", csErr);
    }

    if (targetStatus === "pending") {
      // Record initial signup deposit transaction
      try {
        const gwCharge = Math.round((tenantPaidAmount * chargePercent) / 100);
        const netAmt = tenantPaidAmount - gwCharge;
        await db.insert(subscriptionTransactions).values({
          userId: user.id,
          planId: tenantPlanId,
          type: "deposit",
          billingCycle: tenantBillingCycle,
          grossAmount: tenantPaidAmount,
          gatewayCharge: gwCharge,
          netAmount: netAmt,
          planRate: baseFee,
          paidAmount: tenantPaidAmount,
          trxId: tenantTrxId,
          paymentMethod: "bkash",
          status: "pending",
          note: "Initial signup deposit awaiting SuperAdmin verification"
        });
      } catch (txErr) {
        console.error("Failed to insert pending subscription transaction:", txErr);
      }

      try {
        broadcast(
          "tenant:signup",
          {
            id: user.id,
            name: user.name,
            email: user.email,
            mobile: user.mobile,
            planId: user.planId,
            billingCycle: user.billingCycle,
            trxId: user.trxId,
            paidAmount: user.paidAmount,
            createdAt: user.createdAt
          },
          { roles: ["superadmin"], auth: true }
        );
      } catch (broadcastErr) {
        console.error("Broadcast tenant:signup error:", broadcastErr);
      }

      return c.json(
        {
          success: true,
          message: "Registration successful! Please wait for the Super Admin to approve your account.",
          data: {
            user: await sanitizeUser(user)
          }
        },
        HttpStatusCodes.CREATED
      );
    }

    if (authConfig.requireEmailVerification) {
      const plainToken = makeEmailVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.email, user.email));
      await db.insert(emailVerificationTokens).values({
        email: user.email,
        token: hashEmailVerificationToken(plainToken),
        expiresAt,
        createdAt: new Date()
      });

      const verifyUrl = urls.url(`/verify-email?token=${plainToken}&email=${encodeURIComponent(user.email)}`);
      await dispatchEvent("user:verify-email", { email: user.email, name: user.name, verifyUrl }, { queue: "mail" });

      return c.json({ message: "User registered successfully. Please verify your email before logging in." }, HttpStatusCodes.CREATED);
    }

    await revokeCurrentRefreshToken(c);
    const tokens = await issueTokens(c, user, { remember: !!body.remember });
    await dispatchEvent(
      "user:signup",
      {
        userId: user.id,
        email: user.email,
        name: user.name
      },
      { queue: "mail" }
    );

    return c.json(
      {
        message: "User registered successfully",
        data: {
          user: await sanitizeUser(user),
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_type: "Bearer"
        }
      },
      HttpStatusCodes.CREATED
    );
  } catch (error) {
    console.error("Register error:", error);
    return c.json({ message: "Failed to register user" }, HttpStatusCodes.INTERNAL_SERVER_ERROR);
  }
};
