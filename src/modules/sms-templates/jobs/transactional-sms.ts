import { shouldQueue } from "@/framework/facade.js";
import { type SendTransactionalSmsPayload, sendTransactionalSms } from "@/modules/sms-templates/services/sms.service.js";

/**
 * Why: Transactional SMS delivery (0.5–3 s per gateway call) must never run on
 *      the HTTP event loop — a batch of 100 invoices would freeze requests and
 *      a flaky gateway could crash an otherwise-committed save.
 * When: Controllers call `enqueueTransactionalSms()` after a successful write.
 * Where: `sms` worker (`queueConfig.queues` must include "sms"; the file is
 *        auto-discovered by the framework's module jobs-directory glob).
 * How: Runs the shared `sendTransactionalSms` core (render → gateway →
 *      sms_logs audit → balance sync). Throws ONLY for transient failures so
 *      BullMQ retries them (3 attempts, exponential backoff); permanent
 *      errors (bad number, gateway not configured, insufficient balance) fail
 *      fast instead of burning retries on outcomes that cannot change.
 */
shouldQueue("sms.transactional.send", "sms", async (job) => {
  const payload = job.data as SendTransactionalSmsPayload;
  const result = await sendTransactionalSms(payload);

  if (!result.ok && result.retryable) {
    throw new Error(`[sms.transactional.send] transient failure: ${result.response}`);
  }

  return { ok: result.ok, status: result.status, templateKey: payload.templateKey };
});
