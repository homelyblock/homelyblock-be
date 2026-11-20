# HomelyBlock backend agent rules

Read `docs/DEVELOPMENT.md` and `docs/SETUP.md` before changing API or database behavior.

- Inspect the existing Nest module, Prisma schema, and migrations before editing.
- Validate input with DTOs. Authorize role, membership, and society on the server.
- Do not trust a client-supplied role, user id, society id, or unit id.
- Keep optional composite foreign keys in SQL. Do not drop them to satisfy Prisma.
- Use a transaction when a business write and its audit record must succeed together.
- Do not log credentials, tokens, or payment details.
- Apply existing migrations with `npm run prisma:migrate:deploy`. Use `npm run prisma:migrate` only to create a migration on a local development database.
- Run the backend checks in `docs/DEVELOPMENT.md`.
