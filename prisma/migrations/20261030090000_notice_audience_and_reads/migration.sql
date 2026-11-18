-- CreateEnum
CREATE TYPE "NoticeCategory" AS ENUM ('GENERAL', 'MAINTENANCE', 'EVENT', 'EMERGENCY', 'IMPORTANT');

-- CreateEnum
CREATE TYPE "NoticeAudienceType" AS ENUM ('SOCIETY', 'BUILDING', 'UNIT');

-- AlterTable
ALTER TABLE "notices"
ADD COLUMN "category" "NoticeCategory" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "audience_type" "NoticeAudienceType" NOT NULL DEFAULT 'SOCIETY',
ADD COLUMN "target_building_id" UUID,
ADD COLUMN "target_unit_id" UUID;

-- CreateTable
CREATE TABLE "notice_reads" (
    "id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notices_society_id_audience_type_target_building_id_idx" ON "notices"("society_id", "audience_type", "target_building_id");

-- CreateIndex
CREATE INDEX "notices_society_id_audience_type_target_unit_id_idx" ON "notices"("society_id", "audience_type", "target_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "notice_reads_notice_id_user_id_key" ON "notice_reads"("notice_id", "user_id");

-- CreateIndex
CREATE INDEX "notice_reads_user_id_read_at_idx" ON "notice_reads"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_target_building_id_fkey" FOREIGN KEY ("target_building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_target_unit_id_fkey" FOREIGN KEY ("target_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
