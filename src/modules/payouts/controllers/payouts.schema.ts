import { z } from "@/framework/facade.js";

export const PayoutTypeEnum = z.enum(["staff", "general_expense"]);
export const PaymentMethodEnum = z.enum(["BKASH", "BANK", "CASH"]);
const MonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Period must be in YYYY-MM format (e.g. 2026-08)");

export const IdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const UserIdParamSchema = z.object({
  userId: z.coerce.number().int().positive()
});

export const MonthQuerySchema = z.object({
  month: MonthSchema.optional()
});

export const ListPayoutsQuerySchema = z.object({
  month: MonthSchema.optional(),
  payoutType: z.enum(["all", "staff", "general_expense"]).optional(),
  userId: z.coerce.number().int().positive().optional(),
  search: z.string().optional()
});

export const StaffLedgerQuerySchema = z.object({
  userId: z.coerce.number().int().positive(),
  month: MonthSchema.optional()
});

export const CreatePayoutSchema = z.object({
  payoutType: PayoutTypeEnum,
  userId: z.coerce.number().int().positive().optional(),
  expenseHeadId: z.coerce.number().int().positive().optional(),
  bankAccountId: z.coerce.number().int().positive().optional(),
  periodMonth: MonthSchema.optional(),
  amount: z.coerce.number().nonnegative("Amount must be zero or more"),
  paymentMethod: PaymentMethodEnum.default("CASH"),
  accountInfo: z.string().max(255).optional(),
  referenceNo: z.string().max(100).optional(),
  paidAt: z.string().optional(),
  notes: z.string().max(1000).optional()
});

export const SaveUserRatesSchema = z.object({
  rates: z
    .array(
      z.object({
        serviceItemId: z.coerce.number().int().positive(),
        rate: z.coerce.number().nonnegative(),
        effectiveFrom: z.string().optional()
      })
    )
    .max(300)
});
