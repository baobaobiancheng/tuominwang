import type { FastifyRequest } from "fastify";
import { scoped, rows, sql, type DB } from "../../packages/adapters/db.ts";
import { permissionSchema, type Permission } from "../../packages/contracts/index.ts";

type Target = { project: string } | { document: string } | { job: string };
export const textArray = (values: readonly string[]) => sql`ARRAY[${sql.join(values.map(value => sql`${value}`), sql`, `)}]::text[]`;
export function denied(message = "PERMISSION_DENIED", statusCode = 403): never { throw Object.assign(new Error(message), { statusCode }); }
export async function capabilities(db: DB, project: string): Promise<Permission[]> {
  const list = await rows(db, sql`SELECT value FROM unnest(${textArray(permissionSchema.options)}) AS value WHERE project_permission(${project}::uuid,value)`);
  return list.map(row => row.value);
}
export async function requirePermission(db: DB, project: string, required: Permission[]) {
  for (const permission of required) if (!(await rows(db, sql`SELECT project_permission(${project}::uuid,${permission}) AS allowed`))[0]?.allowed) denied();
}
export async function projectScope<T>(req: FastifyRequest, target: Target, required: Permission[], fn: (db: DB, project: string) => Promise<T>): Promise<T> {
  return scoped(req.user.id, req.user.tenant_id, async db => {
    const project = "project" in target ? target.project : (await rows(db, "document" in target
      ? sql`SELECT project_id FROM documents WHERE id=${target.document}`
      : sql`SELECT project_id FROM jobs WHERE id=${target.job}`))[0]?.project_id;
    if (!project) denied("NOT_FOUND", 404);
    // Member revocation takes the same project lock. Permission check + data use commit before a revoke,
    // or observe the revoke and fail; there is no preHandler-only check/use race.
    const [p] = await rows(db, req.method === "GET" ? sql`SELECT id FROM projects WHERE id=${project} FOR SHARE` : sql`SELECT id FROM projects WHERE id=${project} FOR UPDATE`);
    if (!p) denied("NOT_FOUND", 404);
    await requirePermission(db, project, required);
    return fn(db, project);
  });
}
