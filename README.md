# LivingSpace backend

NestJS 12 API for LivingSpace. Product and API contracts live in the parent `Documents/` folder. Local setup detail is in `docs/SETUP.md`.

## Setup

Node.js `>=20.9.0`, npm, and PostgreSQL 16 (Docker Compose maps host port 5434).

```bash
npm ci
cp .env.example .env
npm run db:up
npm run prisma:migrate
npm run start:dev
```

The API listens at http://localhost:4000. Liveness is `GET /api/v1/health`. Readiness, including a database query, is `GET /api/v1/health/ready`. Swagger is at http://localhost:4000/api/docs when `NODE_ENV` is not `production`.

## Checks

```bash
npm run lint
npm test
npm run test:e2e
npm run test:integration
npm run build
```

Integration tests require `DATABASE_URL_TEST`. `npm run test:integration` reads it from the environment, or from `.env` when the environment variable is unset. The URL must be a localhost PostgreSQL database whose name includes `livingspace_test`. If it is missing or unsafe, the command exits non-zero and does not skip the suite.
