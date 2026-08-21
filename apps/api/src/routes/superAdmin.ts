import { Hono } from 'hono';
import { db } from '../db';
import { users, plans, purchases, clients, items, vatNotesMapping, unitConversions, columnMappings, salesRates } from '../db/schema';
import { eq, count, sum, ilike, or, sql, desc, and } from 'drizzle-orm';
import { authenticate, requireRole } from '../middlewares/auth';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const superAdminApp = new Hono<{ Variables: Variables }>();

// Secure all routes in this app
superAdminApp.use('*', authenticate, requireRole(['superadmin']));

// Get storage stats
superAdminApp.get('/storage-stats', async (c) => {
  try {
    // 1. DB Size
    let dbSizeMB = 0;
    try {
      const dbResult = await db.execute(sql`
        SELECT ROUND(SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))) / 1024.0 / 1024.0, 2) as sizeMB 
        FROM pg_tables 
        WHERE schemaname = 'public'
      `);
      const rows = Array.isArray(dbResult) ? dbResult : (dbResult as any).rows;
      dbSizeMB = (rows && rows.length > 0) ? (rows[0].sizemb || rows[0].sizeMB || 0) : 0;
    } catch (dbError) {
      console.warn('Could not fetch DB size:', dbError);
    }

    // Backend Size calculation
    const backendRoot = process.cwd();
    
    function calculateSize(dirPath: string, ignorePatterns: string[] = []): number {
      let size = 0;
      if (!fs.existsSync(dirPath)) return 0;
      try {
        const stat = fs.statSync(dirPath);
        if (stat.isFile()) return stat.size;
        if (stat.isDirectory()) {
          const files = fs.readdirSync(dirPath);
          for (const file of files) {
            if (ignorePatterns.includes(file)) continue;
            size += calculateSize(path.join(dirPath, file), ignorePatterns);
          }
        }
      } catch (error) {}
      return size;
    }

    const backendSize = calculateSize(backendRoot, ['node_modules', '.git']);
    const backendSizeMB = parseFloat((backendSize / (1024 * 1024)).toFixed(2));

    return c.json({
      success: true,
      data: {
        dbSize: dbSizeMB,
        frontendSize: 0, // Using Vite, built differently
        backendSize: backendSizeMB
      }
    });
  } catch (error) {
    console.error('Error fetching storage stats:', error);
    return c.json({ success: false, error: 'Failed to fetch storage stats' }, 500);
  }
});

// Get all pending signups
superAdminApp.get('/pending-signups', async (c) => {
  try {
    const pendingUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      mobile: users.mobile,
      status: users.status,
      planId: users.planId,
      trxId: users.trxId,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.status, 'pending'));
    return c.json({ success: true, data: pendingUsers });
  } catch (error) {
    console.error('Error fetching pending signups:', error);
    return c.json({ success: false, error: 'Failed to fetch pending signups' }, 500);
  }
});

// Get all tenants (Admins)
superAdminApp.get('/tenants', async (c) => {
  try {
    const tenants = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      mobile: users.mobile,
      role: users.role,
      status: users.status,
      planId: users.planId,
      expDate: users.expDate,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.role, 'admin'));
    return c.json({ success: true, data: tenants });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    return c.json({ success: false, error: 'Failed to fetch tenants' }, 500);
  }
});

// Approve a signup
const approveSchema = z.object({
  userId: z.number(),
  days: z.number().optional()
});

superAdminApp.post('/approve-signup', zValidator('json', approveSchema), async (c) => {
  try {
    const { userId, days } = c.req.valid('json');
    
    let expDate = null;
    
    // If days provided manually, use that
    if (days) {
      expDate = new Date();
      expDate.setDate(expDate.getDate() + days);
    } else {
      // Otherwise calculate from trxId
      const targetUser = await db.select().from(users).where(eq(users.id, userId));
      if (targetUser.length > 0) {
        const u = targetUser[0];
        if (u.trxId) {
          if (u.trxId.toLowerCase().includes('(monthly)')) {
            expDate = new Date();
            expDate.setMonth(expDate.getMonth() + 1);
          } else if (u.trxId.toLowerCase().includes('(yearly)')) {
            expDate = new Date();
            expDate.setFullYear(expDate.getFullYear() + 1);
          }
        }
      }
    }
    
    await db.update(users).set({ status: 'active', expDate }).where(eq(users.id, userId));
    return c.json({ success: true, message: 'User approved successfully' });
  } catch (error) {
    console.error('Error approving user:', error);
    return c.json({ success: false, error: 'Failed to approve user' }, 500);
  }
});

// Reject a signup (delete)
const rejectSchema = z.object({
  userId: z.number()
});

superAdminApp.post('/reject-signup', zValidator('json', rejectSchema), async (c) => {
  try {
    const { userId } = c.req.valid('json');
    await db.delete(users).where(eq(users.id, userId));
    return c.json({ success: true, message: 'User rejected and removed' });
  } catch (error) {
    console.error('Error rejecting user:', error);
    return c.json({ success: false, error: 'Failed to reject user' }, 500);
  }
});

// Pricing Plans CRUD
superAdminApp.get('/plans', async (c) => {
  try {
    const allPlans = await db.select().from(plans);
    return c.json({ success: true, data: allPlans });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return c.json({ success: false, error: 'Failed to fetch plans' }, 500);
  }
});

const planSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  rateMonthly: z.number().min(0),
  rateYearly: z.number().min(0),
  maxUsers: z.number().min(1, 'Max users must be at least 1'),
  yearlyDiscountPercent: z.number().optional().default(0)
});

superAdminApp.post('/plans', zValidator('json', planSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    await db.insert(plans).values(data);
    return c.json({ success: true, message: 'Plan created successfully' });
  } catch (error) {
    console.error('Error creating plan:', error);
    return c.json({ success: false, error: 'Failed to create plan' }, 500);
  }
});

superAdminApp.put('/plans/:id', zValidator('json', planSchema), async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const data = c.req.valid('json');
    
    if (isNaN(id)) return c.json({ success: false, error: 'Invalid ID' }, 400);

    await db.update(plans).set(data).where(eq(plans.id, id));
    return c.json({ success: true, message: 'Plan updated successfully' });
  } catch (error) {
    console.error('Error updating plan:', error);
    return c.json({ success: false, error: 'Failed to update plan' }, 500);
  }
});

superAdminApp.delete('/plans/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) return c.json({ success: false, error: 'Invalid ID' }, 400);

    await db.delete(plans).where(eq(plans.id, id));
    return c.json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return c.json({ success: false, error: 'Failed to delete plan' }, 500);
  }
});

// -----------------------------------------------------
// GLOBAL SETTINGS CRUD ROUTES
// -----------------------------------------------------


// 1. Items
const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  hsCode: z.string().min(1, 'HS Code is required'),
  awHsCode: z.string().min(1, 'AW HS Code is required')
});

superAdminApp.get('/items', async (c) => {
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
});
superAdminApp.post('/items', zValidator('json', itemSchema), async (c) => {
  const data = c.req.valid('json');
  if (data.hsCode && !data.awHsCode) {
    data.awHsCode = String(data.hsCode).replace(/[\.\s]/g, '');
  }
  await db.insert(items).values(data);
  return c.json({ success: true });
});
superAdminApp.put('/items/:id', zValidator('json', itemSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');
  if (data.hsCode && !data.awHsCode) {
    data.awHsCode = String(data.hsCode).replace(/[\.\s]/g, '');
  }
  await db.update(items).set(data).where(eq(items.id, id));
  return c.json({ success: true });
});
superAdminApp.delete('/items/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await db.delete(items).where(eq(items.id, id));
  return c.json({ success: true });
});

// 2. Column Mappings
const mappingSchema = z.object({
  dbColumn: z.string().min(1),
  excelHeader: z.string().min(1)
});

superAdminApp.get('/mappings', async (c) => {
  const data = await db.select().from(columnMappings);
  return c.json({ success: true, data });
});

// For mappings, the old app sent an array of mappings to save all at once
const bulkMappingSchema = z.object({
  mappings: z.array(mappingSchema)
});

superAdminApp.post('/mappings', zValidator('json', bulkMappingSchema), async (c) => {
  const { mappings } = c.req.valid('json');
  
  // Clear existing mappings
  await db.delete(columnMappings);
  
  // Insert new mappings
  if (mappings.length > 0) {
    await db.insert(columnMappings).values(mappings);
  }
  
  return c.json({ success: true });
});

// 3. VAT Notes
const vatNoteSchema = z.object({
  vatRate: z.number().min(0),
  noteName: z.string().min(1)
});

superAdminApp.get('/vat-notes', async (c) => {
  const data = await db.select().from(vatNotesMapping);
  return c.json({ success: true, data });
});
superAdminApp.post('/vat-notes', zValidator('json', vatNoteSchema), async (c) => {
  const data = c.req.valid('json');
  await db.insert(vatNotesMapping).values(data);
  return c.json({ success: true });
});
superAdminApp.put('/vat-notes/:id', zValidator('json', vatNoteSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');
  await db.update(vatNotesMapping).set(data).where(eq(vatNotesMapping.id, id));
  return c.json({ success: true });
});
superAdminApp.delete('/vat-notes/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await db.delete(vatNotesMapping).where(eq(vatNotesMapping.id, id));
  return c.json({ success: true });
});

// 4. Unit Conversions
const unitConvSchema = z.object({
  purchaseUnit: z.string().min(1),
  salesUnit: z.string().min(1),
  factor: z.number().min(0.000001)
});

superAdminApp.get('/unit-conversions', async (c) => {
  const data = await db.select().from(unitConversions);
  return c.json({ success: true, data });
});
superAdminApp.post('/unit-conversions', zValidator('json', unitConvSchema), async (c) => {
  const data = c.req.valid('json');
  await db.insert(unitConversions).values(data);
  return c.json({ success: true });
});
superAdminApp.put('/unit-conversions/:id', zValidator('json', unitConvSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');
  await db.update(unitConversions).set(data).where(eq(unitConversions.id, id));
  return c.json({ success: true });
});
superAdminApp.delete('/unit-conversions/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await db.delete(unitConversions).where(eq(unitConversions.id, id));
  return c.json({ success: true });
});

// -----------------------------------------------------
// GLOBAL PURCHASES & REPORTS
// -----------------------------------------------------

// Get global purchases (all tenants)
superAdminApp.get('/global-purchases', async (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '15');
    const month = c.req.query('month');
    const search = c.req.query('search') || c.req.query('lcNumber') || c.req.query('lc');
    
    const conditions = [];
    if (month) conditions.push(eq(purchases.month, month));
    if (search) {
      conditions.push(or(
        ilike(purchases.lcNumber, `%${search}%`),
        ilike(clients.name, `%${search}%`),
        ilike(clients.bin, `%${search}%`),
        ilike(items.name, `%${search}%`),
        ilike(items.hsCode, `%${search}%`)
      ));
    }
    
    const offset = (page - 1) * limit;
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const data = await db.select({
      id: purchases.id,
      adminId: purchases.adminId,
      clientId: purchases.clientId,
      itemId: purchases.itemId,
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
      vat: purchases.vat,
      at: purchases.at,
      clientName: clients.name,
      clientBin: clients.bin,
      itemName: items.name,
      hsCode: items.hsCode,
    })
    .from(purchases)
    .leftJoin(clients, eq(purchases.clientId, clients.id))
    .leftJoin(items, eq(purchases.itemId, items.id))
    .where(whereClause)
    .limit(limit)
    .offset(offset);
    
    // Get total count
    const countResult = await db.select({ count: sql`count(*)`.mapWith(Number) })
      .from(purchases)
      .leftJoin(clients, eq(purchases.clientId, clients.id))
      .leftJoin(items, eq(purchases.itemId, items.id))
      .where(whereClause);
      
    const totalCount = countResult[0].count;
    const totalPages = Math.ceil(totalCount / limit);
    
    return c.json({
      success: true,
      data,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching global purchases:', error);
    return c.json({ success: false, error: 'Failed to fetch global purchases' }, 500);
  }
});

// Delete all purchases for a month globally
superAdminApp.delete('/global-purchases/months/:month', async (c) => {
  try {
    const month = c.req.param('month');
    if (!month) return c.json({ success: false, error: 'Month is required' }, 400);
    
    await db.delete(purchases).where(eq(purchases.month, month));
    return c.json({ success: true, message: `All purchases for ${month} deleted globally` });
  } catch (error) {
    console.error('Error deleting global purchases:', error);
    return c.json({ success: false, error: 'Failed to delete global purchases' }, 500);
  }
});

// Get global reports (aggregated by client for a specific admin and month)
superAdminApp.get('/global-reports', async (c) => {
  try {
    const adminId = parseInt(c.req.query('adminId') || '0');
    const month = c.req.query('month');
    
    if (!adminId || !month) {
      return c.json({ success: false, error: 'adminId and month are required' }, 400);
    }
    
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
    
    // Add serial number
    const formattedData = reportData.map((item, index) => ({
      sl: index + 1,
      ...item
    }));
    
    return c.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching global reports:', error);
    return c.json({ success: false, error: 'Failed to fetch global reports' }, 500);
  }
});

// Get available months
superAdminApp.get('/global-purchases/months', async (c) => {
  try {
    const result = await db
      .select({ month: purchases.month })
      .from(purchases)
      .groupBy(purchases.month)
      .orderBy(desc(purchases.month));
    const months = result.map(r => r.month);
    return c.json({ success: true, data: months });
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch months' }, 500);
  }
});

export default superAdminApp;
