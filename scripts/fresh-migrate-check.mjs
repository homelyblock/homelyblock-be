import { spawnSync } from "node:child_process";
import pg from "pg";

const source = process.env.DATABASE_URL;
if (!source) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const databaseUrl = new URL(source);
if (databaseUrl.hostname !== "localhost" && databaseUrl.hostname !== "127.0.0.1") {
  console.error("Refusing to create a database on a non-local host.");
  process.exit(1);
}

const databaseName = "livingspace_rc_fresh";
const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";
const freshUrl = new URL(databaseUrl);
freshUrl.pathname = `/${databaseName}`;

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
await admin.query(`CREATE DATABASE ${databaseName}`);
await admin.end();

const migrated = spawnSync(
  "npx",
  ["prisma", "migrate", "deploy"],
  {
    env: { ...process.env, DATABASE_URL: freshUrl.toString() },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);

const applied = (migrated.stdout.match(/migrations? applied/gi) ?? []).length;
const names = [...migrated.stdout.matchAll(/Applying migration `([^`]+)`/g)].map((match) => match[1]);
console.log(`exit=${migrated.status}`);
console.log(`applied_count=${names.length}`);
for (const name of names) console.log(`applied\t${name}`);
if (migrated.status !== 0) {
  const safe = `${migrated.stdout}\n${migrated.stderr}`.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
  console.error(safe);
}

const cleanup = new pg.Client({ connectionString: adminUrl.toString() });
await cleanup.connect();
await cleanup.query(`DROP DATABASE IF EXISTS ${databaseName}`);
await cleanup.end();
console.log("dropped=livingspace_rc_fresh");
process.exit(migrated.status === 0 && names.length > 0 ? 0 : 1);
