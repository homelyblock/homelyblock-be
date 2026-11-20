-- Store emails in one case so the unique index matches case-insensitive lookup.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT lower(email) AS email
      FROM "user_profiles"
      WHERE email IS NOT NULL
      GROUP BY lower(email)
      HAVING COUNT(*) > 1
    ) duplicates
  ) THEN
    RAISE EXCEPTION 'user_profiles contains emails that differ only by case';
  END IF;
END $$;

UPDATE "user_profiles"
SET email = lower(email)
WHERE email IS NOT NULL AND email <> lower(email);

-- One open bill per unit and period, expressed as a Prisma-managed unique column.
-- Cancelled bills clear the key so a replacement draft can be generated.
ALTER TABLE "maintenance_bills" ADD COLUMN "open_period_key" TEXT;

UPDATE "maintenance_bills"
SET "open_period_key" = "unit_id"::text || ':' || "period_year"::text || ':' || "period_month"::text
WHERE "status" <> 'CANCELLED';

CREATE UNIQUE INDEX "maintenance_bills_open_period_key_key"
ON "maintenance_bills"("open_period_key");

DROP INDEX IF EXISTS "maintenance_bills_unit_period_open_key";

-- One active household name per membership, including concurrent creates.
ALTER TABLE "household_members" ADD COLUMN "active_name_key" TEXT;

UPDATE "household_members"
SET "active_name_key" = "membership_id"::text || ':' || lower(btrim("name"))
WHERE "is_active" = true;

CREATE UNIQUE INDEX "household_members_active_name_key_key"
ON "household_members"("active_name_key");
