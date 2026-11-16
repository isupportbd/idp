import { getTableColumns, isTable, sql } from "drizzle-orm";
import { databasePool } from "@/framework/database/connection.js";
import type { AppContext } from "@/framework/facade.js";
import { db } from "@/framework/facade.js";
import * as schema from "@/database/schema.js";

// 22. Full Database SQL Backup Export
export async function exportDatabaseBackup(c: AppContext) {
  try {
    // Build a map of valid column names for each table from Drizzle models
    const drizzleTables = Object.values(schema).filter(isTable);
    const validColumnsMap = new Map<string, Set<string>>();
    for (const t of drizzleTables) {
      try {
        const tableName = (t as any)[Symbol.for("drizzle:Name")];
        if (tableName) {
          const cols = Object.values(getTableColumns(t as any)).map((c: any) => c.name);
          validColumnsMap.set(tableName, new Set(cols));
        }
      } catch {
        // Skip non-table exports
      }
    }

    const tablesRes = await db.execute(sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename ASC
    `);
    const allTables = (Array.isArray(tablesRes) ? tablesRes : (tablesRes as { rows?: Record<string, unknown>[] }).rows || [])
      .map((r) => String((r as Record<string, unknown>).tablename || ""))
      .filter(Boolean);

    // Query foreign key dependencies to sort tables topologically (parent tables before child tables)
    const depsRes = await db.execute(sql`
      SELECT DISTINCT
        tc.table_name AS child_table,
        ccu.table_name AS parent_table
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name != ccu.table_name;
    `);
    const deps = Array.isArray(depsRes) ? depsRes : (depsRes as { rows?: Record<string, unknown>[] }).rows || [];

    const adj = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const t of allTables) {
      adj.set(t, new Set<string>());
      inDegree.set(t, 0);
    }

    for (const edge of deps) {
      const parent = String((edge as Record<string, unknown>).parent_table);
      const child = String((edge as Record<string, unknown>).child_table);
      if (adj.has(parent) && inDegree.has(child)) {
        if (!adj.get(parent)!.has(child)) {
          adj.get(parent)!.add(child);
          inDegree.set(child, (inDegree.get(child) || 0) + 1);
        }
      }
    }

    const queue: string[] = [];
    for (const [t, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(t);
    }

    const tables: string[] = [];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      tables.push(curr);
      for (const child of adj.get(curr) || []) {
        const newDeg = (inDegree.get(child) || 1) - 1;
        inDegree.set(child, newDeg);
        if (newDeg === 0) {
          queue.push(child);
        }
      }
    }

    // Append any circular or remaining tables
    for (const t of allTables) {
      if (!tables.includes(t)) tables.push(t);
    }

    let sqlDump = `-- ========================================================\n`;
    sqlDump += `-- IDP ERP PostgreSQL Database Backup\n`;
    sqlDump += `-- Generated: ${new Date().toISOString()}\n`;
    sqlDump += `-- Total Public Tables: ${tables.length}\n`;
    sqlDump += `-- ========================================================\n\n`;
    sqlDump += `SET statement_timeout = 0;\n`;
    sqlDump += `SET lock_timeout = 0;\n`;
    sqlDump += `SET client_encoding = 'UTF8';\n`;
    sqlDump += `SET standard_conforming_strings = on;\n`;
    sqlDump += `SET check_function_bodies = false;\n`;
    sqlDump += `SET client_min_messages = warning;\n\n`;
    sqlDump += `BEGIN;\n\n`;

    for (const table of tables) {
      try {
        const rowsRes = await db.execute(sql.raw(`SELECT * FROM "${table}"`));
        const rows = Array.isArray(rowsRes) ? rowsRes : (rowsRes as any).rows || [];

        sqlDump += `-- --------------------------------------------------------\n`;
        sqlDump += `-- Table data for "${table}" (${rows.length} records)\n`;
        sqlDump += `-- --------------------------------------------------------\n`;
        sqlDump += `TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE;\n`;

        if (rows.length > 0) {
          const rawColumns = Object.keys(rows[0]);
          const validCols = validColumnsMap.get(table);
          const columns = validCols ? rawColumns.filter((c) => validCols.has(c)) : rawColumns;
          const colsList = columns.map((col) => `"${col}"`).join(", ");

          for (const row of rows) {
            const values = columns.map((col) => {
              const val = row[col];
              if (val === null || val === undefined) return "NULL";
              if (typeof val === "number" || typeof val === "bigint") return val.toString();
              if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
              if (val instanceof Date) return `'${val.toISOString()}'`;
              if (typeof val === "object") {
                return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
              }
              return `'${String(val).replace(/'/g, "''")}'`;
            });

            sqlDump += `INSERT INTO "${table}" (${colsList}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING;\n`;
          }
        }
        sqlDump += `\n`;
      } catch (err: unknown) {
        sqlDump += `-- Error dumping table "${table}": ${(err as Error)?.message || String(err)}\n\n`;
      }
    }

    sqlDump += `COMMIT;\n`;
    sqlDump += `-- End of Backup\n`;

    const now = new Date();
    const dateStr = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}_${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const filename = `idp_backup_${dateStr}_${timeStr}.sql`;

    const auth = c.get("auth") || c.get("user");
    console.info(
      `[AUDIT] SuperAdmin #${(auth as { id?: number })?.id || "unknown"} exported database backup: ${filename} at ${now.toISOString()}`
    );

    return new Response(sqlDump, {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (err: unknown) {
    console.error("Database backup failed:", err);
    return c.json({ success: false, error: "Failed to generate database backup" }, 500);
  }
}

// 23. Full Database SQL Restore (SuperAdmin Only)
export async function restoreDatabaseBackup(c: AppContext) {
  try {
    const body = await c.req.parseBody();
    const file = body["backupFile"];

    if (!file || !(file instanceof File)) {
      return c.json({ success: false, message: "A valid .sql backup file is required" }, 400);
    }

    if (!file.name.endsWith(".sql")) {
      return c.json({ success: false, message: "Only .sql files can be restored" }, 400);
    }

    // 500 MB max file size limit
    const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json({ success: false, message: "File exceeds maximum allowed restore size (500 MB)" }, 400);
    }

    const sqlContent = await file.text();
    if (!sqlContent || sqlContent.trim().length === 0) {
      return c.json({ success: false, message: "Backup file is empty" }, 400);
    }

    // Clean safety checks: allow normal transactional dump statements
    const normalized = sqlContent.toUpperCase();
    if (
      normalized.includes("DROP DATABASE") ||
      normalized.includes("DROP SCHEMA")
    ) {
      return c.json(
        { success: false, message: "Security violation: Destructive DROP DATABASE / SCHEMA queries detected in backup file" },
        400
      );
    }

    const auth = c.get("auth") || c.get("user");
    const superAdminId = (auth as { id?: number })?.id || "unknown";

    const cleanedSql = sqlContent
      .split(/\r?\n/)
      .filter((line) => !/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(line))
      .join("\n");

    // Execute restore using native postgres driver pool to support large multi-statement dumps without Drizzle statement-cache limitations
    const pool = databasePool();

    // Auto-align schema: ensure all Drizzle columns and legacy columns exist so all dumps restore cleanly
    try {
      const drizzleTables = Object.values(schema).filter(isTable);
      for (const t of drizzleTables) {
        const tableName = (t as any)[Symbol.for("drizzle:Name")];
        if (!tableName) continue;
        const cols = Object.values(getTableColumns(t as any));
        for (const col of cols) {
          const colName = (col as any).name;
          if (colName === "id") continue;
          const colType = (col as any).getSQLType();
          try {
            await pool.unsafe(`ALTER TABLE IF EXISTS "${tableName}" ADD COLUMN IF NOT EXISTS "${colName}" ${colType}`);
          } catch {
            // ignore
          }
        }
      }

      await pool.unsafe(`
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sender_id VARCHAR(50) DEFAULT '';
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bkash_number VARCHAR(50) DEFAULT '';
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nagad_number VARCHAR(50) DEFAULT '';
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS rocket_number VARCHAR(50) DEFAULT '';
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bkash_type VARCHAR(30) DEFAULT 'Personal';
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS nagad_type VARCHAR(30) DEFAULT 'Personal';
        ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS rocket_type VARCHAR(30) DEFAULT 'Personal';
        ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS bkash_type VARCHAR(30) DEFAULT 'Personal';
        ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS nagad_type VARCHAR(30) DEFAULT 'Personal';
        ALTER TABLE global_items ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE global_items ADD COLUMN IF NOT EXISTS category VARCHAR(100);
        ALTER TABLE global_items ADD COLUMN IF NOT EXISTS cd NUMERIC(14,2) DEFAULT 0;
        ALTER TABLE global_items ADD COLUMN IF NOT EXISTS sd NUMERIC(14,2) DEFAULT 0;
        ALTER TABLE global_items ADD COLUMN IF NOT EXISTS vat NUMERIC(14,2) DEFAULT 0;
        ALTER TABLE global_items ADD COLUMN IF NOT EXISTS ait NUMERIC(14,2) DEFAULT 0;
        ALTER TABLE global_items ADD COLUMN IF NOT EXISTS rd NUMERIC(14,2) DEFAULT 0;
        ALTER TABLE global_items ADD COLUMN IF NOT EXISTS at NUMERIC(14,2) DEFAULT 0;
      `);
    } catch {
      // ignore
    }

    await pool.begin(async (sqlClient: any) => {
      // Best effort: temporarily disable foreign key constraint and trigger checks during dump restore
      try {
        await sqlClient.unsafe("SET session_replication_role = 'replica';");
      } catch {
        // Fall back gracefully if non-superuser; dump is already topologically ordered
      }

      // Execute the uploaded SQL backup (native multi-statement stream execution)
      await sqlClient.unsafe(cleanedSql);

      // Re-enable foreign key constraints and normal trigger checks
      try {
        await sqlClient.unsafe("SET session_replication_role = 'origin';");
      } catch {
        // Fall back gracefully
      }

      // Synchronize PostgreSQL primary key sequences safely (handling empty tables with is_called = false)
      await sqlClient.unsafe(`
        DO $$
        DECLARE
          r RECORD;
          v_max BIGINT;
        BEGIN
          FOR r IN
            SELECT table_name, column_name, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND column_default LIKE 'nextval%'
          LOOP
            EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', r.column_name, r.table_name) INTO v_max;
            IF v_max > 0 THEN
              EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), %s, true)', r.table_name, r.column_name, v_max);
            ELSE
              EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), 1, false)', r.table_name, r.column_name);
            END IF;
          END LOOP;
        END $$;
      `);
    });

    console.info(
      `[AUDIT] SuperAdmin #${superAdminId} successfully restored database from file: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB) at ${new Date().toISOString()}`
    );

    return c.json({
      success: true,
      message: `Database successfully restored from ${file.name}`
    });
  } catch (err: unknown) {
    console.error("Database restore failed:", err);
    return c.json(
      {
        success: false,
        message: `Failed to restore database: ${(err as Error)?.message || String(err)}`
      },
      500
    );
  }
}
