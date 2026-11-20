# HomelyBlock

HomelyBlock is a web application for residential society operations: buildings and flats, memberships, notices, visitors, complaints, maintenance bills, and a service directory. It is not a payment gateway, a gate-hardware system, or a messaging product.

The application is two repositories:

- `homelyblock-fe` — Next.js application on port 3000
- `homelyblock-be` — NestJS API on port 4000, PostgreSQL through Prisma

## Read these

| Document | Who it is for |
| --- | --- |
| [SETUP.md](SETUP.md) | Anyone installing the project locally, or applying database migrations to an existing environment |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Engineers changing the application |
| [TESTING.md](TESTING.md) | The testing team, including checks on an already deployed environment |

Screen colors and layout are in the frontend repository at `docs/DESIGN.md`.

The Prisma schema in this repository and the development Swagger page are the live API and database contracts. These files are the copies committed with this repository.
