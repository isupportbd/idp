import { Hono } from 'hono';
import { db } from '../db';
import { items } from '../db/schema';
import { eq, desc, ilike, or, sql } from 'drizzle-orm';
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

const itemsApp = new Hono<{ Variables: Variables }>();

itemsApp.use('*', authenticate);

// GET /
itemsApp.get('/', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const search = c.req.query('search') || '';
    const offset = (page - 1) * limit;

    let whereClause = undefined;
    if (search) {
      whereClause = or(
        ilike(items.name, `%${search}%`),
        ilike(items.hsCode, `%${search}%`)
      );
    }

    const dataQuery = db.select()
      .from(items)
      .where(whereClause)
      .orderBy(desc(items.id))
      .limit(limit)
      .offset(offset);

    const countQuery = db.select({ count: sql<number>`count(*)` })
      .from(items)
      .where(whereClause);

    const [data, [{ count }]] = await Promise.all([
      dataQuery,
      countQuery
    ]);

    return c.json({ success: true, data, total: Number(count) });
  } catch (error) {
    console.error('Error fetching items:', error);
    return c.json({ success: false, message: 'Failed to fetch items' }, 500);
  }
});

// POST /
const createItemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hsCode: z.string().min(1, 'HS Code is required'),
  awHsCode: z.string().min(1, 'AW HS Code is required'),
});

itemsApp.post('/', zValidator('json', createItemSchema), async (c) => {
  try {
    const { name, hsCode, awHsCode } = c.req.valid('json');

    const finalAwHsCode = awHsCode || String(hsCode).replace(/[\.\s]/g, '');

    await db.insert(items).values({
      name,
      hsCode,
      awHsCode: finalAwHsCode,
    });

    return c.json({ success: true, message: 'Item created successfully' });
  } catch (error) {
    console.error('Error creating item:', error);
    return c.json({ success: false, message: 'Failed to create item' }, 500);
  }
});

// PUT /:id
itemsApp.put('/:id', zValidator('json', createItemSchema), async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const { name, hsCode, awHsCode } = c.req.valid('json');

    if (isNaN(id)) {
      return c.json({ success: false, message: 'Invalid ID' }, 400);
    }

    const finalAwHsCode = awHsCode || String(hsCode).replace(/[\.\s]/g, '');

    await db.update(items)
      .set({ name, hsCode, awHsCode: finalAwHsCode })
      .where(eq(items.id, id));

    return c.json({ success: true, message: 'Item updated successfully' });
  } catch (error) {
    console.error('Error updating item:', error);
    return c.json({ success: false, message: 'Failed to update item' }, 500);
  }
});

// DELETE /:id
itemsApp.delete('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    if (isNaN(id)) {
      return c.json({ success: false, message: 'Invalid ID' }, 400);
    }

    await db.delete(items).where(eq(items.id, id));

    return c.json({ success: true, message: 'Item deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting item:', error);
    // Note: Postgres error codes are different from MySQL. 23503 is foreign_key_violation in PG
    if (error.code === '23503') {
      return c.json({ success: false, message: 'Cannot delete item: it is currently being used.' }, 400);
    }
    return c.json({ success: false, message: 'Failed to delete item' }, 500);
  }
});

// POST /bulk
const bulkItemsSchema = z.object({
  items: z.array(createItemSchema),
});

itemsApp.post('/bulk', zValidator('json', bulkItemsSchema), async (c) => {
  try {
    const { items: newItems } = c.req.valid('json');

    if (newItems.length === 0) {
      return c.json({ success: false, message: 'Items array is required' }, 400);
    }

    const valuesToInsert = newItems.map((item) => ({
      name: item.name,
      hsCode: item.hsCode,
      awHsCode: item.awHsCode || String(item.hsCode).replace(/[\.\s]/g, ''),
    }));

    await db.insert(items).values(valuesToInsert);

    return c.json({ success: true, message: 'Items mapped successfully' });
  } catch (error) {
    console.error('Error creating bulk items:', error);
    return c.json({ success: false, message: 'Failed to create items' }, 500);
  }
});

export default itemsApp;
