import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authApp from './routes/auth';
import clientsApp from './routes/clients';
import itemsApp from './routes/items';
import purchasesApp from './routes/purchases';
import salesRatesApp from './routes/salesRates';
import superAdminApp from './routes/superAdmin';
import uploadApp from './routes/upload';
import reportsApp from './routes/reports';
import settingsApp from './routes/settings';
import clientCredentialsApp from './routes/clientCredentials';
import usersApp from './routes/users';
import notificationsApp from './routes/notifications';
import profileApp from './routes/profile';
import submissionsApp from './routes/submissions';
import { db } from './db';
import { users, purchases, salesRates, items, clients, clientCredentials, notifications } from './db/schema';
import { eq, count } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

(async () => {
  try {
    // 1. Run automatic migrations safely
    console.log('Checking for database migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('Migrations up to date.');

    // 2. Initialize superadmin if not exists
    const adminCountResult = await db.select({ count: count() }).from(users).where(eq(users.role, 'superadmin'));
    if (adminCountResult[0].count === 0) {
      const initialEmail = process.env.SUPERADMIN_EMAIL;
      const initialPassword = process.env.SUPERADMIN_PASSWORD;
      
      if (initialEmail && initialPassword) {
        const hash = await bcrypt.hash(initialPassword, 10);
        await db.insert(users).values({
          name: 'Super Admin',
          email: initialEmail,
          mobile: '01000000000', // Default or placeholder
          passwordHash: hash,
          role: 'superadmin',
          status: 'Active',
        });
        console.log('Superadmin user created from environment variables.');
      } else {
        console.warn('Notice: No superadmin exists and SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD are not set in .env.');
      }
    }
  } catch(e) {
    console.error('Failed to initialize superadmin:', e);
  }
})();
type Variables = {
  user: {
    userId: number;
    role: string;
    adminId: number;
  };
};

const app = new Hono<{ Variables: Variables }>();

app.use('*', cors());

const api = app.basePath('/api')
  .route('/auth', authApp)
  .route('/clients', clientsApp)
  .route('/items', itemsApp)
  .route('/purchases', purchasesApp)
  .route('/sales-rates', salesRatesApp)
  .route('/superadmin', superAdminApp)
  .route('/upload', uploadApp)
  .route('/reports', reportsApp)
  .route('/settings', settingsApp)
  .route('/client-credentials', clientCredentialsApp)
  .route('/users', usersApp)
  .route('/notifications', notificationsApp)
  .route('/profile', profileApp)
  .route('/submissions', submissionsApp);



export type AppType = typeof api;

export default {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,
  fetch: app.fetch,
};
