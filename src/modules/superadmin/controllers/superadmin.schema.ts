import { z } from "@/framework/facade.js";

export const PlanSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Plan name is required"),
  rateMonthly: z.coerce.number().min(0, "Monthly rate must be positive"),
  rateYearly: z.coerce.number().min(0, "Yearly rate must be positive"),
  maxUsers: z.coerce.number().min(1, "Max users must be at least 1").default(1),
  maxClients: z.coerce.number().min(1, "Max clients must be at least 1").default(50),
  maxStorageMB: z.coerce.number().min(100, "Max storage must be at least 100 MB").default(1024),
  hasAccounts: z.boolean().default(false),
  yearlyDiscountPercent: z.coerce.number().default(0),
  features: z.array(z.string()).default([]),
  status: z.string().default("active")
});

export const ApproveSignupSchema = z.object({
  userId: z.coerce.number(),
  days: z.coerce.number().optional().nullable()
});

export const RejectSignupSchema = z.object({
  userId: z.coerce.number()
});

export const ExtendTenantSchema = z.object({
  days: z.coerce.number().min(1, "Days must be at least 1")
});

export const PaymentSettingsSchema = z.object({
  bkashNumber: z.string().min(1, "bKash number is required"),
  bkashCharge: z.coerce.number().min(0).default(1.8),
  nagadNumber: z.string().optional().nullable(),
  rocketNumber: z.string().optional().nullable()
});

export const ClientTypeSchema = z.object({
  name: z.string().optional(),
  typeName: z.string().optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true)
}).refine(data => !!(data.name || data.typeName), {
  message: "Name is required"
});

export const LocationSchema = z.object({
  name: z.string().min(1, "Location name is required"),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true)
});

export const CommercialAreaSchema = z.object({
  name: z.string().min(1, "Area name is required"),
  locationId: z.coerce.number(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true)
});

export const ClientReferenceSchema = z.object({
  name: z.string().min(1, "Reference name is required"),
  mobile: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true)
});

export const ColumnMappingsSchema = z.object({
  rows: z.array(z.object({
    dbColumn: z.string().optional(),
    label: z.string().optional(),
    aliases: z.unknown().optional(),
    excelColumn: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
    fieldOrder: z.coerce.number().optional()
  }))
});

export const GlobalItemSchema = z.object({
  hsCode: z.string().min(1, "HS Code is required"),
  name: z.string().min(1, "Name is required"),
  awHsCode: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true)
});

export const MeasurementUnitSchema = z.object({
  code: z.string().min(1, "Unit Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true)
});

export const ServiceUnitSchema = z.object({
  code: z.string().min(1, "Unit Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true)
});

export const VatNoteSchema = z.object({
  vatRate: z.coerce.number(),
  noteName: z.string().min(1, "Note Name is required"),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true)
});

export const UnitConversionSchema = z.object({
  purchaseUnit: z.string().min(1, "Purchase unit is required"),
  salesUnit: z.string().min(1, "Sales unit is required"),
  factor: z.coerce.number()
});
