CREATE TABLE IF NOT EXISTS "client_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"login_id" varchar(255) NOT NULL,
	"login_password" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer DEFAULT 1 NOT NULL,
	"name" varchar(255) NOT NULL,
	"bin" varchar(50)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "column_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"db_column" varchar(100) NOT NULL,
	"excel_header" varchar(255) NOT NULL,
	CONSTRAINT "column_mappings_db_column_unique" UNIQUE("db_column")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"hs_code" varchar(50),
	"aw_hs_code" varchar(50)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"message" varchar(500) NOT NULL,
	"client_id" integer NOT NULL,
	"old_admin_id" integer NOT NULL,
	"new_admin_id" integer NOT NULL,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"rate_monthly" double precision NOT NULL,
	"rate_yearly" double precision NOT NULL,
	"max_users" integer NOT NULL,
	"yearly_discount_percent" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer DEFAULT 1 NOT NULL,
	"client_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"office" varchar(50),
	"be_no" varchar(100),
	"be_date" date NOT NULL,
	"month" varchar(7) NOT NULL,
	"lc_number" varchar(100),
	"net_wt" double precision NOT NULL,
	"excess_qty" double precision,
	"total_qty" double precision,
	"ass_value" double precision NOT NULL,
	"unit_value" double precision,
	"cd" double precision,
	"rd" double precision,
	"sd" double precision,
	"base_value_of_vat" double precision,
	"vat" double precision,
	"at" double precision,
	"is_rebate" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer DEFAULT 1 NOT NULL,
	"client_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"unit_id" integer,
	"sales_rate" double precision NOT NULL,
	"vat_rate" double precision NOT NULL,
	"vatable_value" double precision NOT NULL,
	"addition_percent" double precision DEFAULT 0,
	"activation_date" date NOT NULL,
	"is_ffs" boolean DEFAULT false,
	"status" varchar(20) DEFAULT 'Active'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_conversions" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_unit" varchar(50) NOT NULL,
	"sales_unit" varchar(50) NOT NULL,
	"factor" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"mobile" varchar(20),
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"plan_id" integer,
	"trx_id" varchar(100),
	"admin_id" integer,
	"exp_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"last_active" timestamp,
	"last_page" varchar(255),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_mobile_unique" UNIQUE("mobile")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vat_notes_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"vat_rate" double precision NOT NULL,
	"note_name" varchar(50) NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clients" ADD CONSTRAINT "clients_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_old_admin_id_users_id_fk" FOREIGN KEY ("old_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notifications" ADD CONSTRAINT "notifications_new_admin_id_users_id_fk" FOREIGN KEY ("new_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_rates" ADD CONSTRAINT "sales_rates_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_rates" ADD CONSTRAINT "sales_rates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_rates" ADD CONSTRAINT "sales_rates_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_rates" ADD CONSTRAINT "sales_rates_unit_id_unit_conversions_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit_conversions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
