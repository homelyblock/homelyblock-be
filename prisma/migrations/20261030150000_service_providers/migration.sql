CREATE TYPE "ServiceCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'CARPENTRY', 'HOUSEKEEPING', 'PEST_CONTROL', 'INTERNET_CABLE', 'APPLIANCE_REPAIR', 'OTHER');

CREATE TABLE "service_providers" (
    "id" UUID NOT NULL,
    "society_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL,
    "description" TEXT,
    "contact_person" TEXT,
    "phone" TEXT NOT NULL,
    "whatsapp_number" TEXT,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_providers_society_id_is_active_category_idx" ON "service_providers"("society_id", "is_active", "category");
CREATE INDEX "service_providers_society_id_name_idx" ON "service_providers"("society_id", "name");

ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
