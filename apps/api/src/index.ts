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
import { db } from './db';
import { users, purchases, salesRates, items, clients } from './db/schema';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';

(async () => {
  try {
    const hash = await bcrypt.hash('Expw.17@', 10);
    await db.update(users).set({ email: 'isupportbd.info@gmail.com', passwordHash: hash }).where(eq(users.email, 'test@test.com'));
  } catch(e) {
    console.error(e);
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
  .route('/profile', profileApp);

app.get('/api/reset-data-now', async (c) => {
  const secret = c.req.query('secret');
  if (secret !== 'isupportbd123') return c.text('Unauthorized', 401);
  try {
    await db.delete(purchases);
    await db.delete(salesRates);
    await db.delete(items);
    await db.delete(clients);
    return c.text('Data reset successful! Purchases, Sales Rates, Clients, and Items have been deleted.');
  } catch (error: any) {
    return c.text('Error: ' + error.message, 500);
  }
});

export type AppType = typeof api;

export default {
  port: 3001,
  fetch: app.fetch,
};
