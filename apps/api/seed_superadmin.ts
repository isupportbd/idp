import { db } from './src/db';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function seed() {
  const allUsers = await db.select().from(users);
  if (allUsers.length > 0) {
    await db.update(users).set({ role: 'superadmin' }).where(eq(users.id, allUsers[0].id));
  }
  process.exit(0);
}
seed();
