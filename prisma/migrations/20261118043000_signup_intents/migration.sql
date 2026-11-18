-- Trusted registration choice. Not writable from Supabase user metadata.
CREATE TABLE "signup_intents" (
    "user_id" UUID NOT NULL,
    "account_type" "AccountType" NOT NULL,
    "society_name" TEXT,
    "city" TEXT,
    "state" TEXT,
    "phone" TEXT,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "signup_intents_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "signup_intents_choice_check" CHECK (
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
    )
);
