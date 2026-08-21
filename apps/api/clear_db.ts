import { db } from './src/db';
import { sql } from 'drizzle-orm';

async function clear() {
  await db.execute(sql`TRUNCATE TABLE users CASCADE`);
  console.log('Database cleared!');
  process.exit(0);
}

clear();
