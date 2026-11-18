import { defineConfig, env } from 'prisma/config';

// Load local `.env` for Prisma CLI when DATABASE_URL is not already exported
// (e.g. plain `npx prisma validate`). CI injects DATABASE_URL and needs no file.
try {
  process.loadEnvFile('.env');
} catch {
  // Missing or unreadable `.env` is fine when the environment already provides DATABASE_URL.
}

// Prisma CLI commands expect DATABASE_URL.
// Schema validation and client generation do not require a live database, but
// migrate deploy/dev do.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
