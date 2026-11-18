-- AlterEnum
ALTER TYPE "VisitorStatus" ADD VALUE 'CHECKED_IN';
ALTER TYPE "VisitorStatus" ADD VALUE 'CHECKED_OUT';
ALTER TYPE "VisitorStatus" ADD VALUE 'EXPIRED';

-- CreateEnum
CREATE TYPE "VisitorEntryType" AS ENUM ('EXPECTED', 'WALK_IN');

-- Clear any pre-lifecycle visitor rows (MVP schema was unused in product flows).
DELETE FROM "visitors";

-- AlterTable
ALTER TABLE "visitors"
ADD COLUMN "building_id" UUID NOT NULL,
ADD COLUMN "visitor_phone" TEXT NOT NULL,
ADD COLUMN "purpose" TEXT NOT NULL,
ADD COLUMN "expected_at" TIMESTAMPTZ(6) NOT NULL,
ADD COLUMN "vehicle_number" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "entry_type" "VisitorEntryType" NOT NULL,
ADD COLUMN "checked_in_at" TIMESTAMPTZ(6),
ADD COLUMN "checked_out_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "visitors_society_id_expected_at_idx" ON "visitors"("society_id", "expected_at");

-- CreateIndex
CREATE INDEX "visitors_unit_id_expected_at_idx" ON "visitors"("unit_id", "expected_at");

-- CreateIndex
CREATE INDEX "visitors_created_by_user_id_created_at_idx" ON "visitors"("created_by_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
