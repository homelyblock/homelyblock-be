-- Public contact-form messages. Separate from society complaints.
CREATE TABLE "contact_inquiries" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "society_name" TEXT,
    "privacy_acknowledged" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_inquiries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contact_inquiries_privacy_check" CHECK ("privacy_acknowledged" = true),
    CONSTRAINT "contact_inquiries_length_check" CHECK (
      char_length(btrim("full_name")) BETWEEN 2 AND 120
      AND char_length("email") BETWEEN 3 AND 254
      AND char_length(btrim("subject")) BETWEEN 3 AND 160
      AND char_length(btrim("message")) BETWEEN 10 AND 4000
      AND ("society_name" IS NULL OR char_length(btrim("society_name")) BETWEEN 2 AND 160)
    )
);

CREATE INDEX "contact_inquiries_created_at_idx" ON "contact_inquiries"("created_at");
