import { db } from './src/db';
import { users, purchases, salesRates, items, clients, unitConversions } from './src/db/schema';
import { eq } from 'drizzle-orm';
import { hashSync } from 'bcryptjs';

async function seed() {
  console.log("Seeding local database for demonstration...");
  
  // 1. Create a user if not exists
  let allUsers = await db.select().from(users);
  let adminUser;
  if (allUsers.length === 0) {
    const newUsers = await db.insert(users).values({
      name: 'Test Admin',
      email: 'admin@idp.com',
      passwordHash: hashSync('password123', 10),
      role: 'admin',
      status: 'active'
    }).returning();
    adminUser = newUsers[0];
  } else {
    // Update existing user to admin
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, allUsers[0].id));
    allUsers[0].role = 'admin';
    adminUser = allUsers[0];
  }
  
  const adminId = adminUser.id;

  // 2. Create Unit
  let allUnits = await db.select().from(unitConversions);
  let uId;
  if (allUnits.length === 0) {
    const newUnits = await db.insert(unitConversions).values({ purchaseUnit: 'MT', salesUnit: 'MT', factor: '1' }).returning();
    uId = newUnits[0].id;
  } else {
    uId = allUnits[0].id;
  }

  // 3. Create Client
  let cId;
  const existingClient = await db.select().from(clients).where(eq(clients.name, 'M/S RUSHNA ENTERPRISE')).limit(1);
  if (existingClient.length === 0) {
    const newClient = await db.insert(clients).values({ name: 'M/S RUSHNA ENTERPRISE', bin: '000492551-0701', adminId: adminId }).returning();
    cId = newClient[0].id;
  } else {
    cId = existingClient[0].id;
  }

  // 4. Create Item
  let iId;
  const existingItem = await db.select().from(items).where(eq(items.name, 'Limestone')).limit(1);
  if (existingItem.length === 0) {
    const newItem = await db.insert(items).values({ name: 'Limestone', hsCode: '2521.00.10', awHsCode: '25210010' }).returning();
    iId = newItem[0].id;
  } else {
    iId = existingItem[0].id;
  }

  // Clear existing purchases/rates for this client just in case
  await db.delete(purchases).where(eq(purchases.clientId, cId));
  await db.delete(salesRates).where(eq(salesRates.clientId, cId));

  // 5. Purchases
  await db.insert(purchases).values([
    { adminId: adminId, clientId: cId, itemId: iId, beNo: '2860', beDate: '30/06/2026', month: '2026-07', netWt: 348000, excessQty: 0, assValue: 0, totalQty: 348000, unitValue: 1, baseValueOfVat: 644250.07, office: '', lcNumber: '' },
    { adminId: adminId, clientId: cId, itemId: iId, beNo: '2911', beDate: '01/07/2026', month: '2026-07', netWt: 228000, excessQty: 0, assValue: 0, totalQty: 228000, unitValue: 1, baseValueOfVat: 422140.54, office: '', lcNumber: '' },
    { adminId: adminId, clientId: cId, itemId: iId, beNo: '2943', beDate: '02/07/2026', month: '2026-07', netWt: 240000, excessQty: 0, assValue: 0, totalQty: 240000, unitValue: 1, baseValueOfVat: 44436.91, office: '', lcNumber: '' },
    { adminId: adminId, clientId: cId, itemId: iId, beNo: '2984', beDate: '04/07/2026', month: '2026-07', netWt: 120000, excessQty: 0, assValue: 0, totalQty: 120000, unitValue: 1, baseValueOfVat: 222179.04, office: '', lcNumber: '' }
  ]);

  // 6. Sales Rates
  await db.insert(salesRates).values({
    adminId: adminId, clientId: cId, itemId: iId, unitId: uId,
    salesRate: 2.68, vatRate: 7.5, additionPercent: 34.66, activationDate: '01/07/2026', vatableValue: 2.49
  });

  console.log("Database seeded successfully!");
  console.log("Admin Email:", adminUser.email);
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });
