CREATE TABLE IF NOT EXISTS "otps" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"otp_code" varchar(10) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"is_used" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"submission_id" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "submissions_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "mobile" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "is_ffs" boolean DEFAULT false;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "otps" ADD CONSTRAINT "otps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_admin_id_idx" ON "submissions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_client_id_idx" ON "submissions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_month_idx" ON "submissions" USING btree ("month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_credentials_admin_id_idx" ON "client_credentials" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_credentials_client_id_idx" ON "client_credentials" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_admin_id_idx" ON "clients" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_name_idx" ON "clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_bin_idx" ON "clients" USING btree ("bin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_name_idx" ON "items" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_hs_code_idx" ON "items" USING btree ("hs_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_admin_id_idx" ON "purchases" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_client_id_idx" ON "purchases" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_month_idx" ON "purchases" USING btree ("month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_admin_month_idx" ON "purchases" USING btree ("admin_id","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchases_client_month_idx" ON "purchases" USING btree ("client_id","month");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_rates_admin_id_idx" ON "sales_rates" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_rates_client_id_idx" ON "sales_rates" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_rates_item_id_idx" ON "sales_rates" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_rates_client_status_idx" ON "sales_rates" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_admin_id_idx" ON "users" USING btree ("admin_id");--> statement-breakpoint
ALTER TABLE "sales_rates" DROP COLUMN IF EXISTS "is_ffs";