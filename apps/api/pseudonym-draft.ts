import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isDeepStrictEqual } from 'node:util';
import { id } from '../../packages/contracts/index.ts';
import { canonicalRuleEntityType } from '../../packages/core/presets.ts';
import { sourceSelectiveEntityType } from '../../packages/core/reference/workspace-renderer-source.js';
import { rows, sql } from '../../packages/adapters/db.ts';
import { seal, unseal } from '../../packages/adapters/storage.ts';
import { openEntityCorrections } from '../../packages/adapters/entity-corrections.ts';
import { readUnifiedAliasState } from '../../packages/adapters/unified-aliases.ts';
import { semanticEntityValue } from '../../packages/core/entity-corrections.ts';
import { activeDraftHash, canonicalizeOriginalTypeActions, currentOrImportedDraft, draftSourceHash, originalDraftFromReferenceReview, projectDraftEditToMarks, updateOriginalDraft, withActiveDraft, type ActivePseudonymDraft } from '../../packages/core/original-pseudonym-draft.ts';
import { saveReview } from './reviews.ts';
import { projectScope } from './access.ts';

const editSchema = z.object({
  revision: z.number().int().nonnegative(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  draftHash: z.string().regex(/^[a-f0-9]{64}$/),
  style: z.enum(['custom', 'selective']),
  key: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  currentValue: z.string().refine(value => value.isWellFormed() && !value.includes('\0')).optional(),
  locked: z.boolean().optional(),
  action: z.enum(['pseudonym', 'mask', 'partial_star', 'full_star']).optional(),
  confirmDuplicate: z.boolean().default(false),
}).strict().refine(value => Boolean(value.key) !== Boolean(value.entityType), { message: 'DRAFT_EDIT_TARGET_REQUIRED' });
const resetSchema = z.object({ revision: z.number().int().nonnegative(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/), draftHash: z.string().regex(/^[a-f0-9]{64}$/), style: z.enum(['custom', 'selective']) }).strict();

function fail(message: string, statusCode = 409): never { throw Object.assign(new Error(message), { statusCode }); }
function openState(p: any, project: string): Record<string, unknown> {
  return p.portable_state ? JSON.parse(unseal(p.portable_state, `${p.tenant_id}:${project}:portable-state`)) : {};
}
function originalImportedDraft(state: Record<string, unknown>, documentId: string, sourceHash: string, revision: number): ActivePseudonymDraft | undefined {
  const oldId = Object.entries((state.documentIdMap ?? {}) as Record<string, unknown>).find(([, id]) => id === documentId)?.[0];
  const snapshot = state.importedSnapshot as { project?: { presetPolicy?: { profile?: { settings?: { pseudonymTypeActions?: Record<string,string> } } } }; documents?: Array<{ id: string; detection?: { documentText?: string }; review?: { pseudonymEntries?: Array<Record<string, unknown>>; pseudonymStyle?: string; pseudonymTypeActions?: Record<string,string> } }> } | undefined;
  const source = snapshot?.documents?.find(item => item.id === oldId);
  if (!source || source.detection?.documentText !== undefined && draftSourceHash(source.detection.documentText) !== sourceHash) return undefined;
  const review = source.review;
  return review ? originalDraftFromReferenceReview(review, sourceHash, revision, snapshot?.project?.presetPolicy?.profile?.settings?.pseudonymTypeActions) : undefined;
}
function configuredTypeActions(d: any, project: string, projectTypeActions?: Record<string,string>): Record<string,string> {
  const policy=d.document_policy ? JSON.parse(unseal(d.document_policy,`${d.tenant_id}:${project}:${d.id}:document-policy`)) : {};
  const selected=policy.configuration?.pseudonymRules ?? policy.profile?.pseudonymTypeActions ?? projectTypeActions;
  return canonicalizeOriginalTypeActions(selected);
}
function projectTypeActions(p: any, project: string): Record<string,string> | undefined {
  if (!p.preset_policy) return undefined;
  const policy=JSON.parse(unseal(p.preset_policy,`${p.tenant_id}:${project}:presets`));
  return policy.profile?.settings?.pseudonymTypeActions;
}
function selectedDraftTypeActions(prior: ActivePseudonymDraft | undefined, configured: Record<string,string>): Record<string,string> {
  if (prior?.typeActionsReset) return prior.typeActions;
  return prior?.typeActions && Object.keys(prior.typeActions).length ? prior.typeActions : configured;
}
function currentEntities(d: any, text: string) {
  const semantic = { ...d, entityCorrections: openEntityCorrections(d) };
  return (d.marks ?? []).map((mark: any, index: number) => ({
    type: mark.rawEntityType ?? canonicalRuleEntityType(mark.kind), text: semanticEntityValue(semantic, mark, text, index),
    startOffset: mark.start, deleted: mark.decision === 'ignore' || mark.hiddenByType === true,
  }));
}
export function registerPseudonymDraftRoutes(app: FastifyInstance) {
  app.get('/api/documents/:id/pseudonym-draft', async req => {
    const documentId = id.parse((req.params as any).id);
    return projectScope(req, { document: documentId }, ['view_original', 'view_mapping'], async (db, project) => {
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${documentId}`);
      const [p] = await rows(db, sql`SELECT id,tenant_id,portable_state,preset_policy FROM projects WHERE id=${project}`);
      if (!d || !p) fail('NOT_FOUND', 404);
      if ((await readUnifiedAliasState(db, req.user.tenant_id, project)).frame?.enabled) return { available: false, reason: 'UNIFIED_MODE' };
      const text = unseal(d.content, `${d.tenant_id}:${project}:${documentId}`), sourceHash = draftSourceHash(text), state = openState(p, project);
      const prior = currentOrImportedDraft(state, documentId, sourceHash, d.revision) ?? originalImportedDraft(state, documentId, sourceHash, d.revision);
      const configured = configuredTypeActions(d, project, projectTypeActions(p, project));
      const result = await updateOriginalDraft({ prior, text, sourceHash, revision: d.revision,
        entities: currentEntities(d, text), style: prior?.style ?? 'custom', typeActions: selectedDraftTypeActions(prior, configured) });
      return { revision: d.revision, sourceHash, draftHash: activeDraftHash(prior), draft: result.draft };
    });
  });
  async function mutate(req: any, reset: boolean) {
    const documentId = id.parse(req.params.id), input = reset ? resetSchema.parse(req.body) : editSchema.parse(req.body);
    return projectScope(req, { document: documentId }, ['view_original', 'view_mapping', 'review'], async (db, project) => {
      const [p] = await rows(db, sql`SELECT * FROM projects WHERE id=${project} FOR UPDATE`);
      const [d] = await rows(db, sql`SELECT * FROM documents WHERE id=${documentId} FOR UPDATE`);
      if (!d || !p) fail('NOT_FOUND', 404);
      if ((await readUnifiedAliasState(db, req.user.tenant_id, project)).frame?.enabled) fail('DRAFT_UNIFIED_MODE_USE_PROJECT_ALIASES');
      if (d.state !== 'review' || d.revision !== input.revision) fail('VERSION_CONFLICT');
      const text = unseal(d.content, `${d.tenant_id}:${project}:${documentId}`), sourceHash = draftSourceHash(text);
      if (input.sourceHash !== sourceHash) fail('DRAFT_SOURCE_MISMATCH');
      const state = openState(p, project), prior = currentOrImportedDraft(state, documentId, sourceHash, d.revision) ?? originalImportedDraft(state, documentId, sourceHash, d.revision);
      if (input.draftHash !== activeDraftHash(prior)) fail('VERSION_CONFLICT');
      const edit = !reset ? input as z.infer<typeof editSchema> : undefined;
      if (edit?.entityType && edit.style !== 'selective') fail('DRAFT_TYPE_ACTION_REQUIRES_SELECTIVE', 400);
      if (edit?.style === 'custom' && edit.action !== undefined && edit.action !== 'pseudonym') fail('DRAFT_ACTION_REQUIRES_SELECTIVE', 400);
      if (edit?.action === 'mask' && !['pdf', 'png', 'jpg', 'jpeg'].includes(d.source_format)) fail('DRAFT_ACTION_UNAVAILABLE', 400);
      const entities = currentEntities(d, text);
      const configured = configuredTypeActions(d, project, projectTypeActions(p, project));
      const result = await updateOriginalDraft({ prior, text, sourceHash, revision: d.revision,
        entities, style: input.style, reset, typeActions: selectedDraftTypeActions(prior, configured),
        ...edit?.entityType && edit.action ? { typeAction: { entityType: edit.entityType, action: edit.action } } : {},
        edit: edit?.key ? { key: edit.key, patch: { ...edit.currentValue !== undefined ? { currentValue: edit.currentValue } : {},
          ...edit.locked !== undefined ? { locked: edit.locked } : {}, ...edit.action !== undefined ? { action: edit.action } : {} },
          confirmDuplicate: edit.confirmDuplicate } : undefined });
      if (result.duplicateRejected) return { revision: d.revision, draftHash: input.draftHash, duplicateConfirmationRequired: true, draft: result.draft };
      const targets = reset ? new Set(result.draft.entries.map(entry => entry.key)) : edit?.entityType
        ? new Set(result.draft.entries.filter(entry => sourceSelectiveEntityType(entry.entityType) === sourceSelectiveEntityType(edit.entityType!)).map(entry => entry.key))
        : new Set([edit!.key!]);
      const marks = projectDraftEditToMarks({ draft: result.draft, entities, marks: d.marks, targetKeys: targets });
      if (!isDeepStrictEqual(marks, d.marks)) {
        const saved = await saveReview(db, req.user.id, d, marks);
        result.draft.revision = saved.revision;
      }
      const next = withActiveDraft(state, documentId, result.draft);
      await rows(db, sql`UPDATE projects SET portable_state=${seal(JSON.stringify(next), `${p.tenant_id}:${project}:portable-state`)} WHERE id=${project}`);
      await rows(db, sql`INSERT INTO audit(tenant_id,project_id,user_id,event,object_id) VALUES(${p.tenant_id},${project},${req.user.id},'pseudonym_draft_changed',${documentId})`);
      return { revision: result.draft.revision, draftHash: activeDraftHash(result.draft), draft: result.draft };
    });
  }
  app.post('/api/documents/:id/pseudonym-draft/edit', async req => mutate(req, false));
  app.post('/api/documents/:id/pseudonym-draft/reset', async req => mutate(req, true));
}
