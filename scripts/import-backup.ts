import fs from "node:fs/promises";
import path from "node:path";
import { initDatabase, db } from "../src/framework/database/connection.js";
import { sql } from "drizzle-orm";

async function main() {
  await initDatabase();

  const backupFile = path.resolve(process.cwd(), "idp_backup_2026_10_07_074146.sql");
  console.log(`Reading SQL backup from: ${backupFile}`);

  const rawSql = await fs.readFile(backupFile, "utf-8");

  console.log("Preparing database: disabling foreign key triggers (replica mode)...");

  try {
    await db.execute(sql.raw("SET session_replication_role = 'replica';"));
  } catch (e: any) {
    console.log("Notice on session_replication_role:", e.message);
  }

  // Truncate existing tables to prevent duplicate key conflicts
  const tablesRes = await db.execute(sql`
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public'
  `);
  const tables = (Array.isArray(tablesRes) ? tablesRes : (tablesRes as any).rows || [])
    .map((r: any) => r.tablename)
    .filter(Boolean);

  console.log(`Truncating ${tables.length} tables for clean restoration...`);
  for (const t of tables) {
    try {
      await db.execute(sql.raw(`TRUNCATE TABLE "${t}" CASCADE;`));
    } catch (err: any) {
      console.log(`Notice on truncate "${t}":`, err.message);
    }
  }

  console.log("Importing backup data rows...");

  const lines = rawSql.split("\n");
  let currentStmt = "";
  let successCount = 0;
  let errorCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--")) {
      continue;
    }

    currentStmt += line + "\n";

    if (trimmed.endsWith(";")) {
      const stmt = currentStmt.trim();
      currentStmt = "";

      if (stmt === "BEGIN;" || stmt === "COMMIT;" || stmt.startsWith("SET ")) {
        continue;
      }

      try {
        await db.execute(sql.raw(stmt));
        successCount++;
      } catch (err: any) {
        console.error(`[Error on insert]: ${err.cause?.message || err.message}`);
        errorCount++;
      }
    }
  }

  // Restore triggers/constraints
  try {
    await db.execute(sql.raw("SET session_replication_role = 'origin';"));
  } catch (e: any) {
    console.log("Notice on restoring session_replication_role:", e.message);
  }

  // Update sequences for auto-increment columns in PostgreSQL
  console.log("Updating sequence values for serial IDs...");
  try {
    const seqsRes = await db.execute(sql`
      SELECT table_name, column_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND column_default LIKE 'nextval%'
    `);
    const seqRows = Array.isArray(seqsRes) ? seqsRes : (seqsRes as any).rows || [];

    for (const r of seqRows) {
      try {
        await db.execute(sql.raw(`
          SELECT setval(
            pg_get_serial_sequence('"${r.table_name}"', '${r.column_name}'),
            COALESCE((SELECT MAX("${r.column_name}") FROM "${r.table_name}"), 1),
            true
          );
        `));
      } catch (e: any) {
        // Ignore sequence errors
      }
    }
    console.log("Sequence update finished.");
  } catch (e) {
    console.error("Failed to update sequences:", e);
  }

  console.log(`\nImport Completed Successfully!`);
  console.log(`Inserted rows: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
