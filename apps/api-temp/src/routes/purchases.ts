import { Hono } from 'hono';
import { db } from '../db';
import { purchases, clients, items } from '../db/schema';
import { eq, desc, asc, count, like, or, and, sql } from 'drizzle-orm';
import { authenticate } from '../middlewares/auth';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const purchasesApp = new Hono<{ Variables: Variables }>();

purchasesApp.use('*', authenticate);

// GET /
purchasesApp.get('/', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const offset = (page - 1) * limit;

    const month = c.req.query('month');
    const clientId = c.req.query('clientId');
    const itemId = c.req.query('itemId');
    const lcNumber = c.req.query('lcNumber');
    const search = c.req.query('search');

    const user = c.get('user');
    const adminId = user.adminId;
    const role = user.role;
    
    const conditions = [];
    if (role !== 'superadmin') {
      conditions.push(eq(purchases.adminId, adminId));
    }
    if (month) conditions.push(eq(purchases.month, month));
    if (clientId) conditions.push(eq(purchases.clientId, parseInt(clientId)));
    if (itemId) conditions.push(eq(purchases.itemId, parseInt(itemId)));
    if (lcNumber) conditions.push(like(purchases.lcNumber, `%${lcNumber}%`));

    if (search) {
      const searchPattern = `%${search}%`;
      const searchCondition = or(
        like(items.name, searchPattern),
        like(purchases.beNo, searchPattern),
        like(purchases.lcNumber, searchPattern),
        like(clients.bin, searchPattern),
        like(clients.name, searchPattern)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalCountResult = await db.select({ value: count() })
      .from(purchases)
      .leftJoin(clients, eq(purchases.clientId, clients.id))
      .leftJoin(items, eq(purchases.itemId, items.id))
      .where(whereClause);
      
    const totalRows = totalCountResult[0].value;
    const totalPages = Math.ceil(totalRows / limit);

    const data = await db.select({
      id: purchases.id,
      office: purchases.office,
      beNo: purchases.beNo,
      beDate: purchases.beDate,
      month: purchases.month,
      lcNumber: purchases.lcNumber,
      netWt: purchases.netWt,
      totalQty: purchases.totalQty,
      assValue: purchases.assValue,
      baseValueOfVat: purchases.baseValueOfVat,
      unitValue: purchases.unitValue,
      cd: purchases.cd,
      rd: purchases.rd,
      sd: purchases.sd,
      vat: purchases.vat,
      at: purchases.at,
      isRebate: purchases.isRebate,
      clientId: purchases.clientId,
      clientName: clients.name,
      clientBin: clients.bin,
      itemId: purchases.itemId,
      itemName: items.name,
      hsCode: items.hsCode,
      awHsCode: items.awHsCode,
    })
    .from(purchases)
    .leftJoin(clients, eq(purchases.clientId, clients.id))
    .leftJoin(items, eq(purchases.itemId, items.id))
    .where(whereClause)
    .orderBy(asc(purchases.beDate))
    .limit(limit)
    .offset(offset);

    return c.json({
      success: true,
      data,
      pagination: { page, limit, totalRows, totalPages }
    });
  } catch (error) {
    console.error('Error fetching purchases:', error);
    return c.json({ success: false, message: 'Failed to load purchase list.' }, 500);
  }
});

// GET /reports (Aggregated by Client)
purchasesApp.get('/reports', async (c) => {
  try {
    const month = c.req.query('month');
    if (!month) return c.json({ success: false, message: 'Month is required' }, 400);

    const user = c.get('user');
    const adminId = user.adminId;

    const reportData = await db.select({
      clientId: purchases.clientId,
      clientName: clients.name,
      clientBin: clients.bin,
      totalQty: sql`sum(${purchases.totalQty})`.mapWith(Number),
    })
    .from(purchases)
    .leftJoin(clients, eq(purchases.clientId, clients.id))
    .where(and(eq(purchases.adminId, adminId), eq(purchases.month, month)))
    .groupBy(purchases.clientId, clients.name, clients.bin);

    const formattedData = reportData.map((item, index) => ({
      sl: index + 1,
      ...item
    }));

    return c.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching reports:', error);
    return c.json({ success: false, message: 'Failed to generate report' }, 500);
  }
});

// GET /months
purchasesApp.get('/months', async (c) => {
  try {
    const clientId = c.req.query('clientId');
    const queryAdminId = c.req.query('adminId');
    const user = c.get('user');
    const adminId = user.adminId;
    const role = user.role;

    const conditions = [];
    if (role === 'superadmin') {
      if (queryAdminId) conditions.push(eq(purchases.adminId, parseInt(queryAdminId)));
    } else {
      conditions.push(eq(purchases.adminId, adminId));
    }
    
    if (clientId) conditions.push(eq(purchases.clientId, parseInt(clientId)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Workaround for selectDistinct in Drizzle PG: group by month
    const result = await db
      .select({ month: purchases.month })
      .from(purchases)
      .where(whereClause)
      .groupBy(purchases.month)
      .orderBy(desc(purchases.month));

    const months = result.map(r => r.month);
    return c.json({ success: true, data: months });
  } catch (error) {
    console.error('Error fetching purchase months:', error);
    return c.json({ success: false, message: 'Failed to load months.' }, 500);
  }
});

// PUT /:id/month
const updateMonthSchema = z.object({ newMonth: z.string() });

purchasesApp.put('/:id/month', zValidator('json', updateMonthSchema), async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const { newMonth } = c.req.valid('json');

    if (isNaN(id)) return c.json({ success: false, message: 'Invalid ID' }, 400);
    if (!/^\d{4}-\d{2}$/.test(newMonth)) return c.json({ success: false, message: 'Invalid month format.' }, 400);

    const user = c.get('user');
    let whereCondition: any = eq(purchases.id, id);
    if (user.role !== 'superadmin') {
      whereCondition = and(whereCondition, eq(purchases.adminId, user.adminId));
    }

    await db.update(purchases).set({ month: newMonth }).where(whereCondition);
    return c.json({ success: true, message: 'Purchase month updated.' });
  } catch (error) {
    console.error('Error updating purchase month:', error);
    return c.json({ success: false, message: 'Failed to update.' }, 500);
  }
});

// DELETE /month/:month
purchasesApp.delete('/month/:month', async (c) => {
  try {
    const month = c.req.param('month');
    if (!/^\d{4}-\d{2}$/.test(month)) return c.json({ success: false, message: 'Invalid month.' }, 400);

    const user = c.get('user');
    let whereCondition: any = eq(purchases.month, month);
    if (user.role !== 'superadmin') {
      whereCondition = and(whereCondition, eq(purchases.adminId, user.adminId));
    }

    await db.delete(purchases).where(whereCondition);
    return c.json({ success: true, message: `Purchases deleted.` });
  } catch (error) {
    console.error('Error deleting purchases by month:', error);
    return c.json({ success: false, message: 'Failed to delete.' }, 500);
  }
});

export default purchasesApp;
