import { shouldQueue } from "@/framework/facade.js";
import { emitProgress } from "@/framework/queue/progress.js";
import { billingScope } from "@/framework/realtime/event-builders.js";
import { runBatchGeneration } from "@/modules/billing/controllers/billing.controller.js";

/**
 * Why: Offloads invoice batch generation off the HTTP event loop. Large batches
 *      (hundreds of clients) previously blocked the request for the whole run.
 * When: POST /api/billing/batch/async enqueues this (flag/threshold gated).
 * Where: billing queue worker (`queueConfig.queues` must include "billing").
 * How: Reuses the exact same `runBatchGeneration` core as the sync handler, so
 *      the billing math exists once. Emits `billing:batch:progress` broadcasts
 *      so the UI can show live progress without polling the DB.
 */
export type BatchGenerateJobData = {
  taxPeriod: string;
  billDate?: string | null;
  dueDate?: string | null;
  clientIds?: number[];
  creatorId: number | null;
  isSuperAdmin: boolean;
  tenantId?: number | null;
  jobId?: string;
  requestId?: string;
};

shouldQueue("billing.batch.generate", "billing", async (job) => {
  const d = job.data as BatchGenerateJobData;
  const scope = billingScope(d.tenantId ?? null);

  const result = await runBatchGeneration({
    taxPeriod: d.taxPeriod,
    billDate: d.billDate ?? undefined,
    dueDate: d.dueDate ?? undefined,
    clientIds: d.clientIds,
    creatorId: d.creatorId,
    isSuperAdmin: d.isSuperAdmin,
    onProgress: ({ total, processed, created, skipped }) => {
      emitProgress(
        "billing:batch:progress",
        {
          jobId: d.jobId ?? job.id,
          requestId: d.requestId,
          tenantId: d.tenantId ?? null,
          total,
          processed,
          success: created,
          failed: 0,
          skipped,
          final: processed >= total
        },
        false,
        { mode: "percent", step: 5 },
        scope
      );
    }
  });

  // `null` means no active clients were found — a successful no-op, not a failure.
  const createdCount = result?.createdBillsList.length ?? 0;
  const skippedCount = result?.skippedCount ?? 0;

  // Emit a guaranteed final progress event so the UI always reaches 100%.
  emitProgress(
    "billing:batch:progress",
    {
      jobId: d.jobId ?? job.id,
      requestId: d.requestId,
      tenantId: d.tenantId ?? null,
      total: createdCount + skippedCount,
      processed: createdCount + skippedCount,
      success: createdCount,
      failed: 0,
      skipped: skippedCount,
      final: true
    },
    true,
    { mode: "percent", step: 5 },
    scope
  );

  return { createdCount, skippedCount };
});
