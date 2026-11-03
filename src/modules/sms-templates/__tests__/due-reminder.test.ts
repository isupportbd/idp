import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { initDatabase } from "@/framework/database/connection.js";
import { db } from "@/framework/facade.js";
import { companySettings } from "@/modules/firm/database/models/company_settings.js";
import { clients } from "@/modules/clients/database/models/clients.js";
import { bills } from "@/modules/billing/database/models/bills.js";
import { smsLogs } from "../database/models/sms_logs.js";
import { users } from "@/modules/auth/database/models/user.js";
import { runDueReminderScan } from "../services/due-reminder.service.js";

describe("Due Reminder SMS scan (runDueReminderScan)", () => {
  const SUFFIX = Date.now().toString().slice(-6);
  let adminId: number;
  let clientAId: number; // qualifies (old bill, due >= 1000)
  let clientBId: number; // qualifies but will be blocked by cool-off
  let clientCId: number; // too recent
  let clientDId: number; // due too low
  let clientInactiveId: number; // inactive

  beforeAll(async () => {
    await initDatabase();

    // Create admin user
    const [admin] = await db
      .insert(users)
      .values({
        name: `DueReminder Admin ${SUFFIX}`,
        email: `due_reminder_${SUFFIX}@idp.test`,
        password: "pass",
        mobile: `01710000${SUFFIX}`,
        roleId: 1
      })
      .returning();
    adminId = admin.id;

    // Company settings with due reminder enabled + dummy SMS config pointing to local dead port
    await db
      .insert(companySettings)
      .values({
        adminId,
        companyName: `DueReminder Firm ${SUFFIX}`,
        smsApiKey: "DUMMY_KEY",
        smsSenderId: "DUMMY_SND",
        smsEndpointUrl: "http://127.0.0.1:9/smsapi",
        autoDueReminder: true,
        dueReminderDays: 7,
        dueReminderMinAmount: 1000.00
      })
      .returning();

    // Clients — BD-valid 11-digit mobiles ("01711" + 6-digit suffix).
    const [cA] = await db.insert(clients).values({ companyName: `DueReminder Client A ${SUFFIX}`, mobile: `01711${SUFFIX}`, isActive: true, createdBy: adminId }).returning();
    const [cB] = await db.insert(clients).values({ companyName: `DueReminder Client B ${SUFFIX}`, mobile: `01722${SUFFIX}`, isActive: true, createdBy: adminId }).returning();
    const [cC] = await db.insert(clients).values({ companyName: `DueReminder Client C ${SUFFIX}`, mobile: `01733${SUFFIX}`, isActive: true, createdBy: adminId }).returning();
    const [cD] = await db.insert(clients).values({ companyName: `DueReminder Client D ${SUFFIX}`, mobile: `01744${SUFFIX}`, isActive: true, createdBy: adminId }).returning();
    const [cI] = await db.insert(clients).values({ companyName: `DueReminder Client Inactive ${SUFFIX}`, mobile: `01755${SUFFIX}`, isActive: false, createdBy: adminId }).returning();
    clientAId = cA.id; clientBId = cB.id; clientCId = cC.id; clientDId = cD.id; clientInactiveId = cI.id;

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);

    // Bill for A: old (10d), due 5000
    await db.insert(bills).values({
      billNo: `INV-DR-${SUFFIX}-A`,
      clientId: clientAId,
      taxPeriod: "2099-01",
      billDate: tenDaysAgo,
      subtotal: 5000,
      discountAmount: 0,
      previousDue: 0,
      grandTotal: 5000,
      paidAmount: 0,
      dueAmount: 5000,
      status: "unpaid",
      createdBy: adminId
    });

    // Bill for B: old (10d), due 3000
    await db.insert(bills).values({
      billNo: `INV-DR-${SUFFIX}-B`,
      clientId: clientBId,
      taxPeriod: "2099-01",
      billDate: tenDaysAgo,
      subtotal: 3000,
      discountAmount: 0,
      previousDue: 0,
      grandTotal: 3000,
      paidAmount: 0,
      dueAmount: 3000,
      status: "unpaid",
      createdBy: adminId
    });

    // Bill for C: recent (2d)
    await db.insert(bills).values({
      billNo: `INV-DR-${SUFFIX}-C`,
      clientId: clientCId,
      taxPeriod: "2099-01",
      billDate: twoDaysAgo,
      subtotal: 5000,
      discountAmount: 0,
      previousDue: 0,
      grandTotal: 5000,
      paidAmount: 0,
      dueAmount: 5000,
      status: "unpaid",
      createdBy: adminId
    });

    // Bill for D: old but due 500
    await db.insert(bills).values({
      billNo: `INV-DR-${SUFFIX}-D`,
      clientId: clientDId,
      taxPeriod: "2099-01",
      billDate: tenDaysAgo,
      subtotal: 500,
      discountAmount: 0,
      previousDue: 0,
      grandTotal: 500,
      paidAmount: 0,
      dueAmount: 500,
      status: "unpaid",
      createdBy: adminId
    });

    // Bill for inactive: old/high due
    await db.insert(bills).values({
      billNo: `INV-DR-${SUFFIX}-I`,
      clientId: clientInactiveId,
      taxPeriod: "2099-01",
      billDate: tenDaysAgo,
      subtotal: 5000,
      discountAmount: 0,
      previousDue: 0,
      grandTotal: 5000,
      paidAmount: 0,
      dueAmount: 5000,
      status: "unpaid",
      createdBy: adminId
    });
  });

  afterAll(async () => {
    await db.delete(smsLogs).where(sql`${smsLogs.message} LIKE ${'%' + SUFFIX + '%'}`);
    await db.delete(bills).where(sql`${bills.billNo} LIKE ${'INV-DR-' + SUFFIX + '%'}`);
    await db.delete(clients).where(sql`${clients.companyName} LIKE ${'DueReminder ' + SUFFIX + '%'}`);
    await db.delete(companySettings).where(eq(companySettings.adminId, adminId));
    await db.delete(users).where(eq(users.id, adminId));
  });

  it("dispatches due reminders for eligible clients; skips too-recent, low-due, inactive", async () => {
    const res = await runDueReminderScan({ adminIds: [adminId] });
    expect(res.firmsScanned).toBe(1);
    expect(res.candidates).toBe(2); // only A and B pass age + threshold
    expect(res.dispatched).toBe(2);

    // A: rendered with all four template variables (customer_name, date, due, company_name)
    const logsA = await db.select().from(smsLogs).where(and(eq(smsLogs.templateKey, "due_reminder"), sql`${smsLogs.message} LIKE ${'%DueReminder Client A ' + SUFFIX + '%'}`));
    expect(logsA.length).toBe(1);
    expect(logsA[0].message).toContain("DueReminder Client A " + SUFFIX);
    expect(logsA[0].message).toContain("5000"); // running due (openingBalance + billed - collected)
    expect(logsA[0].message).toContain("DueReminder Firm " + SUFFIX); // company_name
    expect(logsA[0].recipientMobile).toBe(`8801711${SUFFIX}`); // normalized BD mobile
    expect(logsA[0].adminId).toBe(adminId); // tenant isolation in the audit trail

    // B: the other eligible client
    const logsB = await db.select().from(smsLogs).where(and(eq(smsLogs.templateKey, "due_reminder"), sql`${smsLogs.message} LIKE ${'%DueReminder Client B ' + SUFFIX + '%'}`));
    expect(logsB.length).toBe(1);

    // C (invoice only 2 days old), D (due below threshold) and the inactive client
    // must have no audit rows at all.
    for (const name of [`Client C`, `Client D`, `Client Inactive`]) {
      const rows = await db.select().from(smsLogs).where(sql`${smsLogs.message} LIKE ${'%DueReminder ' + name + ' ' + SUFFIX + '%'}`);
      expect(rows.length).toBe(0);
    }
  });

  it("respects cool-off guard (SENT within last 25 days blocks re-dispatch)", async () => {
    // Insert SENT log for client B
    await db.insert(smsLogs).values({
      adminId,
      recipientMobile: `8801722${SUFFIX}`, // normalized form of 01722+SUFFIX
      message: "sent",
      templateKey: "due_reminder",
      status: "SENT",
      providerResponse: "ok",
      sentAt: new Date()
    });

    const res2 = await runDueReminderScan({ adminIds: [adminId] });
    // B should not be dispatched again
    const logsB = await db.select().from(smsLogs).where(and(eq(smsLogs.templateKey, "due_reminder"), sql`${smsLogs.message} LIKE ${'%DueReminder Client B ' + SUFFIX + '%'}`));
    // Inline with local endpoint fails → FAILED; first run created FAILED log; cool-off blocks re-dispatch
    expect(logsB.length).toBe(1);
  });

  it("dispatches nothing once the firm's toggle is off (firm-level gate)", async () => {
    await db.update(companySettings).set({ autoDueReminder: false }).where(eq(companySettings.adminId, adminId));
    try {
      const res = await runDueReminderScan({ adminIds: [adminId] });
      expect(res.firmsScanned).toBe(0);
      expect(res.candidates).toBe(0);
      expect(res.dispatched).toBe(0);
    } finally {
      await db.update(companySettings).set({ autoDueReminder: true }).where(eq(companySettings.adminId, adminId));
    }
  });
});
