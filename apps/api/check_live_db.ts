import { db } from './src/db';
import { purchases, users, clients } from './src/db/schema';
import { sql } from 'drizzle-orm';

async function check() {
  try {
    console.log("Connecting to live DB...");
    
    const userCount = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(users);
    console.log("✅ Users:", userCount[0].count);
    
    const purchaseCount = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(purchases);
    console.log("✅ Purchases:", purchaseCount[0].count);
    
    const clientCount = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(clients);
    console.log("✅ Clients:", clientCount[0].count);

    // Check distinct months
    const months = await db.selectDistinct({ month: purchases.month }).from(purchases);
    console.log("✅ Months in DB:", months.map(m => m.month));

    // Check adminIds
    const adminIds = await db.selectDistinct({ adminId: purchases.adminId }).from(purchases);
    console.log("✅ AdminIds in purchases:", adminIds.map(a => a.adminId));

    // Check users
    const allUsers = await db.select({ id: users.id, name: users.name, role: users.role }).from(users);
    console.log("✅ All users:", allUsers);
    
  } catch(e) {
    console.error("❌ Error:", e);
  }
  process.exit(0);
}
check();
