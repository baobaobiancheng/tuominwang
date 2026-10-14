// Maintenance only: new cloud database, explicitly requested initial credentials.
import pg from "pg";
import { randomUUID } from "node:crypto";
import { passwordHash } from "./packages/adapters/storage.ts";
const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (!username || !password || username.length > 80 || password.length > 128) throw new Error("INVALID_CREDENTIALS");
const client = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await client.connect();
try {
  await client.query("INSERT INTO users(id,tenant_id,username,password_hash) VALUES($1,$2,$3,$4)", [randomUUID(), randomUUID(), username, passwordHash(password)]);
  console.log("Initial cloud account created; existing accounts were not modified.");
} finally { await client.end(); }
