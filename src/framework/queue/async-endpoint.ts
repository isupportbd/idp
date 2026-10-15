import { type JobsOptions } from "bullmq";
import type { Context } from "hono";
import crypto from "node:crypto";
import { queueJob } from "@/framework/queue/queue.js";

export type AsyncQueueOptions = {
  queue?: string;
  delay?: number;
  attempts?: number;
  jobId?: string;
  priority?: number;
  removeOnComplete?: JobsOptions["removeOnComplete"];
  removeOnFail?: JobsOptions["removeOnFail"];
  backoff?: JobsOptions["backoff"];
};

/** Truthy parser for env-flag gates (BILLING_BATCH_ASYNC, EXCEL_IMPORT_ASYNC, ...). */
export function isAsyncFlagEnabled(envName: string): boolean {
  const v = (process.env[envName] || "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

/**
 * Why: Re-run a request safely without creating a duplicate job.
 * How: A caller-supplied `Idempotency-Key` header always wins; otherwise a
 *      deterministic hash of the provided parts is used.
 */
export function resolveIdempotencyKey(headerKey: string | undefined | null, parts: Array<string | number | null | undefined>): string {
  const h = headerKey?.trim();
  if (h) return h;
  const stable = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join(":");
  return crypto.createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export type HandleAsyncEndpointArgs<TPayload = unknown> = {
  /** Hono context (for `c.json` and the Idempotency-Key header). */
  c: Context;
  /** BullMQ queue name (e.g. "billing", "import"). */
  queue: string;
  /** Registered job name (e.g. "billing.batch.generate"). */
  jobName: string;
  /** Gate: when false the factory short-circuits to `fallback()`. */
  shouldUseAsync: boolean;
  /** Existing synchronous handler — preserves the current API contract. */
  fallback: () => Promise<Response>;
  /** Parts that seed the deterministic idempotency key. */
  idemParts: Array<string | number | null | undefined>;
  /** Build the stable job id from the resolved idempotency key. */
  makeJobId: (idemKey: string) => string;
  /** Build the job payload (closures may capture parsed body/temp-file info). */
  buildPayload: (jobId: string, idemKey: string) => TPayload;
  /** Optional per-endpoint queue overrides (merged over the defaults below). */
  queueOptions?: AsyncQueueOptions;
  /** Runs before enqueue (e.g. persist an uploaded temp file). */
  beforeEnqueue?: () => Promise<void> | void;
  /** Runs when Redis/queue is unavailable, before falling back (e.g. temp cleanup). */
  onQueueUnavailable?: () => Promise<void> | void;
  /** 202 response message + extra fields. */
  successMessage?: string;
  extraResponse?: Record<string, unknown>;
};

/**
 * Why: Collapses the repeated "gate -> enqueue -> 202 -> sync fallback"
 *      controller flow so both async endpoints behave identically.
 * When: An endpoint offers an async variant behind a flag or size threshold.
 * Where: Any module controller hosting a heavy operation.
 * How: Resolves the idempotency key, short-circuits to the sync handler when
 *      `shouldUseAsync` is false, otherwise enqueues with framework defaults
 *      and returns 202 `{ message, jobId, status, queue, ...extra }`. If the
 *      queue is unavailable (`queueJob` -> null), it runs `onQueueUnavailable`
 *      then falls back to the sync handler, keeping the contract intact.
 */
export async function handleAsyncEndpoint<TPayload = unknown>(args: HandleAsyncEndpointArgs<TPayload>): Promise<Response> {
  const { c } = args;

  if (!args.shouldUseAsync) {
    return await args.fallback();
  }

  const idemKey = resolveIdempotencyKey(c.req.header("Idempotency-Key"), args.idemParts);
  const jobId = args.makeJobId(idemKey);

  if (args.beforeEnqueue) await args.beforeEnqueue();

  const job = await queueJob(args.jobName, args.buildPayload(jobId, idemKey), {
    queue: args.queue,
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
    ...(args.queueOptions || {})
  });

  if (!job) {
    if (args.onQueueUnavailable) await args.onQueueUnavailable();
    return await args.fallback();
  }

  return c.json(
    {
      message: args.successMessage || "Queued",
      jobId: job.id,
      status: "queued",
      queue: args.queue,
      ...(args.extraResponse || {})
    },
    202
  );
}
