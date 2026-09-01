import { Hono } from 'hono';
import { db } from '../db';
import { users, otps } from '../db/schema';
import { eq, and, gt } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import * as nodemailer from 'nodemailer';
import { authenticate } from '../middlewares/auth';

type Variables = {
  user: any;
};

const profile = new Hono<{ Variables: Variables }>();

// Use shared auth middleware (correct JWT secret + userId payload)
profile.use('*', authenticate);

profile.put('/update-name', async (c) => {
  const user = c.get('user');
  const { name } = await c.req.json();
  if (!name) return c.json({ success: false, message: 'Name is required' });

  await db.update(users)
    .set({ name })
    .where(eq(users.id, user.userId || user.id));

  return c.json({ success: true, message: 'Name updated successfully' });
});

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

profile.post('/request-password-change', async (c) => {
  const user = c.get('user');
  console.log('USER IN PROFILE ROUTE:', user);

  const [dbUser] = await db.select().from(users).where(eq(users.id, user.userId || user.id));
  if (!dbUser || !dbUser.email) {
    return c.json({ success: false, message: 'User or email not found' });
  }

  // Generate 6-digit OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(otps).values({
    userId: dbUser.id,
    email: dbUser.email,
    otpCode,
    expiresAt,
  });

  try {
    await transporter.sendMail({
      from: `"IDP System" <${process.env.SMTP_USER || 'noreply@isupportbd.com'}>`,
      to: dbUser.email,
      subject: 'Password Change Verification Code',
      text: `Your OTP for password change is: ${otpCode}. It is valid for 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2563eb;">Password Change Request</h2>
          <p>Hello ${dbUser.name},</p>
          <p>You requested to change your password. Please use the following One-Time Password (OTP) to proceed:</p>
          <h1 style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: center; letter-spacing: 5px; font-size: 32px; color: #0f172a;">
            ${otpCode}
          </h1>
          <p>This code is valid for <strong>10 minutes</strong>. If you did not request this change, please ignore this email.</p>
          <p>Thank you,<br/>IDP System Team</p>
        </div>
      `,
    });
    return c.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Email send error:', error);
    return c.json({ success: false, message: 'Failed to send OTP email. Please check SMTP configuration.' });
  }
});

profile.post('/verify-password-change', async (c) => {
  const user = c.get('user');
  const { otp, newPassword } = await c.req.json();

  if (!otp || !newPassword) {
    return c.json({ success: false, message: 'OTP and new password are required' });
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, user.userId || user.id));
  if (!dbUser) return c.json({ success: false, message: 'User not found' });

  const [validOtp] = await db.select().from(otps).where(
    and(
      eq(otps.userId, dbUser.id),
      eq(otps.otpCode, otp),
      eq(otps.isUsed, false),
      gt(otps.expiresAt, new Date())
    )
  );

  if (!validOtp) {
    return c.json({ success: false, message: 'Invalid or expired OTP' });
  }

  await db.update(otps)
    .set({ isUsed: true })
    .where(eq(otps.id, validOtp.id));

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.update(users)
    .set({ passwordHash })
    .where(eq(users.id, dbUser.id));

  return c.json({ success: true, message: 'Password changed successfully' });
});

export default profile;
