# HomelyBlock API

NestJS 12 API. Setup, local database, production migration steps, engineering rules, and the testing script are in `docs/`.

Node.js `>=20.9.0`, npm, and PostgreSQL 16. Docker Compose maps host port 5434.

```bash
npm ci
cp .env.example .env
npm run db:up
npm run prisma:migrate:deploy
npm run start:dev
```

The API listens at http://localhost:4000. Liveness is `GET /api/v1/health`. Readiness is `GET /api/v1/health/ready`. Swagger is at http://localhost:4000/api/docs when `NODE_ENV` is not `production`.

```bash
npm run lint
npm test
npm run test:e2e
npm run test:integration
npm run build
```

`npm run test:integration` requires `DATABASE_URL_TEST` on localhost and a database name containing `livingspace_test`. It does not skip the suite when that URL is missing or unsafe.
