import { db } from './src/db/index.ts';
import { sql } from 'drizzle-orm';

async function run() {
  const res = await db.execute(sql`SELECT month, count(*), admin_id FROM purchases GROUP BY month, admin_id`);
  console.log(res);
  process.exit(0);
}
run();
