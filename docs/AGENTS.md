# LivingSpace Backend — Agent Rules

Read workspace-level `AGENTS.md`, `PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, and `AUTH_SECURITY.md` before implementing relevant changes. Shared files are canonical; this file adds backend-specific constraints.

- Inspect existing NestJS modules, scripts, Prisma schema, and migrations before editing.
- Use DTO validation and consistent errors.
- Verify authentication tokens; decoding alone is not verification.
- Enforce role, membership, society, and resource-level authorization in every protected operation.
- Never trust client-provided role, user ID, society ID, or unit ID without server-side validation.
- Scope every society-owned query and mutation to authorized resources.
- Use Prisma migrations and review generated changes.
- Use transactions for atomic multi-step writes.
- Use decimal-safe types for money if maintenance amounts are implemented.
- Avoid logging credentials, tokens, or unnecessary personal data.
- Add tests for unauthorized access and cross-society isolation.
- Do not implement payments, AI, or other unapproved integrations.
- Run actual lint, type-check, tests, schema validation, and build scripts; report anything not run.
