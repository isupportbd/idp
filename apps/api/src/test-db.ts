import { db } from './db';
import { clients } from './db/schema';
import { ilike } from 'drizzle-orm';

async function main() {
  console.log("Starting db connection test...");
  const allClients = await db.select().from(clients);
  console.log("Total clients in DB:", allClients.length);
  const dulal = await db.select().from(clients).where(ilike(clients.name, '%dulal%'));
  console.log("Dulal clients count:", dulal.length);
  if (dulal.length > 0) {
    console.log("Dulal clients:", dulal);
  }
}

main().catch(err => {
  console.error("ERROR:", err);
}).finally(() => {
  console.log("Done");
  process.exit(0);
});
