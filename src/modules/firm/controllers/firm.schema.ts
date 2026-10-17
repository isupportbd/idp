import { z } from "@/framework/facade.js";

export const IdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

// ── COMPANY SETTINGS SCHEMAS ─────────────────────────────────────────

export const CompanySettingsSchema = z.object({
  companyName: z.string().min(1).max(255),
  proprietorName: z.string().max(255).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  website: z.string().max(255).optional().nullable().or(z.literal("")),
  address: z.string().optional().nullable(),
  binNumber: z.string().max(50).optional().nullable(),
  tinNumber: z.string().max(50).optional().nullable(),
  tradeLicenseNo: z.string().max(100).optional().nullable(),
  bkashNumber: z.string().max(50).optional().nullable(),
  nagadNumber: z.string().max(50).optional().nullable(),
  rocketNumber: z.string().max(50).optional().nullable(),
  invoicePrefix: z.string().max(20).default("INV"),
  invoiceTerms: z.string().optional().nullable(),
  receiptPrefix: z.string().max(20).default("MR"),
  autoDueCarryForward: z.boolean().default(true),
  binUniqueEnforcement: z.boolean().default(true),
  allowDuplicateMobile: z.boolean().default(true),
  smsOnBill: z.boolean().default(true),
  smsOnCollection: z.boolean().default(true),
  smsOnSubmission: z.boolean().default(true),
  smsApiKey: z.string().optional().nullable().or(z.literal("")),
  smsSenderId: z.string().max(50).optional().nullable().or(z.literal("")),
  smsProvider: z.string().max(100).optional().nullable().or(z.literal("")),
  smsEndpointUrl: z.string().optional().nullable().or(z.literal("")),
  autoDueReminder: z.boolean().default(false),
  dueReminderDays: z.coerce.number().int().min(1).max(365).default(7),
  dueReminderMinAmount: z.coerce.number().min(0).max(1000000000).default(1000)
});

// ── BANK ACCOUNT SCHEMAS ─────────────────────────────────────────────

export const CreateBankAccountSchema = z.object({
  bankName: z.string().min(1).max(150),
  accountName: z.string().min(1).max(150),
  accountNumber: z.string().min(1).max(100),
  branchName: z.string().max(150).optional().nullable(),
  routingNumber: z.string().max(50).optional().nullable(),
  bkashNumber: z.string().max(50).optional().nullable(),
  nagadNumber: z.string().max(50).optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

export const UpdateBankAccountSchema = CreateBankAccountSchema.partial();

// ── EXPENSE HEAD SCHEMAS ─────────────────────────────────────────────

export const CreateExpenseHeadSchema = z.object({
  name: z.string().min(1).max(150),
  code: z.string().max(50).optional().nullable(),
  category: z.enum(["Operational", "Administrative", "Statutory & Fees", "Marketing", "Miscellaneous"]).default("Operational"),
  description: z.string().optional().nullable(),
  isActive: z.boolean().default(true)
});

export const UpdateExpenseHeadSchema = CreateExpenseHeadSchema.partial();
