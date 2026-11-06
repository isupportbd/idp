import { z } from "@/framework/facade.js";

export const QueryActivityFilterSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Tax period must be in YYYY-MM format")
    .optional(),
  taxPeriod: z.string().optional(),
  search: z.string().optional(),
  clientTypeId: z.coerce.number().optional(),
  referenceId: z.coerce.number().optional(),
  status: z
    .enum([
      "all",
      "active",
      "inactive",
      "active_filed",
      "active_unfiled",
      "inactive_filed",
      "inactive_unfiled",
      "total_filed",
      "total_unfiled"
    ])
    .optional()
    .default("all")
});

export type QueryActivityFilter = z.infer<typeof QueryActivityFilterSchema>;

export const ActivityMatrixItemSchema = z.object({
  id: z.number().int(),
  companyName: z.string(),
  proprietorName: z.string().nullable().optional(),
  binNumber: z.string().nullable().optional(),
  tinNumber: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  alternativeMobile: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  vatUserId: z.string().nullable().optional(),
  vatPassword: z.string().nullable().optional(),
  vatServiceType: z.string().nullable().optional(),
  openingBalance: z.number().optional(),
  isActive: z.boolean(),
  notes: z.string().nullable().optional(),
  customerTypeId: z.number().int().nullable().optional(),
  referenceId: z.number().int().nullable().optional(),
  customerTypeName: z.string().nullable().optional(),
  referenceName: z.string().nullable().optional(),
  beCount: z.number().int(),
  totalNetWt: z.number(),
  totalAssValue: z.number(),
  submissionStatus: z.string(),
  isLate: z.boolean().optional(),
  submittedAt: z.union([z.string(), z.date()]).nullable().optional(),
  submittedBy: z.string().nullable().optional(),
  submissionNotes: z.string().nullable().optional()
});

export const ActivityMatrixResponseSchema = z.object({
  success: z.boolean(),
  month: z.string(),
  data: z.array(ActivityMatrixItemSchema),
  stats: z.object({
    activeClients: z.number().int(),
    activeFiledClients: z.number().int(),
    activeUnfiledClients: z.number().int(),
    inactiveClients: z.number().int(),
    inactiveFiledClients: z.number().int(),
    inactiveUnfiledClients: z.number().int(),
    totalFiledClients: z.number().int(),
    totalUnfiledClients: z.number().int(),
    totalPurchaseSum: z.number(),
    totalBeCount: z.number().int()
  }),
  clientTypes: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      description: z.string().nullable().optional()
    })
  ),
  references: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      phone: z.string().nullable().optional()
    })
  )
});
