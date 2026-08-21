import { Hono } from 'hono';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, and, or, ilike, sql } from 'drizzle-orm';
import { authenticate } from '../middlewares/auth';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const usersApp = new Hono<{ Variables: Variables }>();

usersApp.use('*', authenticate);

usersApp.get('/stats', async (c) => {
  try {
    const currentUser = c.get('user');
    
    // Only admins or superadmins can view stats
    if (currentUser.role === 'user') {
      return c.json({ success: false, message: 'Unauthorized' }, 403);
    }

    // Admins see users where adminId = their id (plus themselves if we want).
    // Let's get all users who belong to this admin, or superadmin sees everyone.
    let condition = undefined;
    if (currentUser.role === 'admin') {
      // Find users under this admin OR the admin themselves
      condition = or(
        eq(users.adminId, currentUser.userId),
        eq(users.id, currentUser.userId)
      );
    }

    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      lastActive: users.lastActive,
      lastPage: users.lastPage,
    }).from(users).where(condition);

    const now = new Date();
    
    let activeCount = 0;
    let onlineCount = 0;

    const formattedUsers = allUsers.map(u => {
      let isOnline = false;
      let isActive = false;

      if (u.id === currentUser.userId) {
        // The user making the request is definitely active right now
        isOnline = true;
        isActive = true;
        onlineCount++;
        activeCount++;
        u.lastActive = now; // Update visually for the response
      } else if (u.lastActive) {
        const diffMs = now.getTime() - new Date(u.lastActive).getTime();
        const diffMinutes = diffMs / (1000 * 60);

        if (diffMinutes <= 30) {
          isOnline = true;
          onlineCount++;
        }
        if (diffMinutes <= 5) {
          isActive = true;
          activeCount++;
        }
      }

      return {
        ...u,
        isOnline,
        isActive
      };
    });

    // Sort by active first, then online, then name
    formattedUsers.sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return a.name.localeCompare(b.name);
    });

    return c.json({
      success: true,
      stats: {
        active: activeCount,
        online: onlineCount,
        users: formattedUsers
      }
    });

  } catch (error) {
    console.error('Error fetching user stats:', error);
    return c.json({ success: false, message: 'Failed to fetch user stats' }, 500);
  }
});

// Get all sub-users under current admin
usersApp.get('/', async (c) => {
  try {
    const currentUser = c.get('user');
    if (currentUser.role === 'user') return c.json({ success: false, message: 'Unauthorized' }, 403);

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const search = c.req.query('search') || '';
    const offset = (page - 1) * limit;

    const conditions = [eq(users.adminId, currentUser.userId)];
    
    if (search) {
      conditions.push(
        or(
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`),
          ilike(users.mobile, `%${search}%`)
        )!
      );
    }

    const whereClause = and(...conditions);

    const dataQuery = db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      mobile: users.mobile,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      lastActive: users.lastActive
    })
    .from(users)
    .where(whereClause)
    .limit(limit)
    .offset(offset);

    const countQuery = db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);

    const [data, [{ count }]] = await Promise.all([
      dataQuery,
      countQuery
    ]);

    return c.json({ success: true, data, total: Number(count) });
  } catch (error) {
    console.error('Error fetching users:', error);
    return c.json({ success: false, message: 'Failed to fetch users' }, 500);
  }
});

// Create new user under current admin
usersApp.post('/', async (c) => {
  try {
    const currentUser = c.get('user');
    if (currentUser.role === 'user') return c.json({ success: false, message: 'Unauthorized' }, 403);

    const body = await c.req.json();
    const { name, email, mobile, password } = body;

    if (!name || !email || !password) {
      return c.json({ success: false, message: 'Name, email, and password are required' }, 400);
    }

    const { sql } = await import('drizzle-orm');
    const { plans } = await import('../db/schema');

    // Fetch the current admin's plan ID
    const adminData = await db.select({ planId: users.planId }).from(users).where(eq(users.id, currentUser.userId)).limit(1);
    const planId = adminData[0]?.planId;

    if (planId) {
      const planData = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
      if (planData.length > 0) {
        const maxUsers = planData[0].maxUsers;
        const existingCountData = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.adminId, currentUser.userId));
        const currentCount = Number(existingCountData[0].count);

        if (currentCount >= maxUsers) {
          return c.json({ success: false, message: `User limit reached for your plan (Max: ${maxUsers})` }, 400);
        }
      }
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);

    await db.insert(users).values({
      name,
      email,
      mobile: mobile || null,
      passwordHash,
      role: 'user',
      adminId: currentUser.userId,
      status: 'active',
      planId: planId || null,
    });

    return c.json({ success: true, message: 'User created successfully' });
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error.code === '23505') {
      return c.json({ success: false, message: 'Email or mobile number already exists' }, 400);
    }
    return c.json({ success: false, message: 'Failed to create user' }, 500);
  }
});

// Update user
usersApp.put('/:id', async (c) => {
  try {
    const currentUser = c.get('user');
    if (currentUser.role === 'user') return c.json({ success: false, message: 'Unauthorized' }, 403);

    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    const { name, email, mobile, password } = body;

    const existing = await db.select().from(users).where(and(eq(users.id, id), eq(users.adminId, currentUser.userId))).limit(1);
    if (existing.length === 0) return c.json({ success: false, message: 'User not found' }, 404);

    const updateData: any = { name, email, mobile: mobile || null };
    
    if (password) {
      const bcrypt = await import('bcryptjs');
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    await db.update(users).set(updateData).where(eq(users.id, id));

    return c.json({ success: true, message: 'User updated successfully' });
  } catch (error: any) {
    console.error('Error updating user:', error);
    if (error.code === '23505') return c.json({ success: false, message: 'Email or mobile number already exists' }, 400);
    return c.json({ success: false, message: 'Failed to update user' }, 500);
  }
});

// Delete user
usersApp.delete('/:id', async (c) => {
  try {
    const currentUser = c.get('user');
    if (currentUser.role === 'user') return c.json({ success: false, message: 'Unauthorized' }, 403);

    const id = parseInt(c.req.param('id'));
    
    const existing = await db.select().from(users).where(and(eq(users.id, id), eq(users.adminId, currentUser.userId))).limit(1);
    if (existing.length === 0) return c.json({ success: false, message: 'User not found' }, 404);

    await db.delete(users).where(eq(users.id, id));

    return c.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return c.json({ success: false, message: 'Failed to delete user' }, 500);
  }
});

export default usersApp;
