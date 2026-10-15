import { type BroadcastOptions, broadcast } from "@/framework/realtime/broadcast.js";

export type ProgressMeta = {
  jobId?: string;
  requestId?: string;
  tenantId?: string | number | null;
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped?: number;
  errorsCount?: number;
  final?: boolean;
};

/**
 * Cadence is either a row count (why: imports) or a percent step (why: batch
 * jobs). A plain number is treated as a percent step so simple call sites stay
 * readable while count-based callers opt into the object form.
 */
export type ProgressCadence = number | { mode: "percent" | "count"; step: number };

export function progressPercent(processed: number, total: number): number {
  return total <= 0 ? 100 : Math.floor((processed * 100) / total);
}

export function shouldEmitProgress(processed: number, total: number, force = false, cadence: ProgressCadence = 5): boolean {
  if (force) return true;
  if (total <= 0) return true;
  if (processed === 1 || processed === total) return true;

  const c = typeof cadence === "number" ? { mode: "percent" as const, step: cadence } : cadence;
  if (c.step <= 0) return false;
  if (c.mode === "count") return processed % c.step === 0;
  return progressPercent(processed, total) % c.step === 0;
}

/**
 * Why: One implementation of the throttle + envelope + broadcast block that
 *      was duplicated between batch billing and purchase import workers.
 * When: Once per iteration inside a long-running BullMQ handler.
 * Where: Job handlers under `src/modules/<module>/jobs`.
 * How: Skips unless the iteration lands on a cadence boundary (or `force` is
 *      true), then emits a payload carrying a computed percent + timestamp to
 *      the provided broadcast scope. Returns nothing so call sites stay light.
 */
export function emitProgress(
  event: string,
  meta: ProgressMeta,
  force = false,
  cadence: ProgressCadence = 5,
  scope: BroadcastOptions = {}
): void {
  if (!shouldEmitProgress(meta.processed, meta.total, force, cadence)) return;

  broadcast(event, { ...meta, percent: progressPercent(meta.processed, meta.total), timestamp: Date.now() }, scope);
}
