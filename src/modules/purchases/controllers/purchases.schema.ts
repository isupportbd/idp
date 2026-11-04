import { z } from "@/framework/facade.js";

export const batchDeletePurchasesSchema = z.object({
  month: z.string().optional(),
  clientId: z.union([z.number(), z.string()]).optional(),
  ids: z.array(z.number()).optional()
});

export type BatchDeletePurchasesInput = z.infer<typeof batchDeletePurchasesSchema>;

export const purchaseListItemSchema = z.object({
  id: z.number().int(),
  clientId: z.number().int(),
  clientName: z.string().nullable().optional(),
  clientBin: z.string().nullable().optional(),
  office: z.string().nullable().optional(),
  beNo: z.string().nullable().optional(),
  beDate: z.string(),
  month: z.string(),
  lcNumber: z.string().nullable().optional(),
  netWt: z.number(),
  excessQty: z.number().nullable().optional(),
  totalQty: z.number().nullable().optional(),
  assValue: z.number(),
  unitValue: z.number().nullable().optional(),
  cd: z.number().nullable().optional(),
  rd: z.number().nullable().optional(),
  sd: z.number().nullable().optional(),
  baseValueOfVat: z.number().nullable().optional(),
  vat: z.number().nullable().optional(),
  at: z.number().nullable().optional(),
  isRebate: z.boolean().nullable().optional(),
  isFfs: z.boolean().nullable().optional(),
  itemId: z.number().int(),
  itemName: z.string().nullable().optional(),
  hsCode: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.date()])
});

export const purchasesListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(purchaseListItemSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    totalCount: z.number().int(),
    totalPages: z.number().int()
  })
});

