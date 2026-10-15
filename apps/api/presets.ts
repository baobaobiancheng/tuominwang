import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID, createHmac } from "node:crypto";
import { z } from "zod";
import { id, markSchema, type Mark } from "../../packages/contracts/index.ts";
import { profileSchema, rulesetSchema, preferencesSchema, projectPresetSchema, type Profile, type RuleSet, type PresetPreferences, type ProjectPresetPolicy, type StoredPreset } from "../../packages/contracts/presets.ts";
import { defaultProfile, defaultPreferences, SYSTEM_PROFILE_ID, checkedRuleset, normalizeReferenceRuleSetInput, normalizeReferenceProfileInput, previewRuleImport, previewRulePromotion, importRulesWorkbook, exportRulesWorkbook, canonicalRuleEntityType, presetNameWithSuffix, type ImportRule } from "../../packages/core/presets.ts";
import { scoped, rows, sql, type DB } from "../../packages/adapters/db.ts";
import { seal, unseal } from "../../packages/adapters/storage.ts";
import { projectScope } from "./access.ts";

const revision = z.number().int().nonnegative(), userId = z.union([id, z.literal(SYSTEM_PROFILE_ID)]);
function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
const scope = (req: FastifyRequest, fn: (db: DB) => Promise<any>) => scoped(req.user.id, req.user.tenant_id, fn);
const presetAad = (req: FastifyRequest, target: string) => `${req.user.tenant_id}:${req.user.id}:preset:${target}`;
const preferenceAad = (req: FastifyRequest) => `${req.user.tenant_id}:${req.user.id}:preset-preferences`;
function verifiedUserProfile(value: unknown, target: string): Profile {
  const profile = profileSchema.parse(value);
  if (profile.id !== target || profile.source !== "user" || profile.readonly) throw new Error("PRESET_STORAGE_INVALID");
  return profile;
}
function nameHash(req: FastifyRequest, kind: string, name: string) { return createHmac("sha256", Buffer.from(process.env.DATA_KEY!, "hex")).update(`${req.user.tenant_id}:${req.user.id}:${kind}:${name.trim().toLocaleLowerCase("zh-CN")}`).digest("hex"); }
async function getPreference(db: DB, req: FastifyRequest) {
  await rows(db, sql`INSERT INTO redaction_preferences(tenant_id,owner_id,payload) VALUES(${req.user.tenant_id},${req.user.id},${seal(JSON.stringify(defaultPreferences()), preferenceAad(req))}) ON CONFLICT DO NOTHING`);
  const [row] = await rows(db, sql`SELECT * FROM redaction_preferences WHERE owner_id=${req.user.id} AND tenant_id=${req.user.tenant_id} FOR UPDATE`);
  return { revision: row.revision as number, settings: preferencesSchema.parse(JSON.parse(unseal(row.payload, preferenceAad(req)))) };
}
async function savePreference(db: DB, req: FastifyRequest, previous: { revision: number; settings: PresetPreferences }, settings: PresetPreferences) {
  settings.updatedAt = new Date().toISOString(); const checked = preferencesSchema.parse(settings);
  await rows(db, sql`UPDATE redaction_preferences SET revision=revision+1,payload=${seal(JSON.stringify(checked), preferenceAad(req))} WHERE owner_id=${req.user.id} AND tenant_id=${req.user.tenant_id} AND revision=${previous.revision}`);
  return { revision: previous.revision + 1, settings: checked };
}
// The desktop catalogue validates each saved user profile during startup and
// repairs a default pointer whose target has disappeared. Keep damaged cloud
// rows for recovery, but do not let one owner row block unrelated profiles.
async function profileCatalogue(db: DB, req: FastifyRequest, preference: { revision: number; settings: PresetPreferences }) {
  const records = await rows(db, sql`SELECT * FROM redaction_presets WHERE kind='profile' ORDER BY updated_at DESC,id`);
  const items: StoredPreset<Profile>[] = [];
  let unavailableCount = 0;
  for (const row of records) {
    let plaintext: string;
    try {
      plaintext = unseal(row.payload, presetAad(req, row.id));
    } catch (error) {
      // Key configuration is a server failure, not an invalid individual row.
      if ((error as Error).message === "DATA_KEY_REQUIRED") throw error;
      unavailableCount++;
      continue;
    }
    let value: unknown;
    try { value = JSON.parse(plaintext); }
    catch (error) { if (error instanceof SyntaxError) { unavailableCount++; continue; } throw error; }
    try { items.push({ revision: row.revision, settings: verifiedUserProfile(value, row.id) }); }
    catch (error) { if (error instanceof z.ZodError || (error as Error).message === "PRESET_STORAGE_INVALID") { unavailableCount++; continue; } throw error; }
  }
  const selected = preference.settings.defaultProfileId;
  if (selected !== SYSTEM_PROFILE_ID && !items.some(item => item.settings.id === selected)) {
    preference = await savePreference(db, req, preference, { ...preference.settings, defaultProfileId: SYSTEM_PROFILE_ID });
  }
  return { items, preference, unavailableCount };
}
export async function getProfileCatalogue(db: DB, req: FastifyRequest) {
  return profileCatalogue(db, req, await getPreference(db, req));
}
export async function getPreset<T extends Profile | RuleSet>(db: DB, req: FastifyRequest, kind: "profile" | "ruleset", target: string, lock = false): Promise<StoredPreset<T>> {
  if (kind === "profile" && target === SYSTEM_PROFILE_ID) return { revision: 0, settings: defaultProfile() as T };
  id.parse(target);
  const [row] = await rows(db, sql`SELECT * FROM redaction_presets WHERE id=${target} AND kind=${kind} ${lock ? sql`FOR UPDATE` : sql``}`);
  if (!row) fail("NOT_FOUND", 404);
  const value = JSON.parse(unseal(row.payload, presetAad(req, target)));
  return { revision: row.revision, settings: (kind === "profile" ? verifiedUserProfile(value, target) : checkedRuleset(value)) as T };
}
// Called only when a new project explicitly requests personal defaults. Existing null policies retain their legacy semantics.
export async function defaultProjectPresets(db: DB, req: FastifyRequest): Promise<ProjectPresetPolicy> {
  const { items, preference } = await getProfileCatalogue(db, req);
  const profile = preference.settings.defaultProfileId === SYSTEM_PROFILE_ID
    ? { revision: 0, settings: defaultProfile() }
    : items.find(item => item.settings.id === preference.settings.defaultProfileId)!;
  const ruleset = preference.settings.activeRuleSetId ? await getPreset<RuleSet>(db, req, "ruleset", preference.settings.activeRuleSetId) : null;
  return projectPresetSchema.parse({ revision: 1, profile: structuredClone(profile), ruleset: structuredClone(ruleset) });
}
export function getProjectPresetPolicy(project: { id: string; tenant_id: string; preset_revision?: number; preset_policy?: string | null }): ProjectPresetPolicy {
  if (!project.preset_policy) return { revision: project.preset_revision ?? 0, profile: null, ruleset: null };
  const policy = projectPresetSchema.parse(JSON.parse(unseal(project.preset_policy, `${project.tenant_id}:${project.id}:presets`)));
  if (policy.revision !== project.preset_revision) throw new Error("PRESET_POLICY_MISMATCH");
  return policy;
}
export async function invalidatePresetProject(db: DB, project: string) {
  await rows(db, sql`UPDATE documents SET state='outdated',revision=revision+1 WHERE project_id=${project}`);
  await rows(db, sql`UPDATE attempts SET finished_at=now(),outcome='policy_changed' WHERE finished_at IS NULL AND job_id IN(SELECT id FROM jobs WHERE project_id=${project} AND status IN('queued','running'))`);
  await rows(db, sql`UPDATE jobs SET status='cancelled',lease_until=NULL WHERE project_id=${project} AND status IN('queued','running')`);
}
export function registerPresetRoutes(app: FastifyInstance) {
  for (const kind of ["profile", "ruleset"] as const) {
    const base = `/api/presets/${kind === "profile" ? "profiles" : "rulesets"}`;
    app.get(base, req => scope(req, async db => {
      if (kind === "profile") {
        const { items, preference, unavailableCount } = await getProfileCatalogue(db, req);
        return { items: [{ revision: 0, settings: defaultProfile() }, ...items], preferences: preference, unavailableCount };
      }
      const list = await rows(db, sql`SELECT * FROM redaction_presets WHERE kind=${kind} ORDER BY updated_at DESC,id`);
      const items = list.map(row => ({ revision: row.revision, settings: checkedRuleset(JSON.parse(unseal(row.payload, presetAad(req, row.id)))) }));
      return { items, preferences: await getPreference(db, req) };
    }));
    app.get(`${base}/:id`, req => scope(req, db => getPreset(db, req, kind, userId.parse((req.params as any).id))));
    app.post(base, req => scope(req, async db => {
      await getPreference(db, req); // Serialize this user's catalogue and name uniqueness operations.
      const now = new Date().toISOString(), target = randomUUID(); let value: Profile | RuleSet;
      if (kind === "profile") {
        const input = z.object({ name: z.string().trim().min(1).refine(v=>v.isWellFormed()&&!v.includes("\0")), description: z.string().refine(v=>v.isWellFormed()&&!v.includes("\0")).optional(), baseProfileId: userId.optional(), profile: z.unknown().optional() }).strict().parse(req.body);
        const inherited = input.profile === undefined ? (await getPreset<Profile>(db, req, "profile", input.baseProfileId ?? SYSTEM_PROFILE_ID)).settings : profileSchema.parse(normalizeReferenceProfileInput(input.profile,{writeInput:true,preserveNativeSignature:true}));
        value = profileSchema.parse({ ...inherited, id: target, name: input.name, description: input.description ?? inherited.description, source: "user", readonly: false, createdAt: now, updatedAt: now, certNoPreferenceRecorded: true });
      } else {
        const input = z.object({ name: z.string().trim().min(1).refine(v=>v.isWellFormed()&&!v.includes("\0")), description: z.unknown().optional(), applicability: z.unknown().optional() }).strict().parse(req.body);
        value = checkedRuleset({ id: target, schemaVersion: 1, name: input.name, description: "", source: "user", readonly: false, applicability: { mode: "all", materialRouteKeys: [] }, createdAt: now, updatedAt: now, entries: [] });
      }
      if ((await rows(db, sql`SELECT id FROM redaction_presets WHERE kind=${kind} AND name_hash=${nameHash(req, kind, value.name)}`)).length || kind === "profile" && value.name.toLocaleLowerCase("zh-CN") === defaultProfile().name.toLocaleLowerCase("zh-CN")) fail("PRESET_NAME_CONFLICT");
      await rows(db, sql`INSERT INTO redaction_presets(id,tenant_id,owner_id,kind,revision,name_hash,payload) VALUES(${target},${req.user.tenant_id},${req.user.id},${kind},1,${nameHash(req, kind, value.name)},${seal(JSON.stringify(value), presetAad(req, target))})`);
      return { revision: 1, settings: value };
    }));
    app.put(`${base}/:id`, { bodyLimit: 64 * 1024 * 1024 }, req => scope(req, async db => {
      const target = userId.parse((req.params as any).id); if (target === SYSTEM_PROFILE_ID) fail("PRESET_READONLY", 403);
      await getPreference(db, req); const previous = await getPreset<Profile | RuleSet>(db, req, kind, target, true);
      const input = z.object({ revision, settings: kind === "profile" ? z.preprocess(value=>normalizeReferenceProfileInput(value,{writeInput:true,preserveNativeSignature:true}),profileSchema) : z.preprocess(normalizeReferenceRuleSetInput,rulesetSchema) }).strict().parse(req.body);
      if (input.revision !== previous.revision) fail("VERSION_CONFLICT");
      if (previous.settings.readonly) fail("PRESET_READONLY", 403);
      if (input.settings.id !== target) fail("INVALID_INPUT", 400);
      const normalized = { ...input.settings, id: target, source: previous.settings.source, readonly: false, createdAt: previous.settings.createdAt, updatedAt: new Date().toISOString() };
      const value = kind === "profile" ? profileSchema.parse(normalized) : checkedRuleset(normalized);
      if ((await rows(db, sql`SELECT id FROM redaction_presets WHERE kind=${kind} AND id<>${target} AND name_hash=${nameHash(req, kind, value.name)}`)).length || kind === "profile" && value.name.toLocaleLowerCase("zh-CN") === defaultProfile().name.toLocaleLowerCase("zh-CN")) fail("PRESET_NAME_CONFLICT");
      await rows(db, sql`UPDATE redaction_presets SET payload=${seal(JSON.stringify(value), presetAad(req, target))},name_hash=${nameHash(req, kind, value.name)},revision=revision+1,updated_at=now() WHERE id=${target}`);
      return { revision: previous.revision + 1, settings: value };
    }));
    app.post(`${base}/:id/duplicate`, req => scope(req, async db => {
      await getPreference(db, req); const input = z.object({ name: z.string().trim().min(1).refine(v=>v.isWellFormed()&&!v.includes("\0")).optional() }).strict().parse(req.body ?? {});
      const source = await getPreset(db, req, kind, userId.parse((req.params as any).id));
      let name = input.name ?? presetNameWithSuffix(source.settings.name, " 副本"), suffix = 2;
      const original = name;
      while ((await rows(db, sql`SELECT id FROM redaction_presets WHERE kind=${kind} AND name_hash=${nameHash(req, kind, name)}`)).length || kind === "profile" && name === defaultProfile().name) name = presetNameWithSuffix(original, ` ${suffix++}`);
      const target = randomUUID(), now = new Date().toISOString();
      const raw = { ...source.settings, id: target, name, source: "user", readonly: false, createdAt: now, updatedAt: now };
      const value = kind === "profile" ? profileSchema.parse(raw) : checkedRuleset(raw);
      await rows(db, sql`INSERT INTO redaction_presets(id,tenant_id,owner_id,kind,revision,name_hash,payload) VALUES(${target},${req.user.tenant_id},${req.user.id},${kind},1,${nameHash(req, kind, name)},${seal(JSON.stringify(value), presetAad(req, target))})`);
      return { revision: 1, settings: value };
    }));
    app.delete(`${base}/:id`, req => scope(req, async db => {
      const target = userId.parse((req.params as any).id); if (target === SYSTEM_PROFILE_ID) fail("PRESET_READONLY", 403);
      const input = z.object({ revision }).strict().parse(req.body), preference = await getPreference(db, req), item = await getPreset(db, req, kind, target, true);
      if (item.revision !== input.revision) fail("VERSION_CONFLICT"); if (item.settings.readonly) fail("PRESET_READONLY", 403);
      await rows(db, sql`DELETE FROM redaction_presets WHERE id=${target}`);
      const changed = kind === "profile" ? preference.settings.defaultProfileId === target : preference.settings.activeRuleSetId === target;
      if (changed) await savePreference(db, req, preference, { ...preference.settings, ...(kind === "profile" ? { defaultProfileId: SYSTEM_PROFILE_ID } : { activeRuleSetId: null }) });
      return { deleted: true };
    }));
  }
  app.get("/api/presets/preferences", req => scope(req, db => getPreference(db, req)));
  app.put("/api/presets/preferences", req => scope(req, async db => {
    const input = z.object({ revision, defaultProfileId: userId, activeRuleSetId: id.nullable() }).strict().parse(req.body), previous = await getPreference(db, req);
    if (input.revision !== previous.revision) fail("VERSION_CONFLICT");
    await getPreset(db, req, "profile", input.defaultProfileId); if (input.activeRuleSetId) await getPreset(db, req, "ruleset", input.activeRuleSetId);
    return savePreference(db, req, previous, { ...previous.settings, defaultProfileId: input.defaultProfileId, activeRuleSetId: input.activeRuleSetId });
  }));
  app.post("/api/presets/preferences/exports", async req => {
    const input = z.object({ revision, documentId: id, artifactId: id }).strict().parse(req.body);
    return projectScope(req, { document: input.documentId }, ["export"], async db => {
      const preference = await getPreference(db, req); if (preference.revision !== input.revision) fail("VERSION_CONFLICT");
      const [artifact] = await rows(db, sql`SELECT a.*,d.source_format,p.preset_policy,p.preset_revision,p.id AS policy_project FROM artifacts a JOIN documents d ON d.id=a.document_id JOIN projects p ON p.id=a.project_id JOIN jobs j ON j.id=a.job_id WHERE a.id=${input.artifactId} AND a.document_id=${input.documentId} AND j.status='succeeded' AND a.issued_until>now() AND d.revision=a.revision AND d.state='review'`);
      if (!artifact) fail("EXPORT_NOT_ISSUED");
      const policy = getProjectPresetPolicy({ id: artifact.policy_project, tenant_id: artifact.tenant_id, preset_policy: artifact.preset_policy, preset_revision: artifact.preset_revision });
      const kind = artifact.format ?? artifact.source_format ?? "txt";
      return savePreference(db, req, preference, { ...preference.settings, lastSuccessfulExportByKind: { ...preference.settings.lastSuccessfulExportByKind, [kind]: { kind, documentId: input.documentId, artifactId: input.artifactId, at: new Date().toISOString(), profile: policy.profile?.settings ?? null } } });
    });
  });
  app.get("/api/presets/rulesets/template.xlsx", async (_req, reply) => reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", 'attachment; filename="ruleset-template.xlsx"').send(await exportRulesWorkbook()));
  app.get("/api/presets/rulesets/:id/export.xlsx", async (req, reply) => {
    const target = id.parse((req.params as any).id), expected = z.coerce.number().int().positive().parse((req.query as any).revision);
    const output = await scope(req, async db => { const item = await getPreset<RuleSet>(db, req, "ruleset", target); if (item.revision !== expected) fail("VERSION_CONFLICT"); return exportRulesWorkbook(item.settings); });
    return reply.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", 'attachment; filename="ruleset.xlsx"').send(output);
  });
  app.post("/api/presets/rulesets/:id/import", { bodyLimit: 5 * 1024 * 1024 }, req => scope(req, async db => {
    const target = id.parse((req.params as any).id), expected = z.coerce.number().int().positive().parse((req.query as any).revision);
    if (!Buffer.isBuffer(req.body)) fail("INVALID_DICTIONARY_TABLE", 400);
    const item = await getPreset<RuleSet>(db, req, "ruleset", target); if (item.revision !== expected) fail("VERSION_CONFLICT");
    const parsed = await importRulesWorkbook(req.body); return { revision: expected, ...previewRuleImport(item.settings, parsed.imported, parsed.errors) };
  }));
  app.post("/api/presets/rulesets/:id/promotion", async req => {
    const target = id.parse((req.params as any).id), input = z.object({ revision, projectId: id }).strict().parse(req.body);
    return projectScope(req, { project: input.projectId }, ["view_original", "review", "manage_dictionary"], async db => {
      const item = await getPreset<RuleSet>(db, req, "ruleset", target); if (item.revision !== input.revision) fail("VERSION_CONFLICT");
      const docs = await rows(db, sql`SELECT * FROM documents WHERE project_id=${input.projectId} ORDER BY id`), candidates: ImportRule[] = [];
      for (const d of docs) {
        const text = unseal(d.content, `${d.tenant_id}:${d.project_id}:${d.id}`);
        for (const mark of d.marks as Mark[]) if (mark.decision !== "pending") candidates.push({ pattern: text.slice(mark.start, mark.end), entityType: mark.rawEntityType??canonicalRuleEntityType(mark.kind) as ImportRule["entityType"], kind: mark.decision === "redact" ? "forceDetect" : "forceSkip", enabled: true, row: candidates.length + 1 });
      }
      // Preview is pure; saved decisions are the authoritative source and are never changed by promotion.
      const unique = [...new Map(candidates.map(c => [`${c.entityType}\0${c.pattern}\0${c.kind}`, c])).values()];
      return { revision: item.revision, projectId: input.projectId, ...previewRulePromotion(item.settings, unique) };
    });
  });
  app.get("/api/projects/:id/presets", async req => {
    const project = id.parse((req.params as any).id);
    return projectScope(req, { project }, ["view_original"], async db => { const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project}`); if (!p) fail("NOT_FOUND", 404); return getProjectPresetPolicy(p); });
  });
  app.put("/api/projects/:id/presets", async req => {
    const project = id.parse((req.params as any).id), input = z.object({ revision, profileId: userId.nullable(), profileRevision: revision.optional(), rulesetId: id.nullable(), rulesetRevision: revision.optional() }).strict().parse(req.body);
    return projectScope(req, { project }, ["review"], async db => {
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project} FOR UPDATE`); if (!p) fail("NOT_FOUND", 404); if (p.preset_revision !== input.revision) fail("VERSION_CONFLICT");
      const previous = getProjectPresetPolicy(p);
      const profile = input.profileId ? previous.profile?.settings.id === input.profileId && previous.profile.revision === input.profileRevision ? previous.profile : await getPreset<Profile>(db, req, "profile", input.profileId) : null;
      const ruleset = input.rulesetId ? previous.ruleset?.settings.id === input.rulesetId && previous.ruleset.revision === input.rulesetRevision ? previous.ruleset : await getPreset<RuleSet>(db, req, "ruleset", input.rulesetId) : null;
      if (profile && profile.revision !== input.profileRevision || ruleset && ruleset.revision !== input.rulesetRevision) fail("VERSION_CONFLICT");
      if (JSON.stringify(previous.ruleset) !== JSON.stringify(ruleset)) { const [capability] = await rows(db, sql`SELECT project_permission(${project},'manage_dictionary') AS allowed`); if (!capability?.allowed) fail("PERMISSION_DENIED", 403); }
      const next = projectPresetSchema.parse({ revision: p.preset_revision + 1, profile, ruleset });
      if (JSON.stringify({ profile: previous.profile, ruleset: previous.ruleset }) === JSON.stringify({ profile, ruleset })) return previous;
      await rows(db, sql`UPDATE projects SET preset_policy=${seal(JSON.stringify(next), `${p.tenant_id}:${p.id}:presets`)},preset_revision=preset_revision+1 WHERE id=${project}`);
      await invalidatePresetProject(db, project);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${p.tenant_id},${project},${req.user.id},'presets_applied',${project})`);
      return next;
    });
  });
}
