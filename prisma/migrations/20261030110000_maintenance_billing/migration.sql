-- CreateEnum
CREATE TYPE "MaintenanceBillingCycle" AS ENUM ('MONTHLY');
CREATE TYPE "MaintenanceConfigStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "MaintenanceConfigScope" AS ENUM ('SOCIETY', 'BUILDING', 'UNIT');
CREATE TYPE "MaintenanceBillStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');
CREATE TYPE "InvoiceLineType" AS ENUM ('BASE', 'ADDITIONAL', 'DISCOUNT');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');
CREATE TYPE "PaymentRecordStatus" AS ENUM ('RECORDED', 'REVERSED');

-- CreateTable
CREATE TABLE "maintenance_configurations" (
    "id" UUID NOT NULL,
    "society_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthly_amount" DECIMAL(12,2) NOT NULL,
    "billing_cycle" "MaintenanceBillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "due_day_of_month" INTEGER NOT NULL,
    "additional_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "additional_description" TEXT,
    "scope" "MaintenanceConfigScope" NOT NULL DEFAULT 'SOCIETY',
    "target_building_id" UUID,
    "target_unit_id" UUID,
    "status" "MaintenanceConfigStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "maintenance_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_bills" (
    "id" UUID NOT NULL,
    "society_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "config_id" UUID,
    "billed_user_id" UUID,
    "invoice_number" TEXT NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "additional_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outstanding_amount" DECIMAL(12,2) NOT NULL,
    "status" "MaintenanceBillStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "maintenance_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_bill_line_items" (
    "id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "line_type" "InvoiceLineType" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_bill_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_payments" (
    "id" UUID NOT NULL,
    "society_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "reference_number" TEXT,
    "notes" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'RECORDED',
    "recorded_by_user_id" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(6),
    "reversed_by_user_id" UUID,
    "reversal_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "maintenance_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_configurations_society_id_status_idx" ON "maintenance_configurations"("society_id", "status");
CREATE UNIQUE INDEX "maintenance_bills_society_id_invoice_number_key" ON "maintenance_bills"("society_id", "invoice_number");
CREATE INDEX "maintenance_bills_society_id_status_due_date_idx" ON "maintenance_bills"("society_id", "status", "due_date");
CREATE INDEX "maintenance_bills_society_id_period_year_period_month_idx" ON "maintenance_bills"("society_id", "period_year", "period_month");
CREATE INDEX "maintenance_bills_unit_id_period_year_period_month_idx" ON "maintenance_bills"("unit_id", "period_year", "period_month");
CREATE INDEX "maintenance_bills_unit_id_status_idx" ON "maintenance_bills"("unit_id", "status");
CREATE INDEX "maintenance_bill_line_items_bill_id_idx" ON "maintenance_bill_line_items"("bill_id");
CREATE INDEX "maintenance_payments_society_id_paid_at_idx" ON "maintenance_payments"("society_id", "paid_at");
CREATE INDEX "maintenance_payments_bill_id_status_idx" ON "maintenance_payments"("bill_id", "status");

-- AddForeignKey
ALTER TABLE "maintenance_configurations" ADD CONSTRAINT "maintenance_configurations_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_configurations" ADD CONSTRAINT "maintenance_configurations_target_building_id_fkey" FOREIGN KEY ("target_building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_configurations" ADD CONSTRAINT "maintenance_configurations_target_unit_id_fkey" FOREIGN KEY ("target_unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "maintenance_bills" ADD CONSTRAINT "maintenance_bills_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_bills" ADD CONSTRAINT "maintenance_bills_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_bills" ADD CONSTRAINT "maintenance_bills_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_bills" ADD CONSTRAINT "maintenance_bills_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "maintenance_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "maintenance_bills" ADD CONSTRAINT "maintenance_bills_billed_user_id_fkey" FOREIGN KEY ("billed_user_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "maintenance_bill_line_items" ADD CONSTRAINT "maintenance_bill_line_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "maintenance_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "maintenance_payments" ADD CONSTRAINT "maintenance_payments_society_id_fkey" FOREIGN KEY ("society_id") REFERENCES "societies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_payments" ADD CONSTRAINT "maintenance_payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "maintenance_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_payments" ADD CONSTRAINT "maintenance_payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "maintenance_payments" ADD CONSTRAINT "maintenance_payments_reversed_by_user_id_fkey" FOREIGN KEY ("reversed_by_user_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
