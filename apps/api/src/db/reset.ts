import { db } from './index';
import { purchases, salesRates } from './schema';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Clearing old data from server...');
  try {
    await db.delete(purchases);
    console.log('✅ Successfully deleted all purchases.');
    
    await db.delete(salesRates);
    console.log('✅ Successfully deleted all sales rates.');
    
    console.log('Data cleanup complete! You can now upload fresh data.');
    process.exit(0);
  } catch (error) {
    console.error('Error clearing data:', error);
    process.exit(1);
  }
}

main();
