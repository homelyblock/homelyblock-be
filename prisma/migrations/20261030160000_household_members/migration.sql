-- CreateEnum
CREATE TYPE "HouseholdRelationship" AS ENUM ('SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'RELATIVE', 'OTHER');

-- CreateTable
CREATE TABLE "household_members" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" "HouseholdRelationship" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "household_members_membership_id_is_active_idx" ON "household_members"("membership_id", "is_active");

-- CreateIndex
CREATE INDEX "society_memberships_society_id_primary_unit_id_idx" ON "society_memberships"("society_id", "primary_unit_id");

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "society_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
