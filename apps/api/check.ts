import { db } from "./src/db";
import { columnMappings } from "./src/db/schema";

async function run() {
  try {
    const res = await db.select().from(columnMappings);
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
run();
