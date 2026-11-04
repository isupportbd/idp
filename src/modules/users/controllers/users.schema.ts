import { z } from "@/framework/facade.js";

export const CreateUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  mobile: z.string().min(1, "Mobile is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "user"]).default("user"),
  status: z.enum(["active", "inactive"]).default("active"),
  permissions: z.array(z.string()).default([])
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  email: z.string().email("Valid email is required").optional(),
  mobile: z.string().optional(),
  role: z.enum(["admin", "user"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  permissions: z.array(z.string()).optional()
});

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters")
});

export const UpdateStatusSchema = z.object({
  status: z.enum(["active", "inactive"]).optional()
});

export const IdParamSchema = z.object({
  id: z.string()
});

export const UserItemResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  email: z.string(),
  mobile: z.string(),
  role: z.string(),
  status: z.string(),
  permissions: z.array(z.string()),
  createdAt: z.string(),
  lastActive: z.string(),
  lastPage: z.string()
});

export const ListUsersResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: z.array(UserItemResponseSchema)
});

export const UserMutationResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  data: UserItemResponseSchema.optional()
});

export const UpdateStatusResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  status: z.string().optional()
});

export const PermissionCatalogResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.string(), z.any()),
  defaults: z.array(z.string())
});

