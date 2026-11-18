-- Idempotency for manual payment recording (scoped to society + recording admin).
-- Existing rows (if any) get a deterministic unique placeholder before NOT NULL is enforced.

ALTER TABLE "maintenance_payments"
ADD COLUMN "idempotency_key" TEXT,
ADD COLUMN "request_hash" TEXT;

UPDATE "maintenance_payments"
SET
  "idempotency_key" = 'legacy-' || "id"::text,
  "request_hash" = 'legacy'
WHERE "idempotency_key" IS NULL OR "request_hash" IS NULL;

ALTER TABLE "maintenance_payments"
ALTER COLUMN "idempotency_key" SET NOT NULL,
ALTER COLUMN "request_hash" SET NOT NULL;

CREATE UNIQUE INDEX "maintenance_payments_society_id_recorded_by_user_id_idempotency_key_key"
ON "maintenance_payments"("society_id", "recorded_by_user_id", "idempotency_key");
