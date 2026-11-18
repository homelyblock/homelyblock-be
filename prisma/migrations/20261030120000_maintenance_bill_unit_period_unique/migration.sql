-- Prevent duplicate open bills for the same unit and billing period.
-- CANCELLED invoices are excluded so a replacement draft can be generated.
CREATE UNIQUE INDEX "maintenance_bills_unit_period_open_key"
ON "maintenance_bills"("unit_id", "period_year", "period_month")
WHERE "status" <> 'CANCELLED';
