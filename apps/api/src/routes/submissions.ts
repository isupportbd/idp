import { Hono } from 'hono';
import { db } from '../db';
import { submissions, purchases } from '../db/schema';
import { eq, and } from 'drizzle-orm';
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

const submissionsApp = new Hono<{ Variables: Variables }>();

// Apply auth middleware
submissionsApp.use('*', authenticate);

// GET /available-months?clientId={id}
submissionsApp.get('/available-months', async (c) => {
  try {
    const user = c.get('user');
    const clientIdStr = c.req.query('clientId');

    if (!clientIdStr) {
      return c.json({ error: 'Client ID is required' }, 400);
    }

    const clientId = parseInt(clientIdStr, 10);
    if (isNaN(clientId)) {
      return c.json({ error: 'Invalid Client ID' }, 400);
    }

    const pConditions = [eq(purchases.clientId, clientId)];
    if (user.role !== 'superadmin') {
      pConditions.push(eq(purchases.adminId, user.adminId));
    }

    // 1. Get all distinct months from purchases for this client
    const purchaseRecords = await db
      .select({ month: purchases.month })
      .from(purchases)
      .where(and(...pConditions));
    
    const uniquePurchaseMonths = Array.from(new Set(purchaseRecords.map(p => p.month)));

    const sConditions = [eq(submissions.clientId, clientId)];
    if (user.role !== 'superadmin') {
      sConditions.push(eq(submissions.adminId, user.adminId));
    }

    // 2. Get all months from submissions for this client
    const submissionRecords = await db
      .select({ month: submissions.month })
      .from(submissions)
      .where(and(...sConditions));

    const submittedMonths = new Set(submissionRecords.map(s => s.month));

    // 3. Filter out submitted months
    const availableMonths = uniquePurchaseMonths.filter(m => !submittedMonths.has(m));

    // Sort descending (latest month first)
    availableMonths.sort((a, b) => b.localeCompare(a));

    return c.json({ data: availableMonths }, 200);
  } catch (error: any) {
    console.error('Error fetching available months:', error);
    return c.json({ error: 'Failed to fetch available months' }, 500);
  }
});

// GET /submission?clientId={id}&month={month}
submissionsApp.get('/submission', async (c) => {
  try {
    const user = c.get('user');
    const clientIdStr = c.req.query('clientId');
    const month = c.req.query('month');

    if (!clientIdStr || !month) {
      return c.json({ error: 'Client ID and Month are required' }, 400);
    }

    const clientId = parseInt(clientIdStr, 10);
    
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
});

const submissionSchema = z.object({
  clientId: z.number().int().positive(),
  month: z.string().length(7), // e.g., "2023-10"
  submissionId: z.string().min(1).max(255),
});

// POST /
submissionsApp.post('/', zValidator('json', submissionSchema), async (c) => {
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
});

export default submissionsApp;
