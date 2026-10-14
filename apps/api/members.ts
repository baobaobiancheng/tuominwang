import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { id, paginationSchema, permissionSchema } from "../../packages/contracts/index.ts";
import { scoped, rows, sql, type DB } from "../../packages/adapters/db.ts";
import { passwordHash } from "../../packages/adapters/storage.ts";
import { projectScope, denied, textArray } from "./access.ts";

async function organization(db: DB, manage = false) {
  const [row] = await rows(db, sql`SELECT *,organization_role() AS role FROM organizations`);
  if (!row || manage && !["owner", "admin"].includes(row.role)) denied();
  return row;
}
function databaseError(e: unknown): never {
  const cause = (e as any)?.cause ?? e;
  if (cause.code === "23505") denied("USERNAME_TAKEN", 409);
  if (["PERMISSION_DENIED", "MEMBER_LIMIT", "NOT_FOUND", "OWNER_IMMUTABLE", "VERSION_CONFLICT"].includes(cause.message)) denied(cause.message, cause.message === "NOT_FOUND" ? 404 : 409);
  throw e;
}
export function registerMemberRoutes(app: FastifyInstance) {
  app.get("/api/organization", req => scoped(req.user.id, req.user.tenant_id, db => organization(db)));
  app.put("/api/organization", async req => {
    const input = z.object({ name: z.string().trim().min(1).max(100), revision: z.number().int().nonnegative() }).parse(req.body);
    return scoped(req.user.id, req.user.tenant_id, async db => {
      const org = await organization(db, true);
      const updated = await rows(db, sql`UPDATE organizations SET name=${input.name},revision=revision+1 WHERE id=${org.id} AND revision=${input.revision} RETURNING revision`);
      if (!updated.length) denied("VERSION_CONFLICT", 409);
      await rows(db, sql`INSERT INTO organization_audit(tenant_id,user_id,event,object_id) VALUES(${org.id},${req.user.id},'organization_renamed',${org.id})`);
      return updated[0];
    });
  });
  app.get("/api/organization/members", async req => {
    const { offset, limit } = paginationSchema.parse(req.query);
    return scoped(req.user.id, req.user.tenant_id, async db => { await organization(db, true); return rows(db, sql`SELECT * FROM organization_accounts() LIMIT ${limit} OFFSET ${offset}`); });
  });
  app.post("/api/organization/members", async req => {
    const input = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(12).max(128) }).parse(req.body);
    return scoped(req.user.id, req.user.tenant_id, async db => {
      const org = await organization(db, true), user = randomUUID();
      try { await rows(db, sql`SELECT create_organization_account(${user},${input.username},${passwordHash(input.password)})`); } catch (e) { databaseError(e); }
      await rows(db, sql`INSERT INTO organization_audit(tenant_id,user_id,event,object_id) VALUES(${org.id},${req.user.id},'organization_account_created',${user})`);
      return { id: user, username: input.username };
    });
  });
  app.put("/api/organization/members/:id", async req => {
    const user = id.parse((req.params as any).id), input = z.object({ revision: z.number().int().nonnegative(), role: z.enum(["admin", "member"]), enabled: z.boolean() }).parse(req.body);
    return scoped(req.user.id, req.user.tenant_id, async db => {
      await organization(db, true);
      try { const [result] = await rows(db, sql`SELECT update_organization_member(${user},${input.revision},${input.role},${input.enabled}) AS revision`); return result; } catch (e) { databaseError(e); }
    });
  });
  app.get("/api/projects/:id/members", async req => {
    const project = id.parse((req.params as any).id);
    return projectScope(req, { project }, ["manage_members"], async db => {
      const [p] = await rows(db, sql`SELECT owner_id FROM projects WHERE id=${project}`);
      const accounts = await rows(db, sql`SELECT * FROM organization_accounts()`), grants = await rows(db, sql`SELECT * FROM project_members WHERE project_id=${project}`);
      return accounts.map(account => ({ ...account, owner: account.id === p.owner_id, revision: grants.find(m => m.user_id === account.id)?.revision ?? null, permissions: account.id === p.owner_id ? permissionSchema.options : grants.find(m => m.user_id === account.id)?.permissions ?? [] }));
    });
  });
  app.put("/api/projects/:id/members/:userId", async req => {
    const { id: project, userId } = z.object({ id, userId: id }).parse(req.params), input = z.object({ revision: z.number().int().nonnegative().nullable(), permissions: z.array(permissionSchema).max(permissionSchema.options.length) }).parse(req.body);
    if (new Set(input.permissions).size !== input.permissions.length) denied("INVALID_INPUT", 400);
    return projectScope(req, { project }, ["manage_members"], async db => {
      const [p] = await rows(db, sql`SELECT owner_id FROM projects WHERE id=${project}`);
      if (p.owner_id === userId) denied("OWNER_IMMUTABLE", 409);
      if (req.user.id === userId) denied("SELF_PERMISSION_CHANGE", 409);
      const [account] = await rows(db, sql`SELECT * FROM organization_accounts() WHERE id=${userId}`);
      if (!account) denied("NOT_FOUND", 404);
      if (!account.enabled && input.permissions.length) denied("ACCOUNT_DISABLED", 409);
      const [old] = await rows(db, sql`SELECT * FROM project_members WHERE project_id=${project} AND user_id=${userId}`);
      if ((old?.revision ?? null) !== input.revision) denied("VERSION_CONFLICT", 409);
      const revision = old ? old.revision + 1 : 0;
      await rows(db, sql`INSERT INTO project_members(tenant_id,project_id,user_id,permissions,revision) VALUES(${req.user.tenant_id},${project},${userId},${textArray(input.permissions)},${revision}) ON CONFLICT(project_id,user_id) DO UPDATE SET permissions=excluded.permissions,revision=excluded.revision,updated_at=now()`);
      await rows(db, sql`UPDATE attempts SET finished_at=now(),outcome='permission_revoked' WHERE finished_at IS NULL AND job_id IN (SELECT id FROM jobs WHERE project_id=${project} AND user_id=${userId} AND status IN ('queued','running') AND NOT job_authorized(id))`);
      await rows(db, sql`UPDATE jobs SET status='cancelled',error_code='PERMISSION_REVOKED',lease_until=NULL WHERE project_id=${project} AND user_id=${userId} AND status IN ('queued','running') AND NOT job_authorized(id)`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id,details) VALUES(${req.user.tenant_id},${project},${req.user.id},'project_member_updated',${userId},${JSON.stringify({ previous: old?.permissions ?? [], permissions: input.permissions, revision })}::jsonb)`);
      return { revision };
    });
  });
  app.get("/api/projects/:id/audit", async req => {
    const project = id.parse((req.params as any).id), { offset, limit } = paginationSchema.parse(req.query);
    return projectScope(req, { project }, ["manage_members"], db => rows(db, sql`SELECT id,user_id,event,object_id,details,created_at FROM audit WHERE project_id=${project} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`));
  });
  app.get("/api/organization/audit", async req => {
    const { offset, limit } = paginationSchema.parse(req.query);
    return scoped(req.user.id, req.user.tenant_id, async db => { await organization(db, true); return rows(db, sql`SELECT id,user_id,event,object_id,details,created_at FROM organization_audit ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`); });
  });
}
