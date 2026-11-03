import { z } from "@/framework/facade.js";

export const batchDeletePurchasesSchema = z.object({
  month: z.string().optional(),
  clientId: z.union([z.number(), z.string()]).optional(),
  ids: z.array(z.number()).optional()
});

export type BatchDeletePurchasesInput = z.infer<typeof batchDeletePurchasesSchema>;
