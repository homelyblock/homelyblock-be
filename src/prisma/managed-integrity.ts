/**
 * Database rules that Prisma schema cannot represent, or that a later
 * `migrate dev` might try to drop because they were added in SQL.
 *
 * A migration may drop one of these names only when a later statement in the
 * migration history creates it again. The history as a whole must finish with
 * every name present.
 */
export const MANAGED_INTEGRITY_CONSTRAINTS = [
  'signup_intents_choice_check',
  'contact_inquiries_privacy_check',
  'contact_inquiries_length_check',
  'society_memberships_primary_unit_id_society_id_fkey',
  'notices_target_building_id_society_id_fkey',
  'notices_target_unit_id_society_id_fkey',
  'maintenance_configurations_target_building_id_society_id_fkey',
  'maintenance_configurations_target_unit_id_society_id_fkey',
  'maintenance_bills_config_id_society_id_fkey',
  'maintenance_bills_open_period_key_key',
  'household_members_active_name_key_key',
] as const;

const NAME = MANAGED_INTEGRITY_CONSTRAINTS.join('|');
const STATEMENT = new RegExp(
  `DROP\\s+(?:CONSTRAINT|INDEX)(?:\\s+IF\\s+EXISTS)?\\s+"?(${NAME})"?|(?:ADD\\s+CONSTRAINT|CREATE\\s+(?:UNIQUE\\s+)?INDEX|CONSTRAINT)\\s+"?(${NAME})"?`,
  'gi',
);

export function missingManagedIntegrityConstraints(
  migrationSqlInOrder: readonly string[],
): string[] {
  const present = new Set<string>();
  for (const sql of migrationSqlInOrder) {
    for (const match of sql.matchAll(STATEMENT)) {
      const dropped = match[1];
      const created = match[2];
      if (dropped) present.delete(dropped);
      if (created) present.add(created);
    }
  }
  return MANAGED_INTEGRITY_CONSTRAINTS.filter((name) => !present.has(name));
}
