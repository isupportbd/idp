CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_admin_id_idx" ON "bank_accounts" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "expense_heads_admin_id_idx" ON "expense_heads" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "commercial_areas_location_id_idx" ON "commercial_areas" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "subscription_transactions_user_id_idx" ON "subscription_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_transactions_plan_id_idx" ON "subscription_transactions" USING btree ("plan_id");