-- Read-only counts for rows that would make the integrity migrations fail.
-- This script does not update or delete anything.

SELECT 'case_variant_emails' AS check_name, COUNT(*)::int AS row_count
FROM (
  SELECT lower(email)
  FROM "user_profiles"
  WHERE email IS NOT NULL
  GROUP BY lower(email)
  HAVING COUNT(*) > 1
) duplicates
UNION ALL
SELECT 'units_cross_society', COUNT(*)::int
FROM "units" AS child
JOIN "buildings" AS parent ON parent."id" = child."building_id"
WHERE child."society_id" IS DISTINCT FROM parent."society_id"
UNION ALL
SELECT 'visitors_cross_society', COUNT(*)::int
FROM "visitors" AS child
JOIN "buildings" AS parent ON parent."id" = child."building_id"
WHERE child."society_id" IS DISTINCT FROM parent."society_id"
   OR EXISTS (
     SELECT 1 FROM "units" AS home
     WHERE home."id" = child."unit_id"
       AND (
         home."society_id" IS DISTINCT FROM child."society_id"
         OR home."building_id" IS DISTINCT FROM child."building_id"
       )
   )
UNION ALL
SELECT 'complaints_cross_society', COUNT(*)::int
FROM "complaints" AS child
JOIN "buildings" AS parent ON parent."id" = child."building_id"
WHERE child."society_id" IS DISTINCT FROM parent."society_id"
   OR EXISTS (
     SELECT 1 FROM "units" AS home
     WHERE home."id" = child."unit_id"
       AND (
         home."society_id" IS DISTINCT FROM child."society_id"
         OR home."building_id" IS DISTINCT FROM child."building_id"
       )
   )
UNION ALL
SELECT 'bills_cross_society', COUNT(*)::int
FROM "maintenance_bills" AS child
JOIN "buildings" AS parent ON parent."id" = child."building_id"
WHERE child."society_id" IS DISTINCT FROM parent."society_id"
   OR EXISTS (
     SELECT 1 FROM "units" AS home
     WHERE home."id" = child."unit_id"
       AND (
         home."society_id" IS DISTINCT FROM child."society_id"
         OR home."building_id" IS DISTINCT FROM child."building_id"
       )
   )
   OR (
     child."config_id" IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM "maintenance_configurations" AS config
       WHERE config."id" = child."config_id"
         AND config."society_id" IS DISTINCT FROM child."society_id"
     )
   )
UNION ALL
SELECT 'payments_cross_society', COUNT(*)::int
FROM "maintenance_payments" AS child
JOIN "maintenance_bills" AS bill ON bill."id" = child."bill_id"
WHERE child."society_id" IS DISTINCT FROM bill."society_id"
UNION ALL
SELECT 'membership_unit_cross_society', COUNT(*)::int
FROM "society_memberships" AS child
JOIN "units" AS home ON home."id" = child."primary_unit_id"
WHERE child."society_id" IS DISTINCT FROM home."society_id"
UNION ALL
SELECT 'notices_cross_society', COUNT(*)::int
FROM "notices" AS child
WHERE (
  child."target_building_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "buildings" AS parent
    WHERE parent."id" = child."target_building_id"
      AND parent."society_id" IS DISTINCT FROM child."society_id"
  )
) OR (
  child."target_unit_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "units" AS home
    WHERE home."id" = child."target_unit_id"
      AND home."society_id" IS DISTINCT FROM child."society_id"
  )
)
UNION ALL
SELECT 'maintenance_targets_cross_society', COUNT(*)::int
FROM "maintenance_configurations" AS child
WHERE (
  child."target_building_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "buildings" AS parent
    WHERE parent."id" = child."target_building_id"
      AND parent."society_id" IS DISTINCT FROM child."society_id"
  )
) OR (
  child."target_unit_id" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "units" AS home
    WHERE home."id" = child."target_unit_id"
      AND home."society_id" IS DISTINCT FROM child."society_id"
  )
)
UNION ALL
SELECT 'duplicate_open_period_keys', COUNT(*)::int
FROM (
  SELECT "open_period_key"
  FROM "maintenance_bills"
  WHERE "open_period_key" IS NOT NULL
  GROUP BY "open_period_key"
  HAVING COUNT(*) > 1
) duplicates
UNION ALL
SELECT 'duplicate_active_household_names', COUNT(*)::int
FROM (
  SELECT "active_name_key"
  FROM "household_members"
  WHERE "active_name_key" IS NOT NULL
  GROUP BY "active_name_key"
  HAVING COUNT(*) > 1
) duplicates
UNION ALL
SELECT 'invited_without_expiry', COUNT(*)::int
FROM "society_memberships"
WHERE "status" = 'INVITED' AND "invitation_expires_at" IS NULL;
