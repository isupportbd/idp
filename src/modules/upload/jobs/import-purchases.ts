import { shouldQueue } from "@/framework/facade.js";
import { emitProgress } from "@/framework/queue/progress.js";
import { runPurchaseImport } from "@/modules/upload/controllers/upload.controller.js";

/**
 * Why: Bulk purchase imports (thousands of rows) previously ran inside the HTTP
 *      request, holding the event loop while deduping and chunk-inserting.
 * When: POST /api/upload/purchases/save/async enqueues this (flag/threshold gate).
 * Where: import queue worker (`queueConfig.queues` must include "import").
 * How: Reuses the exact `runPurchaseImport` core the sync handler calls, so the
 *      dedup + normalisation logic exists once. Emits `upload:purchases:progress`
 *      broadcasts so the UI can render a live progress bar.
 */
export type PurchaseImportJobData = {
  data: any[];
  month: string;
  isRebate: boolean;
  isFfs: boolean;
  tenantAdminId: number;
  isSuperAdmin: boolean;
  jobId?: string;
  requestId?: string;
};

shouldQueue("upload.purchases.import", "import", async (job) => {
  const d = job.data as PurchaseImportJobData;
  const total = Array.isArray(d.data) ? d.data.length : 0;

  const result = await runPurchaseImport({
    data: d.data,
    month: d.month,
    isRebate: d.isRebate,
    isFfs: d.isFfs,
    tenantAdminId: d.tenantAdminId,
    isSuperAdmin: d.isSuperAdmin,
    onProgress: ({ total: t, processed }) => {
      emitProgress(
        "upload:purchases:progress",
        {
          jobId: d.jobId ?? job.id,
          requestId: d.requestId,
          tenantId: d.tenantAdminId,
          total: t,
          processed,
          success: processed,
          failed: 0
        },
        false,
        { mode: "count", step: 500 },
        { tenant: d.tenantAdminId }
      );
    }
  });

  const inserted = result.totalRowsProcessed;

  // Guaranteed final event so the UI always reaches 100% (the chunk loop only
  // fires on 500-row boundaries, which may not land exactly on the last row).
  emitProgress(
    "upload:purchases:progress",
    {
      jobId: d.jobId ?? job.id,
      requestId: d.requestId,
      tenantId: d.tenantAdminId,
      total: Math.max(total, inserted),
      processed: Math.max(total, inserted),
      success: inserted,
      failed: 0,
      final: true
    },
    true,
    { mode: "count", step: 500 },
    { tenant: d.tenantAdminId }
  );

  return {
    totalRowsProcessed: inserted,
    duplicates: result.duplicatesList.length,
    ffsPending: result.ffsPendingList.length
  };
});
