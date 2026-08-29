import { Hono } from 'hono';
import { db } from '../db';
import { clients, purchases, salesRates, users, clientCredentials, notifications, items } from '../db/schema';
import { eq, and, inArray, ilike, or, sql } from 'drizzle-orm';
import { authenticate, requireRole } from '../middlewares/auth';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const clientsApp = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all routes in this app
clientsApp.use('*', authenticate);

// GET /
clientsApp.get('/', async (c) => {
  try {
    const user = c.get('user');
    const adminId = user.adminId;
    const role = user.role;

    const month = c.req.query('month');

    let validClientIds: number[] | null = null;
    if (month) {
      // Find distinct client IDs that have purchases in the given month
      const pQuery = await db
        .select({ clientId: purchases.clientId })
        .from(purchases)
        .where(eq(purchases.month, month));
        
      const uniqueIds = Array.from(new Set(pQuery.map(p => p.clientId)));
      validClientIds = uniqueIds.length > 0 ? uniqueIds : [-1]; // -1 to ensure no match if empty
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const search = c.req.query('search') || '';
    const offset = (page - 1) * limit;

    const conditions = [];

    if (role !== 'superadmin') {
      conditions.push(eq(clients.adminId, adminId));
    }

    if (validClientIds) {
      conditions.push(inArray(clients.id, validClientIds));
    }

    if (search) {
      conditions.push(
        or(
          ilike(clients.name, `%${search}%`),
          ilike(clients.bin, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db.select({
      id: clients.id,
      name: clients.name,
      bin: clients.bin,
      ...(role === 'superadmin' ? { adminName: users.name } : {})
    })
    .from(clients);

    if (role === 'superadmin') {
      baseQuery.leftJoin(users, eq(clients.adminId, users.id));
    }

    const dataQuery = baseQuery
      .where(whereClause)
      .limit(limit)
      .offset(offset);

    const countQuery = db.select({ count: sql<number>`count(*)` })
      .from(clients)
      .where(whereClause);

    const [data, [{ count }]] = await Promise.all([
      dataQuery,
      countQuery
    ]);

    return c.json({ data, total: Number(count) });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return c.json({ error: 'Failed to fetch clients' }, 500);
  }
});

// GET /:id/items
clientsApp.get('/:id/items', async (c) => {
  try {
    const user = c.get('user');
    const clientId = parseInt(c.req.param('id'));

    if (isNaN(clientId)) {
      return c.json({ success: false, message: 'Invalid client ID' }, 400);
    }

    const pQuery = await db
      .select({ 
        id: items.id, 
        name: items.name, 
        hsCode: items.hsCode 
      })
      .from(purchases)
      .innerJoin(items, eq(purchases.itemId, items.id))
      .where(eq(purchases.clientId, clientId));

    // Remove duplicates based on item ID
    const uniqueItemsMap = new Map();
    for (const item of pQuery) {
      if (!uniqueItemsMap.has(item.id)) {
        uniqueItemsMap.set(item.id, item);
      }
    }

    const data = Array.from(uniqueItemsMap.values());

    return c.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching client items:', error);
    return c.json({ success: false, message: 'Failed to fetch client items' }, 500);
  }
});

// DELETE /:id
clientsApp.delete('/:id', requireRole(['superadmin', 'admin']), async (c) => {
  try {
    const user = c.get('user');
    const adminId = user.adminId;
    const clientId = parseInt(c.req.param('id'));

    if (isNaN(clientId)) {
      return c.json({ success: false, message: 'Invalid client ID' }, 400);
    }

    // Verify ownership
    const clientRecord = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
    if (clientRecord.length === 0) {
      return c.json({ success: false, message: 'Client not found.' }, 404);
    }

    if (user.role !== 'superadmin' && clientRecord[0].adminId !== adminId) {
      return c.json({ success: false, message: 'Permission denied. You do not own this client.' }, 403);
    }

    // Safe to delete all associated data
    await db.delete(notifications).where(eq(notifications.clientId, clientId));
    await db.delete(clientCredentials).where(eq(clientCredentials.clientId, clientId));
    await db.delete(salesRates).where(eq(salesRates.clientId, clientId));
    await db.delete(purchases).where(eq(purchases.clientId, clientId));
    await db.delete(clients).where(eq(clients.id, clientId));

    return c.json({ success: true, message: 'Client and all associated data deleted successfully.' });
  } catch (error) {
    console.error('Error deleting client:', error);
    return c.json({ success: false, message: 'Failed to delete client.' }, 500);
  }
});

// PUT /:id/admin
const updateAdminSchema = z.object({
  newAdminId: z.number(),
});

clientsApp.put('/:id/admin', requireRole(['superadmin']), zValidator('json', updateAdminSchema), async (c) => {
  try {
    const clientId = parseInt(c.req.param('id'));
    const { newAdminId } = c.req.valid('json');

    if (isNaN(clientId)) {
      return c.json({ success: false, message: 'Invalid client ID' }, 400);
    }

    const newAdmin = await db.select().from(users).where(and(eq(users.id, newAdminId), eq(users.role, 'admin')));
    if (!newAdmin || newAdmin.length === 0) {
      return c.json({ success: false, message: 'New admin user not found or is not an admin' }, 404);
    }

    await db.update(clients).set({ adminId: newAdminId }).where(eq(clients.id, clientId));
    await db.update(purchases).set({ adminId: newAdminId }).where(eq(purchases.clientId, clientId));
    await db.update(salesRates).set({ adminId: newAdminId }).where(eq(salesRates.clientId, clientId));
    await db.update(clientCredentials).set({ adminId: newAdminId }).where(eq(clientCredentials.clientId, clientId));

    return c.json({ success: true, message: 'Client transferred to new admin successfully.' });
  } catch (error) {
    console.error('Error updating client admin:', error);
    return c.json({ success: false, message: 'Failed to update client admin.' }, 500);
  }
});

export default clientsApp;
