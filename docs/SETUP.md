# Backend Setup

Verified on 2026-10-29 with Node.js v24.21.0 and npm 11.19.0. NestJS is 12.3.2. Prisma CLI / client target version is **7.10.1**. This repository uses npm (`package-lock.json`, lockfileVersion 3).

## Install

From `livingspace-be`:

```bash
npm ci
```

If `npm ci` / `npm install` fails writing under `node_modules/@prisma`, some packages are owned by `root` from an earlier elevated install. Fix ownership **only in this repository**, then reinstall:

```bash
sudo chown -R "$(id -un):staff" /Users/apple/WORK/LivingSpace/livingspace-be/node_modules
cd /Users/apple/WORK/LivingSpace/livingspace-be
npm install
```

Do not run npm as root. Do not use `chmod -R 777`. After a successful install, `node_modules/.bin/prisma` must exist and `npm run prisma:validate` must use that local binary.

## Environment

```bash
cp .env.example .env
```

Required / commonly set values:

```bash
NODE_ENV=development
PORT=4000
API_PREFIX=api/v1
CORS_ORIGINS=http://localhost:3000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5434/livingspace_dev
```

`ConfigModule` loads `.env`. Nest can start without Supabase settings; protected routes then return 401 until verification is configured. Prisma CLI commands require `DATABASE_URL` (a local placeholder is enough for `validate` / `generate`; a real development database is required to apply migrations).

Auth-related variables (set URL + anon key together, or leave both unset):

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=
# Optional JWKS / issuer overrides; JWKS is preferred for asymmetric keys:
# SUPABASE_JWKS_URL=https://YOUR_PROJECT.supabase.co/auth/v1/.well-known/jwks.json
# SUPABASE_JWT_ISSUER=https://YOUR_PROJECT.supabase.co/auth/v1
# Legacy HS256 only:
# SUPABASE_JWT_SECRET=
# Backend-only — never expose to the frontend:
# SUPABASE_SERVICE_ROLE_KEY=
```

`GET /api/v1/me` verifies the bearer token, then upserts `user_profiles` keyed by the Supabase user UUID (and syncs `email` when present on the token). That path needs applied Prisma migrations and a reachable `DATABASE_URL`. Token verification itself does not require the service-role key.

### First `PLATFORM_OWNER`

There is no self-promotion API. After the owner signs in once (so `user_profiles` exists):

```sql
UPDATE user_profiles
SET platform_role = 'PLATFORM_OWNER'
WHERE id = '<supabase-auth-user-uuid>';
```

Verify with `GET /api/v1/me` (`platformRole: "PLATFORM_OWNER"`).

### Integration tests

```bash
# create once; do not drop or reset an existing database
docker exec -i livingspace-pg psql -U postgres -c "CREATE DATABASE livingspace_test;"

# Either export it, or put the same line in livingspace-be/.env (the file is not committed).
export DATABASE_URL_TEST='postgresql://postgres:postgres@localhost:5434/livingspace_test'
npm run test:integration
```

`DATABASE_URL_TEST` is required. The command reads the environment first and then `.env` if the variable is unset. It prints the selected database name and host, without the password, and then runs Vitest. Vitest prints passed, failed, and skipped counts separately.

If the variable is missing, the command prints `DATABASE_URL_TEST is required for integration tests` and exits non-zero. It does not report a successful skipped suite. A non-localhost URL, a database name that does not include `livingspace_test`, or a name that looks like production or staging is rejected the same way. The development database `livingspace_dev` is not selected.

Never put the Supabase service-role key in the frontend. Never commit real credentials.

## PostgreSQL (development)

This machine did not have a listening PostgreSQL instance on port 5432 during setup. Docker Desktop is installed but the daemon was not running.

Simplest local options (choose one; do not use production):

### Option A — Docker (recommended when Docker Desktop is running)

Start Docker Desktop first. If `docker run` fails with “Cannot connect to the Docker daemon”, open the Docker app and wait until it is ready.

```bash
open -a Docker
# wait until: docker info
```

This workspace maps host **5434** → container **5432** (`docker ps` should show `0.0.0.0:5434->5432/tcp` for `livingspace-pg`):

Preferred (Compose — also creates `livingspace_test` on first volume init):

```bash
npm run db:up
# docker compose up -d
```

Legacy one-off container:

```bash
docker run --name livingspace-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=livingspace_dev \
  -p 5434:5432 \
  -d postgres:16
npm run db:create-test
```

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/livingspace_dev
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5434/livingspace_test
```

Prisma CLI loads `.env` via `prisma.config.ts`. If you see `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`, create `.env` from `.env.example` or export `DATABASE_URL`.

Confirm the mapped host port before editing `.env`.

### Option B — Homebrew PostgreSQL

```bash
brew install postgresql@16
brew services start postgresql@16
createuser -s postgres
createdb livingspace_dev
```

Do not install packages or start containers until you intentionally choose an option.

## Prisma

Schema: `prisma/schema.prisma`  
Config: `prisma.config.ts`  
Migrations: `prisma/migrations/`  
Generated client: `src/generated/prisma/` (gitignored)

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate
```

`prisma:migrate` runs `prisma migrate dev` and needs a reachable development database. The initial migration `prisma/migrations/20261029130000_init/` is already in the repository. When the database is available:

```bash
npx prisma migrate deploy
```

or continue with `npm run prisma:migrate` for further schema changes. Do not use `db push` for the initial workflow. Do not reset shared or production databases.

Canonical data model: workspace `Documents/DATABASE.md`. Backend notes: `docs/DATABASE.md`.

## Structure

```text
src/
├── app.module.ts
├── app.controller.ts
├── app.service.ts
├── main.ts
├── auth/               # token verification, AuthGuard, GET /me, profile sync
├── authorization/      # RBAC decorators, AuthorizationGuard, probes
├── societies/          # Society create/list/detail
├── prisma/
├── config/
├── common/
├── health/
└── generated/prisma/   # created by prisma generate; not committed
prisma/
├── schema.prisma
└── migrations/
```

Society, notices, and visitor feature modules are not created yet. Auth establishes identity only.

## Run

```bash
npm run start:dev
```

- API: http://localhost:4000
- Health: http://localhost:4000/api/v1/health
- Current user (Bearer): http://localhost:4000/api/v1/me
- Swagger: http://localhost:4000/api/docs

## Checks

| Command | Notes |
| --- | --- |
| `npm run lint` | Nest source |
| `npm test` / `npm run test:e2e` | Nest unit/e2e |
| `npm run build` | Nest build |
| `npm run prisma:validate` | Requires local Prisma CLI |
| `npm run prisma:generate` | Writes `src/generated/prisma` |
| `npx prisma migrate deploy` | Requires reachable development PostgreSQL |

## Troubleshooting

- **Prisma command not found:** fix `node_modules` ownership (see Install), then `npm install`.
- **No PostgreSQL:** start Docker Desktop or install Postgres locally; update `DATABASE_URL`.
- **Migration against production:** do not. Use a dedicated `livingspace_dev` database.
- Port 4000 in use: stop the other process or set `PORT`.
