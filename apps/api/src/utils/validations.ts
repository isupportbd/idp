import { z } from 'zod';

// Reusable schemas
const passwordSchema = z
  .string({ message: 'Password is required' })
  .min(6, 'Password must be at least 6 characters long');

const emailSchema = z
  .string({ message: 'Email is required' })
  .email('Invalid email format');

const mobileSchema = z
  .string({ message: 'Mobile number is required' })
  .min(10, 'Mobile number must be at least 10 digits')
  .max(15, 'Mobile number is too long');

// specific endpoints schemas
export const registerSchema = z.object({
  name: z.string({ message: 'Name is required' }).min(2, 'Name must be at least 2 characters'),
  email: emailSchema,
  mobile: mobileSchema,
  password: passwordSchema,
  planId: z.number().optional().nullable(),
  trxId: z.string().optional().nullable(),
});

export const loginSchema = z.object({
  loginId: z.string({ message: 'Email or Mobile is required' }).min(1, 'Email or Mobile is required'),
  password: z.string({ message: 'Password is required' }).min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string({ message: 'Current password is required' }),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  name: z.string({ message: 'Name is required' }).min(2, 'Name must be at least 2 characters'),
  email: emailSchema,
  mobile: mobileSchema,
  password: passwordSchema,
});
