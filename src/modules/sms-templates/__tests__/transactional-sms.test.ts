import { beforeAll, describe, expect, it } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { initDatabase } from "@/framework/database/connection.js";
import { db } from "@/framework/facade.js";
import { redisClientIfReady } from "@/framework/redis/client.js";
import { smsLogs } from "../database/models/sms_logs.js";
import { enqueueTransactionalSms } from "../services/sms-queue.service.js";
import { buildVatSubmissionSmsPayload, formatPeriodLabel, sendTransactionalSms } from "../services/sms.service.js";

/**
 * Transactional SMS queue core — drives the REAL `sendTransactionalSms` (the
 * exact function the `sms.transactional.send` worker executes) against live
 * PostgreSQL. Deliberately uses recipients/configurations that can never reach
 * an external gateway:
 *   - invalid/empty numbers exit at the recipient guard, and
 *   - valid numbers fail the "gateway configured" guard (tenant 2147483646 has
 *     no settings row; the test DB has no sms_api_key),
 * so these tests never perform network I/O.
 */
describe("Transactional SMS core (sendTransactionalSms)", () => {
  beforeAll(async () => {
    await initDatabase();
  });

  it("fails fast with retryable=false when no valid BD mobile exists", async () => {
    const result = await sendTransactionalSms({
      tenantId: "",
      templateKey: "bill_notification",
      recipientPhone: "",
      variables: { customer_name: "No Phone Co", month: "July-2026", current_bill: 2000, due: 0, grand_total: 2000 }
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.retryable).toBe(false);
    expect(result.response).toBe("No valid mobile number");
    expect(result.message).toBeTruthy(); // template rendered before the guard

    // Audit row exists with the NO_MOBILE convention.
    const [log] = await db
      .select()
      .from(smsLogs)
      .where(and(eq(smsLogs.recipientMobile, "NO_MOBILE"), eq(smsLogs.templateKey, "bill_notification")))
      .orderBy(sql`${smsLogs.id} desc`)
      .limit(1);
    expect(log?.status).toBe("FAILED");
    expect(log?.message).toBe(result.message);
  });

  it("fails fast with retryable=false when the gateway is not configured", async () => {
    const result = await sendTransactionalSms({
      tenantId: "2147483646", // super-admin id nobody occupies → no settings row
      templateKey: "collection_receipt",
      recipientPhone: "01711967548",
      variables: { customer_name: "Config Probe Co", paid: 1500, due: 500, receipt_no: "MR-PROBE" }
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.retryable).toBe(false); // a retry cannot conjure gateway credentials
    expect(result.response).toBe("SMS Gateway not configured");
    expect(result.message).toBeTruthy();
    // Note: no sms_logs assertion here — the probe tenant id intentionally
    // references no users row, so the audit insert hits the FK boundary and is
    // swallowed; production callers always pass real user ids (covered above).
  });

  it("builds the submission payload with primary→alternative mobile fallback", () => {
    const payload = buildVatSubmissionSmsPayload({
      clientName: "M/S. A. S. A ENTERPRISE",
      clientMobile: "not-valid",
      clientAltMobile: "01711967548",
      clientBin: "001320903-0701",
      taxPeriod: "2026-07",
      submissionId: "VAT-2026-000123",
      adminId: 5,
      sentByUserId: 9
    });

    expect(payload.templateKey).toBe("vat_submission");
    expect(payload.recipientPhone).toBe("8801711967548"); // alternative mobile wins
    expect(payload.referenceType).toBe("submission");
    expect(payload.referenceId).toBe("VAT-2026-000123");
    expect(payload.tenantId).toBe("5");
    expect(payload.triggeredByUserId).toBe("9");
    expect(payload.variables.bin_number).toBe("001320903-0701");
  });

  it("formats tax period labels and passes non-ISO values through", () => {
    expect(formatPeriodLabel("2026-07")).toBe("July-2026");
    expect(formatPeriodLabel("2026-12")).toBe("December-2026");
    expect(formatPeriodLabel("2026-13")).toBe("2026-13"); // out-of-range passthrough
    expect(formatPeriodLabel("July 2026")).toBe("July 2026"); // non-ISO passthrough
    expect(formatPeriodLabel("")).toBe("");
    expect(formatPeriodLabel(null)).toBe("");
  });

  it("enqueues when a live queue exists, falls back inline otherwise — never throws", async () => {
    const outcome = await enqueueTransactionalSms({
      tenantId: "2147483646",
      templateKey: "bill_notification",
      recipientPhone: "01711967548",
      variables: { customer_name: "Queue Probe Co", month: "July-2026", current_bill: 1, due: 0, grand_total: 1 }
    });

    // Deterministic either way: queued iff a Redis-backed queue is reachable
    // (this repo's tests run with Redis disabled → inline fallback, no network
    // because the tenant has no gateway configuration).
    expect(outcome.queued).toBe(redisClientIfReady() !== null);
  });
});
