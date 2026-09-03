import { Hono } from 'hono';
import { db } from '../db';
import { salesRates, clients, items, unitConversions } from '../db/schema';
import { eq, and, desc, ilike, or, sql } from 'drizzle-orm';
import { authenticate, requireRole } from '../middlewares/auth';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { appEvents } from '../events';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const salesRatesApp = new Hono<{ Variables: Variables }>();

salesRatesApp.use('*', authenticate);

// GET /
salesRatesApp.get('/', async (c) => {
  try {
    const user = c.get('user');

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '15');
    const clientFilter = c.req.query('clientFilter');
    const itemFilter = c.req.query('itemFilter');
    const rateFilter = c.req.query('rateFilter');
    const search = c.req.query('search');
    const offset = (page - 1) * limit;

    const conditions = [];
    if (user.role !== 'superadmin') {
      conditions.push(eq(salesRates.adminId, user.adminId));
    }

    if (clientFilter) conditions.push(ilike(clients.name, `%${clientFilter}%`));
    if (itemFilter) conditions.push(ilike(items.name, `%${itemFilter}%`));
    if (rateFilter && !isNaN(Number(rateFilter))) conditions.push(eq(salesRates.salesRate, Number(rateFilter)));
    
    if (search) {
      conditions.push(
        or(
          ilike(clients.name, `%${search}%`),
          ilike(items.name, `%${search}%`),
          ilike(clients.bin, `%${search}%`),
          ilike(items.hsCode, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const baseQuery = db
      .select({
        id: salesRates.id,
        clientId: salesRates.clientId,
        clientName: clients.name,
        clientBin: clients.bin,
        itemId: salesRates.itemId,
        itemName: items.name,
        itemHsCode: items.hsCode,
        unitId: salesRates.unitId,
        unitName: unitConversions.salesUnit,
        salesRate: salesRates.salesRate,
        vatRate: salesRates.vatRate,
        vatableValue: salesRates.vatableValue,
        additionPercent: salesRates.additionPercent,
        activationDate: salesRates.activationDate,
        status: salesRates.status,
      })
      .from(salesRates)
      .leftJoin(clients, eq(salesRates.clientId, clients.id))
      .leftJoin(items, eq(salesRates.itemId, items.id))
      .leftJoin(unitConversions, eq(salesRates.unitId, unitConversions.id))
      .where(whereClause);

    const dataQuery = baseQuery
      .orderBy(desc(salesRates.id))
      .limit(limit)
      .offset(offset);

    const countQuery = db.select({ count: sql<number>`count(*)` })
      .from(salesRates)
      .leftJoin(clients, eq(salesRates.clientId, clients.id))
      .leftJoin(items, eq(salesRates.itemId, items.id))
      .where(whereClause);

    const [data, [{ count }]] = await Promise.all([
      dataQuery,
      countQuery
    ]);

    return c.json({ data, total: Number(count) });
  } catch (error) {
    console.error('Error fetching sales rates:', error);
    return c.json({ error: 'Failed to fetch sales rates' }, 500);
  }
});

// GET /active/:clientId — fast endpoint for reports (only active rates for a specific client)
salesRatesApp.get('/active/:clientId', async (c) => {
  try {
    const user = c.get('user');
    const clientId = parseInt(c.req.param('clientId'));
    if (isNaN(clientId)) return c.json({ error: 'Invalid clientId' }, 400);

    const conditions = [
      eq(salesRates.clientId, clientId),
      eq(salesRates.status, 'Active'),
    ];
    if (user.role !== 'superadmin') {
      conditions.push(eq(salesRates.adminId, user.adminId));
    }

    const data = await db
      .select({
        id: salesRates.id,
        clientId: salesRates.clientId,
        itemId: salesRates.itemId,
        unitId: salesRates.unitId,
        salesRate: salesRates.salesRate,
        vatRate: salesRates.vatRate,
        vatableValue: salesRates.vatableValue,
        additionPercent: salesRates.additionPercent,
        activationDate: salesRates.activationDate,
        status: salesRates.status,
      })
      .from(salesRates)
      .where(and(...conditions))
      .orderBy(desc(salesRates.activationDate));

    return c.json({ data });
  } catch (error) {
    console.error('Error fetching active sales rates:', error);
    return c.json({ error: 'Failed to fetch active sales rates' }, 500);
  }
});

const salesRateSchema = z.object({
  clientId: z.number().or(z.string().transform(Number)),
  itemId: z.number().or(z.string().transform(Number)),
  unitId: z.union([z.number(), z.string()]).transform(val => val === '' ? null : Number(val)).optional().nullable(),
  salesRate: z.number().or(z.string().transform(Number)),
  vatRate: z.number().or(z.string().transform(Number)),
  vatableValue: z.number().or(z.string().transform(Number)),
  additionPercent: z.union([z.number(), z.string()]).transform(val => val === '' ? 0 : Number(val)).optional(),
  activationDate: z.string(),
});

// POST /
salesRatesApp.post('/', requireRole(['admin']), zValidator('json', salesRateSchema), async (c) => {
  try {
    const user = c.get('user');
    const { clientId, itemId, unitId, salesRate, vatRate, vatableValue, additionPercent, activationDate } = c.req.valid('json');

    const parsedActivationDate = new Date(activationDate);

    await db.insert(salesRates).values({
      adminId: user.adminId,
      clientId,
      itemId,
      unitId,
      salesRate,
      vatRate,
      vatableValue,
      additionPercent: additionPercent || 0,
      activationDate: parsedActivationDate.toISOString(),
      status: 'Active',
    });

    appEvents.emit('data_changed', JSON.stringify({ type: 'sales_rate_updated', clientId }));

    return c.json({ message: 'Sales rate created successfully' }, 201);
  } catch (error) {
    console.error('Error creating sales rate:', error);
    return c.json({ error: 'Failed to create sales rate' }, 500);
  }
});

// PUT /:id
salesRatesApp.put('/:id', requireRole(['admin']), zValidator('json', salesRateSchema), async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const user = c.get('user');
    const { clientId, itemId, unitId, salesRate, vatRate, vatableValue, additionPercent, activationDate } = c.req.valid('json');

    const parsedActivationDate = new Date(activationDate);

    let whereCondition: any = eq(salesRates.id, id);
    if (user.role !== 'superadmin') {
      whereCondition = and(whereCondition, eq(salesRates.adminId, user.adminId));
    }

    await db.update(salesRates)
      .set({
        clientId,
        itemId,
        unitId,
        salesRate,
        vatRate,
        vatableValue,
        additionPercent: additionPercent || 0,
        activationDate: parsedActivationDate.toISOString(),
      })
      .where(and(eq(salesRates.id, id), eq(salesRates.adminId, user.adminId)));

    appEvents.emit('data_changed', JSON.stringify({ type: 'sales_rate_updated', clientId }));

    return c.json({ message: 'Sales rate updated successfully' });
  } catch (error) {
    console.error('Error updating sales rate:', error);
    return c.json({ error: 'Failed to update sales rate' }, 500);
  }
});

// DELETE /:id
salesRatesApp.delete('/:id', requireRole(['admin']), async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const user = c.get('user');

    if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

    const rateToDelete = await db.select().from(salesRates)
      .where(and(eq(salesRates.id, id), eq(salesRates.adminId, user.adminId)))
      .limit(1);

    if (rateToDelete.length === 0) {
      return c.json({ error: 'Sales rate not found' }, 404);
    }

    const { clientId, itemId } = rateToDelete[0];

    await db.delete(salesRates).where(eq(salesRates.id, id));

    const lastFrozenRate = await db.select()
      .from(salesRates)
      .where(and(
        eq(salesRates.clientId, clientId),
        eq(salesRates.itemId, itemId),
        eq(salesRates.status, 'Frozen')
      ))
      .orderBy(desc(salesRates.activationDate), desc(salesRates.id))
      .limit(1);

    if (lastFrozenRate.length > 0) {
      await db.update(salesRates)
        .set({ status: 'Active' })
        .where(eq(salesRates.id, lastFrozenRate[0].id));
    }

    appEvents.emit('data_changed', JSON.stringify({ type: 'sales_rate_updated', clientId }));

    return c.json({ message: 'Sales rate deleted successfully' });
  } catch (error) {
    console.error('Error deleting sales rate:', error);
    return c.json({ error: 'Failed to delete sales rate' }, 500);
  }
});

export default salesRatesApp;
