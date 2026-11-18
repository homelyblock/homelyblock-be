-- Persist Auth email on profiles so platform owners can search users safely.
-- Email remains optional; uniqueness allows lookup without allowing self-promotion.
ALTER TABLE "user_profiles" ADD COLUMN "email" TEXT;

CREATE UNIQUE INDEX "user_profiles_email_key" ON "user_profiles"("email");
