import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { initDatabase } from "@/framework/database/connection.js";
import { db } from "@/framework/facade.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { users } from "@/modules/auth/database/models/user.js";
import { smsLogs } from "../database/models/sms_logs.js";
import { isSmsEventEnabled, isTenantSmsEventEnabled, sendTransactionalSms } from "../services/sms.service.js";

/**
 * Granular per-event SMS toggles — verifies the pure mapping, the tenant
 * settings lookup, and the fail-safe delivery gate in `sendTransactionalSms`.
 * The gateway endpoint points at a dead local port so nothing ever leaves the
 * machine; the disabled path returns before any gateway call anyway.
 */
describe("Granular per-event SMS toggles", () => {
  const SUFFIX = Date.now().toString().slice(-6);
  let adminId: number;

  beforeAll(async () => {
    await initDatabase();

    const [admin] = await db
      .insert(users)
      .values({
        name: `SmsToggle Admin ${SUFFIX}`,
        email: `sms_toggle_${SUFFIX}@idp.test`,
        password: "pass",
        mobile: `01799000${SUFFIX}`,
        roleId: 1
      })
      .returning();
    adminId = admin.id;

    await db
      .insert(companySettings)
      .values({
        adminId,
        companyName: `SmsToggle Firm ${SUFFIX}`,
        smsApiKey: "DUMMY_KEY",
        smsSenderId: "DUMMY_SND",
        smsEndpointUrl: "http://127.0.0.1:9/smsapi",
        smsOnBill: true,
        smsOnCollection: true,
        smsOnSubmission: true
      })
      .returning();
  });

  afterAll(async () => {
    await db.delete(smsLogs).where(eq(smsLogs.adminId, adminId));
    await db.delete(companySettings).where(eq(companySettings.adminId, adminId));
    await db.delete(users).where(eq(users.id, adminId));
  });

  it("maps each event to its toggle; missing/null values stay enabled (back-compat)", () => {
    expect(isSmsEventEnabled({ smsOnBill: false }, "bill_notification")).toBe(false);
    expect(isSmsEventEnabled({ smsOnBill: true }, "bill_notification")).toBe(true);
    expect(isSmsEventEnabled({ smsOnCollection: false }, "collection_receipt")).toBe(false);
    expect(isSmsEventEnabled({ smsOnSubmission: false }, "vat_submission")).toBe(false);

    // Events without a dedicated toggle are never gated here.
    expect(isSmsEventEnabled({ smsOnBill: false, smsOnCollection: false, smsOnSubmission: false }, "due_reminder")).toBe(true);
    expect(isSmsEventEnabled({ smsOnBill: false }, "mushak_submission")).toBe(true);

    // Missing settings row / legacy null columns → enabled.
    expect(isSmsEventEnabled(null, "bill_notification")).toBe(true);
    expect(isSmsEventEnabled(undefined, "collection_receipt")).toBe(true);
    expect(isSmsEventEnabled({}, "vat_submission")).toBe(true);
    expect(isSmsEventEnabled({ smsOnBill: null }, "bill_notification")).toBe(true);
  });

  it("reads the toggle from the tenant's settings row, independently per event", async () => {
    expect(await isTenantSmsEventEnabled(adminId, "bill_notification")).toBe(true);

    await db.update(companySettings).set({ smsOnBill: false }).where(eq(companySettings.adminId, adminId));
    try {
      expect(await isTenantSmsEventEnabled(adminId, "bill_notification")).toBe(false);
      // Other events stay enabled — the toggles are independent.
      expect(await isTenantSmsEventEnabled(adminId, "collection_receipt")).toBe(true);
      expect(await isTenantSmsEventEnabled(adminId, "vat_submission")).toBe(true);
    } finally {
      await db.update(companySettings).set({ smsOnBill: true }).where(eq(companySettings.adminId, adminId));
    }
  });

  it("sendTransactionalSms no-ops (SKIPPED) with no audit row when the event toggle is off", async () => {
    await db.update(companySettings).set({ smsOnSubmission: false }).where(eq(companySettings.adminId, adminId));
    try {
      const before = await db.select({ id: smsLogs.id }).from(smsLogs).where(eq(smsLogs.adminId, adminId));

      const result = await sendTransactionalSms({
        tenantId: String(adminId),
        templateKey: "vat_submission",
        recipientPhone: "01711967548",
        variables: { customer_name: "Toggle Probe Co", tax_period: "July-2026", submission_id: "VAT-X" }
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe("SKIPPED");
      expect(result.retryable).toBe(false);
      expect(result.response).toContain("disabled");

      const after = await db.select({ id: smsLogs.id }).from(smsLogs).where(eq(smsLogs.adminId, adminId));
      expect(after.length).toBe(before.length);
    } finally {
      await db.update(companySettings).set({ smsOnSubmission: true }).where(eq(companySettings.adminId, adminId));
    }
  });
});
