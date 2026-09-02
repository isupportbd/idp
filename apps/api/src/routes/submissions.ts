import { Hono } from 'hono';
import { db } from '../db';
import { submissions, purchases, salesRates, clients } from '../db/schema';
import { eq, and, sql, ilike, or, desc, inArray } from 'drizzle-orm';
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

// Apply auth middleware
const submissionsApp = new Hono<{ Variables: Variables }>()
  .use('*', authenticate)

  // GET /available-months?clientId={id}
  .get('/available-months', async (c) => {
  try {
    const user = c.get('user');
    const clientId = parseInt(c.req.query('clientId') || '0', 10);
    if (!clientId) return c.json({ error: 'clientId is required' }, 400);

    const conditions = [eq(purchases.clientId, clientId)];
    if (user.role !== 'superadmin') {
      conditions.push(eq(purchases.adminId, user.adminId));
    }

    // Get all months with purchases for this client
    const purchaseMonthsResult = await db
      .select({ month: purchases.month })
      .from(purchases)
      .where(and(...conditions));

    // Get all months with sales rates for this client
    const salesRatesConditions = [eq(salesRates.clientId, clientId)];
    if (user.role !== 'superadmin') {
      salesRatesConditions.push(eq(salesRates.adminId, user.adminId));
    }
    
    const salesRatesMonthsResult = await db
      .select({ month: salesRates.month })
      .from(salesRates)
      .where(and(...salesRatesConditions));

    const purchaseMonths = purchaseMonthsResult.map(p => p.month);
    const salesMonths = salesRatesMonthsResult.map(s => s.month);
    
    // Combine and remove duplicates
    const allMonths = [...new Set([...purchaseMonths, ...salesMonths])];

    // Get all months that already have a submission
    const existingSubmissions = await db
      .select({ month: submissions.month })
      .from(submissions)
      .where(eq(submissions.clientId, clientId));

    const submittedMonths = new Set(existingSubmissions.map(s => s.month));

    // Available months are those with purchases or sales but NO submission
    const availableMonths = allMonths.filter(m => !submittedMonths.has(m)).sort((a, b) => b.localeCompare(a));

    return c.json({ data: availableMonths }, 200);
  } catch (error: any) {
    console.error('Error fetching available months:', error);
    return c.json({ error: 'Failed to fetch available months' }, 500);
  }
  })

  // GET /submission - Get submission ID for a specific client and month
  .get('/submission', async (c) => {
  try {
    const user = c.get('user');
    const clientId = parseInt(c.req.query('clientId') || '0', 10);
    const month = c.req.query('month');

    if (!clientId || !month) {
      return c.json({ error: 'Client ID and Month are required' }, 400);
    }
    
    const conditions = [
      eq(submissions.clientId, clientId),
      eq(submissions.month, month)
    ];
    if (user.role !== 'superadmin') {
      conditions.push(eq(submissions.adminId, user.adminId));
    }

    const existing = await db
      .select({ submissionId: submissions.submissionId })
      .from(submissions)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ data: existing[0].submissionId }, 200);
    } else {
      return c.json({ data: null }, 200);
    }
  } catch (error: any) {
    console.error('Error fetching submission:', error);
    return c.json({ error: 'Failed to fetch submission' }, 500);
  }
  })

  // POST / - Create new submission
  .post('/', zValidator('json', z.object({
    clientId: z.number().int().positive(),
    month: z.string().length(7), // e.g., "2023-10"
    submissionId: z.string().min(1).max(255),
  })), async (c) => {
  try {
    const user = c.get('user');
    const { clientId, month, submissionId } = c.req.valid('json');

    const existingConditions = [
      eq(submissions.clientId, clientId),
      eq(submissions.month, month)
    ];
    if (user.role !== 'superadmin') {
      existingConditions.push(eq(submissions.adminId, user.adminId));
    }

    // 1. Verify if submission already exists for this client and month
    const existing = await db
      .select()
      .from(submissions)
      .where(and(...existingConditions))
      .limit(1);

    if (existing.length > 0) {
      return c.json({ error: 'A submission already exists for this client in the selected month.' }, 400);
    }

    // 2. Insert new submission
    const newSubmission = await db.insert(submissions).values({
      adminId: user.adminId,
      clientId,
      month,
      submissionId,
    }).returning();

    return c.json({ message: 'Submission saved successfully', data: newSubmission[0] }, 201);
  } catch (error: any) {
    console.error('Error saving submission:', error);
    // Handle unique constraint violation on submissionId
    if (error.code === '23505') {
       return c.json({ error: 'This Submission ID is already in use.' }, 400);
    }
    return c.json({ error: 'Failed to save submission' }, 500);
  }
  })

  // GET / - List all submissions with pagination and search
  .get('/', async (c) => {
  try {
    const user = c.get('user');
    const search = c.req.query('search') || '';
    const filterMonth = c.req.query('month');
    const page = parseInt(c.req.query('page') || '1', 10);
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (user.role !== 'superadmin') {
      conditions.push(eq(submissions.adminId, user.adminId));
    }

    if (filterMonth) {
      conditions.push(eq(submissions.month, filterMonth));
    }

    // Since we need to search by client name/bin, we do a join
    // We can't do ILIKE across joined tables easily without building the query manually or using sql
    
    if (search) {
      conditions.push(
        or(
          ilike(clients.name, `%${search}%`),
          ilike(clients.bin, `%${search}%`),
          ilike(submissions.submissionId, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .innerJoin(clients, eq(submissions.clientId, clients.id))
      .where(whereClause);
      
    const totalCount = Number(totalResult[0]?.count || 0);

    // Get paginated data
    const data = await db
      .select({
        id: submissions.id,
        clientId: submissions.clientId,
        clientName: clients.name,
        clientBin: clients.bin,
        month: submissions.month,
        submissionId: submissions.submissionId,
        createdAt: submissions.createdAt
      })
      .from(submissions)
      .innerJoin(clients, eq(submissions.clientId, clients.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(submissions.createdAt));

    return c.json({ data, total: totalCount }, 200);
  } catch (error: any) {
    console.error('Error fetching submissions:', error);
    return c.json({ error: 'Failed to fetch submissions' }, 500);
  }
  })

  // PUT /:id - Edit submission
  .put('/:id', zValidator('json', z.object({ submissionId: z.string().min(1).max(255) })), async (c) => {
  try {
    const user = c.get('user');
    const id = parseInt(c.req.param('id'), 10);
    const { submissionId } = c.req.valid('json');

    const conditions = [eq(submissions.id, id)];
    if (user.role !== 'superadmin') {
      conditions.push(eq(submissions.adminId, user.adminId));
    }

    const updated = await db
      .update(submissions)
      .set({ submissionId })
      .where(and(...conditions))
      .returning();

    if (updated.length === 0) {
      return c.json({ error: 'Submission not found or unauthorized' }, 404);
    }

    return c.json({ message: 'Submission updated successfully', data: updated[0] }, 200);
  } catch (error: any) {
    console.error('Error updating submission:', error);
    if (error.code === '23505') {
       return c.json({ error: 'This Submission ID is already in use.' }, 400);
    }
    return c.json({ error: 'Failed to update submission' }, 500);
  }
  })

  // DELETE /:id - Delete submission
  .delete('/:id', async (c) => {
  try {
    const user = c.get('user');
    const id = parseInt(c.req.param('id'), 10);

    const conditions = [eq(submissions.id, id)];
    if (user.role !== 'superadmin') {
      conditions.push(eq(submissions.adminId, user.adminId));
    }

    const deleted = await db.delete(submissions).where(and(...conditions)).returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Submission not found or unauthorized' }, 404);
    }

    return c.json({ message: 'Submission deleted successfully' }, 200);
  } catch (error: any) {
    console.error('Error deleting submission:', error);
    return c.json({ error: 'Failed to delete submission' }, 500);
  }
  })

  // POST /batch-delete - Delete multiple submissions
  .post('/batch-delete', zValidator('json', z.object({ ids: z.array(z.number()) })), async (c) => {
  try {
    const user = c.get('user');
    const { ids } = c.req.valid('json');

    if (ids.length === 0) return c.json({ message: 'No IDs provided' }, 200);

    const conditions = [inArray(submissions.id, ids)];
    if (user.role !== 'superadmin') {
      conditions.push(eq(submissions.adminId, user.adminId));
    }

    await db.delete(submissions).where(and(...conditions));
    return c.json({ message: 'Submissions deleted successfully' }, 200);
  } catch (error: any) {
    console.error('Error in batch delete submissions:', error);
    return c.json({ error: 'Failed to delete submissions' }, 500);
  }
});

export default submissionsApp;
