import { readFileSync } from "node:fs";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. This script only reads an isolated local database.");
  process.exit(1);
}

let hostname = "";
try {
  hostname = new URL(databaseUrl).hostname;
} catch {
  console.error("DATABASE_URL is not a valid URL.");
  process.exit(1);
}

if (hostname !== "localhost" && hostname !== "127.0.0.1") {
  console.error("Refusing to run preflight against a non-local database.");
  process.exit(1);
}

const sql = readFileSync(new URL("../prisma/preflight/integrity-counts.sql", import.meta.url), "utf8");
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const result = await client.query(sql);
  for (const row of result.rows) {
    console.log(`${row.check_name}\t${row.row_count}`);
  }
  const failing = result.rows.filter((row) => Number(row.row_count) > 0);
  if (failing.length > 0) {
    process.exitCode = 2;
  }
} finally {
  await client.end();
}
