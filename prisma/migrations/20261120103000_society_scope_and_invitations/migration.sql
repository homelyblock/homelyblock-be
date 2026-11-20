-- Fail closed when denormalized society ids already disagree.
-- This migration does not rewrite or delete those rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "units" AS child
    JOIN "buildings" AS parent ON parent."id" = child."building_id"
    WHERE child."society_id" IS DISTINCT FROM parent."society_id"
  ) THEN
    RAISE EXCEPTION 'integrity: units.society_id does not match the building society';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "visitors" AS child
    JOIN "buildings" AS parent ON parent."id" = child."building_id"
    WHERE child."society_id" IS DISTINCT FROM parent."society_id"
       OR EXISTS (
         SELECT 1 FROM "units" AS home
         WHERE home."id" = child."unit_id"
           AND (
             home."society_id" IS DISTINCT FROM child."society_id"
             OR home."building_id" IS DISTINCT FROM child."building_id"
           )
       )
  ) THEN
    RAISE EXCEPTION 'integrity: a visitor points at a building or unit outside its society';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "complaints" AS child
    JOIN "buildings" AS parent ON parent."id" = child."building_id"
    WHERE child."society_id" IS DISTINCT FROM parent."society_id"
       OR EXISTS (
         SELECT 1 FROM "units" AS home
         WHERE home."id" = child."unit_id"
           AND (
             home."society_id" IS DISTINCT FROM child."society_id"
             OR home."building_id" IS DISTINCT FROM child."building_id"
           )
       )
  ) THEN
    RAISE EXCEPTION 'integrity: a complaint points at a building or unit outside its society';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "maintenance_bills" AS child
    JOIN "buildings" AS parent ON parent."id" = child."building_id"
    WHERE child."society_id" IS DISTINCT FROM parent."society_id"
       OR EXISTS (
         SELECT 1 FROM "units" AS home
         WHERE home."id" = child."unit_id"
           AND (
             home."society_id" IS DISTINCT FROM child."society_id"
             OR home."building_id" IS DISTINCT FROM child."building_id"
           )
       )
       OR (
         child."config_id" IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM "maintenance_configurations" AS config
           WHERE config."id" = child."config_id"
             AND config."society_id" IS DISTINCT FROM child."society_id"
         )
       )
  ) THEN
    RAISE EXCEPTION 'integrity: a maintenance bill points outside its society';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "maintenance_payments" AS child
    JOIN "maintenance_bills" AS bill ON bill."id" = child."bill_id"
    WHERE child."society_id" IS DISTINCT FROM bill."society_id"
  ) THEN
    RAISE EXCEPTION 'integrity: a payment society does not match its bill';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "society_memberships" AS child
    JOIN "units" AS home ON home."id" = child."primary_unit_id"
    WHERE child."society_id" IS DISTINCT FROM home."society_id"
  ) THEN
    RAISE EXCEPTION 'integrity: a membership primary unit belongs to another society';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "notices" AS child
    WHERE (
      child."target_building_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "buildings" AS parent
        WHERE parent."id" = child."target_building_id"
          AND parent."society_id" IS DISTINCT FROM child."society_id"
      )
    ) OR (
      child."target_unit_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "units" AS home
        WHERE home."id" = child."target_unit_id"
          AND home."society_id" IS DISTINCT FROM child."society_id"
      )
    )
  ) THEN
    RAISE EXCEPTION 'integrity: a notice audience points outside its society';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "maintenance_configurations" AS child
    WHERE (
      child."target_building_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "buildings" AS parent
        WHERE parent."id" = child."target_building_id"
          AND parent."society_id" IS DISTINCT FROM child."society_id"
      )
    ) OR (
      child."target_unit_id" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "units" AS home
        WHERE home."id" = child."target_unit_id"
          AND home."society_id" IS DISTINCT FROM child."society_id"
      )
    )
  ) THEN
    RAISE EXCEPTION 'integrity: a maintenance configuration target is outside its society';
  END IF;
END $$;

-- DropForeignKey
ALTER TABLE "complaints" DROP CONSTRAINT "complaints_building_id_fkey";

-- DropForeignKey
ALTER TABLE "complaints" DROP CONSTRAINT "complaints_unit_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_bills" DROP CONSTRAINT "maintenance_bills_building_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_bills" DROP CONSTRAINT "maintenance_bills_unit_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_payments" DROP CONSTRAINT "maintenance_payments_bill_id_fkey";

-- DropForeignKey
ALTER TABLE "units" DROP CONSTRAINT "units_building_id_fkey";

-- DropForeignKey
ALTER TABLE "visitors" DROP CONSTRAINT "visitors_building_id_fkey";

-- DropForeignKey
ALTER TABLE "visitors" DROP CONSTRAINT "visitors_unit_id_fkey";

-- AlterTable
ALTER TABLE "society_memberships" ADD COLUMN "invitation_expires_at" TIMESTAMPTZ(6),
ADD COLUMN "invited_at" TIMESTAMPTZ(6);

-- Legacy invitations use the same 14-day product default, measured from created_at.
-- Rows already older than that stay expired until an administrator reissues them.
-- Active, suspended, and removed memberships are not given an expiry.
UPDATE "society_memberships"
SET "invited_at" = "created_at",
    "invitation_expires_at" = "created_at" + INTERVAL '14 days'
WHERE "status" = 'INVITED'
  AND "invitation_expires_at" IS NULL;

UPDATE "society_memberships"
SET "invited_at" = "created_at"
WHERE "status" <> 'INVITED'
  AND "invited_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "buildings_id_society_id_key" ON "buildings"("id", "society_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_bills_id_society_id_key" ON "maintenance_bills"("id", "society_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_configurations_id_society_id_key" ON "maintenance_configurations"("id", "society_id");

-- CreateIndex
CREATE INDEX "society_memberships_status_invitation_expires_at_idx" ON "society_memberships"("status", "invitation_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "units_id_society_id_key" ON "units"("id", "society_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_id_building_id_society_id_key" ON "units"("id", "building_id", "society_id");

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_society_id_fkey" FOREIGN KEY ("building_id", "society_id") REFERENCES "buildings"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_building_id_society_id_fkey" FOREIGN KEY ("building_id", "society_id") REFERENCES "buildings"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_unit_id_building_id_society_id_fkey" FOREIGN KEY ("unit_id", "building_id", "society_id") REFERENCES "units"("id", "building_id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_bills" ADD CONSTRAINT "maintenance_bills_building_id_society_id_fkey" FOREIGN KEY ("building_id", "society_id") REFERENCES "buildings"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_bills" ADD CONSTRAINT "maintenance_bills_unit_id_building_id_society_id_fkey" FOREIGN KEY ("unit_id", "building_id", "society_id") REFERENCES "units"("id", "building_id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_payments" ADD CONSTRAINT "maintenance_payments_bill_id_society_id_fkey" FOREIGN KEY ("bill_id", "society_id") REFERENCES "maintenance_bills"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_building_id_society_id_fkey" FOREIGN KEY ("building_id", "society_id") REFERENCES "buildings"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_unit_id_building_id_society_id_fkey" FOREIGN KEY ("unit_id", "building_id", "society_id") REFERENCES "units"("id", "building_id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot model composite foreign keys that mix a nullable parent id
-- with a required society id. These constraints stay in SQL on purpose.
ALTER TABLE "society_memberships" DROP CONSTRAINT "society_memberships_primary_unit_id_fkey";

ALTER TABLE "society_memberships" ADD CONSTRAINT "society_memberships_primary_unit_id_society_id_fkey" FOREIGN KEY ("primary_unit_id", "society_id") REFERENCES "units"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notices" DROP CONSTRAINT "notices_target_building_id_fkey";

ALTER TABLE "notices" ADD CONSTRAINT "notices_target_building_id_society_id_fkey" FOREIGN KEY ("target_building_id", "society_id") REFERENCES "buildings"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notices" DROP CONSTRAINT "notices_target_unit_id_fkey";

ALTER TABLE "notices" ADD CONSTRAINT "notices_target_unit_id_society_id_fkey" FOREIGN KEY ("target_unit_id", "society_id") REFERENCES "units"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "maintenance_configurations" DROP CONSTRAINT "maintenance_configurations_target_building_id_fkey";

ALTER TABLE "maintenance_configurations" ADD CONSTRAINT "maintenance_configurations_target_building_id_society_id_fkey" FOREIGN KEY ("target_building_id", "society_id") REFERENCES "buildings"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "maintenance_configurations" DROP CONSTRAINT "maintenance_configurations_target_unit_id_fkey";

ALTER TABLE "maintenance_configurations" ADD CONSTRAINT "maintenance_configurations_target_unit_id_society_id_fkey" FOREIGN KEY ("target_unit_id", "society_id") REFERENCES "units"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "maintenance_bills" DROP CONSTRAINT "maintenance_bills_config_id_fkey";

ALTER TABLE "maintenance_bills" ADD CONSTRAINT "maintenance_bills_config_id_society_id_fkey" FOREIGN KEY ("config_id", "society_id") REFERENCES "maintenance_configurations"("id", "society_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Postgres truncated this identifier to 63 characters. Rename it to the name
-- Prisma uses so later schema diffs do not try to recreate the index.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE relkind = 'i'
      AND relname = 'maintenance_payments_society_id_recorded_by_user_id_idempotency'
  ) THEN
    ALTER INDEX "maintenance_payments_society_id_recorded_by_user_id_idempotency"
      RENAME TO "maintenance_payments_society_id_recorded_by_user_id_idempot_key";
  END IF;
END $$;

-- CHECK constraints Prisma cannot store. Recreate them so a drifted database
-- and a fresh database both end with the same rules.
ALTER TABLE "signup_intents" DROP CONSTRAINT IF EXISTS "signup_intents_choice_check";
ALTER TABLE "signup_intents" ADD CONSTRAINT "signup_intents_choice_check" CHECK (
  (
    "account_type" = 'RESIDENT_USER'
    AND "society_name" IS NULL
    AND "city" IS NULL
    AND "state" IS NULL
  )
  OR (
    "account_type" = 'SOCIETY_ADMIN'
    AND char_length(btrim("society_name")) >= 2
    AND char_length(btrim("city")) >= 2
  )
);

ALTER TABLE "contact_inquiries" DROP CONSTRAINT IF EXISTS "contact_inquiries_privacy_check";
ALTER TABLE "contact_inquiries" ADD CONSTRAINT "contact_inquiries_privacy_check" CHECK ("privacy_acknowledged" = true);

ALTER TABLE "contact_inquiries" DROP CONSTRAINT IF EXISTS "contact_inquiries_length_check";
ALTER TABLE "contact_inquiries" ADD CONSTRAINT "contact_inquiries_length_check" CHECK (
  char_length(btrim("full_name")) BETWEEN 2 AND 120
  AND char_length("email") BETWEEN 3 AND 254
  AND char_length(btrim("subject")) BETWEEN 3 AND 160
  AND char_length(btrim("message")) BETWEEN 10 AND 4000
  AND ("society_name" IS NULL OR char_length(btrim("society_name")) BETWEEN 2 AND 160)
);
