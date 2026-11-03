import { z } from "@/framework/facade.js";

export const SavePurchasesSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())).min(1, "Data cannot be empty"),
  month: z.string().min(1, "Month is required"),
  isRebate: z.boolean().optional(),
  isFfs: z.boolean().optional()
});

export const ReplaceDuplicateSchema = z.object({
  itemsToReplace: z.array(z.record(z.string(), z.unknown())).min(1, "No items provided for replacement")
});

export const SavePendingFfsSchema = z.object({
  itemsToSave: z.array(z.record(z.string(), z.unknown())).min(1, "No FFS items provided"),
  takeRebate: z.boolean().optional()
});
