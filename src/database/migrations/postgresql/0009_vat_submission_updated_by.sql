-- 0009_vat_submission_updated_by
-- Track who last edited a VAT return submission separately from the original
-- filer. `submitted_by` stays immutable (historical attribution); `updated_by`
-- records the user who most recently modified the record.

ALTER TABLE vat_submissions
  ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vat_submissions_updated_by_idx ON vat_submissions (updated_by);
