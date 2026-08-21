import { createMiddleware } from 'hono/factory';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

type JwtPayload = {
  userId: number;
  role: string;
  adminId: number;
};

export const authenticate = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Authentication required' }, 401);
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    c.set('user', payload);

    const currentPage = c.req.header('x-current-page');
    const updateData: any = { lastActive: new Date() };
    if (currentPage) {
      updateData.lastPage = currentPage;
    }

    // Fire and forget
    db.update(users)
      .set(updateData)
      .where(eq(users.id, payload.userId))
      .catch(err => console.error('Failed to update lastActive/lastPage:', err));

    await next();
  } catch (error) {
    return c.json({ success: false, error: 'Invalid or expired token' }, 403);
  }
});

export const requireRole = (roles: string[]) => {
  return createMiddleware(async (c, next) => {
    const user = c.get('user') as JwtPayload;
    if (!user) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json({ success: false, error: 'Insufficient permissions' }, 403);
    }

    await next();
  });
};
