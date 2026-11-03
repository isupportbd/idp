import { z } from "@/framework/facade.js";

export const itemInputSchema = z.object({
  hsCode: z.string().optional(),
  awHsCode: z.string().optional(),
  name: z.string().optional(),
  unit: z.string().optional()
});

export const bulkCreateItemsSchema = z.object({
  items: z.array(itemInputSchema).min(1, "No items provided")
});

export type BulkCreateItemsInput = z.infer<typeof bulkCreateItemsSchema>;
