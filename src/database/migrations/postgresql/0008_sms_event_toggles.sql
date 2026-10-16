-- 0008_sms_event_toggles
-- Add granular per-event automated SMS toggles to company_settings so a firm
-- can enable SMS for some events (e.g. VAT submissions) but not others.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS sms_on_bill BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS sms_on_collection BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS sms_on_submission BOOLEAN NOT NULL DEFAULT TRUE;
