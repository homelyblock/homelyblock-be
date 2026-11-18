CREATE TYPE "ComplaintCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'CLEANING', 'LIFT', 'SECURITY', 'PARKING', 'GENERAL', 'OTHER');
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED');

CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "society_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "assigned_to_user_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ComplaintCategory" NOT NULL,
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "complaint_status_history" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "from_status" "ComplaintStatus",
    "to_status" "ComplaintStatus" NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "complaint_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "complaint_comments" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "complaint_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "complaint_attachments" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "complaint_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "complaints_society_id_status_created_at_idx" ON "complaints"("society_id", "status", "created_at");
CREATE INDEX "complaints_society_id_category_idx" ON "complaints"("society_id", "category");
CREATE INDEX "complaints_society_id_priority_idx" ON "complaints"("society_id", "priority");
CREATE INDEX "complaints_unit_id_created_at_idx" ON "complaints"("unit_id", "created_at");
CREATE INDEX "complaints_created_by_user_id_created_at_idx" ON "complaints"("created_by_user_id", "created_at");
CREATE INDEX "complaints_assigned_to_user_id_status_idx" ON "complaints"("assigned_to_user_id", "status");
CREATE INDEX "complaint_status_history_complaint_id_created_at_idx" ON "complaint_status_history"("complaint_id", "created_at");
CREATE INDEX "complaint_comments_complaint_id_created_at_idx" ON "complaint_comments"("complaint_id", "created_at");
CREATE INDEX "complaint_attachments_complaint_id_created_at_idx" ON "complaint_attachments"("complaint_id", "created_at");
CREATE UNIQUE INDEX "complaint_attachments_storage_key_key" ON "complaint_attachments"("storage_key");

ALTER TABLE "complaints" ADD CONSTRAINT "complaints_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "complaint_status_history" ADD CONSTRAINT "complaint_status_history_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaint_status_history" ADD CONSTRAINT "complaint_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaint_comments" ADD CONSTRAINT "complaint_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
