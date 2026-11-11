import { queueJob } from "@/framework/facade.js";
import { type SendTransactionalSmsPayload, sendTransactionalSms } from "./sms.service.js";

export type { SendTransactionalSmsPayload };

/** Queue + job names must match `queueConfig.queues` and jobs/transactional-sms.ts. */
export const SMS_QUEUE = "sms";
export const TRANSACTIONAL_SMS_JOB = "sms.transactional.send";

/**
 * Why: Single doorway for every transactional SMS (billing / collections /
 *      submissions) so HTTP controllers stay zero-blocking — the gateway call
 *      takes 0.5–3 s and used to risk freezing requests or crashing a save.
 * When: Immediately after a successful financial/compliance write.
 * Where: billing + submissions controllers (future: due-reminder scheduler).
 * How: Pushes to the `sms` queue (the worker retries transient failures with
 *      backoff and writes the sms_logs audit row). When the queue is
 *      unavailable — Redis disabled or down — it falls back to an INLINE
 *      BACKGROUND send so delivery still happens exactly as before.
 *      Never throws into the caller.
 */
export type EnqueueTransactionalSmsResult = {
  queued: boolean;
  /** Present only when the queue was unavailable and the send ran inline. */
  inline?: Promise<import("./sms.service.js").TransactionalSmsResult>;
};

export async function enqueueTransactionalSms(payload: SendTransactionalSmsPayload): Promise<EnqueueTransactionalSmsResult> {
  // Always trigger self-managed background dispatch (zero blocking, no external worker dependency)
  const inline = sendTransactionalSms(payload).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[SMS] Background send failed:", message);
    return {
      ok: false,
      status: "FAILED" as const,
      response: message,
      message: "",
      retryable: false
    } as import("./sms.service.js").TransactionalSmsResult;
  });
  void inline;

  return { queued: false, inline };
}
