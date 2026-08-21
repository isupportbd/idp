import { db } from './src/db';
import { purchases } from './src/db/schema';
import { sql } from 'drizzle-orm';

async function clearPurchases() {
  try {
    console.log('Deleting all purchase data...');
    await db.execute(sql`TRUNCATE TABLE purchases CASCADE`);
    console.log('✅ Successfully deleted all purchase data!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to delete data:', error);
    process.exit(1);
  }
}

clearPurchases();
