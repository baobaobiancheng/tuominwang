import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql, type SQL } from "drizzle-orm";
export { sql };
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
});
export type DB = NodePgDatabase;
export async function rows(db: DB, query: SQL): Promise<any[]> {
  return (await db.execute(query)).rows;
}
export async function scoped<T>(
  user: string,
  tenant: string,
  fn: (db: DB) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      "SELECT set_config('app.user_id',$1,true),set_config('app.tenant_id',$2,true)",
      [user, tenant],
    );
    const result = await fn(drizzle(c));
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export const globalDb = drizzle(pool);
// No waiting for an advisory lock while holding document rows or a pool slot: that can deadlock
// the worker publishing its result. A dedicated short-lived connection tries once and fails busy.
let localHeavy = false;
export async function withHeavySlot<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (localHeavy) throw new Error("PROCESSING_BUSY");
  localHeavy = true;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
  const lost = new AbortController();
  client.on("error", () => lost.abort());
  let owned = false;
  try {
    await client.connect();
    owned = (await client.query("SELECT pg_try_advisory_lock(7843,2) AS owned")).rows[0].owned;
    if (!owned) throw new Error("PROCESSING_BUSY");
    return await fn(lost.signal);
  } finally {
    try { if (owned) await client.query("SELECT pg_advisory_unlock(7843,2)"); }
    finally { try { await client.end(); } finally { localHeavy = false; } }
  }
}
export async function verifyRuntimeRole() {
  const [role] = await rows(
    globalDb,
    sql`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`,
  );
  if (!role || role.rolsuper || role.rolbypassrls)
    throw new Error("UNSAFE_DATABASE_ROLE");
}
