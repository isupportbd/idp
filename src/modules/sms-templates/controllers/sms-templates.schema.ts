import { z } from "@/framework/facade.js";

export const UpdateTemplateSchema = z.object({
  body: z.string().min(1, "Template body cannot be empty").optional(),
  isActive: z.boolean().optional()
});

export const SendTestSmsSchema = z.object({
  recipientMobile: z.string().min(1, "Recipient mobile is required"),
  message: z.string().min(1, "Message is required")
});

export const UpdateGatewaySettingsSchema = z.object({
  smsApiKey: z.string().optional().nullable(),
  smsSenderId: z.string().optional().nullable(),
  provider: z.string().optional().nullable(),
  endpoint: z.string().optional().nullable()
});
