-- Registration choice for public accounts. Nullable so existing profiles stay valid.
-- PLATFORM_OWNER is intentionally absent. Society access remains on society_memberships.
CREATE TYPE "AccountType" AS ENUM ('SOCIETY_ADMIN', 'RESIDENT_USER');

ALTER TABLE "user_profiles" ADD COLUMN "account_type" "AccountType";
