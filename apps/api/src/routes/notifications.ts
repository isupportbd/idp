import { Hono } from 'hono';
import { db } from '../db';
import { notifications, purchases, salesRates, users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate, requireRole } from '../middlewares/auth';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const notificationsApp = new Hono<{ Variables: Variables }>();

notificationsApp.use('*', authenticate, requireRole(['superadmin']));

// GET /
notificationsApp.get('/', async (c) => {
  try {
    const data = await db.select().from(notifications).orderBy(notifications.createdAt);
    
    let allNotifications = [...data];

    if (c.var.user.role === 'superadmin') {
      const pendingAdmins = await db.select().from(users).where(eq(users.status, 'pending'));
      const virtualNotifs = pendingAdmins.map(u => ({
        id: -u.id,
        message: `New Admin Signup: ${u.name} (${u.mobile}) is waiting for approval.`,
        isRead: false,
        createdAt: u.createdAt,
        clientId: 0,
        oldAdminId: 0,
        newAdminId: 0
      }));
      allNotifications = [...allNotifications, ...virtualNotifs];
    }

    // Sort descending by date
    allNotifications.sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());

    return c.json({ success: true, data: allNotifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return c.json({ success: false, message: 'Failed to fetch notifications' }, 500);
  }
});

// DELETE /:id (dismiss notification)
notificationsApp.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) return c.json({ success: false, message: 'Invalid ID' }, 400);

    if (id < 0) {
      return c.json({ success: true, message: 'Virtual notification' });
    }

    await db.delete(notifications).where(eq(notifications.id, id));
    return c.json({ success: true });
  } catch (error) {
    return c.json({ success: false, message: 'Failed to delete' }, 500);
  }
});

// DELETE /clear-old-data/:clientId/:oldAdminId
notificationsApp.delete('/clear-old-data/:clientId/:oldAdminId', async (c) => {
  try {
    const clientId = parseInt(c.req.param('clientId'));
    const oldAdminId = parseInt(c.req.param('oldAdminId'));

    if (isNaN(clientId) || isNaN(oldAdminId)) {
      return c.json({ success: false, message: 'Invalid parameters' }, 400);
    }

    // Delete old purchases and sales rates for this client and old admin
    await db.delete(purchases).where(and(eq(purchases.clientId, clientId), eq(purchases.adminId, oldAdminId)));
    await db.delete(salesRates).where(and(eq(salesRates.clientId, clientId), eq(salesRates.adminId, oldAdminId)));

    return c.json({ success: true, message: 'Old data deleted successfully.' });
  } catch (error) {
    console.error('Error deleting old data:', error);
    return c.json({ success: false, message: 'Failed to delete old data.' }, 500);
  }
});

export default notificationsApp;
