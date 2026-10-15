-- 0007_due_reminder_settings
-- Add due reminder configuration fields to company_settings.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS auto_due_reminder BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS due_reminder_days INTEGER NOT NULL DEFAULT 7;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS due_reminder_min_amount NUMERIC(14,2) NOT NULL DEFAULT 1000.00;
