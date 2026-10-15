import { test as base, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { passwordHash } from "../../packages/adapters/storage.ts";
import { setTimeout as delay } from "node:timers/promises";

// Browser cases never share a user's projects or rate-limit bucket.
export const test = base.extend<{ account: void }>({
  account: [async ({}, use, testInfo) => {
    const url = new URL(process.env.MIGRATION_DATABASE_URL!);
    if (!url.pathname.startsWith("/tmw_test_")) throw new Error("ISOLATED_DATABASE_REQUIRED");
    const db = new pg.Client({ connectionString: url.href }); await db.connect();
    const username = "isolated-" + randomUUID().slice(0, 8), password = randomBytes(24).toString("hex");
    try {
      // Respect the real IP login limiter across tests and worker restarts; never weaken the server's limit.
      const recent = (await db.query("SELECT EXTRACT(EPOCH FROM (MIN(expires_at)-interval '12 hours'+interval '61 seconds'-now())) AS wait_seconds,COUNT(*) AS n FROM sessions WHERE expires_at>now()+interval '12 hours'-interval '60 seconds'")).rows[0];
      if (Number(recent.n) >= 9) { await delay(Math.max(0, Number(recent.wait_seconds) * 1000)); }
      await db.query("INSERT INTO users VALUES($1,$2,$3,$4)", [randomUUID(), randomUUID(), username, passwordHash(password)]);
    }
    finally { await db.end(); }
    const previous = { username: process.env.E2E_USERNAME, password: process.env.E2E_PASSWORD };
    process.env.E2E_USERNAME = username; process.env.E2E_PASSWORD = password;
    try { await use(); }
    finally { process.env.E2E_USERNAME = previous.username; process.env.E2E_PASSWORD = previous.password; }
  }, { auto: true, timeout: 120000 }],
});
export { expect };
// Preserve the actual assertion/transport error before browser/worker teardown,
// including when a native module later prevents that worker from exiting.
test.afterEach(async({},info)=>{for(const error of info.errors)console.error(JSON.stringify({failedTest:info.title,error:error.message,stack:error.stack}));});
