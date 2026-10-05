import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { roles } from "@/modules/auth/database/models/role.js";

async function executeSingleSql(rawSql: string) {
  const clean = rawSql.trim();
  if (!clean) return;
  try {
    await db.execute(sql.raw(clean));
  } catch (err: any) {
    if (
      !err.message?.includes("already exists") &&
      !err.message?.includes("duplicate") &&
      !err.message?.includes("multiple primary keys")
    ) {
      console.warn(`[DB Schema Sync Warning]:`, err.message || err);
    }
  }
}

export async function syncDatabaseSchemaAndSuperAdmin() {
  console.log("[DB Sync] Starting clean schema and SuperAdmin synchronization...");

  // 1. Run all base SQL migrations safely (idempotent execution across fresh and existing databases)
  try {
    const migrationsDir = path.resolve(process.cwd(), "src/database/migrations/postgresql");
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
      console.log(`[DB Sync] Checking and applying ${files.length} migration file(s)...`);
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sqlContent = fs.readFileSync(filePath, "utf-8");
        const statements = sqlContent.split("--> statement-breakpoint");
        for (const stmt of statements) {
          await executeSingleSql(stmt);
        }
      }
    }
  } catch (mErr) {
    console.warn("[DB Sync Migration Warning]", mErr);
  }

  // 2. Comprehensive Idempotent Schema Guards (Guarantees full model sync regardless of migration state)
  try {
    // Ensure Roles table and system roles
    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await executeSingleSql(
      `INSERT INTO roles (name) VALUES ('superadmin'), ('admin'), ('user') ON CONFLICT (name) DO NOTHING`
    );

    // Auto-clean stale column mapping entries
    await executeSingleSql(`DELETE FROM column_mappings WHERE db_column IN ('client_name', 'clientName') OR label = 'client_name'`);
    
    // Auto-seed default system column mappings if table is empty
    await executeSingleSql(`
      INSERT INTO column_mappings (db_column, label, excel_header, is_calculated, is_from_db, is_regex_extracted)
      VALUES
        ('office', 'office', 'Office', false, false, false),
        ('be_no', 'be_no', 'BE_NO', false, false, false),
        ('be_date', 'be_date', 'BE_DATE', false, false, false),
        ('hs_code', 'hs_code', 'HSCode', false, false, false),
        ('item_name', 'item_name', '', false, true, false),
        ('lc_number', 'lc_number', 'LC Number', false, false, false),
        ('net_wt', 'net_wt', 'Net_WT', false, false, false),
        ('excess_qty', 'excess_qty', 'Description', false, false, true),
        ('total_qty', 'total_qty', '', true, false, false),
        ('ass_value', 'ass_value', 'Ass. Value', false, false, false),
        ('cd', 'cd', 'CD', false, false, false),
        ('rd', 'rd', 'RD', false, false, false),
        ('sd', 'sd', 'SD', false, false, false),
        ('base_value_of_vat', 'base_value_of_vat', '', true, false, false),
        ('vat', 'vat', 'VAT', false, false, false),
        ('unit_value', 'unit_value', '', true, false, false),
        ('at', 'at', 'AT', false, false, false),
        ('bin', 'bin', 'BIN', false, false, false)
      ON CONFLICT (db_column) DO NOTHING
    `);
    
    // Ensure all plan columns exist
    await executeSingleSql(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_clients INTEGER NOT NULL DEFAULT 50`);
    await executeSingleSql(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_storage_mb INTEGER NOT NULL DEFAULT 1024`);
    await executeSingleSql(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS has_accounts BOOLEAN NOT NULL DEFAULT false`);

    // Ensure users table has all modern columns
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile VARCHAR(20)`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_id INTEGER`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20)`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trx_id VARCHAR(100)`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_amount INTEGER DEFAULT 0`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS advance_balance INTEGER DEFAULT 0`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_balance DOUBLE PRECISION DEFAULT 0`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_id INTEGER`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSON DEFAULT '[]'::json`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS exp_date TIMESTAMP`);
    await executeSingleSql(`ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_storage_mb INTEGER NOT NULL DEFAULT 0`);

    // Ensure tenant admin_id columns exist on firm tables
    await executeSingleSql(`ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS admin_id INTEGER`);
    await executeSingleSql(`ALTER TABLE expense_heads ADD COLUMN IF NOT EXISTS admin_id INTEGER`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS admin_id INTEGER`);

    // Drop global unique constraints on expense_heads for multi-tenant support
    await executeSingleSql(`ALTER TABLE expense_heads DROP CONSTRAINT IF EXISTS "expense_heads_name_unique"`);
    await executeSingleSql(`ALTER TABLE expense_heads DROP CONSTRAINT IF EXISTS "expense_heads_code_unique"`);

    // Ensure company_settings has all SMS and modern configuration columns
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sms_api_key TEXT`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sms_sender_id VARCHAR(50) DEFAULT ''`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sms_provider VARCHAR(100) DEFAULT ''`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS sms_endpoint_url TEXT DEFAULT ''`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_messaging_enabled BOOLEAN NOT NULL DEFAULT true`);
    await executeSingleSql(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS receipt_prefix VARCHAR(20) DEFAULT 'RCP'`);

    // Copy legacy sender_id to sms_sender_id if it exists
    await executeSingleSql(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='company_settings' AND column_name='sender_id') THEN
          UPDATE company_settings SET sms_sender_id = sender_id WHERE (sms_sender_id IS NULL OR sms_sender_id = '') AND sender_id IS NOT NULL;
        END IF;
      END $$;
    `);

    // Ensure SMS tables exist
    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS sms_templates (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        key VARCHAR(64) NOT NULL,
        name VARCHAR(128) NOT NULL,
        description TEXT,
        body TEXT NOT NULL,
        variables JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await executeSingleSql(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        recipient_mobile VARCHAR(32) NOT NULL,
        message TEXT NOT NULL,
        template_key VARCHAR(64),
        submission_id VARCHAR(64),
        status VARCHAR(32) NOT NULL DEFAULT 'SENT',
        provider_response TEXT,
        sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Ensure high-performance composite & tenant indexes exist
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS purchases_admin_month_idx ON purchases (admin_id, month)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS purchases_client_month_idx ON purchases (client_id, month)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS purchases_client_be_date_idx ON purchases (client_id, be_date)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sales_rates_lookup_idx ON sales_rates (client_id, item_id, status, activation_date)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS company_settings_admin_id_idx ON company_settings (admin_id)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS users_admin_id_idx ON users (admin_id)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_templates_admin_key_idx ON sms_templates (admin_id, key)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_templates_key_idx ON sms_templates (key)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_logs_admin_date_idx ON sms_logs (admin_id, sent_at)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_logs_admin_id_idx ON sms_logs (admin_id)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_logs_sent_at_idx ON sms_logs (sent_at)`);
    await executeSingleSql(`CREATE INDEX IF NOT EXISTS sms_logs_status_idx ON sms_logs (status)`);
  } catch (rErr) {
    console.warn("[DB Roles/Schema Warning]", rErr);
  }

  // 3. Dynamic SuperAdmin Account Setup from .env (Only SuperAdmin account, NO demo data)
  try {
    const superadminEmail = (process.env.SUPERADMIN_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const superadminPassword = process.env.SUPERADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    const superadminName = process.env.SUPERADMIN_NAME || process.env.ADMIN_NAME || "Super Admin";

    if (superadminEmail && superadminPassword) {
      let [superadminRole] = await db.select().from(roles).where(eq(roles.name, "superadmin")).limit(1);
      if (!superadminRole) {
        try {
          const [createdRole] = await db.insert(roles).values({ name: "superadmin" }).returning();
          superadminRole = createdRole;
        } catch {
          const [existingRole] = await db.select().from(roles).where(eq(roles.name, "superadmin")).limit(1);
          superadminRole = existingRole;
        }
      }

      const hashedPassword = await bcrypt.hash(superadminPassword, 10);
      const existingAdmin = await db.select().from(users).where(sql`lower(${users.email}) = ${superadminEmail}`).limit(1);

      if (existingAdmin.length > 0) {
        console.log(`[SuperAdmin Sync] Updating credentials for ${superadminEmail} from .env...`);
        await db.update(users).set({
          name: superadminName,
          email: superadminEmail,
          password: hashedPassword,
          roleId: superadminRole?.id || existingAdmin[0].roleId,
          status: "active",
          emailVerifiedAt: new Date(),
          updatedAt: new Date()
        }).where(eq(users.id, existingAdmin[0].id));
      } else {
        console.log(`[SuperAdmin Sync] Creating SuperAdmin account for ${superadminEmail} from .env...`);
        await db.insert(users).values({
          name: superadminName,
          email: superadminEmail,
          password: hashedPassword,
          roleId: superadminRole?.id,
          status: "active",
          emailVerifiedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
      console.log(`[SuperAdmin Sync] SuperAdmin account ready & synced: ${superadminEmail}`);
    } else {
      console.warn("[SuperAdmin Sync] No SUPERADMIN_EMAIL / ADMIN_EMAIL configured in environment.");
    }
  } catch (adminErr) {
    console.error("[SuperAdmin Sync Error]", adminErr);
  }

  console.log("[DB Sync] Clean schema synchronization finished (Zero demo data).");
}
