# LivingSpace Backend

NestJS + TypeScript REST API for LivingSpace.

## Status
The workspace-level `PRD.md` describes intended features. This README must be updated to reflect what is actually implemented.

## Setup
From this repository, with Node.js `>=20.9.0` and npm:

```bash
npm ci
cp .env.example .env
npm run start:dev
```

The API listens at http://localhost:4000. Health is at http://localhost:4000/api/v1/health. Swagger is at http://localhost:4000/api/docs. `.env.example` sets `NODE_ENV`, `PORT`, `API_PREFIX`, and `CORS_ORIGINS`. Database, Supabase, and Prisma model prerequisites are in `docs/SETUP.md` and `docs/DATABASE.md`.

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

## Security
- Authenticate protected requests.
- Enforce role and society-level authorization server-side.
- Never expose secrets in source control.
- Do not reset shared/production databases to resolve local errors.
- Keep Swagger/OpenAPI aligned with implemented routes.

## Shared documentation
The canonical architecture, schema, API, and security documents live in the parent workspace. Open the full `LivingSpace` folder in Cursor when changing both FE and BE contracts.
