import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, sql, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { users, plans, otps } from '../db/schema';
import { registerSchema, loginSchema, changePasswordSchema } from '../utils/validations';
import * as nodemailer from 'nodemailer';

const authApp = new Hono();

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// System Status
authApp.get('/system-status', async (c) => {
  try {
    const usersCount = await db.select({ count: sql<number>`count(*)` }).from(users);
    const hasSuperAdmin = usersCount[0].count > 0;
    return c.json({ success: true, hasSuperAdmin });
  } catch (error) {
    console.error('Error checking system status:', error);
    return c.json({ success: false, error: 'Failed to check system status' }, 500);
  }
});

// Register
authApp.post('/register', zValidator('json', registerSchema), async (c) => {
  try {
    const { name, email, mobile, password, planId, trxId } = c.req.valid('json');

    const existingEmail = await db.select().from(users).where(eq(users.email, email));
    if (existingEmail.length > 0) {
      return c.json({ success: false, error: 'Email is already registered.' }, 400);
    }

    const existingMobile = await db.select().from(users).where(eq(users.mobile, mobile));
    if (existingMobile.length > 0) {
      return c.json({ success: false, error: 'Mobile number is already registered.' }, 400);
    }

    const usersCount = await db.select({ count: sql<number>`count(*)` }).from(users);
    const countVal = Number(usersCount[0].count);
    const isFirstUser = countVal === 0;

    const role = isFirstUser ? 'superadmin' : 'admin';
    const status = isFirstUser ? 'active' : 'pending';

    if (!isFirstUser && (!planId || !trxId)) {
      return c.json({ success: false, error: 'Plan and Transaction ID are required for regular signup.' }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.insert(users).values({
      name,
      email,
      mobile,
      passwordHash,
      role,
      status,
      planId: planId || null,
      trxId: trxId || null,
    });

    return c.json({ success: true, message: 'Registration successful', role, status });
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ success: false, error: 'Registration failed' }, 500);
  }
});

// Login
authApp.post('/login', zValidator('json', loginSchema), async (c) => {
  try {
    const { loginId, password } = c.req.valid('json');

    const userResult = await db.select().from(users).where(eq(users.email, loginId));
    let user = userResult[0];

    if (!user) {
      const mobileResult = await db.select().from(users).where(eq(users.mobile, loginId));
      user = mobileResult[0];
    }

    if (!user) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    if (user.status !== 'active') {
      return c.json({ success: false, error: 'Account is pending approval or suspended' }, 403);
    }

    if (user.expDate && new Date(user.expDate) < new Date()) {
      return c.json({ success: false, error: 'Account has expired. Please renew your plan.' }, 403);
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401);
    }

    const userAdminId = user.role === 'admin' ? user.id : (user.adminId || user.id);
    const token = jwt.sign({ userId: user.id, role: user.role, adminId: userAdminId }, JWT_SECRET, { expiresIn: '1d' });

    await db.update(users).set({ lastActive: new Date() }).where(eq(users.id, user.id)).catch(e => console.error(e));

    return c.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, role: user.role, email: user.email, adminId: userAdminId }
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ success: false, error: 'Login failed' }, 500);
  }
});

// Plans
authApp.get('/plans', async (c) => {
  try {
    const allPlans = await db.select().from(plans);
    return c.json({ success: true, data: allPlans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return c.json({ success: false, error: 'Failed to fetch plans' }, 500);
  }
});

// Configure Nodemailer transporter (shared setup)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Forgot Password - Request OTP
authApp.post('/forgot-password-request', async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) {
      return c.json({ success: false, error: 'Email is required' }, 400);
    }

    const [dbUser] = await db.select().from(users).where(eq(users.email, email));
    if (!dbUser || !dbUser.email) {
      return c.json({ success: false, error: 'User with this email not found' }, 404);
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(otps).values({
      userId: dbUser.id,
      email: dbUser.email,
      otpCode,
      expiresAt,
    });

    await transporter.sendMail({
      from: `"IDP System" <${process.env.SMTP_USER || 'noreply@oneassociatebd.com'}>`,
      to: dbUser.email,
      subject: 'Password Reset Code',
      text: `Your OTP for password reset is: ${otpCode}. It is valid for 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">Password Reset Request</h2>
          <p>Hello ${dbUser.name},</p>
          <p>You requested to reset your password. Please use the following One-Time Password (OTP) to proceed:</p>
          <h1 style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; letter-spacing: 5px; font-size: 32px; color: #0f172a;">
            ${otpCode}
          </h1>
          <p>This code is valid for <strong>10 minutes</strong>. If you did not request this reset, please ignore this email.</p>
          <p>Thank you,<br/>IDP System Team</p>
        </div>
      `,
    });

    return c.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Forgot password request error:', error);
    return c.json({ success: false, error: 'Failed to request OTP' }, 500);
  }
});

// Forgot Password - Reset with OTP
authApp.post('/forgot-password-reset', async (c) => {
  try {
    const { email, otp, newPassword } = await c.req.json();
    if (!email || !otp || !newPassword) {
      return c.json({ success: false, error: 'Email, OTP, and new password are required' }, 400);
    }

    const [dbUser] = await db.select().from(users).where(eq(users.email, email));
    if (!dbUser) {
      return c.json({ success: false, error: 'User not found' }, 404);
    }

    const [validOtp] = await db.select().from(otps).where(
      and(
        eq(otps.userId, dbUser.id),
        eq(otps.otpCode, otp),
        eq(otps.isUsed, false),
        gt(otps.expiresAt, new Date())
      )
    );

    if (!validOtp) {
      return c.json({ success: false, error: 'Invalid or expired OTP' }, 400);
    }

    await db.update(otps).set({ isUsed: true }).where(eq(otps.id, validOtp.id));

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, dbUser.id));

    return c.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Forgot password reset error:', error);
    return c.json({ success: false, error: 'Failed to reset password' }, 500);
  }
});

export default authApp;
